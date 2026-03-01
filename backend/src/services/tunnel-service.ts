import { exec, spawn, ChildProcess } from "child_process";
import * as crypto from "crypto";

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

  constructor() {
    this.tunnels = new Map();
    this.tunnelProcesses = new Map();
  }

  private async isCloudflaredInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      exec("cloudflared --version", (error) => {
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
        "cloudflared is not installed on server. Install it first to use Cloudflare tunnels.",
      );
    }

    try {
      const tunnelId = crypto.randomBytes(8).toString("hex");
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "-");
      const args = ["tunnel", "--url", `http://localhost:${port}`];
      const mode: "quick" | "hostname" = domain ? "hostname" : "quick";
      if (domain) {
        args.push("--hostname", domain);
      }

      return new Promise((resolve, reject) => {
        const tunnel = spawn("cloudflared", args, {
          env: {
            ...process.env,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });

        this.tunnelProcesses.set(safeName, tunnel);
        let resolved = false;

        const parseTunnelUrl = (data: string) => {
          const urlMatch = data.match(/https:\/\/([^\s]+)/);
          if (!urlMatch || resolved) {
            return;
          }
          resolved = true;
          const tunnelUrl = urlMatch[1].replace(/\/$/, "");
          this.tunnels.set(safeName, {
            id: tunnelId,
            name: safeName,
            url: tunnelUrl,
            port,
            domain,
            status: "active",
            createdAt: new Date().toISOString(),
            mode,
          });
          resolve(tunnelUrl);
        };

        tunnel.stdout?.on("data", (data) => {
          const output = data.toString();
          console.log(`Tunnel ${safeName}: ${output}`);
          parseTunnelUrl(output);
        });

        tunnel.stderr?.on("data", (data) => {
          const output = data.toString();
          console.error(`Tunnel ${safeName} error: ${output}`);
          parseTunnelUrl(output);

          if (
            output.includes("Cannot determine default origin certificate path") ||
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
          console.error(`Tunnel ${safeName} failed:`, error);
          reject(error);
        });

        tunnel.on("close", (code) => {
          console.log(`Tunnel ${safeName} closed with code: ${code}`);
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
      console.error(`Failed to create tunnel ${name}:`, error);
      throw error;
    }
  }

  async stopTunnel(name: string): Promise<void> {
    try {
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, "-");
      // Stop tunnel process
      const tunnelProcess = this.tunnelProcesses.get(safeName);
      if (tunnelProcess) {
        tunnelProcess.kill();
        this.tunnelProcesses.delete(safeName);
      }

      // Remove from active tunnels
      this.tunnels.delete(safeName);

      console.log(`Tunnel ${safeName} stopped`);
    } catch (error) {
      console.error(`Failed to stop tunnel ${name}:`, error);
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
