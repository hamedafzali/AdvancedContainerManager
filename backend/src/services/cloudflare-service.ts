import { Cloudflare } from "cloudflare";
import * as crypto from "crypto";
import { Logger, LogLevel } from "../utils/logger";

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

export interface CloudflareDNSRecord {
  id: string;
  name: string;
  content: string;
}

export interface CloudflareConfig {
  apiToken: string;
  accountId?: string;
}

export class CloudflareService {
  private client: Cloudflare | null = null;
  private config: CloudflareConfig | null = null;
  private resolvedAccountId: string | null = null;
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? new Logger(LogLevel.INFO);
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
    this.resolvedAccountId = config.accountId ?? null;
  }

  clearConfig(): void {
    this.config = null;
    this.client = null;
    this.resolvedAccountId = null;
  }

  /**
   * Tunnel and DNS calls are account-scoped. The account ID is optional in the
   * UI, so fall back to the first account the token can see and cache it.
   */
  async resolveAccountId(accountId?: string): Promise<string> {
    if (accountId) return accountId;
    if (this.resolvedAccountId) return this.resolvedAccountId;
    if (!this.client) throw new Error("Cloudflare client not initialized");

    const accounts = await this.client.accounts.list({ per_page: 5 });
    const first = accounts.result?.[0];
    if (!first?.id) {
      throw new Error(
        "No Cloudflare account is visible to this API token — the token needs Account:Cloudflare Tunnel:Edit",
      );
    }
    this.resolvedAccountId = first.id;
    return first.id;
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
      this.logger.error("Cloudflare token validation failed:", error);
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
      this.logger.error("Failed to fetch Cloudflare zones:", error);
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
      this.logger.error("Failed to create Cloudflare zone:", error);
      throw new Error("Failed to create zone in Cloudflare");
    }
  }

  /**
   * Create a remotely-managed ("cloudflare" config_src) named tunnel. Ingress
   * rules then live in Cloudflare rather than a local YAML file, so cloudflared
   * only ever needs the connector token to run.
   */
  async createTunnel(
    name: string,
    accountId?: string,
  ): Promise<CloudflareTunnel> {
    if (!this.client) {
      throw new Error("Cloudflare client not initialized");
    }

    const targetAccountId = await this.resolveAccountId(
      accountId || this.config?.accountId,
    );

    try {
      const tunnel = await this.client.zeroTrust.tunnels.cloudflared.create({
        account_id: targetAccountId,
        name,
        config_src: "cloudflare",
      });

      return {
        id: tunnel.id!,
        name: tunnel.name ?? name,
        accountId: targetAccountId,
        createdAt: tunnel.created_at ?? new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error("Failed to create Cloudflare tunnel:", error);
      throw new Error(`Failed to create tunnel in Cloudflare: ${error}`);
    }
  }

  async getTunnels(accountId?: string): Promise<CloudflareTunnel[]> {
    if (!this.client) {
      throw new Error("Cloudflare client not initialized");
    }

    const targetAccountId = await this.resolveAccountId(
      accountId || this.config?.accountId,
    );

    try {
      const tunnels: CloudflareTunnel[] = [];
      const page = await this.client.zeroTrust.tunnels.cloudflared.list({
        account_id: targetAccountId,
        is_deleted: false,
      });
      for await (const tunnel of page) {
        tunnels.push({
          id: tunnel.id!,
          name: tunnel.name ?? "",
          accountId: targetAccountId,
          createdAt: tunnel.created_at ?? "",
        });
      }
      return tunnels;
    } catch (error) {
      this.logger.error("Failed to fetch Cloudflare tunnels:", error);
      throw new Error(`Failed to fetch tunnels from Cloudflare: ${error}`);
    }
  }

  async findTunnelByName(
    name: string,
    accountId?: string,
  ): Promise<CloudflareTunnel | undefined> {
    if (!this.client) {
      throw new Error("Cloudflare client not initialized");
    }

    const targetAccountId = await this.resolveAccountId(
      accountId || this.config?.accountId,
    );

    const page = await this.client.zeroTrust.tunnels.cloudflared.list({
      account_id: targetAccountId,
      name,
      is_deleted: false,
    });

    for await (const tunnel of page) {
      if (tunnel.name === name) {
        return {
          id: tunnel.id!,
          name: tunnel.name,
          accountId: targetAccountId,
          createdAt: tunnel.created_at ?? "",
        };
      }
    }
    return undefined;
  }

  /**
   * The connector token cloudflared needs to run this tunnel. Safe to fetch
   * repeatedly — it is stable for the lifetime of the tunnel.
   */
  async getTunnelToken(tunnelId: string, accountId?: string): Promise<string> {
    if (!this.client) {
      throw new Error("Cloudflare client not initialized");
    }

    const targetAccountId = await this.resolveAccountId(
      accountId || this.config?.accountId,
    );

    try {
      return await this.client.zeroTrust.tunnels.cloudflared.token.get(
        tunnelId,
        { account_id: targetAccountId },
      );
    } catch (error) {
      this.logger.error("Failed to fetch tunnel token:", error);
      throw new Error(`Failed to fetch tunnel token from Cloudflare: ${error}`);
    }
  }

  /**
   * Point a hostname at a local service. The trailing catch-all rule is
   * mandatory — Cloudflare rejects an ingress list without one.
   */
  async setTunnelIngress(
    tunnelId: string,
    hostname: string,
    service: string,
    accountId?: string,
  ): Promise<void> {
    if (!this.client) {
      throw new Error("Cloudflare client not initialized");
    }

    const targetAccountId = await this.resolveAccountId(
      accountId || this.config?.accountId,
    );

    try {
      await this.client.zeroTrust.tunnels.cloudflared.configurations.update(
        tunnelId,
        {
          account_id: targetAccountId,
          config: {
            // The catch-all rule carries no hostname, which the SDK's Ingress
            // type does not model.
            ingress: [
              { hostname, service },
              { service: "http_status:404" } as any,
            ],
          },
        },
      );
    } catch (error) {
      this.logger.error("Failed to set tunnel ingress:", error);
      throw new Error(`Failed to configure tunnel ingress: ${error}`);
    }
  }

  /**
   * Find the zone that owns a hostname. Picks the longest match so that a
   * delegated subdomain zone wins over its parent.
   */
  async findZoneForHostname(
    hostname: string,
  ): Promise<CloudflareZone | undefined> {
    const zones = await this.getZones();
    return zones
      .filter(
        (zone) => hostname === zone.name || hostname.endsWith(`.${zone.name}`),
      )
      .sort((a, b) => b.name.length - a.name.length)[0];
  }

  /**
   * Upsert the CNAME that routes a hostname into the tunnel. Replaces any
   * existing record on that name so re-creating a tunnel is not blocked by a
   * stale record left behind by an earlier run.
   */
  async upsertTunnelDNSRecord(
    zoneId: string,
    hostname: string,
    tunnelId: string,
    proxied = true,
  ): Promise<CloudflareDNSRecord> {
    if (!this.client) throw new Error("Cloudflare client not initialized");

    const content = `${tunnelId}.cfargotunnel.com`;

    try {
      const existing = await (this.client.dns.records as any).list({
        zone_id: zoneId,
        name: hostname,
      });

      // Only clear records a CNAME actually conflicts with. Deleting every
      // record on the name would take MX/TXT with it, breaking mail and domain
      // verification when the hostname is a zone apex.
      const conflicting = new Set(["A", "AAAA", "CNAME"]);
      for (const record of existing.result ?? []) {
        if (conflicting.has(record.type)) {
          await this.deleteDNSRecord(zoneId, record.id);
        }
      }

      const record = await (this.client.dns.records as any).create({
        zone_id: zoneId,
        type: "CNAME",
        name: hostname,
        content,
        proxied,
        ttl: 1,
        comment: "Created by AdvancedContainerManager tunnel",
      });

      return { id: record.id, name: record.name, content: record.content };
    } catch (error) {
      this.logger.error("Failed to upsert tunnel DNS record:", error);
      throw new Error(`Failed to create tunnel CNAME in Cloudflare: ${error}`);
    }
  }

  async createCNAMERecord(
    zoneId: string,
    subdomain: string,
    target: string,
    proxied = true,
  ): Promise<{ id: string; name: string; content: string }> {
    if (!this.client) throw new Error("Cloudflare client not initialized");
    try {
      const record = await (this.client.dns.records as any).create({
        zone_id: zoneId,
        type: "CNAME",
        name: subdomain,
        content: target,
        proxied,
        ttl: proxied ? 1 : 300,
        comment: "Created by AdvancedContainerManager tunnel",
      });
      return { id: record.id, name: record.name, content: record.content };
    } catch (error) {
      this.logger.error("Failed to create CNAME record:", error);
      throw new Error(`Failed to create CNAME in Cloudflare: ${error}`);
    }
  }

  async deleteDNSRecord(zoneId: string, recordId: string): Promise<void> {
    if (!this.client) throw new Error("Cloudflare client not initialized");
    try {
      await (this.client.dns.records as any).delete(recordId, { zone_id: zoneId });
    } catch (error) {
      this.logger.error("Failed to delete DNS record:", error);
    }
  }

  async deleteTunnel(tunnelId: string, accountId?: string): Promise<void> {
    if (!this.client) {
      throw new Error("Cloudflare client not initialized");
    }

    const targetAccountId = await this.resolveAccountId(
      accountId || this.config?.accountId,
    );

    try {
      await this.client.zeroTrust.tunnels.cloudflared.delete(tunnelId, {
        account_id: targetAccountId,
      });
    } catch (error) {
      this.logger.error("Failed to delete Cloudflare tunnel:", error);
      throw new Error(`Failed to delete tunnel from Cloudflare: ${error}`);
    }
  }
}
