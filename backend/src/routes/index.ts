import { Router } from "express";
import { DockerService } from "../services/docker-service";
import { ProjectService } from "../services/project-service";
import { TunnelService } from "../services/tunnel-service";
import { TerminalService } from "../services/terminal-service";
import { MetricsCollector } from "../services/metrics-collector";
import { Logger, LogLevel } from "../utils/logger";
import { apiRateLimit } from "../middleware/rate-limiter";
import { BackupService } from "../services/backup-service";
import { AuditService } from "../services/audit-service";
import { HealthService } from "../services/health-service";
import { AnalyticsService } from "../services/analytics-service";
import { SecurityService } from "../services/security-service";
import { CloudflareService } from "../services/cloudflare-service";
import { GitAccountService } from "../services/git-account-service";
import { AuthService } from "../services/auth-service";
import { SettingsService } from "../services/settings-service";
import { PruneService } from "../services/prune-service";
import { PipelineService } from "../services/pipeline-service";
import type { RouteDeps } from "./deps";
import { registerPublicRoutes } from "./public";
import { registerSystemRoutes } from "./system";
import { registerDockerRoutes } from "./docker";
import { registerSecurityRoutes } from "./security";
import { registerProjectRoutes } from "./projects";
import { registerAnalyticsRoutes } from "./analytics";
import { registerTunnelRoutes } from "./tunnels";

export function routes(
  dockerService: DockerService,
  projectService: ProjectService,
  tunnelService: TunnelService,
  terminalService: TerminalService,
  metricsCollector: MetricsCollector,
  gitAccountService: GitAccountService,
  authService: AuthService,
  settingsService: SettingsService,
  pruneService: PruneService,
  pipelineService: PipelineService,
  cloudflareService: CloudflareService,
): Router {
  const router = Router();
  const logger = new Logger(LogLevel.INFO);
  const deps: RouteDeps = {
    dockerService,
    projectService,
    tunnelService,
    terminalService,
    metricsCollector,
    gitAccountService,
    authService,
    settingsService,
    pruneService,
    pipelineService,
    cloudflareService,
    logger,
    backupService: new BackupService(logger),
    auditService: new AuditService(logger),
    healthService: new HealthService(logger),
    securityService: new SecurityService(logger),
    analyticsService: new AnalyticsService(logger, metricsCollector),
  };
  const { auditService } = deps;

  router.use(apiRateLimit);

  registerPublicRoutes(router, deps);

  // Auth middleware — applied to all subsequent routes
  router.use((req, res, next) => {
    const requireAuth = settingsService.getSectionValue<boolean>("security", "requireAuth");
    if (!requireAuth) return next();
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token || !authService.validateSession(token)) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    next();
  });

  router.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      if (req.path.startsWith("/health")) {
        return;
      }
      auditService.logAction({
        action: `${req.method} ${req.path}`,
        resource: "api",
        details: {
          statusCode: res.statusCode,
          durationMs: duration,
        },
        ip: req.ip,
        userAgent: req.get("user-agent"),
        success: res.statusCode < 400,
        level:
          res.statusCode >= 500
            ? "error"
            : res.statusCode >= 400
              ? "warn"
              : "info",
      });
    });
    next();
  });

  // Every domain registers on the same router, after the auth middleware.
  // Each module keeps its routes in their original order (e.g.
  // /containers/cached stays relative to /containers/:id).
  registerSystemRoutes(router, deps);
  registerDockerRoutes(router, deps);
  registerSecurityRoutes(router, deps);
  registerProjectRoutes(router, deps);
  registerAnalyticsRoutes(router, deps);
  registerTunnelRoutes(router, deps);

  return router;
}

export default routes;
