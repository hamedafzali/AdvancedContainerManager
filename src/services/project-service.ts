import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { simpleGit } from 'simple-git';
import { ProjectInfo, ProjectHealth, AppConfig } from '../types';
import { Logger } from '../utils/logger';

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
        const data = fs.readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(data);
        
        if (config.projects) {
          this.projects = new Map(Object.entries(config.projects));
          this.logger.info(`Loaded ${this.projects.size} projects from config`);
        }
      }
    } catch (error) {
      this.logger.error('Error loading projects config:', error);
      this.projects = new Map();
    }
  }

  private saveProjects(): void {
    try {
      const config = {
        projects: Object.fromEntries(this.projects),
        settings: {}
      };
      
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
      this.logger.debug('Projects configuration saved');
    } catch (error) {
      this.logger.error('Error saving projects config:', error);
    }
  }

  public async addProject(
    name: string,
    repoUrl: string,
    branch: string = 'main',
    dockerfile: string = 'Dockerfile',
    composeFile: string = 'docker-compose.yml',
    environmentVars: Record<string, string> = {}
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
        await git.clone(repoUrl, projectPath, ['--branch', branch]);
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
        status: 'configured',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        buildHistory: [],
        deployHistory: [],
        healthChecks: [],
        autoRestart: false,
        resourceLimits: {
          memory: '512m',
          cpu: '0.5'
        }
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

  public async updateProjectStatus(name: string, status: ProjectInfo['status']): Promise<void> {
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
          await fs.rm(project.path, { recursive: true, force: true });
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
      project.status = 'building';
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      // This would typically use Docker API to build the image
      // For now, we'll simulate the build
      this.logger.info(`Building project: ${name}`);
      
      // Simulate build time
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Add to build history
      project.buildHistory.push({
        timestamp: new Date().toISOString(),
        status: 'success',
        imageId: `project-${name}:latest`
      });
      
      project.status = 'built';
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();
      
      this.logger.info(`Project ${name} built successfully`);
    } catch (error) {
      project.status = 'error';
      project.lastUpdated = new Date().toISOString();
      project.buildHistory.push({
        timestamp: new Date().toISOString(),
        status: 'failed',
        error: error.message
      });
      this.saveProjects();
      
      this.logger.error(`Error building project ${name}:`, error);
      throw error;
    }
  }

  public async deployProject(name: string): Promise<void> {
    const project = this.projects.get(name);
    if (!project) {
      throw new Error(`Project ${name} not found`);
    }

    try {
      project.status = 'running';
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      this.logger.info(`Deploying project: ${name}`);
      
      // This would typically use Docker Compose to start services
      // For now, we'll simulate the deployment
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Add to deploy history
      project.deployHistory.push({
        timestamp: new Date().toISOString(),
        status: 'success',
        containerIds: [`container-${name}-1`, `container-${name}-2`]
      });
      
      project.status = 'running';
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();
      
      this.logger.info(`Project ${name} deployed successfully`);
    } catch (error) {
      project.status = 'error';
      project.lastUpdated = new Date().toISOString();
      project.deployHistory.push({
        timestamp: new Date().toISOString(),
        status: 'failed',
        containerIds: [],
        error: error.message
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
      project.status = 'stopped';
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();

      this.logger.info(`Stopping project: ${name}`);
      
      // This would typically use Docker Compose to stop services
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      project.status = 'stopped';
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();
      
      this.logger.info(`Project ${name} stopped successfully`);
    } catch (error) {
      project.status = 'error';
      project.lastUpdated = new Date().toISOString();
      this.saveProjects();
      
      this.logger.error(`Error stopping project ${name}:`, error);
      throw error;
    }
  }

  public async getProjectHealth(name: string): Promise<ProjectHealth> {
    const project = this.projects.get(name);
    if (!project) {
      throw new Error(`Project ${name} not found`);
    }

    const health: ProjectHealth = {
      overall: 'healthy',
      containers: [],
      lastCheck: new Date().toISOString(),
      issues: []
    };

    try {
      // This would typically check actual container health
      // For now, we'll simulate health checks
      const containerCount = project.containers.length || 0;
      
      if (containerCount === 0) {
        health.overall = 'no_containers';
        health.issues.push('No containers running');
      } else {
        // Simulate container health
        for (let i = 0; i < containerCount; i++) {
          const containerName = `${name}-container-${i + 1}`;
          const containerHealth = {
            name: containerName,
            status: 'running',
            health: 'healthy'
          };
          health.containers.push(containerHealth);
        }
      }
    } catch (error) {
      health.overall = 'error';
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
        status: health.overall,
        issues: health.issues
      });
      this.saveProjects();
    }
  }

  public getProjectsSummary() {
    return {
      total: this.projects.size,
      byStatus: {
        configured: Array.from(this.projects.values()).filter(p => p.status === 'configured').length,
        building: Array.from(this.projects.values()).filter(p => p.status === 'building').length,
        built: Array.from(this.projects.values()).filter(p => p.status === 'built').length,
        running: Array.from(this.projects.values()).filter(p => p.status === 'running').length,
        stopped: Array.from(this.projects.values()).filter(p => p.status === 'stopped').length,
        error: Array.from(this.projects.values()).filter(p => p.status === 'error').length
      },
      projects: Array.from(this.projects.entries()).map(([name, project]) => ({
        name,
        status: project.status,
        lastUpdated: project.lastUpdated,
        containerCount: project.containers.length
      }))
    };
  }
}

export default ProjectService;
