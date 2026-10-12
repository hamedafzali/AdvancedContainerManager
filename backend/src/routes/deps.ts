import { DockerService } from "../services/docker-service";
import { ProjectService } from "../services/project-service";
import { TunnelService } from "../services/tunnel-service";
import { TerminalService } from "../services/terminal-service";
import { MetricsCollector } from "../services/metrics-collector";
import { GitAccountService } from "../services/git-account-service";
import { AuthService } from "../services/auth-service";
import { SettingsService } from "../services/settings-service";
import { PruneService } from "../services/prune-service";
import { PipelineService } from "../services/pipeline-service";
import { CloudflareService } from "../services/cloudflare-service";
import { BackupService } from "../services/backup-service";
import { AuditService } from "../services/audit-service";
import { HealthService } from "../services/health-service";
import { SecurityService } from "../services/security-service";
import { AnalyticsService } from "../services/analytics-service";
import { Logger } from "../utils/logger";

/** Everything the route modules need, built once in routes(). */
export interface RouteDeps {
  dockerService: DockerService;
  projectService: ProjectService;
  tunnelService: TunnelService;
  terminalService: TerminalService;
  metricsCollector: MetricsCollector;
  gitAccountService: GitAccountService;
  authService: AuthService;
  settingsService: SettingsService;
  pruneService: PruneService;
  pipelineService: PipelineService;
  cloudflareService: CloudflareService;
  logger: Logger;
  backupService: BackupService;
  auditService: AuditService;
  healthService: HealthService;
  securityService: SecurityService;
  analyticsService: AnalyticsService;
}
