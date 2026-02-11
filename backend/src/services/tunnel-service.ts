import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as yaml from "js-yaml";
import * as crypto from "crypto";

export interface Tunnel {
  id: string;
  name: string;
  url: string;
  port: number;
  domain?: string;
  status: "active" | "inactive";
  createdAt: string;
}

export class TunnelService {
  private tunnels: Map<string, Tunnel>;
  private tunnelProcesses: Map<string, any>;

  constructor() {
    this.tunnels = new Map();
    this.tunnelProcesses = new Map();
  }

  async createTunnel(
    name: string,
    port: number,
    domain?: string,
  ): Promise<string> {
    try {
      const tunnelId = crypto.randomBytes(8).toString("hex");
      const config = {
        tunnel: name,
        protocol: "http",
        hostname: domain || `${tunnelId}.trycloudflare.com`,
        target: `http://localhost:${port}`,
        "no-tls-verify": true,
        logfile: `/app/logs/tunnel-${name}.log`,
      };

      const configFile = `/tmp/tunnel-${name}.yml`;
      fs.writeFileSync(configFile, yaml.dump(config));

      return new Promise((resolve, reject) => {
        const tunnel = exec(`cloudflared tunnel --config ${configFile} run`, {
          env: {
            ...process.env,
            TUNNEL_LOG: `/app/logs/tunnel-${name}.log`,
          },
        });

        this.tunnelProcesses.set(name, tunnel);

        tunnel.stdout?.on("data", (data) => {
          console.log(`Tunnel ${name}: ${data}`);

          // Store tunnel info
          if (data.includes("https://")) {
            const urlMatch = data.match(/https:\/\/([^\/\s]+)/);
            if (urlMatch) {
              const tunnelUrl = urlMatch[1];
              this.tunnels.set(name, {
                id: tunnelId,
                name,
                url: tunnelUrl,
                port,
                domain,
                status: "active",
                createdAt: new Date().toISOString(),
              });
              resolve(tunnelUrl);
            }
          }
        });

        tunnel.stderr?.on("data", (data) => {
          console.error(`Tunnel ${name} error: ${data}`);
        });

        tunnel.on("error", (error) => {
          console.error(`Tunnel ${name} failed:`, error);
          reject(error);
        });

        tunnel.on("close", (code) => {
          console.log(`Tunnel ${name} closed with code: ${code}`);
          this.tunnels.delete(name);
        });
      });
    } catch (error) {
      console.error(`Failed to create tunnel ${name}:`, error);
      throw error;
    }
  }

  async stopTunnel(name: string): Promise<void> {
    try {
      // Stop tunnel process
      const tunnelProcess = this.tunnelProcesses.get(name);
      if (tunnelProcess) {
        tunnelProcess.kill();
        this.tunnelProcesses.delete(name);
      }

      // Clean up config file
      const configFile = `/tmp/tunnel-${name}.yml`;
      if (fs.existsSync(configFile)) {
        fs.unlinkSync(configFile);
      }

      // Remove from active tunnels
      this.tunnels.delete(name);

      console.log(`Tunnel ${name} stopped`);
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
}
