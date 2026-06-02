import * as crypto from "crypto";
import { Logger } from "../utils/logger";

const Database = require("better-sqlite3");

export interface Session {
  token: string;
  createdAt: string;
  expiresAt: string;
}

export class AuthService {
  private db: any;
  private logger: Logger;
  private sessionTimeoutMs: number;

  constructor(logger: Logger, databasePath: string, sessionTimeoutMs = 3600000) {
    this.logger = logger;
    this.sessionTimeoutMs = sessionTimeoutMs;
    this.db = new Database(databasePath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_users (
        username TEXT PRIMARY KEY,
        salt TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `);

    const existing = this.db.prepare("SELECT COUNT(*) as c FROM auth_users").get() as { c: number };
    if (existing.c === 0) {
      this.createUser("admin", "admin");
      this.logger.info("Created default admin user (username: admin, password: admin)");
    }
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  }

  public createUser(username: string, password: string): void {
    const salt = crypto.randomBytes(32).toString("hex");
    const hash = this.hashPassword(password, salt);
    this.db.prepare(`
      INSERT INTO auth_users (username, salt, hash, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET salt=excluded.salt, hash=excluded.hash
    `).run(username, salt, hash, new Date().toISOString());
  }

  public changePassword(username: string, oldPassword: string, newPassword: string): void {
    if (!this.verifyPassword(username, oldPassword)) {
      throw new Error("Current password is incorrect");
    }
    this.createUser(username, newPassword);
    this.revokeAllSessions(username);
    this.logger.info(`Password changed for user: ${username}`);
  }

  public verifyPassword(username: string, password: string): boolean {
    const row = this.db.prepare("SELECT salt, hash FROM auth_users WHERE username = ?").get(username) as { salt: string; hash: string } | undefined;
    if (!row) return false;
    const hash = this.hashPassword(password, row.salt);
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(row.hash, "hex"));
  }

  public createSession(username: string): Session {
    this.cleanExpiredSessions();
    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date();
    const expires = new Date(now.getTime() + this.sessionTimeoutMs);
    this.db.prepare("INSERT INTO auth_sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
      token, username, now.toISOString(), expires.toISOString(),
    );
    return { token, createdAt: now.toISOString(), expiresAt: expires.toISOString() };
  }

  public validateSession(token: string): string | null {
    const row = this.db.prepare("SELECT username, expires_at FROM auth_sessions WHERE token = ?").get(token) as { username: string; expires_at: string } | undefined;
    if (!row) return null;
    if (new Date(row.expires_at) < new Date()) {
      this.db.prepare("DELETE FROM auth_sessions WHERE token = ?").run(token);
      return null;
    }
    return row.username;
  }

  public revokeSession(token: string): void {
    this.db.prepare("DELETE FROM auth_sessions WHERE token = ?").run(token);
  }

  private revokeAllSessions(username: string): void {
    this.db.prepare("DELETE FROM auth_sessions WHERE username = ?").run(username);
  }

  private cleanExpiredSessions(): void {
    this.db.prepare("DELETE FROM auth_sessions WHERE expires_at < ?").run(new Date().toISOString());
  }

  public isAuthEnabled(): boolean {
    return true;
  }
}
