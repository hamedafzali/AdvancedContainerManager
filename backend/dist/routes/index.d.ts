import { Router } from "express";
import { DockerService } from "../services/docker-service";
import { ProjectService } from "../services/project-service";
import { TerminalService } from "../services/terminal-service";
import { MetricsCollector } from "../services/metrics-collector";
export declare function routes(dockerService: DockerService, projectService: ProjectService, terminalService: TerminalService, metricsCollector: MetricsCollector): Router;
export default routes;
//# sourceMappingURL=index.d.ts.map