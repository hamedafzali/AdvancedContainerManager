import * as https from "https";
import { Logger } from "../utils/logger";

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

  constructor(logger: Logger) {
    this.logger = logger;
  }

  private fetch(url: string, token: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "AdvancedContainerManager/1.0",
          Accept: "application/vnd.github+json",
        },
      };

      const req = https.get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
            } else {
              resolve(parsed);
            }
          } catch {
            reject(new Error("Failed to parse API response"));
          }
        });
      });

      req.on("error", reject);
    });
  }

  public async addAccount(
    provider: "github" | "gitlab",
    token: string,
  ): Promise<GitAccount> {
    let username: string;

    if (provider === "github") {
      const user = await this.fetch("https://api.github.com/user", token);
      username = user.login;
    } else {
      const user = await this.fetch("https://gitlab.com/api/v4/user", token);
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
    this.logger.info(`Added ${provider} account: ${username}`);
    return account;
  }

  public removeAccount(id: string): boolean {
    const existed = this.accounts.has(id);
    this.accounts.delete(id);
    return existed;
  }

  public getAccounts(): GitAccount[] {
    return Array.from(this.accounts.values()).map((a) => ({
      ...a,
      token: "***",
    }));
  }

  public async listRepos(accountId: string, page = 1): Promise<GitRepo[]> {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error("Account not found");

    if (account.provider === "github") {
      const data = await this.fetch(
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
      const data = await this.fetch(
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

  public async listBranches(
    accountId: string,
    repoFullName: string,
  ): Promise<string[]> {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error("Account not found");

    if (account.provider === "github") {
      const data = await this.fetch(
        `https://api.github.com/repos/${repoFullName}/branches?per_page=100`,
        account.token,
      );
      return (data as any[]).map((b) => b.name);
    } else {
      const encoded = encodeURIComponent(repoFullName);
      const data = await this.fetch(
        `https://gitlab.com/api/v4/projects/${encoded}/repository/branches?per_page=100`,
        account.token,
      );
      return (data as any[]).map((b) => b.name);
    }
  }
}
