import { Logger } from "../utils/logger";

const Database = require("better-sqlite3");

const DEFAULTS: Record<string, any> = {
  "general.theme": "light",
  "general.language": "en",
  "general.autoRefresh": true,
  "general.refreshInterval": 5000,
  "notifications.enabled": true,
  "notifications.containerEvents": true,
  "notifications.systemAlerts": true,
  "notifications.emailNotifications": false,
  "docker.defaultRegistry": "docker.io",
  "docker.autoPrune": false,
  "docker.pruneInterval": 86400000,
  "docker.maxContainers": 50,
  "security.requireAuth": false,
  "security.sessionTimeout": 3600000,
  "security.maxLoginAttempts": 5,
  "api.rateLimit": true,
  "api.maxRequests": 100,
  "api.windowMs": 900000,
};

export class SettingsService {
  private db: any;
  private logger: Logger;

  constructor(logger: Logger, databasePath: string) {
    this.logger = logger;
    this.db = new Database(databasePath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  private get(key: string): any {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    if (row) {
      try { return JSON.parse(row.value); } catch { return row.value; }
    }
    return DEFAULTS[key] ?? null;
  }

  private set(key: string, value: any): void {
    this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, JSON.stringify(value));
  }

  public getAll(): Record<string, any> {
    const rows = this.db.prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
    const stored: Record<string, any> = {};
    for (const row of rows) {
      try { stored[row.key] = JSON.parse(row.value); } catch { stored[row.key] = row.value; }
    }

    const merged = { ...DEFAULTS, ...stored };
    const sections: Record<string, Record<string, any>> = {};
    for (const [key, val] of Object.entries(merged)) {
      const [section, field] = key.split(".");
      if (!sections[section]) sections[section] = {};
      sections[section][field] = val;
    }
    return sections;
  }

  public saveSection(section: string, values: Record<string, any>): void {
    const upsert = this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const tx = this.db.transaction(() => {
      for (const [field, val] of Object.entries(values)) {
        upsert.run(`${section}.${field}`, JSON.stringify(val));
      }
    });
    tx();
    this.logger.info(`Settings saved for section: ${section}`);
  }

  public getSectionValue<T>(section: string, field: string): T {
    return this.get(`${section}.${field}`) as T;
  }
}
