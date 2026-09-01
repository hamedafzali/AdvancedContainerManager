import { spawn, ChildProcess } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import Docker from "dockerode";
import { Logger, LogLevel } from "../utils/logger";
import { CloudflareService } from "./cloudflare-service";
const Database = require("better-sqlite3");

export interface Tunnel {
  id: string;
  name: string;
  url: string;
  port: number;
  domain?: string;
  status: "active" | "inactive";
  createdAt: string;
  mode: "quick" | "hostname";
  cfTunnelId?: string;
  cfZoneId?: string;
  cfDnsRecordId?: string;
  /** True once ACM has taken over management of a container it didn't create. */
  adopted?: boolean;
}

/**
 * Host the tunnel connector dials to reach the exposed container. The backend
 * runs in its own container, so services published on the host are reachable
 * via the host gateway rather than localhost.
 */
const ORIGIN_HOST = process.env.TUNNEL_ORIGIN_HOST || "host.docker.internal";

const CLOUDFLARED_IMAGE = "cloudflare/cloudflared:latest";

export class TunnelService {
  private tunnels: Map<string, Tunnel>;
  /** Only the quick-tunnel (SSH) mode still runs as a plain child process. */
  private tunnelProcesses: Map<string, ChildProcess>;
  private database: any;
  private databasePath: string;
  private logger: Logger;
  private cloudflareService: CloudflareService;
  private docker: Docker;

  constructor(logger?: Logger, cloudflareService?: CloudflareService) {
    this.logger = logger ?? new Logger(LogLevel.INFO);
    this.cloudflareService = cloudflareService ?? new CloudflareService(this.logger);
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock",
    });
    this.tunnels = new Map();
    this.tunnelProcesses = new Map();
    this.databasePath = this.resolveDatabasePath();
    this.initializeDatabase();
    this.loadTunnelsFromDatabase();
    // Best-effort: pick up any pre-existing cloudflared containers ACM didn't
    // create itself. Failures here must never block startup.
    this.adoptExistingTunnels().catch((error) =>
      this.logger.warn(`Startup tunnel adoption skipped: ${error}`),
    );
  }

  /**
   * Tunnels used to live at <cwd>/data/tunnels.db — not under any bind mount,
   * so an image rebuild silently wiped every stored connector token (this is
   * what caused the 2026-08-09 outage). Put the file next to the main
   * database instead, which is already bind-mounted at /data/db.
   */
  private resolveDatabasePath(): string {
    if (process.env.TUNNELS_DATABASE_PATH) return process.env.TUNNELS_DATABASE_PATH;

    const mainDbDir = process.env.DATABASE_PATH
      ? path.dirname(process.env.DATABASE_PATH)
      : "/data/db";
    const newPath = path.join(mainDbDir, "tunnels.db");

    // One-time migration for installs upgrading from the old, unmounted path.
    const legacyPath = path.join(process.cwd(), "data", "tunnels.db");
    try {
      if (!fs.existsSync(newPath) && fs.existsSync(legacyPath)) {
        fs.mkdirSync(mainDbDir, { recursive: true });
        fs.copyFileSync(legacyPath, newPath);
        this.logger.info(`Migrated tunnels database from ${legacyPath} to ${newPath}`);
      }
    } catch (error) {
      this.logger.warn(`Tunnels database migration skipped: ${error}`);
    }

    return newPath;
  }

  private initializeDatabase(): void {
    try {
      const databaseDir = path.dirname(this.databasePath);
      if (!fs.existsSync(databaseDir)) {
        fs.mkdirSync(databaseDir, { recursive: true });
      }

      this.database = new Database(this.databasePath);
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS tunnels (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          port INTEGER NOT NULL,
          domain TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          mode TEXT NOT NULL
        )
      `);

      // Columns added for named Cloudflare tunnels; older databases predate them.
      const columns: string[] = this.database
        .prepare("PRAGMA table_info(tunnels)")
        .all()
        .map((row: any) => row.name);

      for (const column of [
        "cf_tunnel_id",
        "cf_token",
        "cf_zone_id",
        "cf_dns_record_id",
        "adopted",
      ]) {
        if (!columns.includes(column)) {
          this.database.exec(`ALTER TABLE tunnels ADD COLUMN ${column} TEXT`);
        }
      }

      // Earlier versions keyed only on `id`, which is regenerated per create,
      // so one tunnel could accumulate several rows. Keep the newest per name.
      this.database.exec(`
        DELETE FROM tunnels
        WHERE rowid NOT IN (SELECT MAX(rowid) FROM tunnels GROUP BY name);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tunnels_name ON tunnels(name);
      `);
    } catch (error) {
      this.logger.error("Error initializing tunnels database:", error);
    }
  }

  private loadTunnelsFromDatabase(): void {
    try {
      const rows = this.database.prepare("SELECT * FROM tunnels").all();
      this.tunnels.clear();

      for (const row of rows) {
        this.tunnels.set(row.name, {
          id: row.id,
          name: row.name,
          url: row.url,
          port: row.port,
          domain: row.domain,
          status: "inactive",
          createdAt: row.created_at,
          mode: row.mode,
          cfTunnelId: row.cf_tunnel_id,
          cfZoneId: row.cf_zone_id,
          cfDnsRecordId: row.cf_dns_record_id,
          adopted: !!row.adopted,
        });
      }

      this.logger.info(`Loaded ${this.tunnels.size} tunnels from database`);

      // Named-tunnel connectors are sibling containers with their own
      // restart policy — they keep running across an ACM restart on their
      // own. Only (re)create the container when it's genuinely missing, so a
      // healthy tunnel is never touched just because ACM booted.
      for (const row of rows) {
        if (row.mode !== "hostname" || !row.cf_token) continue;
        this.reconcileConnectorContainer(row.name, row.cf_token).catch((error) =>
          this.logger.error(`Failed to reconcile connector for ${row.name}:`, error),
        );
      }
    } catch (error) {
      this.logger.error("Error loading tunnels from database:", error);
    }
  }

  /**
   * Ensure the sibling container for a named tunnel exists and is running,
   * starting it only if it's missing. Updates the in-memory/stored status
   * either way.
   */
  private async reconcileConnectorContainer(safeName: string, token: string): Promise<void> {
    const running = await this.containerIsRunning(this.containerName(safeName));
    if (!running) {
      await this.startConnector(safeName, token);
    }
    const tunnel = this.tunnels.get(safeName);
    if (tunnel) {
      tunnel.status = (await this.containerIsRunning(this.containerName(safeName)))
        ? "active"
        : "inactive";
      this.saveTunnelToDatabase(tunnel);
    }
  }

  /**
   * Tunnels are identified by name everywhere in this service, but the table's
   * primary key is `id` and a new id is minted on every create. Replace by name
   * so re-creating a tunnel updates its row instead of adding a second one.
   */
  private saveTunnelToDatabase(tunnel: Tunnel, token?: string): void {
    try {
      const preservedToken = token ?? this.getStoredToken(tunnel.name) ?? null;

      const save = this.database.transaction(() => {
        this.database
          .prepare("DELETE FROM tunnels WHERE name = ?")
          .run(tunnel.name);
        this.database
          .prepare(
            `INSERT INTO tunnels
              (id, name, url, port, domain, status, created_at, mode,
               cf_tunnel_id, cf_token, cf_zone_id, cf_dns_record_id, adopted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            tunnel.id,
            tunnel.name,
            tunnel.url,
            tunnel.port,
            tunnel.domain || null,
            tunnel.status,
            tunnel.createdAt,
            tunnel.mode,
            tunnel.cfTunnelId || null,
            preservedToken,
            tunnel.cfZoneId || null,
            tunnel.cfDnsRecordId || null,
            tunnel.adopted ? "1" : null,
          );
      });

      save();
    } catch (error) {
      this.logger.error("Error saving tunnel to database:", error);
    }
  }

  private deleteTunnelFromDatabase(name: string): void {
    try {
      const stmt = this.database.prepare("DELETE FROM tunnels WHERE name = ?");
      stmt.run(name);
    } catch (error) {
      this.logger.error("Error deleting tunnel from database:", error);
    }
  }

  private getStoredToken(name: string): string | undefined {
    try {
      const row = this.database
        .prepare("SELECT cf_token FROM tunnels WHERE name = ?")
        .get(name);
      return row?.cf_token ?? undefined;
    } catch {
      return undefined;
    }
  }

  private containerName(safeName: string): string {
    return `${safeName}-tunnel`;
  }

  private async containerIsRunning(containerName: string): Promise<boolean> {
    try {
      const info = await this.docker.getContainer(containerName).inspect();
      return !!info.State?.Running;
    } catch {
      return false;
    }
  }

  private async removeContainerIfExists(containerName: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();
      if (info.State?.Running) {
        await container.stop().catch(() => {});
      }
      await container.remove({ force: true });
    } catch {
      // Not found — nothing to remove.
    }
  }

  private async ensureCloudflaredImage(): Promise<void> {
    try {
      await this.docker.getImage(CLOUDFLARED_IMAGE).inspect();
    } catch {
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(CLOUDFLARED_IMAGE, (err: any, stream: any) => {
          if (err) return reject(err);
          this.docker.modem.followProgress(stream, (err2: any) =>
            err2 ? reject(err2) : resolve(),
          );
        });
      });
    }
  }

  /**
   * Run the cloudflared connector for a named tunnel as a sibling Docker
   * container — not a child process of the ACM backend — with its own
   * restart policy, so an ACM rebuild/restart never touches it. Ingress
   * lives in Cloudflare, so the token is the only configuration needed.
   */
  private async startConnector(safeName: string, token: string): Promise<void> {
    const containerName = this.containerName(safeName);
    await this.removeContainerIfExists(containerName);
    await this.ensureCloudflaredImage();

    const container = await this.docker.createContainer({
      name: containerName,
      Image: CLOUDFLARED_IMAGE,
      Cmd: ["tunnel", "--no-autoupdate", "run", "--token", token],
      HostConfig: {
        RestartPolicy: { Name: "unless-stopped" },
        ExtraHosts: ["host.docker.internal:host-gateway"],
      },
      Labels: { "acm.tunnel": safeName },
    });

    await container.start();
    this.logger.info(`Connector container ${containerName} started`);
  }

  async createTunnel(
    name: string,
    port: number,
    domain?: string,
  ): Promise<string> {
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "-");

    if (domain) {
      return this.createNamedTunnel(safeName, port, domain);
    }
    return this.createQuickTunnel(safeName, port);
  }

  /**
   * Bind a hostname on a Cloudflare zone to a local port via a named tunnel:
   * create (or reuse) the tunnel, publish its ingress rule, CNAME the hostname
   * at the tunnel, then run the connector.
   */
  private async createNamedTunnel(
    safeName: string,
    port: number,
    domain: string,
  ): Promise<string> {
    if (!this.cloudflareService.isAuthenticated()) {
      throw new Error(
        "Cloudflare is not connected — add an API token in Settings → Cloudflare before using a custom domain",
      );
    }

    const hostname = domain.trim().toLowerCase();
    const zone = await this.cloudflareService.findZoneForHostname(hostname);
    if (!zone) {
      throw new Error(
        `No Cloudflare zone found for ${hostname} — add the domain to Cloudflare first`,
      );
    }

    const cfTunnelName = `acm-${safeName}`;
    const existing = await this.cloudflareService.findTunnelByName(cfTunnelName);
    const cfTunnel =
      existing ?? (await this.cloudflareService.createTunnel(cfTunnelName));

    const token = await this.cloudflareService.getTunnelToken(cfTunnel.id);

    await this.cloudflareService.setTunnelIngress(
      cfTunnel.id,
      hostname,
      `http://${ORIGIN_HOST}:${port}`,
    );

    const record = await this.cloudflareService.upsertTunnelDNSRecord(
      zone.id,
      hostname,
      cfTunnel.id,
      true,
    );

    const tunnel: Tunnel = {
      id: crypto.randomBytes(8).toString("hex"),
      name: safeName,
      url: hostname,
      port,
      domain: hostname,
      status: "active",
      createdAt: new Date().toISOString(),
      mode: "hostname",
      cfTunnelId: cfTunnel.id,
      cfZoneId: zone.id,
      cfDnsRecordId: record.id,
    };

    await this.startConnector(safeName, token);
    this.tunnels.set(safeName, tunnel);
    this.saveTunnelToDatabase(tunnel, token);

    this.logger.info(
      `Named tunnel ${cfTunnelName} serving ${hostname} -> ${ORIGIN_HOST}:${port}`,
    );
    return hostname;
  }

  /**
   * No-domain fallback: an SSH reverse tunnel to localhost.run, which hands
   * back a throwaway *.lhr.life hostname and needs no account. Out of scope
   * for the container redesign — it holds no long-lived token to lose, so
   * the 2026-08-09 durability problem never applied to it.
   */
  private createQuickTunnel(safeName: string, port: number): Promise<string> {
    const tunnelId = crypto.randomBytes(8).toString("hex");

    return new Promise((resolve, reject) => {
      const sshArgs = [
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=30",
        "-o", "ServerAliveInterval=30",
        "-R", `80:${ORIGIN_HOST}:${port}`,
        "nokey@localhost.run",
      ];

      const tunnel = spawn("ssh", sshArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.tunnelProcesses.set(safeName, tunnel);
      let resolved = false;

      const parseTunnelUrl = (data: string) => {
        if (resolved) return;
        // localhost.run prints: "abc123.lhr.life tunnelled with tls termination, https://abc123.lhr.life"
        const urlMatch = data.match(/https:\/\/([a-z0-9]+\.lhr\.life)/i);
        if (!urlMatch) return;

        const tunnelUrl = urlMatch[1]; // hostname only, without https://
        resolved = true;

        const record: Tunnel = {
          id: tunnelId,
          name: safeName,
          url: tunnelUrl,
          port,
          status: "active",
          createdAt: new Date().toISOString(),
          mode: "quick",
        };
        this.tunnels.set(safeName, record);
        this.saveTunnelToDatabase(record);
        resolve(tunnelUrl);
      };

      tunnel.stdout?.on("data", (data) => {
        const output = data.toString();
        this.logger.info(`Tunnel ${safeName}: ${output}`);
        parseTunnelUrl(output);
      });

      tunnel.stderr?.on("data", (data) => {
        const output = data.toString();
        this.logger.info(`Tunnel ${safeName}: ${output}`);
        parseTunnelUrl(output);
      });

      tunnel.on("error", (error) => {
        this.logger.error(`Tunnel ${safeName} failed:`, error);
        if (!resolved) reject(error);
      });

      tunnel.on("close", (code) => {
        this.logger.info(`Tunnel ${safeName} closed with code: ${code}`);
        this.tunnels.delete(safeName);
        this.tunnelProcesses.delete(safeName);
        if (!resolved) {
          reject(new Error(`Tunnel process exited before URL was created (exit code: ${code ?? "unknown"})`));
        }
      });
    });
  }

  async stopTunnel(name: string): Promise<void> {
    try {
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "-");
      const tunnel = this.tunnels.get(safeName);

      if (tunnel?.mode === "hostname") {
        await this.removeContainerIfExists(this.containerName(safeName));
      } else {
        const tunnelProcess = this.tunnelProcesses.get(safeName);
        if (tunnelProcess) {
          tunnelProcess.kill();
          this.tunnelProcesses.delete(safeName);
        }
      }

      // Tear down the Cloudflare side so a stopped hostname stops resolving
      // rather than pointing at a tunnel with no connector behind it.
      if (tunnel?.mode === "hostname" && this.cloudflareService.isAuthenticated()) {
        if (tunnel.cfZoneId && tunnel.cfDnsRecordId) {
          await this.cloudflareService
            .deleteDNSRecord(tunnel.cfZoneId, tunnel.cfDnsRecordId)
            .catch((error) =>
              this.logger.warn(`Failed to delete tunnel DNS record: ${error}`),
            );
        }
        if (tunnel.cfTunnelId) {
          await this.cloudflareService
            .deleteTunnel(tunnel.cfTunnelId)
            .catch((error) =>
              this.logger.warn(`Failed to delete Cloudflare tunnel: ${error}`),
            );
        }
      }

      this.tunnels.delete(safeName);
      this.deleteTunnelFromDatabase(safeName);

      this.logger.info(`Tunnel ${safeName} stopped`);
    } catch (error) {
      this.logger.error(`Failed to stop tunnel ${name}:`, error);
      throw error;
    }
  }

  getTunnels(): Tunnel[] {
    return Array.from(this.tunnels.values());
  }

  getTunnel(name: string): Tunnel | undefined {
    return this.tunnels.get(name);
  }

  /**
   * Named tunnels now run cloudflared as a sibling container rather than a
   * binary inside this container, so "installed" means "can reach the
   * Docker socket" (the connector image is pulled on demand when a tunnel
   * is created) rather than a local `cloudflared` executable.
   */
  private async isCloudflaredInstalled(): Promise<boolean> {
    try {
      await this.docker.ping();
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<{
    cloudflaredInstalled: boolean;
    cloudflareAuthenticated: boolean;
    activeTunnels: number;
  }> {
    return {
      cloudflaredInstalled: await this.isCloudflaredInstalled(),
      cloudflareAuthenticated: this.cloudflareService.isAuthenticated(),
      activeTunnels: Array.from(this.tunnels.values()).filter(
        (tunnel) => tunnel.status === "active",
      ).length,
    };
  }

  /**
   * Discover cloudflared containers that already exist on the host (created
   * outside ACM, e.g. by hand or via docker-compose) and start tracking them
   * as regular tunnels — no recreation, no token churn. Recovers the
   * Cloudflare tunnel id straight from the container's own `--token`
   * argument (a base64 JSON blob of {a: accountId, t: tunnelId, s: secret} —
   * no network call needed for that part) and best-effort resolves the
   * hostname/zone from Cloudflare's side when a session is authenticated.
   * Safe to call repeatedly: already-tracked tunnels (by container name) are
   * skipped.
   */
  async adoptExistingTunnels(): Promise<Tunnel[]> {
    const adopted: Tunnel[] = [];
    let containers: Docker.ContainerInfo[];
    try {
      containers = await this.docker.listContainers({ all: true });
    } catch (error) {
      this.logger.warn(`Tunnel adoption: failed to list containers: ${error}`);
      return adopted;
    }

    const trackedContainerNames = new Set(
      Array.from(this.tunnels.keys()).map((name) => this.containerName(name)),
    );

    for (const info of containers) {
      const rawName = (info.Names?.[0] || "").replace(/^\//, "");
      const match = rawName.match(/^(.+)-tunnel$/);
      if (!match) continue;
      if (!info.Image?.startsWith("cloudflare/cloudflared")) continue;
      if (trackedContainerNames.has(rawName)) continue;

      const safeName = match[1];
      if (this.tunnels.has(safeName)) continue;

      try {
        const tunnel = await this.adoptContainer(safeName, rawName);
        if (tunnel) adopted.push(tunnel);
      } catch (error) {
        this.logger.warn(`Failed to adopt tunnel container ${rawName}: ${error}`);
      }
    }

    if (adopted.length > 0) {
      this.logger.info(
        `Adopted ${adopted.length} existing tunnel container(s): ${adopted
          .map((t) => t.name)
          .join(", ")}`,
      );
    }
    return adopted;
  }

  private async adoptContainer(safeName: string, containerName: string): Promise<Tunnel | undefined> {
    const container = this.docker.getContainer(containerName);
    const info = await container.inspect();
    const cmd: string[] = info.Config?.Cmd || [];
    const tokenIndex = cmd.indexOf("--token");
    const token = tokenIndex >= 0 ? cmd[tokenIndex + 1] : undefined;
    if (!token) {
      this.logger.warn(`Skipping adoption of ${containerName}: no --token argument found`);
      return undefined;
    }

    let cfTunnelId: string | undefined;
    try {
      const decoded = JSON.parse(Buffer.from(token, "base64").toString("utf8"));
      cfTunnelId = decoded?.t;
    } catch {
      this.logger.warn(`Could not decode Cloudflare token for ${containerName}; adopting without a tunnel id`);
    }

    let hostname: string | undefined;
    let zoneId: string | undefined;
    let dnsRecordId: string | undefined;
    let port = 0;

    if (cfTunnelId && this.cloudflareService.isAuthenticated()) {
      const config = await this.cloudflareService.getTunnelConfiguration(cfTunnelId);
      if (config?.hostname) {
        hostname = config.hostname;
        const portMatch = config.service?.match(/:(\d+)\s*$/);
        if (portMatch) port = parseInt(portMatch[1], 10);

        const zone = await this.cloudflareService.findZoneForHostname(hostname);
        if (zone) {
          zoneId = zone.id;
          const record = await this.cloudflareService.findDNSRecordForHostname(zone.id, hostname);
          dnsRecordId = record?.id;
        }
      }
    }

    const running = !!(await container.inspect()).State?.Running;

    const tunnel: Tunnel = {
      id: crypto.randomBytes(8).toString("hex"),
      name: safeName,
      url: hostname || safeName,
      port,
      domain: hostname,
      status: running ? "active" : "inactive",
      createdAt: new Date().toISOString(),
      mode: "hostname",
      cfTunnelId,
      cfZoneId: zoneId,
      cfDnsRecordId: dnsRecordId,
      adopted: true,
    };

    this.tunnels.set(safeName, tunnel);
    this.saveTunnelToDatabase(tunnel, token);
    return tunnel;
  }
}
