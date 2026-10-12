import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { simpleGit } from "simple-git";
import * as yaml from "js-yaml";
import { ProjectInfo, ProjectHealth, AppConfig } from "../types";
import { Logger } from "../utils/logger";
import { encryptEnvVars, decryptEnvVars } from "../utils/encryption";
import type { WebSocketHandler } from "./websocket-handler";
import {
  findRelativeBindMounts,
  inspectOwnMounts,
  resolveHostPath,
} from "../utils/host-paths";
import {
  DEFAULT_PORT_OFFSETS,
  RenderResult,
  buildVariableRefs,
  builtImageName,
  builtServices,
  defaultComposeProjectName,
  evaluateHealth,
  parseComposePs,
  renderEnvCompose,
  withTag,
} from "../utils/env-compose";

const Database = require("better-sqlite3");

export const PROJECT_ENVIRONMENTS = ["dev", "test", "prod"] as const;

/** Thrown by deployProject() when a deploy for the same project is already
 *  in flight. In-memory only (see ProjectService.inFlightDeploys) — deliberately
 *  NOT backed by the persisted `project.status` field, which never self-heals
 *  a stale "building" value after a crash/restart (see loadProjects). */
export class DeployInProgressError extends Error {
  constructor(
    public readonly projectName: string,
    public readonly startedAt: string,
  ) {
    super(`Deploy already in progress for ${projectName} (started ${startedAt})`);
    this.name = "DeployInProgressError";
  }
}

export class ProjectService {
  private config: AppConfig;
  private logger: Logger;
  private projectsDir: string;
  private configPath: string;
  private databasePath: string;
  private legacyProjectsDir: string;
  private legacyConfigPath: string;
  private database: any;
  private projects: Map<string, ProjectInfo> = new Map();
  /** Deploys currently running, keyed by project name. In-memory by design —
   *  see DeployInProgressError. Cleared in deployProject()'s finally block,
   *  and naturally empty again on process restart. */
  private inFlightDeploys: Map<string, { startedAt: string }> = new Map();
  private wsHandler?: WebSocketHandler;
  /** Host path behind projectsDir, looked up once (see utils/host-paths).
   *  undefined = not looked up yet, null = unknown or not containerized. */
  private projectsHostDir?: string | null;
  /** Resolves an authenticated clone URL for a stored git account (wired in index.ts). */
  private authenticatedUrlResolver?: (
    accountId: string,
    cloneUrl: string,
  ) => string;

  constructor(config: AppConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.projectsDir = config.projectsDir;
    this.configPath = config.configPath;
    this.databasePath = config.databasePath;
    this.legacyProjectsDir = config.legacyProjectsDir || this.projectsDir;
    this.legacyConfigPath = config.legacyConfigPath || this.configPath;
    this.ensureDirectories();
    this.ensureGitSafeDirectories();
    this.database = new Database(this.databasePath);
    this.initializeDatabase();
    this.loadProjects();
  }

  /** ACM runs git (clone/pull) as root over repos owned by other uids, which
   *  modern git rejects with "detected dubious ownership". Trust managed repos
   *  globally (git ignores safe.directory unless it's in global/system config). */
  private ensureGitSafeDirectories(): void {
    try {
      const { execSync } = require("child_process");
      execSync("git config --global --replace-all safe.directory '*'", { stdio: "ignore" });
      this.logger.info("Configured git safe.directory='*' for managed repos");
    } catch (e) {
      this.logger.warn(`Failed to set git safe.directory: ${e}`);
    }
  }

  public setWebSocketHandler(handler: WebSocketHandler): void {
    this.wsHandler = handler;
  }

  /** Wire the git-account service so private repos can be re-cloned during
   *  recovery/sync (see ensureProjectRepo). Set once at startup. */
  public setAuthenticatedUrlResolver(
    resolver: (accountId: string, cloneUrl: string) => string,
  ): void {
    this.authenticatedUrlResolver = resolver;
  }

  /** Strip embedded credentials (https://TOKEN@host/...) from text before it
   *  reaches logs or API responses. */
  private redactCredentials(text: string): string {
    return text.replace(/(https?:\/\/)[^@/\s"']+@/g, "$1***@");
  }

  /** Best authenticated clone URL for a project: uses the stored git account
   *  when available, otherwise the plain repo URL. */
  private resolveCloneUrl(project: ProjectInfo): string {
    if (project.accountId && this.authenticatedUrlResolver) {
      return this.authenticatedUrlResolver(project.accountId, project.repoUrl);
    }
    return project.repoUrl;
  }

  private ensureDirectories(): void {
    try {
      if (!fs.existsSync(this.projectsDir)) {
        fs.mkdirSync(this.projectsDir, { recursive: true });
        this.logger.info(`Created projects directory: ${this.projectsDir}`);
      }

      const databaseDir = path.dirname(this.databasePath);
      if (!fs.existsSync(databaseDir)) {
        fs.mkdirSync(databaseDir, { recursive: true });
        this.logger.info(`Created database directory: ${databaseDir}`);
      }
    } catch (error) {
      this.logger.error(`Error creating projects directory: ${error}`);
    }
  }

  private initializeDatabase(): void {
    try {
      this.database.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          name TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
    } catch (error) {
      this.logger.error("Error initializing projects database:", error);
      throw error;
    }
  }

  private copyDirectoryIfMissing(sourceDir: string, targetDir: string): void {
    if (!fs.existsSync(sourceDir) || sourceDir === targetDir) {
      return;
    }

    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);
      if (!fs.existsSync(targetPath)) {
        fs.cpSync(sourcePath, targetPath, { recursive: true });
        this.logger.info(`Migrated legacy project folder: ${entry.name}`);
      }
    }
  }

  private normalizeImportedProject(
    name: string,
    project: Partial<ProjectInfo>,
  ): ProjectInfo {
    const projectPath = path.join(this.projectsDir, name);
    const composeFile = project.composeFile || "docker-compose.yml";
    const composeFilePath = path.join(projectPath, composeFile);
    const createdAt = project.createdAt || new Date().toISOString();
    const lastUpdated = project.lastUpdated || createdAt;

    return {
      name,
      repoUrl: project.repoUrl || "",
      branch: project.branch || "main",
      path: projectPath,
      dockerfile: project.dockerfile || "Dockerfile",
      composeFile,
      environmentVars: fs.existsSync(composeFilePath)
        ? {
            ...this.extractDefinedEnvVars(composeFilePath),
            ...(project.environmentVars || {}),
          }
        : project.environmentVars || {},
      containers: project.containers || [],
      status: project.status || "configured",
      createdAt,
      lastUpdated,
      ports: fs.existsSync(composeFilePath)
        ? this.extractPortsFromCompose(composeFilePath)
        : project.ports || [],
      buildHistory: project.buildHistory || [],
      deployHistory: project.deployHistory || [],
      healthChecks: project.healthChecks || [],
      autoRestart: project.autoRestart || false,
      resourceLimits: project.resourceLimits || {
        memory: "512m",
        cpu: "0.5",
      },
    };
  }

  private migrateLegacyProjects(): void {
    this.copyDirectoryIfMissing(this.legacyProjectsDir, this.projectsDir);

    let imported = false;
    try {
      if (
        fs.existsSync(this.legacyConfigPath) &&
        fs.statSync(this.legacyConfigPath).isFile()
      ) {
        const data = fs.readFileSync(this.legacyConfigPath, "utf8");
        const config = JSON.parse(data);
        if (config.projects && typeof config.projects === "object") {
          for (const [name, rawProject] of Object.entries(config.projects)) {
            this.projects.set(
              name,
              this.normalizeImportedProject(
                name,
                rawProject as Partial<ProjectInfo>,
              ),
            );
          }
          imported = this.projects.size > 0;
          if (imported) {
            this.logger.info(
              `Imported ${this.projects.size} legacy projects from config file`,
            );
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Legacy config import failed: ${error}`);
    }

    if (!imported && fs.existsSync(this.projectsDir)) {
      const entries = fs.readdirSync(this.projectsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const name = entry.name;
        this.projects.set(name, this.normalizeImportedProject(name, { name }));
      }
      if (this.projects.size > 0) {
        this.logger.info(
          `Reconstructed ${this.projects.size} projects from project folders`,
        );
      }
    }

    if (this.projects.size > 0) {
      this.saveProjects();
    }
  }

  private loadProjects(): void {
    try {
      const rows = this.database
        .prepare("SELECT name, payload FROM projects ORDER BY name")
        .all() as Array<{ name: string; payload: string }>;

      if (rows.length === 0) {
        this.migrateLegacyProjects();
        return;
      }

      this.projects = new Map(
        rows.map((row) => {
          const p = JSON.parse(row.payload) as ProjectInfo;
          p.environmentVars = decryptEnvVars(p.environmentVars || {});
          if (p.envOverrides) {
            p.envOverrides = Object.fromEntries(
              Object.entries(p.envOverrides).map(([env, vars]) => [env, decryptEnvVars(vars || {})]),
            );
          }
          // A persisted "building" status can only mean the process died
          // mid-deploy — inFlightDeploys is in-memory and always empty right
          // after a restart, so no deploy can genuinely still be running.
          // Reset to "error" so reconcileStatus (which deliberately skips
          // "building" projects) is free to correct it on the startup tick.
          if (p.status === "building") p.status = "error";
          return [row.name, p];
        }),
      );
      this.logger.info(`Loaded ${this.projects.size} projects from database`);
    } catch (error) {
      this.logger.error("Error loading projects config:", error);
      this.projects = new Map();
    }
  }

  private saveProjects(): void {
    try {
      const upsert = this.database.prepare(`
        INSERT INTO projects (name, payload, updated_at)
        VALUES (@name, @payload, @updated_at)
        ON CONFLICT(name) DO UPDATE SET
          payload = excluded.payload,
          updated_at = excluded.updated_at
      `);
      const remove = this.database.prepare(
        "DELETE FROM projects WHERE name = ?",
      );
      const existingRows = this.database
        .prepare("SELECT name FROM projects")
        .all() as Array<{ name: string }>;

      const transaction = this.database.transaction(() => {
        for (const [name, project] of this.projects.entries()) {
          const stored = {
            ...project,
            environmentVars: encryptEnvVars(project.environmentVars || {}),
            ...(project.envOverrides
              ? {
                  envOverrides: Object.fromEntries(
                    Object.entries(project.envOverrides).map(([env, vars]) => [env, encryptEnvVars(vars || {})]),
                  ),
                }
              : {}),
          };
          upsert.run({
            name,
            payload: JSON.stringify(stored),
            updated_at: project.lastUpdated || new Date().toISOString(),
          });
        }

        for (const row of existingRows) {
          if (!this.projects.has(row.name)) {
            remove.run(row.name);
          }
        }
      });

      transaction();
      this.logger.debug("Projects configuration saved");
    } catch (error) {
      this.logger.error("Error saving projects config:", error);
    }
  }

  private resolveComposeFile(project: ProjectInfo): string | null {
    const explicit = project.composeFile
      ? path.join(project.path, project.composeFile)
      : null;
    if (explicit && fs.existsSync(explicit)) {
      return explicit;
    }

    const candidates = ["docker-compose.yml", "docker-compose.yaml"];
    for (const candidate of candidates) {
      const candidatePath = path.join(project.path, candidate);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    return null;
  }

  public findComposeFiles(projectPath: string): string[] {
    const results: string[] = [];
    const names = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];

    const scan = (dir: string, depth: number) => {
      if (depth > 4) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath, depth + 1);
        } else if (names.includes(entry.name)) {
          results.push(path.relative(projectPath, fullPath));
        }
      }
    };

    scan(projectPath, 0);
    return results;
  }

  // Unlike extractDefinedEnvVars, this one is NOT YAML-structure-aware — it
  // regex-scans the raw file text for `${VAR...}` patterns wherever they
  // appear, so a var referenced only inside a service's build.args (e.g.
  // NEXT_PUBLIC_SITE_URL) is already matched here with no change needed. What
  // decides "required" vs. not is purely the presence of a default/optional
  // modifier (:-, -, :+, +) or a required-value modifier (:?, ?) — which is
  // orthogonal to which YAML section the reference lives in.
  private extractRequiredEnvVars(composeFile: string): string[] {
    try {
      const content = fs.readFileSync(composeFile, "utf8");
      const required = new Set<string>();
      const regex = /\$\{([A-Z0-9_]+)([^}]*)\}/gi;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        const name = match[1];
        const modifier = match[2] || "";

        // If modifier includes default value (:- or -) or optional substitution (:+ or +), skip.
        const hasDefault =
          modifier.includes(":-") ||
          modifier.includes("-") ||
          modifier.includes(":+") ||
          modifier.includes("+");
        const requiresValue =
          modifier.includes(":?") || modifier.startsWith("?");

        if (requiresValue) {
          required.add(name);
          continue;
        }

        if (!hasDefault) {
          required.add(name);
        }
      }

      return Array.from(required);
    } catch (error) {
      this.logger.warn(`Failed to parse compose env vars: ${error}`);
      return [];
    }
  }

  // The inverse of getMissingEnvVars: keys the project HAS saved that this
  // compose file doesn't reference anywhere (environment, env_file, or
  // build.args) — i.e. editing them in ACM's UI cannot possibly take effect
  // on the next deploy. This happens in practice when a var only made sense
  // under a different compose file (a dev/prod override never adopted by the
  // live one) or was hand-typed once based on a stale .env.example and never
  // pruned. `extractRequiredEnvVars` is intentionally NOT consulted here —
  // it's a raw regex match, not YAML-structure-aware, so it can't enumerate
  // "every var this compose file could reference" the way extractDefinedEnvVars
  // does; it only classifies required-vs-defaulted for vars already found.
  public getUnmanagedEnvVarKeys(projectName: string): string[] {
    const project = this.projects.get(projectName);
    if (!project) return [];
    const composeFile = this.resolveComposeFile(project);
    if (!composeFile) return [];
    const declared = this.extractDefinedEnvVars(composeFile);
    return Object.keys(project.environmentVars || {}).filter(
      (key) => !(key in declared),
    );
  }

  private getMissingEnvVars(
    composeFile: string,
    envVars: Record<string, string>,
  ): string[] {
    const requiredVars = this.extractRequiredEnvVars(composeFile);
    return requiredVars.filter((key) => {
      const inProject = envVars[key] !== undefined && envVars[key] !== "";
      const inProcess =
        process.env[key] !== undefined && process.env[key] !== "";
      return !inProject && !inProcess;
    });
  }

  private resolveComposeValue(rawValue: unknown): string {
    if (rawValue === undefined || rawValue === null) {
      return "";
    }

    const value = String(rawValue);
    const defaultMatch = value.match(/^\$\{[A-Z0-9_]+:-(.*)\}$/i);
    return defaultMatch ? defaultMatch[1] : value;
  }

  private parseEnvFile(envFilePath: string): Record<string, string> {
    const envVars: Record<string, string> = {};
    if (!fs.existsSync(envFilePath) || !fs.statSync(envFilePath).isFile()) {
      return envVars;
    }

    for (const rawLine of fs.readFileSync(envFilePath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        envVars[line] = "";
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      envVars[key] = value.replace(/^['"]|['"]$/g, "");
    }

    return envVars;
  }

  private extractDefinedEnvVars(composeFile: string): Record<string, string> {
    try {
      const composeDir = path.dirname(composeFile);
      const content = fs.readFileSync(composeFile, "utf8");
      const compose = yaml.load(content) as any;
      const envVars: Record<string, string> = {};

      const assign = (key: string, value: unknown) => {
        if (key) {
          envVars[key] = this.resolveComposeValue(value);
        }
      };

      if (!compose || typeof compose !== "object" || !compose.services) {
        return envVars;
      }

      for (const service of Object.values(
        compose.services as Record<string, any>,
      )) {
        if (!service || typeof service !== "object") {
          continue;
        }

        const envFiles = Array.isArray(service.env_file)
          ? service.env_file
          : service.env_file
            ? [service.env_file]
            : [];

        for (const envFile of envFiles) {
          const envFilePath = path.isAbsolute(envFile)
            ? envFile
            : path.join(composeDir, envFile);
          Object.assign(envVars, this.parseEnvFile(envFilePath));
        }

        if (Array.isArray(service.environment)) {
          for (const entry of service.environment) {
            if (typeof entry !== "string") {
              continue;
            }

            const separatorIndex = entry.indexOf("=");
            if (separatorIndex === -1) {
              assign(entry.trim(), "");
            } else {
              assign(
                entry.slice(0, separatorIndex).trim(),
                entry.slice(separatorIndex + 1).trim(),
              );
            }
          }
        } else if (
          service.environment &&
          typeof service.environment === "object"
        ) {
          for (const [key, value] of Object.entries(service.environment)) {
            assign(key, value);
          }
        }

        // build.args is a distinct variable category from environment/env_file:
        // NEXT_PUBLIC_* (and any other) vars declared only here are inlined at
        // image-build time, not passed to the running container's env — but a
        // project can still only configure them through this same
        // environmentVars store, so discovery has to see them too or they're
        // invisible to both pre-population and getMissingEnvVars.
        const buildArgs = service.build?.args;
        if (Array.isArray(buildArgs)) {
          for (const entry of buildArgs) {
            if (typeof entry !== "string") {
              continue;
            }
            const separatorIndex = entry.indexOf("=");
            if (separatorIndex === -1) {
              assign(entry.trim(), "");
            } else {
              assign(
                entry.slice(0, separatorIndex).trim(),
                entry.slice(separatorIndex + 1).trim(),
              );
            }
          }
        } else if (buildArgs && typeof buildArgs === "object") {
          for (const [key, value] of Object.entries(buildArgs)) {
            assign(key, value);
          }
        }
      }

      return envVars;
    } catch (error) {
      this.logger.warn(
        `Failed to extract compose environment variables: ${error}`,
      );
      return {};
    }
  }

  private extractPortsFromCompose(composeFile: string): Array<{
    service: string;
    containerPort: number;
    hostPort?: number;
    protocol: string;
  }> {
    try {
      const content = fs.readFileSync(composeFile, "utf8");
      const compose = yaml.load(content) as any;
      const ports: Array<{
        service: string;
        containerPort: number;
        hostPort?: number;
        protocol: string;
      }> = [];

      if (compose.services) {
        for (const [serviceName, service] of Object.entries(compose.services)) {
          const serviceConfig = service as any;
          if (serviceConfig.ports) {
            for (const portMapping of serviceConfig.ports) {
              let containerPort: number;
              let hostPort: number | undefined;
              let protocol = "tcp";
              const parsed = this.parsePortMapping(portMapping);
              containerPort = parsed.containerPort;
              hostPort = parsed.hostPort;
              protocol = parsed.protocol;

              if (containerPort && !isNaN(containerPort)) {
                ports.push({
                  service: serviceName,
                  containerPort,
                  hostPort,
                  protocol,
                });
              }
            }
          }
        }
      }

      return ports;
    } catch (error) {
      this.logger.warn(`Failed to extract ports from compose file: ${error}`);
      return [];
    }
  }

  /** Broadcast a command's output over the project deploy-log channel so the
   *  UI can stream it live (used by stop/restart/build as well as deploys). */
  private deployLogStreamer(name: string, stream: "stdout" | "stderr") {
    return (chunk: string) => {
      this.wsHandler?.broadcastProjectDeployLog({
        projectName: name,
        stream,
        chunk,
        timestamp: new Date().toISOString(),
      });
    };
  }

  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    extraEnv: Record<string, string> = {},
    onStdout?: (chunk: string) => void,
    onStderr?: (chunk: string) => void,
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          ...extraEnv,
        },
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        onStdout?.(chunk);
      });

      child.stderr.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        onStderr?.(chunk);
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        resolve({ stdout, stderr, code: code ?? 0 });
      });
    });
  }

  private isComposeUnavailable(output: string): boolean {
    const message = output.toLowerCase();
    return (
      message.includes("unknown shorthand flag") ||
      message.includes("is not a docker command") ||
      message.includes("docker: 'compose' is not a docker command") ||
      message.includes("no such file or directory")
    );
  }

  private async runCompose(
    project: ProjectInfo,
    args: string[],
    onStdout?: (chunk: string) => void,
    onStderr?: (chunk: string) => void,
  ): Promise<{
    stdout: string;
    stderr: string;
    code: number;
    command: string;
  }> {
    const cwd = project.path;
    // Prod's per-env overrides apply to every prod compose run, as they do to
    // dev/test, instead of being saved and then silently ignored.
    const env = this.mergedEnvFor(project, "prod");
    const dockerArgs = args;
    const dockerComposeArgs = args[0] === "compose" ? args.slice(1) : args;

    const dockerResult = await this.runCommand(
      "docker",
      dockerArgs,
      cwd,
      env,
      onStdout,
      onStderr,
    );
    if (dockerResult.code === 0) {
      return { ...dockerResult, command: "docker" };
    }

    const combined = `${dockerResult.stdout}\n${dockerResult.stderr}`;
    if (!this.isComposeUnavailable(combined)) {
      return { ...dockerResult, command: "docker" };
    }

    const composeResult = await this.runCommand(
      "docker-compose",
      dockerComposeArgs,
      cwd,
      env,
      onStdout,
      onStderr,
    );
    return { ...composeResult, command: "docker-compose" };
  }

  private async runPostDeploySeedHook(
    project: ProjectInfo,
  ): Promise<{ output: string; executed: boolean }> {
    const scriptPath = path.join(project.path, "scripts", "seed-mongo.sh");
    if (!fs.existsSync(scriptPath)) {
      return { output: "", executed: false };
    }

    this.logger.info(`Running post-deploy seed hook for ${project.name}`);
    const result = await this.runCommand(
      "sh",
      [scriptPath],
      project.path,
      project.environmentVars || {},
    );

    const combined = [result.stdout, result.stderr].filter(Boolean).join("\n");
    if (result.code !== 0) {
      this.logger.warn(
        `Post-deploy seed hook failed for ${project.name}: ${combined || "no output"}`,
      );
      return {
        output: `Post-deploy seed failed (exit ${result.code}). ${combined}`,
        executed: true,
      };
    }

    this.logger.info(
      `Post-deploy seed hook succeeded for ${project.name}: ${combined || "no output"}`,
    );
    return { output: combined, executed: true };
  }

  private async ensureProjectRepo(
    project: ProjectInfo,
  ): Promise<{ recovered: boolean; note?: string }> {
    const gitDir = path.join(project.path, ".git");
    if (fs.existsSync(gitDir)) {
      return { recovered: false };
    }

    const probe = await this.runCommand(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      project.path,
      project.environmentVars,
    ).catch(() => ({ stdout: "", stderr: "", code: 1 }));

    if (probe.code === 0 && probe.stdout.trim() === "true") {
      return { recovered: false };
    }

    if (!project.repoUrl) {
      throw new Error(
        `Project ${project.name} repository is missing and cannot be recovered automatically`,
      );
    }

    let note = `Recovered broken project repo from ${project.repoUrl}.`;
    if (fs.existsSync(project.path)) {
      const backupPath = `${project.path}.broken-${Date.now()}`;
      fs.renameSync(project.path, backupPath);
      note = `Recovered broken project repo from ${project.repoUrl}. Previous folder moved to ${backupPath}.`;
      this.logger.warn(
        `Project ${project.name} repository folder was invalid. Moved to ${backupPath}`,
      );
    }

    fs.mkdirSync(path.dirname(project.path), { recursive: true });
    const git = simpleGit();
    try {
      // Use the stored git account so private repos recover too
      await git.clone(this.resolveCloneUrl(project), project.path, [
        "--branch",
        project.branch || "main",
      ]);
    } catch (error: any) {
      // simple-git errors embed the tokenized URL — scrub before rethrowing
      throw new Error(
        this.redactCredentials(String(error?.message ?? error)),
      );
    }
    this.logger.info(`Recovered project repository for ${project.name}`);

    return { recovered: true, note };
  }

  public async addProject(
    name: string,
    repoUrl: string,
    branch: string = "main",
    dockerfile: string = "Dockerfile",
    composeFile: string = "docker-compose.yml",
    environmentVars: Record<string, string> = {},
    authenticatedUrl?: string,
    accountId?: string,
  ): Promise<ProjectInfo> {
    try {
      const projectPath = path.join(this.projectsDir, name);
      const cloneUrl = authenticatedUrl || repoUrl;

      // Clone repository
      const git = simpleGit();

      if (fs.existsSync(projectPath)) {
        const repo = git.cwd(projectPath);
        await repo.fetch("origin", branch);
        await repo.checkout(["-B", branch, `origin/${branch}`]);
        await repo.pull("origin", branch, { "--ff-only": null });
        this.logger.info(
          `Synced existing project on branch ${branch}: ${name}`,
        );
      } else {
        await git.clone(cloneUrl, projectPath, ["--branch", branch]);
        this.logger.info(`Cloned repository for project: ${name}`);
      }

      // Create project info
      const composeFilePath = path.join(projectPath, composeFile);
      const ports = this.extractPortsFromCompose(composeFilePath);
      const discoveredEnvVars = this.extractDefinedEnvVars(composeFilePath);

      const project: ProjectInfo = {
        name,
        repoUrl,
        branch,
        accountId,
        path: projectPath,
        dockerfile,
        composeFile,
        environmentVars: {
          ...discoveredEnvVars,
          ...environmentVars,
        },
        containers: [],
        status: "configured",
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        ports,
        buildHistory: [],
        deployHistory: [],
        healthChecks: [],
        autoRestart: false,
        resourceLimits: {
          memory: "512m",
          cpu: "0.5",
        },
      };

      // Add to projects map
      this.projects.set(name, project);
      this.saveProjects();

      this.logger.info(`Project ${name} added successfully`);
      return project;
    } catch (error: any) {
      // Rethrow a plain Error with credentials scrubbed — simple-git errors
      // carry the tokenized clone URL in their message and task payload,
      // which must never reach logs or API responses.
      const message = this.redactCredentials(String(error?.message ?? error));
      this.logger.error(`Error adding project ${name}: ${message}`);
      throw new Error(message);
    }
  }

  public getProjects(): Map<string, ProjectInfo> {
    return this.projects;
  }

  public async pullLatestProject(
    name: string,
  ): Promise<{ output: string; updated: boolean }> {
    const project = this.projects.get(name);
    if (!project) {
      throw new Error(`Project ${name} not found`);
    }

    if (!fs.existsSync(project.path)) {
      throw new Error(`Project path not found: ${project.path}`);
    }

    try {
      const recovery = await this.ensureProjectRepo(project);

      // Check first, stop only if needed — a plain sync check (nothing new
      // to pull) used to unconditionally `compose down` the live project
      // right here, before we even knew whether anything would change. On a
      // no-op sync that took the project offline for no reason, and if the
      // subsequent deployProject() call then failed or got rejected as a
      // DeployInProgressError (e.g. an overlapping sync-deploy call), the
      // containers were left stopped with nothing bringing them back up.
      // Now the `down` only runs once we know a reset/checkout is about to
      // happen, right before it, so a no-op sync never touches the running
      // containers at all.
      const git = simpleGit();
      const repo = git.cwd(project.path);
      let status = await repo.status();
      const before = status.current || project.branch || "main";

      const hasTrackedChanges =
        status.modified.length > 0 ||
        status.created.length > 0 ||
        status.deleted.length > 0 ||
        status.renamed.length > 0;

      await repo.fetch("origin", before);
      const localHead = (await repo.revparse(["HEAD"])).trim();
      const remoteHead = (await repo.revparse([`origin/${before}`])).trim();
      const updated = localHead !== remoteHead;

      const composeFile = this.resolveComposeFile(project);
      if (composeFile && (hasTrackedChanges || updated)) {
        this.logger.info(
          `Stopping project ${name} before sync using ${path.basename(composeFile)}`,
        );
        const downResult = await this.runCompose(project, [
          "compose",
          "-f",
          composeFile,
          "down",
        ]);
        if (downResult.code !== 0) {
          this.logger.warn(
            `Failed to stop ${name} before sync: ${downResult.stderr || downResult.stdout}`,
          );
        } else {
          project.status = "stopped";
          project.containers = [];
          this.saveProjects();
        }
      }

      let discardedChanges = false;
      if (hasTrackedChanges) {
        this.logger.warn(
          `Discarding local tracked changes before syncing project ${name}`,
        );
        await repo.reset(["--hard", "HEAD"]);
        discardedChanges = true;
        status = await repo.status();
      }

      if (updated) {
        await repo.reset(["--hard", `origin/${before}`]);
      }

      const refreshedComposeFile = this.resolveComposeFile(project);
      if (refreshedComposeFile && fs.existsSync(refreshedComposeFile)) {
        project.ports = this.extractPortsFromCompose(refreshedComposeFile);
        project.environmentVars = {
          ...this.extractDefinedEnvVars(refreshedComposeFile),
          ...(project.environmentVars || {}),
        };
      }

      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      const output = [
        recovery.note || "",
        discardedChanges ? "Discarded local tracked changes before sync." : "",
        updated
          ? `Synced project to origin/${before} (${localHead.slice(0, 7)} -> ${remoteHead.slice(0, 7)}).`
          : `Already up to date with origin/${before} (${remoteHead.slice(0, 7)}).`,
      ]
        .filter(Boolean)
        .join(" ");
      this.logger.info(`Project ${name} updated: ${output}`);

      return { output, updated };
    } catch (error) {
      this.logger.error(`Error pulling latest for project ${name}:`, error);
      throw error;
    }
  }

  public updateProjectEnvironmentVars(
    name: string,
    environmentVars: Record<string, string>,
  ): ProjectInfo {
    const project = this.projects.get(name);
    if (!project) {
      throw new Error(`Project ${name} not found`);
    }

    project.environmentVars = environmentVars || {};
    project.lastUpdated = new Date().toISOString();
    this.saveProjects();

    this.logger.info(`Updated environment variables for project ${name}`);
    return project;
  }

  public linkTunnel(
    name: string,
    tunnelId: string,
    tunnelUrl: string,
    tunnelPort?: number,
    tunnelService?: string,
    tunnelDomain?: string,
  ): ProjectInfo {
    const project = this.projects.get(name);
    if (!project) throw new Error(`Project ${name} not found`);
    project.tunnelId = tunnelId;
    project.tunnelUrl = tunnelUrl;
    project.tunnelPort = tunnelPort;
    project.tunnelService = tunnelService;
    project.tunnelDomain = tunnelDomain;
    project.lastUpdated = new Date().toISOString();
    this.saveProjects();
    this.logger.info(`Linked tunnel ${tunnelId} (port ${tunnelPort}) to project ${name}`);
    return project;
  }

  public unlinkTunnel(name: string): ProjectInfo {
    const project = this.projects.get(name);
    if (!project) throw new Error(`Project ${name} not found`);
    project.tunnelId = undefined;
    project.tunnelUrl = undefined;
    project.tunnelPort = undefined;
    project.tunnelService = undefined;
    project.tunnelDomain = undefined;
    project.cfDnsRecordId = undefined;
    project.cfZoneId = undefined;
    project.lastUpdated = new Date().toISOString();
    this.saveProjects();
    this.logger.info(`Unlinked tunnel from project ${name}`);
    return project;
  }

  public linkDomain(
    name: string,
    domain: string,
    cfDnsRecordId: string,
    cfZoneId: string,
  ): ProjectInfo {
    const project = this.projects.get(name);
    if (!project) throw new Error(`Project ${name} not found`);
    project.tunnelDomain = domain;
    project.cfDnsRecordId = cfDnsRecordId;
    project.cfZoneId = cfZoneId;
    project.lastUpdated = new Date().toISOString();
    this.saveProjects();
    this.logger.info(`Linked Cloudflare domain ${domain} to project ${name}`);
    return project;
  }

  public unlinkDomain(name: string): ProjectInfo {
    const project = this.projects.get(name);
    if (!project) throw new Error(`Project ${name} not found`);
    project.tunnelDomain = undefined;
    project.cfDnsRecordId = undefined;
    project.cfZoneId = undefined;
    project.lastUpdated = new Date().toISOString();
    this.saveProjects();
    return project;
  }

  private validatePort(port: number): void {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port value: ${port}`);
    }
  }

  private getPortKey(containerPort: number, protocol: string): string {
    return `${containerPort}/${(protocol || "tcp").toLowerCase()}`;
  }

  private parsePortMapping(portMapping: any): {
    containerPort: number;
    hostPort?: number;
    protocol: string;
  } {
    // Numeric port: just the container port, no host binding (e.g. yaml parsed "- 3000" as number)
    if (typeof portMapping === "number") {
      return { containerPort: portMapping, hostPort: undefined, protocol: "tcp" };
    }

    if (typeof portMapping === "string") {
      const [rawMapping, rawProtocol] = portMapping.split("/");
      const segments = rawMapping.split(":");
      // Last segment is always the container port
      const containerPort = parseInt(segments[segments.length - 1], 10);
      // Second-to-last is host port only when there are at least 2 segments
      // and it's numeric (not an IP address)
      let hostPort: number | undefined;
      if (segments.length >= 2) {
        const candidate = parseInt(segments[segments.length - 2], 10);
        if (!isNaN(candidate)) hostPort = candidate;
      }
      return {
        containerPort,
        hostPort,
        protocol: (rawProtocol || "tcp").toLowerCase(),
      };
    }

    if (portMapping && typeof portMapping === "object") {
      const containerPort = parseInt(String(portMapping.target), 10);
      const hostPort = portMapping.published !== undefined && portMapping.published !== null
        ? parseInt(String(portMapping.published), 10)
        : undefined;
      return {
        containerPort,
        hostPort: hostPort !== undefined && !isNaN(hostPort) ? hostPort : undefined,
        protocol: String(portMapping.protocol || "tcp").toLowerCase(),
      };
    }

    return { containerPort: NaN, hostPort: undefined, protocol: "tcp" };
  }

  // Records which container(s) own each published host port so a caller can
  // tell "this port is held by MY OWN about-to-be-replaced container" apart
  // from "this port is held by someone else's container". Used by both
  // checkPortConflicts() (the deploy-time check) and updateProjectSettings()
  // (the settings-save-time check) — they used to have separate,
  // differently-buggy self-exclusion logic; now they share this one source.
  // `--no-trunc` is required here: `docker compose ps -q` (used below to get
  // a project's own live container IDs) returns full 64-char IDs, and a
  // short-vs-full mismatch would silently defeat the comparison the same way
  // the old bug did.
  private async getUsedHostPortOwners(): Promise<Map<number, Set<string>>> {
    const ownersByPort = new Map<number, Set<string>>();
    try {
      const result = await this.runCommand(
        "docker",
        ["ps", "--no-trunc", "--format", "{{.ID}}\t{{.Ports}}"],
        process.cwd(),
      );
      if (result.code !== 0) {
        return ownersByPort;
      }

      const lines = (result.stdout || "").split("\n").filter(Boolean);
      for (const line of lines) {
        const [id, portsStr] = line.split("\t");
        if (!id || !portsStr) continue;
        const matches = portsStr.matchAll(/:(\d+)->/g);
        for (const match of matches) {
          const port = parseInt(match[1], 10);
          if (isNaN(port)) continue;
          if (!ownersByPort.has(port)) ownersByPort.set(port, new Set());
          ownersByPort.get(port)!.add(id);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to inspect Docker port owners: ${error}`);
    }
    return ownersByPort;
  }

  private formatPortMapping(
    hostPort: number,
    containerPort: number,
    protocol: string,
  ): string {
    const normalizedProtocol = (protocol || "tcp").toLowerCase();
    return `${hostPort}:${containerPort}/${normalizedProtocol}`;
  }

  public async updateProjectSettings(
    name: string,
    payload: {
      repoUrl?: string;
      branch?: string;
      environmentVars?: Record<string, string>;
      composeFile?: string;
      portUpdates?: Array<{
        service: string;
        containerPort: number;
        protocol?: string;
        hostPort: number;
      }>;
    },
  ): Promise<ProjectInfo> {
    const project = this.projects.get(name);
    if (!project) {
      throw new Error(`Project ${name} not found`);
    }

    const requestedRepoUrl = payload.repoUrl?.trim();
    if (requestedRepoUrl !== undefined) {
      project.repoUrl = requestedRepoUrl;
    }

    const requestedBranch = payload.branch?.trim();
    if (requestedBranch !== undefined && requestedBranch.length > 0) {
      project.branch = requestedBranch;
    }

    const requestedComposeFile = payload.composeFile?.trim();

    if (requestedComposeFile) {
      const absoluteComposePath = path.join(project.path, requestedComposeFile);
      if (!fs.existsSync(absoluteComposePath)) {
        throw new Error(`Compose file not found: ${requestedComposeFile}`);
      }
      project.composeFile = requestedComposeFile;
    }

    const composeFile = this.resolveComposeFile(project);
    if (!composeFile) {
      throw new Error("docker-compose file not found in project");
    }

    const discoveredEnvVars = this.extractDefinedEnvVars(composeFile);
    const environmentVars = payload.environmentVars ?? {
      ...discoveredEnvVars,
      ...project.environmentVars,
    };

    if (payload.portUpdates && payload.portUpdates.length > 0) {
      const content = fs.readFileSync(composeFile, "utf8");
      const compose = yaml.load(content) as any;
      if (!compose || typeof compose !== "object" || !compose.services) {
        throw new Error("Invalid compose file structure: services not found");
      }

      const composeServices = compose.services as Record<string, any>;
      const updateByServiceAndPort = new Map<
        string,
        {
          service: string;
          containerPort: number;
          protocol: string;
          hostPort: number;
        }
      >();

      for (const update of payload.portUpdates) {
        const protocol = (update.protocol || "tcp").toLowerCase();
        this.validatePort(update.containerPort);
        this.validatePort(update.hostPort);
        const key = `${update.service}:${this.getPortKey(update.containerPort, protocol)}`;
        updateByServiceAndPort.set(key, {
          ...update,
          protocol,
        });
      }

      for (const [serviceName, serviceConfig] of Object.entries(
        composeServices,
      )) {
        if (!serviceConfig || !Array.isArray(serviceConfig.ports)) {
          continue;
        }

        serviceConfig.ports = serviceConfig.ports.map((portMapping: any) => {
          const parsed = this.parsePortMapping(portMapping);
          const containerPort = parsed.containerPort;
          const protocol = parsed.protocol;

          if (!containerPort || isNaN(containerPort)) {
            return portMapping;
          }

          const updateKey = `${serviceName}:${this.getPortKey(containerPort, protocol)}`;
          const update = updateByServiceAndPort.get(updateKey);
          if (!update) {
            return portMapping;
          }

          if (typeof portMapping === "string") {
            return this.formatPortMapping(
              update.hostPort,
              update.containerPort,
              update.protocol,
            );
          }

          return {
            ...portMapping,
            target: update.containerPort,
            published: update.hostPort,
            protocol: update.protocol,
          };
        });
      }

      const prospectivePorts: Array<{
        service: string;
        containerPort: number;
        hostPort?: number;
        protocol: string;
      }> = [];
      for (const [serviceName, serviceConfig] of Object.entries(
        composeServices,
      )) {
        if (!serviceConfig || !Array.isArray(serviceConfig.ports)) {
          continue;
        }

        for (const portMapping of serviceConfig.ports) {
          const parsed = this.parsePortMapping(portMapping);
          if (!isNaN(parsed.containerPort)) {
            prospectivePorts.push({
              service: serviceName,
              containerPort: parsed.containerPort,
              hostPort: parsed.hostPort,
              protocol: parsed.protocol,
            });
          }
        }
      }

      const hostPortToServices = new Map<number, string[]>();
      for (const entry of prospectivePorts) {
        if (!entry.hostPort) {
          continue;
        }
        if (!hostPortToServices.has(entry.hostPort)) {
          hostPortToServices.set(entry.hostPort, []);
        }
        hostPortToServices
          .get(entry.hostPort)
          ?.push(`${entry.service}:${entry.containerPort}/${entry.protocol}`);
      }

      const duplicateInCompose: string[] = [];
      for (const [hostPort, refs] of hostPortToServices.entries()) {
        if (refs.length > 1) {
          duplicateInCompose.push(
            `Port ${hostPort} is duplicated in ${refs.join(", ")}`,
          );
        }
      }
      if (duplicateInCompose.length > 0) {
        throw new Error(duplicateInCompose.join("; "));
      }

      const conflictsWithProjects: string[] = [];
      for (const [projectName, otherProject] of this.projects.entries()) {
        if (projectName === name) {
          continue;
        }
        for (const otherPort of otherProject.ports || []) {
          if (!otherPort.hostPort) {
            continue;
          }
          if (hostPortToServices.has(otherPort.hostPort)) {
            conflictsWithProjects.push(
              `Port ${otherPort.hostPort} conflicts with project ${projectName} (${otherPort.service})`,
            );
          }
        }
      }
      if (conflictsWithProjects.length > 0) {
        throw new Error(conflictsWithProjects.join("; "));
      }

      // Same self-exclusion checkPortConflicts() applies (see its comment
      // above): a port already held by THIS project's own live containers
      // isn't a conflict — a redeploy replaces them in place on the same
      // host port. This check used to call getUsedHostPortsFromDocker(),
      // which only answers "is anything on this port" with no notion of
      // ownership, so every settings save on a running project flagged all
      // of its own ports as "in use by a running container". Switched to
      // getUsedHostPortOwners() + this project's live container IDs so only
      // a port held by someone else's container is flagged.
      const portOwners = await this.getUsedHostPortOwners();
      let myContainerIds = new Set(project.containers || []);
      try {
        const psResult = await this.runCompose(project, [
          "compose",
          "-f",
          composeFile,
          "ps",
          "-q",
        ]);
        const liveIds = (psResult.stdout || "")
          .split("\n")
          .map((id) => id.trim())
          .filter(Boolean);
        if (liveIds.length > 0) {
          myContainerIds = new Set(liveIds);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to get live containers for ${name} during port-conflict check: ${error}`,
        );
      }

      const conflictsWithRunningContainers: string[] = [];
      for (const hostPort of hostPortToServices.keys()) {
        const owners = portOwners.get(hostPort);
        if (!owners || owners.size === 0) continue;
        const ownedEntirelyByMe = Array.from(owners).every((id) => myContainerIds.has(id));
        if (ownedEntirelyByMe) continue;
        conflictsWithRunningContainers.push(
          `Port ${hostPort} is currently used by a running container`,
        );
      }

      if (conflictsWithRunningContainers.length > 0) {
        this.logger.warn(
          `Port usage conflicts detected for ${name}: ${conflictsWithRunningContainers.join("; ")}`,
        );
      }

      fs.writeFileSync(
        composeFile,
        yaml.dump(compose, { noRefs: true }),
        "utf8",
      );
    }

    project.environmentVars = {
      ...discoveredEnvVars,
      ...(environmentVars || {}),
    };
    project.ports = this.extractPortsFromCompose(composeFile);
    project.lastUpdated = new Date().toISOString();
    this.saveProjects();

    this.logger.info(`Updated settings for project ${name}`);
    return project;
  }

  public getProject(name: string): ProjectInfo | undefined {
    return this.projects.get(name);
  }

  public async updateProjectStatus(
    name: string,
    status: ProjectInfo["status"],
  ): Promise<void> {
    const project = this.projects.get(name);
    if (project) {
      project.status = status;
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();
      this.logger.info(`Project ${name} status updated to: ${status}`);
    }
  }

  public async removeProject(name: string): Promise<void> {
    try {
      const project = this.projects.get(name);
      if (project) {
        // Best-effort runtime cleanup before deleting files/config.
        // 1) Prefer compose down when compose file exists.
        // 2) Fallback to removing tracked container IDs directly.
        try {
          const composeFile = this.resolveComposeFile(project);
          if (composeFile) {
            this.logger.info(
              `Cleaning runtime for project ${name} using ${path.basename(composeFile)}`,
            );
            const downResult = await this.runCompose(project, [
              "compose",
              "-f",
              composeFile,
              "down",
              "--remove-orphans",
            ]);

            if (downResult.code !== 0) {
              this.logger.warn(
                `Compose cleanup failed for ${name}: ${downResult.stderr || downResult.stdout}`,
              );
            }
          }
        } catch (cleanupError) {
          this.logger.warn(
            `Compose cleanup error for project ${name}: ${cleanupError}`,
          );
        }

        if (
          Array.isArray(project.containers) &&
          project.containers.length > 0
        ) {
          for (const containerId of project.containers) {
            try {
              const rmResult = await this.runCommand(
                "docker",
                ["rm", "-f", containerId],
                project.path,
                project.environmentVars,
              );
              if (rmResult.code !== 0) {
                this.logger.warn(
                  `Failed to remove container ${containerId} for ${name}: ${rmResult.stderr || rmResult.stdout}`,
                );
              }
            } catch (containerError) {
              this.logger.warn(
                `Container cleanup error (${containerId}) for ${name}: ${containerError}`,
              );
            }
          }
        }

        // Remove project directory
        if (fs.existsSync(project.path)) {
          await fs.promises.rm(project.path, { recursive: true, force: true });
          this.logger.info(`Removed project directory: ${project.path}`);
        }

        // Remove from projects map
        this.projects.delete(name);
        this.saveProjects();

        this.logger.info(`Project ${name} removed successfully`);
      }
    } catch (error) {
      this.logger.error(`Error removing project ${name}:`, error);
      throw error;
    }
  }

  public async buildProject(name: string): Promise<void> {
    const project = this.projects.get(name);
    if (!project) {
      throw new Error(`Project ${name} not found`);
    }

    // Stream build output over the same channel as deploys so the UI can
    // show live progress in its task log.
    const onBuildChunk =
      (stream: "stdout" | "stderr") => (chunk: string) => {
        this.wsHandler?.broadcastProjectDeployLog({
          projectName: name,
          stream,
          chunk,
          timestamp: new Date().toISOString(),
        });
      };

    try {
      this.wsHandler?.broadcastProjectDeployStatus({
        projectName: name,
        status: "started",
        timestamp: new Date().toISOString(),
      });

      project.status = "building";
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      this.logger.info(`Building project: ${name}`);

      let imageId: string | undefined;
      let buildResult: {
        stdout: string;
        stderr: string;
        code: number;
        command: string;
      };

      const composeFile = this.resolveComposeFile(project);
      if (composeFile) {
        const missingEnvVars = this.getMissingEnvVars(
          composeFile,
          project.environmentVars || {},
        );
        if (missingEnvVars.length > 0) {
          throw new Error(
            `Missing required environment variables: ${missingEnvVars.join(", ")}`,
          );
        }

        buildResult = await this.runCompose(
          project,
          ["compose", "-f", composeFile, "build"],
          onBuildChunk("stdout"),
          onBuildChunk("stderr"),
        );
      } else {
        const dockerfile = project.dockerfile || "Dockerfile";
        const dockerfilePath = path.join(project.path, dockerfile);
        if (!fs.existsSync(dockerfilePath)) {
          throw new Error(`Dockerfile not found: ${dockerfilePath}`);
        }

        imageId = `${name}:latest`;
        buildResult = {
          ...(await this.runCommand(
            "docker",
            ["build", "-f", dockerfilePath, "-t", imageId, "."],
            project.path,
            project.environmentVars,
            onBuildChunk("stdout"),
            onBuildChunk("stderr"),
          )),
          command: "docker",
        };
      }

      if (buildResult.code !== 0) {
        throw new Error(
          buildResult.stderr || buildResult.stdout || "Build failed",
        );
      }

      this.logger.info(
        `Build output for ${name} (${buildResult.command}): ${buildResult.stdout || "no output"}`,
      );

      project.buildHistory.push({
        timestamp: new Date().toISOString(),
        status: "success",
        imageId,
      });

      project.status = "built";
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      this.logger.info(`Project ${name} built successfully`);

      this.wsHandler?.broadcastProjectDeployStatus({
        projectName: name,
        status: "completed",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      project.status = "error";
      project.lastUpdated = new Date().toISOString();
      project.buildHistory.push({
        timestamp: new Date().toISOString(),
        status: "failed",
        error: error.message,
      });
      this.saveProjects();

      this.logger.error(`Error building project ${name}:`, error);

      this.wsHandler?.broadcastProjectDeployStatus({
        projectName: name,
        status: "failed",
        timestamp: new Date().toISOString(),
        error: error.message,
      });
      throw error;
    }
  }

  public async deployProject(
    name: string,
  ): Promise<{ containerIds: string[]; output: string; command: string }> {
    const project = this.projects.get(name);
    if (!project) {
      throw new Error(`Project ${name} not found`);
    }

    // Check-then-set with no `await` in between — Node's single-threaded
    // event loop makes this atomic against a second call arriving in the
    // same tick (e.g. a double-click or an overlapping webhook/MCP call).
    const existingDeploy = this.inFlightDeploys.get(name);
    if (existingDeploy) {
      throw new DeployInProgressError(name, existingDeploy.startedAt);
    }
    this.inFlightDeploys.set(name, { startedAt: new Date().toISOString() });

    try {
      this.wsHandler?.broadcastProjectDeployStatus({
        projectName: name,
        status: "started",
        timestamp: new Date().toISOString(),
      });

      project.status = "building";
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      const composeFile = this.resolveComposeFile(project);
      if (!composeFile) {
        throw new Error("docker-compose file not found in project");
      }

      const missingEnvVars = this.getMissingEnvVars(
        composeFile,
        this.mergedEnvFor(project, "prod"),
      );
      if (missingEnvVars.length > 0) {
        const message = `Missing required environment variables: ${missingEnvVars.join(", ")}`;
        this.logger.error(`Deploy blocked for ${name}: ${message}`);
        throw new Error(message);
      }

      const resourcesFile = this.applyResourceLimits(project, composeFile);

      const warnings = await this.hostPathWarnings(project, composeFile);
      for (const warning of warnings) {
        this.logger.warn(`Deploy ${name}: ${warning}`);
        this.wsHandler?.broadcastProjectDeployLog({
          projectName: name,
          stream: "stderr",
          chunk: `[acm] WARNING: ${warning}\n`,
          timestamp: new Date().toISOString(),
        });
      }

      // Hard port conflict check — block before starting containers
      const conflicts = await this.checkPortConflicts(name, composeFile);
      if (conflicts.length > 0) {
        const message = `Port conflicts detected: ${conflicts.join("; ")}`;
        this.logger.error(`Deploy blocked for ${name}: ${message}`);
        throw new Error(message);
      }

      this.logger.info(
        `Deploying project: ${name} using ${path.basename(composeFile)}`,
      );
      this.logger.info(
        `Project ${name} repo: ${project.repoUrl} branch: ${project.branch} path: ${project.path}`,
      );

      const upResult = await this.runCompose(
        project,
        [
          "compose",
          "-f",
          composeFile,
          ...(resourcesFile ? ["-f", resourcesFile] : []),
          "up",
          "-d",
          "--build",
        ],
        (chunk) => {
          this.wsHandler?.broadcastProjectDeployLog({
            projectName: name,
            stream: "stdout",
            chunk,
            timestamp: new Date().toISOString(),
          });
        },
        (chunk) => {
          this.wsHandler?.broadcastProjectDeployLog({
            projectName: name,
            stream: "stderr",
            chunk,
            timestamp: new Date().toISOString(),
          });
        },
      );

      if (upResult.code !== 0) {
        this.logger.error(
          `Deploy failed for ${name} (${upResult.command}): ${upResult.stderr || upResult.stdout}`,
        );
        this.wsHandler?.broadcastProjectDeployStatus({
          projectName: name,
          status: "failed",
          timestamp: new Date().toISOString(),
          code: upResult.code,
          error: upResult.stderr || upResult.stdout || "Deployment failed",
        });
        throw new Error(
          upResult.stderr || upResult.stdout || "Deployment failed",
        );
      }

      const psResult = await this.runCompose(project, [
        "compose",
        "-f",
        composeFile,
        "ps",
        "-q",
      ]);
      const containerIds = psResult.stdout
        .split("\n")
        .map((id) => id.trim())
        .filter(Boolean);

      this.logger.info(
        `Deploy output for ${name} (${upResult.command}): ${upResult.stdout || "no output"}`,
      );

      const seedHook = await this.runPostDeploySeedHook(project);
      if (seedHook.executed && seedHook.output) {
        this.wsHandler?.broadcastProjectDeployLog({
          projectName: name,
          stream: "stdout",
          chunk: `\n[post-deploy-seed]\n${seedHook.output}\n`,
          timestamp: new Date().toISOString(),
        });
      }
      const deployOutput = [
        ...warnings.map((w) => `[acm] WARNING: ${w}`),
        upResult.stdout || upResult.stderr || "",
        seedHook.executed ? `\n[post-deploy-seed]\n${seedHook.output}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      // Add to deploy history
      project.deployHistory.push({
        timestamp: new Date().toISOString(),
        status: "success",
        containerIds,
        output: deployOutput,
        command: upResult.command,
        env: "prod",
        kind: "deploy",
      });
      try {
        const prodCtx = this.envContext(project, "prod");
        project.envState = {
          ...(project.envState || {}),
          prod: {
            commit: await this.headCommit(project),
            deployedAt: new Date().toISOString(),
            source: "build",
            images: await this.builtImageIds(project, prodCtx),
          },
        };
      } catch (e) {
        this.logger.warn(`Could not record prod state for ${name}: ${e}`);
      }
      project.containers = containerIds;

      project.status = "running";
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      this.logger.info(`Project ${name} deployed successfully`);

      this.wsHandler?.broadcastProjectDeployStatus({
        projectName: name,
        status: "completed",
        timestamp: new Date().toISOString(),
        code: upResult.code,
      });
      return {
        containerIds,
        output: deployOutput,
        command: upResult.command,
      };
    } catch (error) {
      project.status = "error";
      project.lastUpdated = new Date().toISOString();
      project.deployHistory.push({
        timestamp: new Date().toISOString(),
        status: "failed",
        containerIds: [],
        error: error.message,
        output: error.message,
        env: "prod",
        kind: "deploy",
      });
      this.saveProjects();

      this.logger.error(`Error deploying project ${name}:`, error);

      this.wsHandler?.broadcastProjectDeployStatus({
        projectName: name,
        status: "failed",
        timestamp: new Date().toISOString(),
        error: error.message,
      });
      throw error;
    } finally {
      this.inFlightDeploys.delete(name);
    }
  }

  public async stopProject(name: string): Promise<void> {
    const project = this.projects.get(name);
    if (!project) {
      throw new Error(`Project ${name} not found`);
    }

    try {
      project.status = "stopped";
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      const composeFile = this.resolveComposeFile(project);
      if (!composeFile) {
        throw new Error("docker-compose file not found in project");
      }

      this.logger.info(
        `Stopping project: ${name} using ${path.basename(composeFile)}`,
      );

      const downResult = await this.runCompose(
        project,
        ["compose", "-f", composeFile, "down"],
        this.deployLogStreamer(name, "stdout"),
        this.deployLogStreamer(name, "stderr"),
      );

      if (downResult.code !== 0) {
        this.logger.error(
          `Stop failed for ${name} (${downResult.command}): ${downResult.stderr || downResult.stdout}`,
        );
        throw new Error(
          downResult.stderr || downResult.stdout || "Stop failed",
        );
      }

      project.status = "stopped";
      project.lastUpdated = new Date().toISOString();
      project.containers = [];
      this.saveProjects();

      this.logger.info(`Project ${name} stopped successfully`);
    } catch (error) {
      project.status = "error";
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      this.logger.error(`Error stopping project ${name}:`, error);
      throw error;
    }
  }

  public async getProjectLogs(
    name: string,
    tail: number = 200,
    env: string = "prod",
  ): Promise<Array<{ containerId: string; logs: string }>> {
    const project = this.projects.get(name);
    if (!project) {
      throw new Error(`Project ${name} not found`);
    }
    if (!PROJECT_ENVIRONMENTS.includes(env as any)) {
      throw new Error(`Unknown environment: ${env}`);
    }

    const composeFile = this.resolveComposeFile(project);
    if (!composeFile) {
      throw new Error("docker-compose file not found in project");
    }

    // Without -p, Compose falls back to guessing the project name from the
    // directory, which only coincidentally matches prod and never matches
    // dev/test — so a dev-only project would silently show no containers.
    const psResult = await this.runCompose(project, [
      "compose",
      "-p",
      this.envComposeProject(project, env),
      "-f",
      composeFile,
      "ps",
      "-q",
    ]);

    if (psResult.code !== 0) {
      throw new Error(
        psResult.stderr || psResult.stdout || "Failed to list containers",
      );
    }

    const containerIds = psResult.stdout
      .split("\n")
      .map((id) => id.trim())
      .filter(Boolean);

    const logs: Array<{ containerId: string; logs: string }> = [];
    for (const containerId of containerIds) {
      const logResult = await this.runCommand(
        "docker",
        ["logs", "--tail", String(tail), containerId],
        project.path,
        project.environmentVars,
      );
      logs.push({
        containerId,
        logs: logResult.stdout || logResult.stderr || "",
      });
    }

    return logs;
  }

  public async getProjectHealth(name: string, env: string = "prod"): Promise<ProjectHealth> {
    const project = this.projects.get(name);
    if (!project) {
      throw new Error(`Project ${name} not found`);
    }

    const health: ProjectHealth = {
      overall: "healthy",
      containers: [],
      lastCheck: new Date().toISOString(),
      issues: [],
    };

    try {
      const composeFile = this.resolveComposeFile(project);
      if (!composeFile) {
        health.overall = "error";
        health.issues.push("docker-compose file not found in project");
        return health;
      }

      // Explicit -p so dev/test are found; see envComposeProject.
      const psResult = await this.runCompose(project, [
        "compose",
        "-p",
        this.envComposeProject(project, env),
        "-f",
        composeFile,
        "ps",
        "-q",
      ]);

      if (psResult.code !== 0) {
        health.overall = "error";
        health.issues.push(
          psResult.stderr || psResult.stdout || "Failed to list containers",
        );
        return health;
      }

      const containerIds = psResult.stdout
        .split("\n")
        .map((id) => id.trim())
        .filter(Boolean);

      if (containerIds.length === 0) {
        health.overall = "no_containers";
        health.issues.push("No containers running");
        return health;
      }

      for (const containerId of containerIds) {
        const inspectResult = await this.runCommand(
          "docker",
          ["inspect", containerId],
          project.path,
          project.environmentVars,
        );

        if (inspectResult.code !== 0) {
          health.issues.push(
            `Failed to inspect container ${containerId}: ${inspectResult.stderr || inspectResult.stdout}`,
          );
          continue;
        }

        let inspectData: any[] = [];
        try {
          inspectData = JSON.parse(inspectResult.stdout || "[]");
        } catch (parseError) {
          health.issues.push(
            `Invalid inspect data for container ${containerId}`,
          );
          continue;
        }

        const containerInfo = inspectData[0] || {};
        const containerName = (containerInfo.Name || containerId).replace(
          /^\//,
          "",
        );
        const state = containerInfo.State || {};
        const status = state.Status || "unknown";
        const healthState = state.Health?.Status || "unknown";
        const failingStreak = state.Health?.FailingStreak;

        health.containers.push({
          name: containerName,
          status,
          health: healthState,
          failingStreak,
        });

        if (status !== "running") {
          health.issues.push(`Container ${containerName} status: ${status}`);
        }

        if (healthState === "unhealthy") {
          health.issues.push(`Container ${containerName} is unhealthy`);
        }
      }

      if (health.issues.length > 0) {
        health.overall = "unhealthy";
      }
    } catch (error) {
      health.overall = "error";
      health.issues.push(error.message);
      this.logger.error(`Error checking health for project ${name}:`, error);
    }

    return health;
  }

  public async updateProjectHealth(name: string): Promise<void> {
    const health = await this.getProjectHealth(name);

    const project = this.projects.get(name);
    if (project) {
      project.healthChecks.push({
        timestamp: health.lastCheck,
        status:
          health.overall === "error" || health.overall === "no_containers"
            ? "unknown"
            : health.overall,
        issues: health.issues,
      });
      this.saveProjects();
    }
  }

  public getProjectsSummary() {
    return {
      total: this.projects.size,
      byStatus: {
        configured: Array.from(this.projects.values()).filter(
          (p) => p.status === "configured",
        ).length,
        building: Array.from(this.projects.values()).filter(
          (p) => p.status === "building",
        ).length,
        built: Array.from(this.projects.values()).filter(
          (p) => p.status === "built",
        ).length,
        running: Array.from(this.projects.values()).filter(
          (p) => p.status === "running",
        ).length,
        stopped: Array.from(this.projects.values()).filter(
          (p) => p.status === "stopped",
        ).length,
        error: Array.from(this.projects.values()).filter(
          (p) => p.status === "error",
        ).length,
      },
      projects: Array.from(this.projects.entries()).map(([name, project]) => ({
        name,
        status: project.status,
        lastUpdated: project.lastUpdated,
        containerCount: project.containers.length,
      })),
    };
  }
  public async checkPortConflicts(projectName: string, composeFile: string): Promise<string[]> {
    const ports = this.extractPortsFromCompose(composeFile);
    const conflicts: string[] = [];

    // Ports this project actually needs with host bindings
    const neededHostPorts = ports.filter((p) => p.hostPort);
    if (neededHostPorts.length === 0) return [];

    // Conflict with other running projects (excluding this one)
    for (const [otherName, otherProject] of this.projects.entries()) {
      if (otherName === projectName || otherProject.status !== "running") continue;
      for (const myPort of neededHostPorts) {
        for (const theirPort of otherProject.ports || []) {
          if (theirPort.hostPort === myPort.hostPort) {
            conflicts.push(
              `Host port ${myPort.hostPort} (${myPort.service}) already used by project "${otherName}" (${theirPort.service})`,
            );
          }
        }
      }
    }

    // Conflict with containers NOT owned by this project.
    //
    // A redeploy replaces this project's own containers in place — Docker
    // Compose stops the old container and starts the new one on the same
    // host port, so a port already held by a container that's ABOUT TO BE
    // REPLACED is not a conflict. It only becomes a conflict when some other,
    // unrelated container is holding the port.
    //
    // The previous version of this check compared a Set of container-ID
    // strings (this.projects.get(projectName)?.containers) against a port
    // NUMBER (`!myContainerIds.has(String(myPort.hostPort!))`) — a type
    // mismatch that could never match anything, so self-exclusion was a
    // permanent no-op. Every port this project itself already had bound —
    // including the ones its own redeploy was about to reuse — got flagged
    // as "in use by a running container", forcing a full stop of the project
    // before Deploy would proceed.
    const portOwners = await this.getUsedHostPortOwners();

    // this.projects.get(projectName)?.containers can be stale (e.g. it's
    // last refreshed by a previous deploy/status poll), so ask Docker
    // Compose directly for this project's current live container IDs rather
    // than trusting the cache. Same call shape used post-deploy elsewhere in
    // this file (see the "ps", "-q" call after `up -d --build`).
    let myContainerIds = new Set(this.projects.get(projectName)?.containers || []);
    const project = this.projects.get(projectName);
    if (project) {
      try {
        const psResult = await this.runCompose(project, [
          "compose",
          "-f",
          composeFile,
          "ps",
          "-q",
        ]);
        const liveIds = (psResult.stdout || "")
          .split("\n")
          .map((id) => id.trim())
          .filter(Boolean);
        if (liveIds.length > 0) {
          myContainerIds = new Set(liveIds);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to get live containers for ${projectName} during port-conflict check: ${error}`,
        );
      }
    }

    for (const myPort of neededHostPorts) {
      const owners = portOwners.get(myPort.hostPort!);
      if (!owners || owners.size === 0) continue;

      const ownedEntirelyByMe = Array.from(owners).every((id) => myContainerIds.has(id));
      if (ownedEntirelyByMe) continue;

      // Only flag if not already caught by project conflict above
      const alreadyFlagged = conflicts.some((c) => c.includes(`Host port ${myPort.hostPort}`));
      if (!alreadyFlagged) {
        conflicts.push(
          `Host port ${myPort.hostPort} (${myPort.service}) is in use by a running container`,
        );
      }
    }

    return conflicts;
  }

  private static readonly DEFAULT_MEMORY = "512m";
  private static readonly DEFAULT_CPU = "0.5";

  /** Resource limits live in their own compose file next to the project's
   *  compose file and are passed with an explicit `-f` on `up`. ACM always
   *  runs compose with `-f`, so a `docker-compose.override.yml` is never
   *  auto-loaded; writing limits there did nothing and could clobber a
   *  repo's own override file. */
  private static readonly RESOURCES_FILE = "docker-compose.acm-resources.yml";

  /** Writes (or removes) the resource-limits file and returns its path when
   *  the project has non-default limits, otherwise null. */
  private applyResourceLimits(project: ProjectInfo, composeFile: string): string | null {
    const { memory, cpu } = project.resourceLimits || {};
    const resourcesPath = path.join(path.dirname(composeFile), ProjectService.RESOURCES_FILE);

    if (
      (!memory || memory === ProjectService.DEFAULT_MEMORY) &&
      (!cpu || cpu === ProjectService.DEFAULT_CPU)
    ) {
      if (fs.existsSync(resourcesPath)) fs.unlinkSync(resourcesPath);
      return null;
    }

    try {
      const compose = yaml.load(fs.readFileSync(composeFile, "utf8")) as any;
      if (!compose?.services) return null;

      const services: Record<string, any> = {};
      for (const serviceName of Object.keys(compose.services as Record<string, any>)) {
        services[serviceName] = {
          deploy: {
            resources: {
              limits: {
                ...(memory ? { memory } : {}),
                ...(cpu ? { cpus: cpu } : {}),
              },
            },
          },
        };
      }

      fs.writeFileSync(resourcesPath, yaml.dump({ services }, { noRefs: true }), "utf8");
      this.logger.info(`Written resource limits for project ${project.name}`);
      return resourcesPath;
    } catch (error) {
      this.logger.warn(`Failed to write resource limits for ${project.name}: ${error}`);
      return null;
    }
  }

  /** Warn when a project's relative bind mounts will land somewhere other
   *  than its checkout because ACM's projects dir is mounted from a different
   *  host path (see utils/host-paths). This is how a project ends up seeding
   *  or serving stale files from an old host directory. */
  private async hostPathWarnings(project: ProjectInfo, composeFile: string): Promise<string[]> {
    if (this.projectsHostDir === undefined) {
      const mounts = await inspectOwnMounts(this.config.docker.socketPath || "/var/run/docker.sock");
      this.projectsHostDir = mounts ? resolveHostPath(mounts, this.projectsDir) : null;
      if (this.projectsHostDir && this.projectsHostDir !== this.projectsDir) {
        this.logger.warn(
          `Projects dir ${this.projectsDir} is mounted from host ${this.projectsHostDir}; ` +
            `relative bind mounts in project compose files resolve under ${this.projectsDir} on the host`,
        );
      }
    }
    if (!this.projectsHostDir || this.projectsHostDir === this.projectsDir) return [];

    let relative: string[] = [];
    try {
      relative = findRelativeBindMounts(yaml.load(fs.readFileSync(composeFile, "utf8")));
    } catch {
      return [];
    }
    if (relative.length === 0) return [];

    const actualHost = path.join(
      this.projectsHostDir,
      path.relative(this.projectsDir, path.dirname(composeFile)),
    );
    const daemonSees = path.dirname(composeFile);
    return [
      `relative bind mounts (${relative.join(", ")}) resolve to host ${daemonSees}, ` +
        `not to this checkout (host ${actualHost}). Files there may be stale or missing. ` +
        `Bake the files into the image, use a named volume, or mount ACM's projects dir at the same path on host and container.`,
    ];
  }

  /** Reconcile a project's stored status with its actual containers, so the
   *  card reflects reality even when something else (e.g. the pipeline's raw
   *  `docker compose up`) started/stopped it. "degraded" means some but not
   *  all of the project's containers are running. Only flips steady states —
   *  never clobbers an in-progress action (building). Returns true if changed. */
  private async reconcileStatus(name: string): Promise<boolean> {
    const project = this.projects.get(name);
    if (!project) return false;
    if (project.status === "building") return false; // mid-action — leave it
    const composeFile = this.resolveComposeFile(project);
    if (!composeFile) return false;
    try {
      // project.status represents prod specifically (dev/test have their own
      // toggle buttons).
      const composeProject = this.envComposeProject(project, "prod");
      const [allRes, runningRes] = await Promise.all([
        this.runCompose(project, ["compose", "-p", composeProject, "-f", composeFile, "ps", "-q"]),
        this.runCompose(project, ["compose", "-p", composeProject, "-f", composeFile, "ps", "--status", "running", "-q"]),
      ]);
      const total = allRes.stdout.split("\n").map((s) => s.trim()).filter(Boolean).length;
      const running = runningRes.stdout.split("\n").map((s) => s.trim()).filter(Boolean).length;
      const newStatus = total === 0 ? "stopped" : running === total ? "running" : "degraded";
      if (project.status !== newStatus) {
        project.status = newStatus;
        project.lastUpdated = new Date().toISOString();
        return true;
      }
    } catch {
      /* docker not reachable — leave status as-is */
    }
    return false;
  }

  /** Reconcile every project; persist + broadcast any changes. */
  private async reconcileAllStatuses(): Promise<void> {
    let changed = false;
    for (const name of Array.from(this.projects.keys())) {
      if (await this.reconcileStatus(name)) {
        changed = true;
        const project = this.projects.get(name);
        if (project) this.wsHandler?.broadcastProjectStatus({ name, status: project.status });
      }
    }
    if (changed) this.saveProjects();
  }

  private healthPollInterval: ReturnType<typeof setInterval> | null = null;

  public startHealthPolling(wsHandler: WebSocketHandler, intervalMs = 30_000): void {
    if (this.healthPollInterval) return;
    this.wsHandler = wsHandler;
    const tick = async () => {
      // 1) sync stored status with reality (covers pipeline/manual docker changes)
      await this.reconcileAllStatuses();
      // 2) push health for the ones actually running
      for (const [name, project] of this.projects.entries()) {
        if (project.status !== "running" && project.status !== "degraded") continue;
        try {
          const health = await this.getProjectHealth(name, "prod");
          wsHandler.broadcastProjectHealth({ projectName: name, health });
        } catch {}
      }
    };
    void tick(); // reconcile immediately on startup so cards are correct on boot
    this.healthPollInterval = setInterval(tick, intervalMs);
  }

  public stopHealthPolling(): void {
    if (this.healthPollInterval) {
      clearInterval(this.healthPollInterval);
      this.healthPollInterval = null;
    }
  }

  public generateWebhookSecret(name: string): string {
    const project = this.projects.get(name);
    if (!project) throw new Error(`Project ${name} not found`);
    const crypto = require("crypto");
    const secret = crypto.randomBytes(24).toString("hex");
    (project as any).webhookSecret = secret;
    project.lastUpdated = new Date().toISOString();
    this.saveProjects();
    return secret;
  }

  public getWebhookSecret(name: string): string | undefined {
    return (this.projects.get(name) as any)?.webhookSecret;
  }

  // ── Environments (dev / test / prod) ─────────────────────
  // Each environment is a separate compose project on the same host, built
  // from the same checkout:
  //   prod  -> the project's own compose file, exactly as deployProject runs it
  //   dev   -> <name>-dev,  from a rendered docker-compose.acm-dev.yml
  //   test  -> <name>-test, from a rendered docker-compose.acm-test.yml
  // The rendered files (see utils/env-compose.ts) rename containers, shift
  // host ports and give each env its own data directories, so dev/test can run
  // next to prod without touching it. Promotion moves the exact images an env
  // was tested with to the next env instead of rebuilding them.

  private static readonly HEALTH_TIMEOUT_MS = Number(process.env.ACM_ENV_HEALTH_TIMEOUT_MS) || 120_000;

  private sanitizeProjectName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  }

  public composeProjectFor(name: string, env: string): string {
    const base = this.sanitizeProjectName(name);
    return env === "prod" ? base : `${base}-${env}`;
  }

  /** The compose project an env actually runs under. Prod is deployed
   *  without -p (see deployProject), so its name is whatever Compose derives
   *  from the compose file, which is not always the ACM project name. */
  private envComposeProject(project: ProjectInfo, env: string): string {
    if (env !== "prod") return this.composeProjectFor(project.name, env);
    const composeFile = this.resolveComposeFile(project);
    if (!composeFile) return this.composeProjectFor(project.name, env);
    let doc: any = {};
    try {
      doc = yaml.load(fs.readFileSync(composeFile, "utf8")) || {};
    } catch {
      /* unparsable: fall back to the directory name */
    }
    return defaultComposeProjectName(doc, composeFile, this.mergedEnvFor(project, "prod"));
  }

  private mergedEnvFor(project: ProjectInfo, env: string): Record<string, string> {
    return { ...(project.environmentVars || {}), ...((project.envOverrides || {})[env] || {}) };
  }

  private assertEnv(env: string): void {
    if (!PROJECT_ENVIRONMENTS.includes(env as any)) throw new Error(`Unknown environment: ${env}`);
  }

  private requireProject(name: string): ProjectInfo {
    const project = this.projects.get(name);
    if (!project) throw new Error(`Project ${name} not found`);
    return project;
  }

  /** Lock key: prod shares deployProject's key so the two never overlap. */
  private envLockKey(name: string, env: string): string {
    return env === "prod" ? name : `${name}:${env}`;
  }

  private async withEnvLock<T>(name: string, envs: string[], fn: () => Promise<T>): Promise<T> {
    const keys = envs.map((e) => this.envLockKey(name, e));
    for (const key of keys) {
      const existing = this.inFlightDeploys.get(key);
      if (existing) throw new DeployInProgressError(name, existing.startedAt);
    }
    const startedAt = new Date().toISOString();
    for (const key of keys) this.inFlightDeploys.set(key, { startedAt });
    try {
      return await fn();
    } finally {
      for (const key of keys) this.inFlightDeploys.delete(key);
    }
  }

  /** Writes .env.<env> owner-only: it holds the env's secrets in plaintext
   *  for Compose and the pipeline's --env-file. */
  private writeEnvFile(project: ProjectInfo, env: string): string {
    const file = path.join(project.path, `.env.${env}`);
    const merged = this.mergedEnvFor(project, env);
    fs.writeFileSync(
      file,
      Object.entries(merged).map(([k, v]) => `${k}=${v}`).join("\n") + "\n",
      { mode: 0o600 },
    );
    fs.chmodSync(file, 0o600);
    return file;
  }

  /** Keeps ACM's generated files out of `git status` (and out of the way of
   *  `git pull`) without touching the repo's own .gitignore. */
  private excludeGeneratedFiles(project: ProjectInfo): void {
    const exclude = path.join(project.path, ".git", "info", "exclude");
    if (!fs.existsSync(path.dirname(exclude))) return;
    const wanted = ["docker-compose.acm-*.yml", ".acm-env/", ".env.dev", ".env.test", ".env.prod"];
    try {
      const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, "utf8") : "";
      const lines = new Set(current.split("\n").map((l) => l.trim()));
      const missing = wanted.filter((w) => !lines.has(w));
      if (missing.length) {
        const prefix = current && !current.endsWith("\n") ? "\n" : "";
        fs.appendFileSync(exclude, `${prefix}# ACM generated files\n${missing.join("\n")}\n`);
      }
    } catch (e) {
      this.logger.warn(`Could not update .git/info/exclude for ${project.name}: ${e}`);
    }
  }

  private gitTracked(dir: string, rel: string): boolean {
    try {
      const { execFileSync } = require("child_process");
      const out = execFileSync("git", ["ls-files", "--", rel], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      return out.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async headCommit(project: ProjectInfo): Promise<string | null> {
    try {
      return (await simpleGit(project.path).revparse(["HEAD"])).trim();
    } catch {
      return null;
    }
  }

  /**
   * Everything needed to run compose against one env. For dev/test it renders
   * the isolated compose document (and writes it when `write` is set).
   */
  private envContext(project: ProjectInfo, env: string, write = false): EnvContext {
    const composeFile = this.resolveComposeFile(project);
    if (!composeFile) throw new Error("docker-compose file not found in project");
    const dir = path.dirname(composeFile);
    let source: any;
    try {
      source = yaml.load(fs.readFileSync(composeFile, "utf8")) || {};
    } catch (e: any) {
      throw new Error(`Could not parse ${path.basename(composeFile)}: ${e.message}`);
    }
    const merged = this.mergedEnvFor(project, env);

    if (env === "prod") {
      return {
        env,
        composeFile,
        doc: source,
        files: [composeFile],
        composeProject: defaultComposeProjectName(source, composeFile, merged),
        merged,
        render: null,
      };
    }

    const offsetRaw = merged.ACM_PORT_OFFSET;
    const portOffset = offsetRaw !== undefined && offsetRaw !== "" ? Number(offsetRaw) : DEFAULT_PORT_OFFSETS[env] ?? 0;
    if (!Number.isInteger(portOffset)) throw new Error(`ACM_PORT_OFFSET for ${env} must be a whole number`);

    const render = renderEnvCompose(source, {
      env,
      portOffset,
      isTracked: (rel) => this.gitTracked(dir, rel),
      isFile: (rel) => {
        try {
          return fs.statSync(path.join(dir, rel)).isFile();
        } catch {
          return false;
        }
      },
    });
    const rendered = path.join(dir, `docker-compose.acm-${env}.yml`);
    if (write) {
      const header =
        `# Generated by ACM for the "${env}" environment from ${path.basename(composeFile)}.\n` +
        `# Do not edit: it is rewritten on every ${env} deploy.\n`;
      fs.writeFileSync(rendered, header + yaml.dump(render.doc, { noRefs: true, lineWidth: -1 }), "utf8");
      this.excludeGeneratedFiles(project);
    }
    return {
      env,
      composeFile,
      doc: render.doc,
      files: [rendered],
      composeProject: this.composeProjectFor(project.name, env),
      merged,
      render,
    };
  }

  private composeBaseArgs(ctx: EnvContext, envFile?: string): string[] {
    const args = ["compose", "-p", ctx.composeProject];
    for (const f of ctx.files) args.push("-f", f);
    if (envFile) {
      // An explicit --env-file stops Compose from reading the project's .env,
      // so pass that first to keep its defaults, then the env's values on top.
      const dotEnv = path.join(path.dirname(ctx.composeFile), ".env");
      if (fs.existsSync(dotEnv)) args.push("--env-file", dotEnv);
      args.push("--env-file", envFile);
    }
    return args;
  }

  private async envServiceStates(project: ProjectInfo, ctx: EnvContext) {
    const res = await this.runCommand(
      "docker",
      [...this.composeBaseArgs(ctx), "ps", "-a", "--format", "json"],
      project.path,
      ctx.merged,
    );
    if (res.code !== 0) throw new Error(res.stderr || res.stdout || "docker compose ps failed");
    return parseComposePs(res.stdout);
  }

  /** Services that start on a plain `up` (profiled services do not). */
  private expectedServices(doc: any): string[] {
    return Object.entries<any>(doc?.services || {})
      .filter(([, svc]) => !svc?.profiles || svc.profiles.length === 0)
      .map(([n]) => n);
  }

  /** Polls until every service is running/healthy, something fails, or the
   *  timeout passes. */
  private async waitForHealthy(
    project: ProjectInfo,
    ctx: EnvContext,
    log: (line: string) => void,
  ): Promise<{ ok: boolean; detail: string }> {
    const expected = this.expectedServices(ctx.doc);
    const deadline = Date.now() + ProjectService.HEALTH_TIMEOUT_MS;
    let last = "";
    while (Date.now() < deadline) {
      let verdict: ReturnType<typeof evaluateHealth>;
      try {
        verdict = evaluateHealth(await this.envServiceStates(project, ctx), expected);
      } catch (e: any) {
        verdict = { verdict: "pending", detail: e.message };
      }
      if (verdict.verdict === "healthy") return { ok: true, detail: verdict.detail };
      if (verdict.verdict === "failed") return { ok: false, detail: verdict.detail };
      if (verdict.detail !== last) log(`[acm] waiting: ${verdict.detail}`);
      last = verdict.detail;
      await new Promise((r) => setTimeout(r, 3000));
    }
    return { ok: false, detail: `not healthy after ${Math.round(ProjectService.HEALTH_TIMEOUT_MS / 1000)}s (${last})` };
  }

  private async imageId(ref: string, cwd: string): Promise<string | null> {
    const res = await this.runCommand("docker", ["image", "inspect", "-f", "{{.Id}}", ref], cwd);
    return res.code === 0 ? res.stdout.trim() || null : null;
  }

  private async builtImageIds(project: ProjectInfo, ctx: EnvContext) {
    const images: Record<string, string> = {};
    for (const svc of builtServices(ctx.doc)) {
      const id = await this.imageId(builtImageName(ctx.doc, ctx.composeProject, svc), project.path);
      if (id) images[svc] = id;
    }
    return images;
  }

  private recordEnv(
    project: ProjectInfo,
    env: string,
    entry: { status: "success" | "failed"; kind: "deploy" | "promote" | "rollback"; output: string; error?: string },
  ) {
    project.deployHistory.push({
      timestamp: new Date().toISOString(),
      status: entry.status,
      containerIds: [],
      output: entry.output,
      error: entry.error,
      env,
      kind: entry.kind,
    });
    // Keep the persisted payload bounded.
    if (project.deployHistory.length > 100) project.deployHistory.splice(0, project.deployHistory.length - 100);
  }

  public getEnvVars(name: string, env: string): Record<string, string> {
    const project = this.requireProject(name);
    return (project.envOverrides || {})[env] || {};
  }

  public setEnvVars(name: string, env: string, vars: Record<string, string>): void {
    const project = this.requireProject(name);
    this.assertEnv(env);
    for (const key of Object.keys(vars)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid variable name: ${key}`);
    }
    project.envOverrides = { ...(project.envOverrides || {}), [env]: vars };
    this.saveProjects();
    try {
      this.writeEnvFile(project, env);
      this.excludeGeneratedFiles(project);
    } catch (e) {
      this.logger.warn(`Failed to write .env.${env} for ${name}: ${e}`);
    }
  }

  /** Live status of every environment, with what is deployed in it and how
   *  it is isolated from prod. */
  public async getEnvironments(name: string) {
    const project = this.requireProject(name);
    const out = [];
    for (const env of PROJECT_ENVIRONMENTS) {
      let status: "running" | "partial" | "stopped" | "unknown" = "stopped";
      let composeProject = this.composeProjectFor(name, env);
      let ports: Array<{ service: string; host: string; container: string }> = [];
      let isolation: string[] = [];
      let warnings: string[] = [];
      let error: string | undefined;
      try {
        const ctx = this.envContext(project, env);
        composeProject = ctx.composeProject;
        if (ctx.render) {
          ports = ctx.render.hostPorts;
          isolation = ctx.render.changes;
          warnings = ctx.render.warnings;
        } else {
          ports = renderEnvCompose(ctx.doc, { env, portOffset: 0, isTracked: () => true, isFile: () => true }).hostPorts;
        }
        const states = await this.envServiceStates(project, ctx);
        const running = states.filter((s) => s.State === "running").length;
        const expected = this.expectedServices(ctx.doc).length;
        status = running === 0 ? "stopped" : running < expected ? "partial" : "running";
      } catch (e: any) {
        status = "unknown";
        error = e.message;
      }
      const state = project.envState?.[env];
      const last = [...(project.deployHistory || [])]
        .reverse()
        .find((h) => (h.env || "prod") === env);
      out.push({
        env,
        status,
        composeProject,
        configured: env === "prod" || !!(project.envOverrides || {})[env] || !!state,
        commit: state?.commit ?? null,
        deployedAt: state?.deployedAt ?? null,
        source: state?.source ?? null,
        promotedFrom: state?.promotedFrom ?? null,
        lastResult: last ? { status: last.status, timestamp: last.timestamp, kind: last.kind || "deploy", error: last.error } : null,
        ports,
        isolation,
        warnings,
        error,
      });
    }
    return { environments: out, headCommit: await this.headCommit(project) };
  }

  /** Builds and starts one env from the current checkout. Prod goes through
   *  deployProject so both paths share one lock, history and set of checks. */
  public async deployEnvironment(name: string, env: string): Promise<{ output: string }> {
    const project = this.requireProject(name);
    this.assertEnv(env);

    if (env === "prod") {
      const result = await this.deployProject(name);
      return { output: result.output };
    }

    return this.withEnvLock(name, [env], async () => {
      const lines: string[] = [];
      const log = (line: string) => {
        lines.push(line);
        this.deployLogStreamer(name, "stdout")(line + "\n");
      };
      this.wsHandler?.broadcastProjectDeployStatus({ projectName: name, status: "started", timestamp: new Date().toISOString() });
      try {
        const ctx = this.envContext(project, env, true);
        for (const c of ctx.render!.changes) log(`[acm] ${env}: ${c}`);
        for (const w of ctx.render!.warnings) log(`[acm] WARNING: ${w}`);
        const envFile = this.writeEnvFile(project, env);
        const resourcesFile = this.applyResourceLimits(project, ctx.composeFile);
        const commit = await this.headCommit(project);

        const args = this.composeBaseArgs(ctx, envFile);
        if (resourcesFile) args.splice(args.indexOf("--env-file"), 0, "-f", resourcesFile);
        const up = await this.runCommand(
          "docker",
          [...args, "up", "-d", "--build", "--remove-orphans"],
          project.path,
          ctx.merged,
          this.deployLogStreamer(name, "stdout"),
          this.deployLogStreamer(name, "stderr"),
        );
        lines.push(up.stdout, up.stderr);
        if (up.code !== 0) throw new Error(up.stderr || up.stdout || "Deploy failed");

        const health = await this.waitForHealthy(project, ctx, log);
        if (!health.ok) throw new Error(`${env} started but is not healthy: ${health.detail}`);
        log(`[acm] ${env} healthy: ${health.detail}`);

        project.envState = {
          ...(project.envState || {}),
          [env]: { commit, deployedAt: new Date().toISOString(), source: "build", images: await this.builtImageIds(project, ctx) },
        };
        this.recordEnv(project, env, { status: "success", kind: "deploy", output: lines.filter(Boolean).join("\n") });
        this.saveProjects();
        this.wsHandler?.broadcastProjectDeployStatus({ projectName: name, status: "completed", timestamp: new Date().toISOString(), code: 0 });
        return { output: lines.filter(Boolean).join("\n") };
      } catch (e: any) {
        this.recordEnv(project, env, { status: "failed", kind: "deploy", output: lines.filter(Boolean).join("\n"), error: e.message });
        this.saveProjects();
        this.wsHandler?.broadcastProjectDeployStatus({ projectName: name, status: "failed", timestamp: new Date().toISOString(), error: e.message });
        throw e;
      }
    });
  }

  /**
   * Moves the images running in `from` to the next env without rebuilding,
   * so the next stage runs exactly what was tested. The target's previous
   * images are kept as `:acm-rollback` and restored if the target does not
   * come up healthy.
   */
  public async promoteEnvironment(name: string, from: string, to: string): Promise<{ output: string; warnings: string[] }> {
    const project = this.requireProject(name);
    this.assertEnv(from);
    this.assertEnv(to);
    const order = PROJECT_ENVIRONMENTS as readonly string[];
    if (order.indexOf(to) !== order.indexOf(from) + 1) {
      throw new Error(`Promotion goes one stage at a time (${order.join(" → ")}); ${from} → ${to} is not allowed`);
    }

    return this.withEnvLock(name, [from, to], async () => {
      const lines: string[] = [];
      const warnings: string[] = [];
      const log = (line: string) => {
        lines.push(line);
        this.deployLogStreamer(name, "stdout")(line + "\n");
      };
      const fromState = project.envState?.[from];
      if (!fromState) throw new Error(`${from} has not been deployed by ACM yet; deploy it first`);

      const fromCtx = this.envContext(project, from);
      const fromHealth = evaluateHealth(await this.envServiceStates(project, fromCtx), this.expectedServices(fromCtx.doc));
      if (fromHealth.verdict !== "healthy") {
        throw new Error(`${from} is not healthy (${fromHealth.detail}); fix it before promoting`);
      }

      const toCtx = this.envContext(project, to, to !== "prod");
      const fromEnv = fromCtx.merged;
      const toEnv = toCtx.merged;

      // Values baked in at build time would carry the wrong env's config.
      const baked: string[] = [];
      for (const svc of builtServices(fromCtx.doc)) {
        for (const v of buildVariableRefs(fromCtx.doc, svc)) {
          if ((fromEnv[v] ?? "") !== (toEnv[v] ?? "")) baked.push(`${svc}: ${v}`);
        }
      }
      if (baked.length) {
        throw new Error(
          `These build-time variables differ between ${from} and ${to}, so ${from}'s images cannot be reused: ` +
            `${baked.join(", ")}. Make them runtime variables, or deploy ${to} directly.`,
        );
      }

      const head = await this.headCommit(project);
      if (fromState.commit && head && head !== fromState.commit) {
        warnings.push(
          `The checkout is at ${head.slice(0, 7)} but ${from} was built from ${fromState.commit.slice(0, 7)}. ` +
            `Images come from ${from}; files mounted from the checkout come from ${head.slice(0, 7)}.`,
        );
      }
      for (const w of warnings) log(`[acm] WARNING: ${w}`);

      // Retag: from's image IDs become the names `to` runs.
      const retagged: Array<{ svc: string; target: string; previous: string | null }> = [];
      for (const svc of builtServices(fromCtx.doc)) {
        const target = builtImageName(toCtx.doc, toCtx.composeProject, svc);
        if (target.includes("$")) throw new Error(`${svc}: image name ${target} uses a variable; promotion cannot resolve it`);
        const sourceId =
          (fromState.images[svc] && (await this.imageId(fromState.images[svc], project.path))) ||
          (await this.imageId(builtImageName(fromCtx.doc, fromCtx.composeProject, svc), project.path));
        if (!sourceId) throw new Error(`${svc}: ${from}'s image is gone (pruned?); redeploy ${from} first`);
        const previous = await this.imageId(target, project.path);
        if (previous) await this.runCommand("docker", ["tag", previous, withTag(target, "acm-rollback")], project.path);
        const tag = await this.runCommand("docker", ["tag", sourceId, target], project.path);
        if (tag.code !== 0) throw new Error(`docker tag ${svc} failed: ${tag.stderr}`);
        retagged.push({ svc, target, previous });
        log(`[acm] ${svc}: ${from} image ${sourceId.slice(7, 19)} -> ${target}`);
      }

      const up = async () => {
        if (to === "prod") {
          return this.runCompose(
            project,
            [
              "compose",
              "-f",
              toCtx.composeFile,
              ...((r) => (r ? ["-f", r] : []))(this.applyResourceLimits(project, toCtx.composeFile)),
              "up",
              "-d",
              "--no-build",
              "--remove-orphans",
            ],
            this.deployLogStreamer(name, "stdout"),
            this.deployLogStreamer(name, "stderr"),
          );
        }
        const envFile = this.writeEnvFile(project, to);
        const args = this.composeBaseArgs(toCtx, envFile);
        const resourcesFile = this.applyResourceLimits(project, toCtx.composeFile);
        if (resourcesFile) args.splice(args.indexOf("--env-file"), 0, "-f", resourcesFile);
        return this.runCommand(
          "docker",
          [...args, "up", "-d", "--no-build", "--remove-orphans"],
          project.path,
          toCtx.merged,
          this.deployLogStreamer(name, "stdout"),
          this.deployLogStreamer(name, "stderr"),
        );
      };

      this.wsHandler?.broadcastProjectDeployStatus({ projectName: name, status: "started", timestamp: new Date().toISOString() });
      if (to === "prod") {
        project.status = "building";
        this.saveProjects();
      }

      let failure: string | null = null;
      const result = await up();
      lines.push(result.stdout, result.stderr);
      if (result.code !== 0) {
        failure = result.stderr || result.stdout || "up failed";
      } else {
        const health = await this.waitForHealthy(project, toCtx, log);
        if (!health.ok) failure = health.detail;
        else log(`[acm] ${to} healthy: ${health.detail}`);
      }

      if (failure) {
        log(`[acm] promotion to ${to} failed: ${failure}`);
        let rollback = "nothing to roll back to (first deploy of this env)";
        if (retagged.some((r) => r.previous)) {
          for (const r of retagged) if (r.previous) await this.runCommand("docker", ["tag", r.previous, r.target], project.path);
          const again = await up();
          const health = again.code === 0 ? await this.waitForHealthy(project, toCtx, log) : { ok: false, detail: again.stderr };
          rollback = health.ok ? "rolled back to the previous images, which are healthy" : `rollback also failed: ${health.detail}`;
        }
        log(`[acm] ${rollback}`);
        if (to === "prod") project.status = "error";
        this.recordEnv(project, to, {
          status: "failed",
          kind: "promote",
          output: lines.filter(Boolean).join("\n"),
          error: `${failure}; ${rollback}`,
        });
        this.saveProjects();
        this.wsHandler?.broadcastProjectDeployStatus({ projectName: name, status: "failed", timestamp: new Date().toISOString(), error: failure });
        throw new Error(`Promotion ${from} → ${to} failed: ${failure}. ${rollback}.`);
      }

      project.envState = {
        ...(project.envState || {}),
        [to]: {
          commit: fromState.commit,
          deployedAt: new Date().toISOString(),
          source: "promote",
          promotedFrom: from,
          images: await this.builtImageIds(project, toCtx),
        },
      };
      if (to === "prod") {
        project.status = "running";
        project.lastUpdated = new Date().toISOString();
        const seed = await this.runPostDeploySeedHook(project);
        if (seed.executed && seed.output) log(`[post-deploy-seed]\n${seed.output}`);
      }
      this.recordEnv(project, to, { status: "success", kind: "promote", output: lines.filter(Boolean).join("\n") });
      this.saveProjects();
      this.wsHandler?.broadcastProjectDeployStatus({ projectName: name, status: "completed", timestamp: new Date().toISOString(), code: 0 });
      this.wsHandler?.broadcastProjectStatus({ name, status: project.status });
      return { output: lines.filter(Boolean).join("\n"), warnings };
    });
  }

  public async stopEnvironment(name: string, env: string): Promise<void> {
    const project = this.requireProject(name);
    this.assertEnv(env);
    if (env === "prod") {
      await this.stopProject(name);
      this.wsHandler?.broadcastProjectStatus({ name, status: "stopped" });
      return;
    }
    await this.withEnvLock(name, [env], async () => {
      const ctx = this.envContext(project, env, true);
      const result = await this.runCommand(
        "docker",
        [...this.composeBaseArgs(ctx), "down", "--remove-orphans"],
        project.path,
        ctx.merged,
        this.deployLogStreamer(name, "stdout"),
        this.deployLogStreamer(name, "stderr"),
      );
      if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Stop failed");
    });
  }

  /** Restart an environment's containers in place (no rebuild, no config reload). */
  public async restartEnvironment(name: string, env: string): Promise<void> {
    const project = this.requireProject(name);
    this.assertEnv(env);
    await this.withEnvLock(name, [env], async () => {
      const ctx = this.envContext(project, env);
      const result = await this.runCommand(
        "docker",
        [...this.composeBaseArgs(ctx), "restart"],
        project.path,
        ctx.merged,
        this.deployLogStreamer(name, "stdout"),
        this.deployLogStreamer(name, "stderr"),
      );
      if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Restart failed");
    });
    this.wsHandler?.broadcastProjectStatus({ name, status: project.status });
  }
}

export default ProjectService;

interface EnvContext {
  env: string;
  /** The project's own compose file. */
  composeFile: string;
  /** The compose document this env runs (rendered for dev/test). */
  doc: any;
  /** Files passed with -f. */
  files: string[];
  composeProject: string;
  merged: Record<string, string>;
  render: RenderResult | null;
}
