import { ProjectInfo, ProjectHealth, AppConfig } from "../types";
import { Logger } from "../utils/logger";
export declare class ProjectService {
    private config;
    private logger;
    private projectsDir;
    private configPath;
    private projects;
    constructor(config: AppConfig, logger: Logger);
    private ensureDirectories;
    private loadProjects;
    private saveProjects;
    addProject(name: string, repoUrl: string, branch?: string, dockerfile?: string, composeFile?: string, environmentVars?: Record<string, string>): Promise<ProjectInfo>;
    getProjects(): Map<string, ProjectInfo>;
    getProject(name: string): ProjectInfo | undefined;
    updateProjectStatus(name: string, status: ProjectInfo["status"]): Promise<void>;
    removeProject(name: string): Promise<void>;
    buildProject(name: string): Promise<void>;
    deployProject(name: string): Promise<void>;
    stopProject(name: string): Promise<void>;
    getProjectHealth(name: string): Promise<ProjectHealth>;
    updateProjectHealth(name: string): Promise<void>;
    getProjectsSummary(): {
        total: number;
        byStatus: {
            configured: number;
            building: number;
            built: number;
            running: number;
            stopped: number;
            error: number;
        };
        projects: {
            name: string;
            status: "running" | "configured" | "building" | "built" | "stopped" | "error";
            lastUpdated: string;
            containerCount: number;
        }[];
    };
}
export default ProjectService;
//# sourceMappingURL=project-service.d.ts.map