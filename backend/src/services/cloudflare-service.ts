import { Cloudflare } from "cloudflare";
import * as crypto from "crypto";

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  paused: boolean;
  type: string;
}

export interface CloudflareTunnel {
  id: string;
  name: string;
  accountId: string;
  createdAt: string;
}

export interface CloudflareConfig {
  apiToken: string;
  accountId?: string;
}

export class CloudflareService {
  private client: Cloudflare | null = null;
  private config: CloudflareConfig | null = null;

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    // Load from environment or database in future
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    if (apiToken) {
      this.config = { apiToken, accountId };
      this.client = new Cloudflare({ apiToken });
    }
  }

  setConfig(config: CloudflareConfig): void {
    this.config = config;
    this.client = new Cloudflare({ apiToken: config.apiToken });
  }

  clearConfig(): void {
    this.config = null;
    this.client = null;
  }

  isAuthenticated(): boolean {
    return this.client !== null;
  }

  async validateToken(): Promise<boolean> {
    if (!this.client) return false;

    try {
      // Try to fetch zones as a simple validation
      await this.client.zones.list();
      return true;
    } catch (error) {
      console.error("Cloudflare token validation failed:", error);
      return false;
    }
  }

  async getZones(): Promise<CloudflareZone[]> {
    if (!this.client) {
      throw new Error("Cloudflare client not initialized");
    }

    try {
      const zones = await this.client.zones.list();
      return zones.result.map((zone: any) => ({
        id: zone.id,
        name: zone.name,
        status: zone.status,
        paused: zone.paused,
        type: zone.type,
      }));
    } catch (error) {
      console.error("Failed to fetch Cloudflare zones:", error);
      throw new Error("Failed to fetch zones from Cloudflare");
    }
  }

  async createZone(
    domain: string,
    accountId?: string,
  ): Promise<CloudflareZone> {
    if (!this.client) {
      throw new Error("Cloudflare client not initialized");
    }

    const targetAccountId = accountId || this.config?.accountId;
    if (!targetAccountId) {
      throw new Error("Cloudflare account ID is required");
    }

    try {
      const zone = await (this.client.zones as any).create({
        name: domain,
        account: { id: targetAccountId },
        type: "full",
      });

      return {
        id: zone.result.id,
        name: zone.result.name,
        status: zone.result.status,
        paused: zone.result.paused,
        type: zone.result.type,
      };
    } catch (error) {
      console.error("Failed to create Cloudflare zone:", error);
      throw new Error("Failed to create zone in Cloudflare");
    }
  }

  async createTunnel(
    name: string,
    accountId?: string,
  ): Promise<CloudflareTunnel> {
    if (!this.client) {
      throw new Error("Cloudflare client not initialized");
    }

    const targetAccountId = accountId || this.config?.accountId;
    if (!targetAccountId) {
      throw new Error("Cloudflare account ID is required");
    }

    try {
      // Use cloudflared CLI for tunnel creation since API is complex
      // This is a placeholder - actual implementation would use cloudflared
      throw new Error(
        "Tunnel creation via cloudflared CLI - not yet implemented",
      );
    } catch (error) {
      console.error("Failed to create Cloudflare tunnel:", error);
      throw new Error("Failed to create tunnel in Cloudflare");
    }
  }

  async getTunnels(accountId?: string): Promise<CloudflareTunnel[]> {
    if (!this.client) {
      throw new Error("Cloudflare client not initialized");
    }

    const targetAccountId = accountId || this.config?.accountId;
    if (!targetAccountId) {
      throw new Error("Cloudflare account ID is required");
    }

    try {
      // Placeholder - would use cloudflared CLI to list tunnels
      return [];
    } catch (error) {
      console.error("Failed to fetch Cloudflare tunnels:", error);
      throw new Error("Failed to fetch tunnels from Cloudflare");
    }
  }

  async createDNSRecord(
    zoneId: string,
    name: string,
    tunnelId: string,
  ): Promise<void> {
    if (!this.client) {
      throw new Error("Cloudflare client not initialized");
    }

    try {
      // Use the correct API method signature
      await (this.client.dns.records as any).create(zoneId, {
        type: "CNAME",
        name: name,
        content: `${tunnelId}.cfargotunnel.com`,
        proxied: true,
        ttl: 1,
        comment: "Created by AdvancedContainerManager",
      });
    } catch (error) {
      console.error("Failed to create DNS record:", error);
      throw new Error("Failed to create DNS record in Cloudflare");
    }
  }

  async deleteTunnel(tunnelId: string, accountId?: string): Promise<void> {
    if (!this.client) {
      throw new Error("Cloudflare client not initialized");
    }

    const targetAccountId = accountId || this.config?.accountId;
    if (!targetAccountId) {
      throw new Error("Cloudflare account ID is required");
    }

    try {
      // Placeholder - would use cloudflared CLI to delete tunnel
      throw new Error(
        "Tunnel deletion via cloudflared CLI - not yet implemented",
      );
    } catch (error) {
      console.error("Failed to delete Cloudflare tunnel:", error);
      throw new Error("Failed to delete tunnel from Cloudflare");
    }
  }
}
