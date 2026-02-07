import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawn } from "child_process";
import { simpleGit } from "simple-git";
import { ProjectInfo, ProjectHealth, AppConfig } from "../types";
import { Logger } from "../utils/logger";

export class ProjectService {
  private config: AppConfig;
  private logger: Logger;
  private projectsDir: string;
  private configPath: string;
  private projects: Map<string, ProjectInfo> = new Map();

  constructor(config: AppConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.projectsDir = config.projectsDir;
    this.configPath = config.configPath;
    this.ensureDirectories();
    this.loadProjects();
  }

  private ensureDirectories(): void {
    try {
      if (!fs.existsSync(this.projectsDir)) {
        fs.mkdirSync(this.projectsDir, { recursive: true });
        this.logger.info(`Created projects directory: ${this.projectsDir}`);
      }
    } catch (error) {
      this.logger.error(`Error creating projects directory: ${error}`);
    }
  }

  private loadProjects(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, "utf8");
        const config = JSON.parse(data);

        if (config.projects) {
          this.projects = new Map(Object.entries(config.projects));
          this.logger.info(`Loaded ${this.projects.size} projects from config`);
        }
      }
    } catch (error) {
      this.logger.error("Error loading projects config:", error);
      this.projects = new Map();
    }
  }

  private saveProjects(): void {
    try {
      const config = {
        projects: Object.fromEntries(this.projects),
        settings: {},
      };

      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
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
          modifier.includes(":-") || modifier.includes("-") || modifier.includes(":+") || modifier.includes("+");
        const requiresValue = modifier.includes(":?") || modifier.startsWith("?");

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
      const inProcess = process.env[key] !== undefined && process.env[key] !== "";
      return !inProject && !inProcess;
    });
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
  ): Promise<{ stdout: string; stderr: string; code: number; command: string }> {
    const cwd = project.path;
    const env = project.environmentVars;

    const dockerResult = await this.runCommand("docker", args, cwd, env);
    if (dockerResult.code === 0) {
      return { ...dockerResult, command: "docker" };
    }

    const combined = `${dockerResult.stdout}\n${dockerResult.stderr}`;
    if (!this.isComposeUnavailable(combined)) {
      return { ...dockerResult, command: "docker" };
    }

    const composeResult = await this.runCommand("docker-compose", args, cwd, env);
    return { ...composeResult, command: "docker-compose" };
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
        // Pull latest changes
        await git.cwd(projectPath).pull();
        this.logger.info(`Pulled latest changes for project: ${name}`);
      } else {
        // Clone new repository
        await git.clone(repoUrl, projectPath, ["--branch", branch]);
        this.logger.info(`Cloned repository for project: ${name}`);
      }

      // Create project info
      const project: ProjectInfo = {
        name,
        repoUrl,
        branch,
        path: projectPath,
        dockerfile,
        composeFile,
        environmentVars,
        containers: [],
        status: "configured",
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
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

      // This would typically use Docker API to build the image
      // For now, we'll simulate the build
      this.logger.info(`Building project: ${name}`);

      // Simulate build time
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Add to build history
      project.buildHistory.push({
        timestamp: new Date().toISOString(),
        status: "success",
        imageId: `project-${name}:latest`,
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

      // Add to deploy history
      project.deployHistory.push({
        timestamp: new Date().toISOString(),
        status: "success",
        containerIds,
        output: upResult.stdout || upResult.stderr || "",
        command: upResult.command,
      });
      project.containers = containerIds;

      project.status = "running";
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      this.logger.info(`Project ${name} deployed successfully`);
      return {
        containerIds,
        output: upResult.stdout || upResult.stderr || "",
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
      throw new Error(psResult.stderr || psResult.stdout || "Failed to list containers");
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
      // This would typically check actual container health
      // For now, we'll simulate health checks
      const containerCount = project.containers.length || 0;

      if (containerCount === 0) {
        health.overall = "no_containers";
        health.issues.push("No containers running");
      } else {
        // Simulate container health
        for (let i = 0; i < containerCount; i++) {
          const containerName = `${name}-container-${i + 1}`;
          const containerHealth = {
            name: containerName,
            status: "running",
            health: "healthy",
          };
          health.containers.push(containerHealth);
        }
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
