import { exec, spawn, ChildProcess } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { Logger, LogLevel } from "../utils/logger";
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
}

export class TunnelService {
  private tunnels: Map<string, Tunnel>;
  private tunnelProcesses: Map<string, ChildProcess>;
  private database: any;
  private databasePath: string;
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? new Logger(LogLevel.INFO);
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
          status: row.status,
          createdAt: row.created_at,
          mode: row.mode,
        });

        // Check if cloudflared container is still running and reattach
        this.checkAndReattachTunnel(row.name, row.port, row.domain);
      }

      this.logger.info(`Loaded ${this.tunnels.size} tunnels from database`);
    } catch (error) {
      this.logger.error("Error loading tunnels from database:", error);
    }
  }

  private checkAndReattachTunnel(
    name: string,
    port: number,
    domain?: string,
  ): void {
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "-");
    exec(
      `docker ps --filter name=cloudflared-${safeName} --format '{{.Names}}'`,
      (error, stdout) => {
        if (!error && stdout.trim().includes(`cloudflared-${safeName}`)) {
          this.logger.info(`Cloudflared container for ${safeName} is still running`);
          // Container is running, update status to active
          const tunnel = this.tunnels.get(safeName);
          if (tunnel) {
            tunnel.status = "active";
            this.saveTunnelToDatabase(tunnel);
          }
        } else {
          // Container is not running, update status to inactive
          const tunnel = this.tunnels.get(safeName);
          if (tunnel) {
            tunnel.status = "inactive";
            this.saveTunnelToDatabase(tunnel);
          }
        }
      },
    );
  }

  private saveTunnelToDatabase(tunnel: Tunnel): void {
    try {
      const stmt = this.database.prepare(`
        INSERT OR REPLACE INTO tunnels (id, name, url, port, domain, status, created_at, mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        tunnel.id,
        tunnel.name,
        tunnel.url,
        tunnel.port,
        tunnel.domain || null,
        tunnel.status,
        tunnel.createdAt,
        tunnel.mode,
      );
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

  private async isCloudflaredInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      exec("docker --version", (error) => {
        resolve(!error);
      });
    });
  }

  async createTunnel(
    name: string,
    port: number,
    domain?: string,
  ): Promise<string> {
    const cloudflaredInstalled = await this.isCloudflaredInstalled();
    if (!cloudflaredInstalled) {
      throw new Error(
        "Docker is not available on server. Install it first to use Cloudflare tunnels.",
      );
    }

    try {
      const tunnelId = crypto.randomBytes(8).toString("hex");
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "-");
      const tunnelUrl = `http://localhost:${port}`;
      const mode: "quick" | "hostname" = domain ? "hostname" : "quick";

      // Remove existing container with the same name if it exists
      await new Promise<void>((resolve) => {
        exec(`docker rm -f cloudflared-${safeName}`, (error) => {
          if (error) {
            // Container doesn't exist or other error, continue
            this.logger.info(
              `No existing container to remove or error removing: ${error.message}`,
            );
          }
          resolve();
        });
      });

      // Run cloudflared in a Docker container on host network for better connectivity
      const dockerArgs = [
        "run",
        "--rm",
        "--network",
        "host",
        "--name",
        `cloudflared-${safeName}`,
        "cloudflare/cloudflared:latest",
        "tunnel",
        "--url",
        tunnelUrl,
      ];
      if (domain) {
        dockerArgs.push("--hostname", domain);
      }

      return new Promise((resolve, reject) => {
        const tunnel = spawn("docker", dockerArgs, {
          env: {
            ...process.env,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });

        this.tunnelProcesses.set(safeName, tunnel);
        let resolved = false;

        const parseTunnelUrl = (data: string) => {
          // Match trycloudflare.com URLs, but exclude the terms of service URL
          const urlMatch = data.match(
            /https:\/\/[a-z0-9\-]+\.trycloudflare\.com/i,
          );
          if (!urlMatch || resolved) {
            return;
          }
          let tunnelUrl = urlMatch[0].replace(/\/$/, "").trim();
          // Remove https:// prefix since frontend adds it
          tunnelUrl = tunnelUrl.replace(/^https:\/\//i, "");
          if (!tunnelUrl) return;

          resolved = true;
          const tunnel: Tunnel = {
            id: tunnelId,
            name: safeName,
            url: tunnelUrl,
            port,
            domain,
            status: "active",
            createdAt: new Date().toISOString(),
            mode,
          };
          this.tunnels.set(safeName, tunnel);
          this.saveTunnelToDatabase(tunnel);
          resolve(tunnelUrl);
        };

        tunnel.stdout?.on("data", (data) => {
          const output = data.toString();
          this.logger.info(`Tunnel ${safeName}: ${output}`);
          parseTunnelUrl(output);
        });

        tunnel.stderr?.on("data", (data) => {
          const output = data.toString();
          this.logger.error(`Tunnel ${safeName} error: ${output}`);
          parseTunnelUrl(output);

          if (
            output.includes(
              "Cannot determine default origin certificate path",
            ) ||
            output.includes("Origin cert") ||
            output.includes("Please login")
          ) {
            if (!resolved) {
              reject(
                new Error(
                  "Cloudflare login is required for custom hostname tunnels. Run: cloudflared tunnel login",
                ),
              );
            }
          }
        });

        tunnel.on("error", (error) => {
          this.logger.error(`Tunnel ${safeName} failed:`, error);
          reject(error);
        });

        tunnel.on("close", (code) => {
          this.logger.info(`Tunnel ${safeName} closed with code: ${code}`);
          this.tunnels.delete(safeName);
          this.tunnelProcesses.delete(safeName);
          if (!resolved) {
            reject(
              new Error(
                `Tunnel process exited before URL was created (exit code: ${code ?? "unknown"})`,
              ),
            );
          }
        });
      });
    } catch (error) {
      this.logger.error(`Failed to create tunnel ${name}:`, error);
      throw error;
    }
  }

  async stopTunnel(name: string): Promise<void> {
    try {
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "-");
      // Stop Docker container
      exec(`docker stop cloudflared-${safeName}`, (error) => {
        if (error) {
          this.logger.error(`Failed to stop cloudflared container:`, error);
        }
      });

      // Stop tunnel process
      const tunnelProcess = this.tunnelProcesses.get(safeName);
      if (tunnelProcess) {
        tunnelProcess.kill();
        this.tunnelProcesses.delete(safeName);
      }

      // Remove from active tunnels
      this.tunnels.delete(safeName);
      this.deleteTunnelFromDatabase(safeName);

      this.logger.info(`Tunnel ${safeName} stopped`);
    } catch (error) {
      this.logger.error(`Failed to stop tunnel ${name}:`, error);
      throw error;
    }
  }

  getTunnels(): Tunnel[] {
    return Array.from(this.tunnels.entries()).map(([name, info]) => ({
      name,
      ...info,
    }));
  }

  getTunnel(name: string): Tunnel | undefined {
    return this.tunnels.get(name);
  }

  async getStatus(): Promise<{
    cloudflaredInstalled: boolean;
    activeTunnels: number;
  }> {
    const cloudflaredInstalled = await this.isCloudflaredInstalled();
    return {
      cloudflaredInstalled,
      activeTunnels: this.tunnels.size,
    };
  }
}
