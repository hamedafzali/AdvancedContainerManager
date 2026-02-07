"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectService = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const simple_git_1 = require("simple-git");
class ProjectService {
    constructor(config, logger) {
        this.projects = new Map();
        this.config = config;
        this.logger = logger;
        this.projectsDir = config.projectsDir;
        this.configPath = config.configPath;
        this.ensureDirectories();
        this.loadProjects();
    }
    ensureDirectories() {
        try {
            if (!fs.existsSync(this.projectsDir)) {
                fs.mkdirSync(this.projectsDir, { recursive: true });
                this.logger.info(`Created projects directory: ${this.projectsDir}`);
            }
        }
        catch (error) {
            this.logger.error(`Error creating projects directory: ${error}`);
        }
    }
    loadProjects() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, "utf8");
                const config = JSON.parse(data);
                if (config.projects) {
                    this.projects = new Map(Object.entries(config.projects));
                    this.logger.info(`Loaded ${this.projects.size} projects from config`);
                }
            }
        }
        catch (error) {
            this.logger.error("Error loading projects config:", error);
            this.projects = new Map();
        }
    }
    saveProjects() {
        try {
            const config = {
                projects: Object.fromEntries(this.projects),
                settings: {},
            };
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            this.logger.debug("Projects configuration saved");
        }
        catch (error) {
            this.logger.error("Error saving projects config:", error);
        }
    }
    async addProject(name, repoUrl, branch = "main", dockerfile = "Dockerfile", composeFile = "docker-compose.yml", environmentVars = {}) {
        try {
            const projectPath = path.join(this.projectsDir, name);
            // Clone repository
            const git = (0, simple_git_1.simpleGit)();
            if (fs.existsSync(projectPath)) {
                // Pull latest changes
                await git.cwd(projectPath).pull();
                this.logger.info(`Pulled latest changes for project: ${name}`);
            }
            else {
                // Clone new repository
                await git.clone(repoUrl, projectPath, ["--branch", branch]);
                this.logger.info(`Cloned repository for project: ${name}`);
            }
            // Create project info
            const project = {
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
        }
        catch (error) {
            this.logger.error(`Error adding project ${name}:`, error);
            throw error;
        }
    }
    getProjects() {
        return this.projects;
    }
    getProject(name) {
        return this.projects.get(name);
    }
    async updateProjectStatus(name, status) {
        const project = this.projects.get(name);
        if (project) {
            project.status = status;
            project.lastUpdated = new Date().toISOString();
            this.saveProjects();
            this.logger.info(`Project ${name} status updated to: ${status}`);
        }
    }
    async removeProject(name) {
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
        }
        catch (error) {
            this.logger.error(`Error removing project ${name}:`, error);
            throw error;
        }
    }
    async buildProject(name) {
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
        }
        catch (error) {
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
    async deployProject(name) {
        const project = this.projects.get(name);
        if (!project) {
            throw new Error(`Project ${name} not found`);
        }
        try {
            project.status = "running";
            project.lastUpdated = new Date().toISOString();
            this.saveProjects();
            this.logger.info(`Deploying project: ${name}`);
            // This would typically use Docker Compose to start services
            // For now, we'll simulate the deployment
            await new Promise((resolve) => setTimeout(resolve, 3000));
            // Add to deploy history
            project.deployHistory.push({
                timestamp: new Date().toISOString(),
                status: "success",
                containerIds: [`container-${name}-1`, `container-${name}-2`],
            });
            project.status = "running";
            project.lastUpdated = new Date().toISOString();
            this.saveProjects();
            this.logger.info(`Project ${name} deployed successfully`);
        }
        catch (error) {
            project.status = "error";
            project.lastUpdated = new Date().toISOString();
            project.deployHistory.push({
                timestamp: new Date().toISOString(),
                status: "failed",
                containerIds: [],
                error: error.message,
            });
            this.saveProjects();
            this.logger.error(`Error deploying project ${name}:`, error);
            throw error;
        }
    }
    async stopProject(name) {
        const project = this.projects.get(name);
        if (!project) {
            throw new Error(`Project ${name} not found`);
        }
        try {
            project.status = "stopped";
            project.lastUpdated = new Date().toISOString();
            this.saveProjects();
            this.logger.info(`Stopping project: ${name}`);
            // This would typically use Docker Compose to stop services
            await new Promise((resolve) => setTimeout(resolve, 2000));
            project.status = "stopped";
            project.lastUpdated = new Date().toISOString();
            this.saveProjects();
            this.logger.info(`Project ${name} stopped successfully`);
        }
        catch (error) {
            project.status = "error";
            project.lastUpdated = new Date().toISOString();
            this.saveProjects();
            this.logger.error(`Error stopping project ${name}:`, error);
            throw error;
        }
    }
    async getProjectHealth(name) {
        const project = this.projects.get(name);
        if (!project) {
            throw new Error(`Project ${name} not found`);
        }
        const health = {
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
            }
            else {
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
        }
        catch (error) {
            health.overall = "error";
            health.issues.push(error.message);
            this.logger.error(`Error checking health for project ${name}:`, error);
        }
        return health;
    }
    async updateProjectHealth(name) {
        const health = await this.getProjectHealth(name);
        const project = this.projects.get(name);
        if (project) {
            project.healthChecks.push({
                timestamp: health.lastCheck,
                status: health.overall === "error" || health.overall === "no_containers"
                    ? "unknown"
                    : health.overall,
                issues: health.issues,
            });
            this.saveProjects();
        }
    }
    getProjectsSummary() {
        return {
            total: this.projects.size,
            byStatus: {
                configured: Array.from(this.projects.values()).filter((p) => p.status === "configured").length,
                building: Array.from(this.projects.values()).filter((p) => p.status === "building").length,
                built: Array.from(this.projects.values()).filter((p) => p.status === "built").length,
                running: Array.from(this.projects.values()).filter((p) => p.status === "running").length,
                stopped: Array.from(this.projects.values()).filter((p) => p.status === "stopped").length,
                error: Array.from(this.projects.values()).filter((p) => p.status === "error").length,
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
exports.ProjectService = ProjectService;
exports.default = ProjectService;
