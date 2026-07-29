import { exec, spawn, ChildProcess } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
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
}

/**
 * Host the tunnel connector dials to reach the exposed container. The backend
 * runs in its own container, so services published on the host are reachable
 * via the host gateway rather than localhost.
 */
const ORIGIN_HOST = process.env.TUNNEL_ORIGIN_HOST || "host.docker.internal";

export class TunnelService {
  private tunnels: Map<string, Tunnel>;
  private tunnelProcesses: Map<string, ChildProcess>;
  private database: any;
  private databasePath: string;
  private logger: Logger;
  private cloudflareService: CloudflareService;

  constructor(logger?: Logger, cloudflareService?: CloudflareService) {
    this.logger = logger ?? new Logger(LogLevel.INFO);
    this.cloudflareService = cloudflareService ?? new CloudflareService(this.logger);
    this.tunnels = new Map();
    this.tunnelProcesses = new Map();
    this.databasePath = path.join(process.cwd(), "data", "tunnels.db");
    this.initializeDatabase();
    this.loadTunnelsFromDatabase();
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
        });

        // Named tunnels are resumable: the stored connector token is all
        // cloudflared needs, so relaunch without touching the Cloudflare API.
        if (row.mode === "hostname" && row.cf_token) {
          this.startConnector(row.name, row.cf_token);
          const tunnel = this.tunnels.get(row.name);
          if (tunnel) {
            tunnel.status = "active";
            this.saveTunnelToDatabase(tunnel, row.cf_token);
          }
        }
      }

      this.logger.info(`Loaded ${this.tunnels.size} tunnels from database`);
    } catch (error) {
      this.logger.error("Error loading tunnels from database:", error);
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
               cf_tunnel_id, cf_token, cf_zone_id, cf_dns_record_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  /**
   * Run the cloudflared connector for a named tunnel. Ingress lives in
   * Cloudflare, so the token is the only configuration the process needs.
   */
  private startConnector(safeName: string, token: string): ChildProcess {
    const existing = this.tunnelProcesses.get(safeName);
    if (existing) existing.kill();

    const connector = spawn(
      "cloudflared",
      [
        "tunnel",
        "--no-autoupdate",
        "--loglevel",
        "info",
        "run",
        "--token",
        token,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    this.tunnelProcesses.set(safeName, connector);

    const log = (data: Buffer) => {
      // Never let the connector token reach the logs.
      const output = data.toString().replace(token, "***");
      this.logger.info(`Tunnel ${safeName}: ${output}`);
    };
    connector.stdout?.on("data", log);
    connector.stderr?.on("data", log);

    connector.on("error", (error) => {
      this.logger.error(`Connector ${safeName} failed to start:`, error);
      const tunnel = this.tunnels.get(safeName);
      if (tunnel) {
        tunnel.status = "inactive";
        this.saveTunnelToDatabase(tunnel);
      }
    });

    connector.on("close", (code) => {
      this.logger.info(`Connector ${safeName} exited with code: ${code}`);
      this.tunnelProcesses.delete(safeName);
      const tunnel = this.tunnels.get(safeName);
      if (tunnel) {
        tunnel.status = "inactive";
        this.saveTunnelToDatabase(tunnel);
      }
    });

    return connector;
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

    if (!(await this.isCloudflaredInstalled())) {
      throw new Error(
        "cloudflared is not available in this container — rebuild the image so custom domains can be served",
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

    this.startConnector(safeName, token);
    this.tunnels.set(safeName, tunnel);
    this.saveTunnelToDatabase(tunnel, token);

    this.logger.info(
      `Named tunnel ${cfTunnelName} serving ${hostname} -> ${ORIGIN_HOST}:${port}`,
    );
    return hostname;
  }

  /**
   * No-domain fallback: an SSH reverse tunnel to localhost.run, which hands
   * back a throwaway *.lhr.life hostname and needs no account.
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

      const tunnelProcess = this.tunnelProcesses.get(safeName);
      if (tunnelProcess) {
        tunnelProcess.kill();
        this.tunnelProcesses.delete(safeName);
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

  private isCloudflaredInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      exec("cloudflared --version", (error) => resolve(!error));
    });
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
}
