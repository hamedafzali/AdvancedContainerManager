import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { simpleGit } from "simple-git";
import * as yaml from "js-yaml";
import { ProjectInfo, ProjectHealth, AppConfig } from "../types";
import { Logger } from "../utils/logger";

const Database = require("better-sqlite3");

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

  constructor(config: AppConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.projectsDir = config.projectsDir;
    this.configPath = config.configPath;
    this.databasePath = config.databasePath;
    this.legacyProjectsDir = config.legacyProjectsDir || this.projectsDir;
    this.legacyConfigPath = config.legacyConfigPath || this.configPath;
    this.ensureDirectories();
    this.database = new Database(this.databasePath);
    this.initializeDatabase();
    this.loadProjects();
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

  private normalizeImportedProject(name: string, project: Partial<ProjectInfo>): ProjectInfo {
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
              this.normalizeImportedProject(name, rawProject as Partial<ProjectInfo>),
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
        rows.map((row) => [row.name, JSON.parse(row.payload) as ProjectInfo]),
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
          upsert.run({
            name,
            payload: JSON.stringify(project),
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

      for (const service of Object.values(compose.services as Record<string, any>)) {
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
        } else if (service.environment && typeof service.environment === "object") {
          for (const [key, value] of Object.entries(service.environment)) {
            assign(key, value);
          }
        }
      }

      return envVars;
    } catch (error) {
      this.logger.warn(`Failed to extract compose environment variables: ${error}`);
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

  private runCommand(
    command: string,
    args: string[],
    cwd: string,
    extraEnv: Record<string, string> = {},
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
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
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
  ): Promise<{
    stdout: string;
    stderr: string;
    code: number;
    command: string;
  }> {
    const cwd = project.path;
    const env = project.environmentVars;
    const dockerArgs = args;
    const dockerComposeArgs =
      args[0] === "compose" ? args.slice(1) : args;

    const dockerResult = await this.runCommand("docker", dockerArgs, cwd, env);
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
    await git.clone(project.repoUrl, project.path, ["--branch", project.branch || "main"]);
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
  ): Promise<ProjectInfo> {
    try {
      const projectPath = path.join(this.projectsDir, name);

      // Clone repository
      const git = simpleGit();

      if (fs.existsSync(projectPath)) {
        // Ensure the repository is attached to the requested branch before syncing
        const repo = git.cwd(projectPath);
        await repo.fetch("origin", branch);
        await repo.checkout(["-B", branch, `origin/${branch}`]);
        await repo.pull("origin", branch, { "--ff-only": null });
        this.logger.info(`Synced existing project on branch ${branch}: ${name}`);
      } else {
        // Clone new repository
        await git.clone(repoUrl, projectPath, ["--branch", branch]);
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
    } catch (error) {
      this.logger.error(`Error adding project ${name}:`, error);
      throw error;
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
      const composeFile = this.resolveComposeFile(project);
      if (composeFile) {
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

      const git = simpleGit();
      const repo = git.cwd(project.path);
      let status = await repo.status();
      const before = status.current || project.branch || "main";

      const hasTrackedChanges =
        status.modified.length > 0 ||
        status.created.length > 0 ||
        status.deleted.length > 0 ||
        status.renamed.length > 0;

      let discardedChanges = false;
      if (hasTrackedChanges) {
        this.logger.warn(
          `Discarding local tracked changes before syncing project ${name}`,
        );
        await repo.reset(["--hard", "HEAD"]);
        discardedChanges = true;
        status = await repo.status();
      }

      await repo.fetch("origin", before);
      const localHead = (await repo.revparse(["HEAD"])).trim();
      const remoteHead = (await repo.revparse([`origin/${before}`])).trim();
      const updated = localHead !== remoteHead;

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
        discardedChanges
          ? "Discarded local tracked changes before sync."
          : "",
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
    if (typeof portMapping === "string") {
      const [rawMapping, rawProtocol] = portMapping.split("/");
      const segments = rawMapping.split(":");
      const containerPort = parseInt(segments[segments.length - 1], 10);
      const hostPort =
        segments.length >= 2
          ? parseInt(segments[segments.length - 2], 10)
          : undefined;
      return {
        containerPort,
        hostPort: hostPort !== undefined && !isNaN(hostPort) ? hostPort : undefined,
        protocol: (rawProtocol || "tcp").toLowerCase(),
      };
    }

    if (portMapping && typeof portMapping === "object") {
      const containerPort = parseInt(String(portMapping.target), 10);
      const hostPort = parseInt(String(portMapping.published), 10);
      return {
        containerPort,
        hostPort: !isNaN(hostPort) ? hostPort : undefined,
        protocol: String(portMapping.protocol || "tcp").toLowerCase(),
      };
    }

    return { containerPort: NaN, hostPort: undefined, protocol: "tcp" };
  }

  private async getUsedHostPortsFromDocker(): Promise<Set<number>> {
    const usedPorts = new Set<number>();
    try {
      const result = await this.runCommand(
        "docker",
        ["ps", "--format", "{{.Ports}}"],
        process.cwd(),
      );
      if (result.code !== 0) {
        return usedPorts;
      }

      const lines = (result.stdout || "").split("\n").filter(Boolean);
      for (const line of lines) {
        const matches = line.matchAll(/:(\d+)->/g);
        for (const match of matches) {
          const port = parseInt(match[1], 10);
          if (!isNaN(port)) {
            usedPorts.add(port);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to inspect Docker used ports: ${error}`);
    }
    return usedPorts;
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
        { service: string; containerPort: number; protocol: string; hostPort: number }
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

      for (const [serviceName, serviceConfig] of Object.entries(composeServices)) {
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
      for (const [serviceName, serviceConfig] of Object.entries(composeServices)) {
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
          duplicateInCompose.push(`Port ${hostPort} is duplicated in ${refs.join(", ")}`);
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

      const dockerUsedPorts = await this.getUsedHostPortsFromDocker();
      const conflictsWithRunningContainers: string[] = [];
      for (const hostPort of hostPortToServices.keys()) {
        if (dockerUsedPorts.has(hostPort)) {
          conflictsWithRunningContainers.push(
            `Port ${hostPort} is currently used by a running container`,
          );
        }
      }

      if (conflictsWithRunningContainers.length > 0) {
        this.logger.warn(
          `Port usage conflicts detected for ${name}: ${conflictsWithRunningContainers.join("; ")}`,
        );
      }

      fs.writeFileSync(composeFile, yaml.dump(compose, { noRefs: true }), "utf8");
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

        if (Array.isArray(project.containers) && project.containers.length > 0) {
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

    try {
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

        buildResult = await this.runCompose(project, [
          "compose",
          "-f",
          composeFile,
          "build",
        ]);
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

    try {
      project.status = "building";
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      const composeFile = this.resolveComposeFile(project);
      if (!composeFile) {
        throw new Error("docker-compose file not found in project");
      }

      const missingEnvVars = this.getMissingEnvVars(
        composeFile,
        project.environmentVars || {},
      );
      if (missingEnvVars.length > 0) {
        const message = `Missing required environment variables: ${missingEnvVars.join(", ")}`;
        this.logger.error(`Deploy blocked for ${name}: ${message}`);
        throw new Error(message);
      }

      this.logger.info(
        `Deploying project: ${name} using ${path.basename(composeFile)}`,
      );
      this.logger.info(
        `Project ${name} repo: ${project.repoUrl} branch: ${project.branch} path: ${project.path}`,
      );

      const upResult = await this.runCompose(project, [
        "compose",
        "-f",
        composeFile,
        "up",
        "-d",
        "--build",
      ]);

      if (upResult.code !== 0) {
        this.logger.error(
          `Deploy failed for ${name} (${upResult.command}): ${upResult.stderr || upResult.stdout}`,
        );
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
      const deployOutput = [
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
      });
      project.containers = containerIds;

      project.status = "running";
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      this.logger.info(`Project ${name} deployed successfully`);
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
      });
      this.saveProjects();

      this.logger.error(`Error deploying project ${name}:`, error);
      throw error;
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

      const downResult = await this.runCompose(project, [
        "compose",
        "-f",
        composeFile,
        "down",
      ]);

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
  ): Promise<Array<{ containerId: string; logs: string }>> {
    const project = this.projects.get(name);
    if (!project) {
      throw new Error(`Project ${name} not found`);
    }

    const composeFile = this.resolveComposeFile(project);
    if (!composeFile) {
      throw new Error("docker-compose file not found in project");
    }

    const psResult = await this.runCompose(project, [
      "compose",
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

  public async getProjectHealth(name: string): Promise<ProjectHealth> {
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

      const psResult = await this.runCompose(project, [
        "compose",
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
}

export default ProjectService;
