import * as https from "https";
import { Logger } from "../utils/logger";

const Database = require("better-sqlite3");

export interface GitAccount {
  id: string;
  provider: "github" | "gitlab";
  username: string;
  token: string;
  addedAt: string;
}

export interface GitRepo {
  id: number;
  name: string;
  fullName: string;
  cloneUrl: string;
  sshUrl: string;
  private: boolean;
  description: string | null;
  defaultBranch: string;
  updatedAt: string;
}

export class GitAccountService {
  private accounts: Map<string, GitAccount> = new Map();
  private logger: Logger;
  private database: any;

  constructor(logger: Logger, databasePath: string) {
    this.logger = logger;
    this.database = new Database(databasePath);
    this.initDatabase();
    this.loadAccounts();
  }

  private initDatabase(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS git_accounts (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  private loadAccounts(): void {
    const rows = this.database
      .prepare("SELECT id, payload FROM git_accounts")
      .all() as Array<{ id: string; payload: string }>;
    for (const row of rows) {
      this.accounts.set(row.id, JSON.parse(row.payload));
    }
    this.logger.info(`Loaded ${this.accounts.size} git accounts from database`);
  }

  private saveAccount(account: GitAccount): void {
    this.database
      .prepare(`
        INSERT INTO git_accounts (id, payload, updated_at)
        VALUES (@id, @payload, @updated_at)
        ON CONFLICT(id) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `)
      .run({
        id: account.id,
        payload: JSON.stringify(account),
        updated_at: new Date().toISOString(),
      });
  }

  private deleteAccount(id: string): void {
    this.database.prepare("DELETE FROM git_accounts WHERE id = ?").run(id);
  }

  private apiFetch(url: string, token: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const req = https.get(
        {
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": "AdvancedContainerManager/1.0",
            Accept: "application/vnd.github+json",
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const body = JSON.parse(data);
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(body.message || `HTTP ${res.statusCode}`));
              } else {
                resolve(body);
              }
            } catch {
              reject(new Error("Failed to parse API response"));
            }
          });
        },
      );
      req.on("error", reject);
    });
  }

  public async addAccount(
    provider: "github" | "gitlab",
    token: string,
  ): Promise<GitAccount> {
    let username: string;

    if (provider === "github") {
      const user = await this.apiFetch("https://api.github.com/user", token);
      username = user.login;
    } else {
      const user = await this.apiFetch("https://gitlab.com/api/v4/user", token);
      username = user.username;
    }

    const id = `${provider}:${username}`;
    const account: GitAccount = {
      id,
      provider,
      username,
      token,
      addedAt: new Date().toISOString(),
    };

    this.accounts.set(id, account);
    this.saveAccount(account);
    this.logger.info(`Added ${provider} account: ${username}`);
    return account;
  }

  public removeAccount(id: string): boolean {
    const existed = this.accounts.has(id);
    this.accounts.delete(id);
    this.deleteAccount(id);
    return existed;
  }

  public getAccounts(): Omit<GitAccount, "token">[] {
    return Array.from(this.accounts.values()).map(({ token: _t, ...rest }) => rest);
  }

  /** Returns the authenticated HTTPS clone URL for private repos. */
  public getAuthenticatedUrl(accountId: string, cloneUrl: string): string {
    const account = this.accounts.get(accountId);
    if (!account) return cloneUrl;
    try {
      const url = new URL(cloneUrl);
      url.username = account.token;
      url.password = "";
      return url.toString();
    } catch {
      return cloneUrl;
    }
  }

  /** Returns the token for a given account (for injection at clone time). */
  public getToken(accountId: string): string | undefined {
    return this.accounts.get(accountId)?.token;
  }

  public async listRepos(accountId: string, page = 1): Promise<GitRepo[]> {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error("Account not found");

    if (account.provider === "github") {
      const data = await this.apiFetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator`,
        account.token,
      );
      return (data as any[]).map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        cloneUrl: r.clone_url,
        sshUrl: r.ssh_url,
        private: r.private,
        description: r.description,
        defaultBranch: r.default_branch,
        updatedAt: r.updated_at,
      }));
    } else {
      const data = await this.apiFetch(
        `https://gitlab.com/api/v4/projects?membership=true&per_page=100&page=${page}&order_by=last_activity_at`,
        account.token,
      );
      return (data as any[]).map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.path_with_namespace,
        cloneUrl: r.http_url_to_repo,
        sshUrl: r.ssh_url_to_repo,
        private: r.visibility !== "public",
        description: r.description,
        defaultBranch: r.default_branch,
        updatedAt: r.last_activity_at,
      }));
    }
  }

  public async listBranches(accountId: string, repoFullName: string): Promise<string[]> {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error("Account not found");

    if (account.provider === "github") {
      const data = await this.apiFetch(
        `https://api.github.com/repos/${repoFullName}/branches?per_page=100`,
        account.token,
      );
      return (data as any[]).map((b) => b.name);
    } else {
      const encoded = encodeURIComponent(repoFullName);
      const data = await this.apiFetch(
        `https://gitlab.com/api/v4/projects/${encoded}/repository/branches?per_page=100`,
        account.token,
      );
      return (data as any[]).map((b) => b.name);
    }
  }
}
