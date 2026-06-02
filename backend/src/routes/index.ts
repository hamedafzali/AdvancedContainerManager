import { Router } from "express";
import { DockerService } from "../services/docker-service";
import { ProjectService } from "../services/project-service";
import { TunnelService } from "../services/tunnel-service";
import { TerminalService } from "../services/terminal-service";
import { MetricsCollector } from "../services/metrics-collector";
import { Logger, LogLevel } from "../utils/logger";
import { asyncHandler } from "../middleware/error-handler";
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
import * as crypto from "crypto";

export function routes(
  dockerService: DockerService,
  projectService: ProjectService,
  tunnelService: TunnelService,
  terminalService: TerminalService,
  metricsCollector: MetricsCollector,
  gitAccountService: GitAccountService,
  authService: AuthService,
  settingsService: SettingsService,
): Router {
  const router = Router();
  const logger = new Logger(LogLevel.INFO);
  const backupService = new BackupService(logger);
  const auditService = new AuditService(logger);
  const healthService = new HealthService(logger);
  const securityService = new SecurityService(logger);
  const analyticsService = new AnalyticsService(logger, metricsCollector);
  const cloudflareService = new CloudflareService(logger);

  router.use(apiRateLimit);

  // Auth routes (public — no auth required)
  router.post("/auth/login", asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "username and password required" });
    }
    if (!authService.verifyPassword(username, password)) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    const session = authService.createSession(username);
    res.json({ success: true, data: session });
  }));

  router.post("/auth/logout", asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) authService.revokeSession(token);
    res.json({ success: true });
  }));

  router.post("/auth/change-password", asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const username = token ? authService.validateSession(token) : null;
    if (!username) return res.status(401).json({ success: false, message: "Unauthorized" });
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "oldPassword and newPassword required" });
    }
    authService.changePassword(username, oldPassword, newPassword);
    res.json({ success: true, message: "Password changed. Please log in again." });
  }));

  router.get("/auth/me", asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const username = token ? authService.validateSession(token) : null;
    if (!username) return res.status(401).json({ success: false, message: "Unauthorized" });
    res.json({ success: true, data: { username } });
  }));

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

  // System routes
  router.get(
    "/system/status",
    asyncHandler(async (req, res) => {
      try {
        const systemInfo = await dockerService.getSystemInfo();
        const version = await dockerService.getVersion();
        const metricsSummary = metricsCollector.getMetricsSummary();

        res.json({
          success: true,
          data: {
            docker: {
              connected: dockerService.isConnected(),
              version,
              systemInfo,
            },
            metrics: metricsSummary,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        logger.error("Error getting system status:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/system/metrics",
    asyncHandler(async (req, res) => {
      try {
        const metrics = await metricsCollector.collectSystemMetrics();
        res.json({
          success: true,
          data: metrics,
        });
      } catch (error) {
        logger.error("Error getting system metrics:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/system/metrics/history",
    asyncHandler(async (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 100;
        const history = await metricsCollector.getSystemMetricsHistory(limit);
        res.json({
          success: true,
          data: history,
        });
      } catch (error) {
        logger.error("Error getting system metrics history:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Container routes
  router.get(
    "/containers",
    asyncHandler(async (req, res) => {
      try {
        const containers = await dockerService.getAllContainers();
        res.json({
          success: true,
          data: containers,
        });
      } catch (error) {
        logger.error("Error getting containers:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/containers/:id",
    asyncHandler(async (req, res) => {
      try {
        const container = await dockerService.getContainer(req.params.id);
        res.json({
          success: true,
          data: container,
        });
      } catch (error) {
        logger.error(`Error getting container ${req.params.id}:`, error);
        res.status(404).json({
          success: false,
          message: "Container not found",
        });
      }
    }),
  );

  router.post(
    "/containers/create",
    asyncHandler(async (req, res) => {
      try {
        const {
          name,
          image,
          ports = [],
          env = {},
          packages = [],
          command,
        } = req.body || {};

        if (!image) {
          return res.status(400).json({
            success: false,
            message: "Image is required",
          });
        }

        const created = await dockerService.createContainerFromWizard({
          name,
          image,
          ports,
          env,
          packages,
          command,
        });

        res.json({
          success: true,
          data: created,
        });
      } catch (error) {
        logger.error("Error creating container:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/containers/:id/start",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.startContainer(req.params.id);
        res.json({
          success: true,
          message: `Container ${req.params.id} started successfully`,
        });
      } catch (error) {
        logger.error(`Error starting container ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/containers/:id/stop",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.stopContainer(req.params.id);
        res.json({
          success: true,
          message: `Container ${req.params.id} stopped successfully`,
        });
      } catch (error) {
        logger.error(`Error stopping container ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/containers/:id/restart",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.restartContainer(req.params.id);
        res.json({
          success: true,
          message: `Container ${req.params.id} restarted successfully`,
        });
      } catch (error) {
        logger.error(`Error restarting container ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.put(
    "/containers/:id/ports",
    asyncHandler(async (req, res) => {
      try {
        const { ports } = req.body;
        const containerId = req.params.id;

        if (!ports || !Array.isArray(ports)) {
          return res.status(400).json({
            success: false,
            message: "Ports array is required",
          });
        }

        // Update container port mappings
        const result = await dockerService.updateContainerPorts(
          containerId,
          ports,
        );

        logger.info(`Updated port mappings for container: ${containerId}`);

        res.json({
          success: true,
          message: "Container port mappings updated successfully",
          data: result,
        });
      } catch (error) {
        logger.error(
          `Failed to update port mappings for container ${req.params.id}:`,
          error,
        );
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/containers/:id",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.removeContainer(req.params.id, true);
        res.json({
          success: true,
          message: `Container ${req.params.id} removed successfully`,
        });
      } catch (error) {
        logger.error(`Error removing container ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/containers/:id/logs",
    asyncHandler(async (req, res) => {
      try {
        const options = {
          tail: req.query.tail ? parseInt(req.query.tail as string) : 100,
          since: req.query.since
            ? new Date(req.query.since as string)
            : undefined,
          until: req.query.until
            ? new Date(req.query.until as string)
            : undefined,
          timestamps: req.query.timestamps !== "false",
          stdout: req.query.stdout !== "false",
          stderr: req.query.stderr !== "false",
        };

        const logs = await dockerService.getContainerLogs(
          req.params.id,
          options,
        );

        res.setHeader("Content-Type", "text/plain");
        res.send(logs);
      } catch (error) {
        logger.error(
          `Error getting logs for container ${req.params.id}:`,
          error,
        );
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/containers/:id/stats",
    asyncHandler(async (req, res) => {
      try {
        const stats = await dockerService.getContainerStats(req.params.id);
        res.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        logger.error(
          `Error getting stats for container ${req.params.id}:`,
          error,
        );
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Security routes
  router.get(
    "/security/scans",
    asyncHandler(async (req, res) => {
      try {
        const scans = await securityService.getAllScans();
        res.json({ success: true, data: scans });
      } catch (error) {
        logger.error("Error getting security scans:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.post(
    "/security/scans",
    asyncHandler(async (req, res) => {
      try {
        const { containerId, imageName } = req.body;
        if (!containerId || !imageName) {
          return res.status(400).json({
            success: false,
            message: "containerId and imageName are required",
          });
        }
        const scan = await securityService.startSecurityScan(
          containerId,
          imageName,
        );
        res.json({ success: true, data: scan });
      } catch (error) {
        logger.error("Error starting security scan:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/security/scans/:id",
    asyncHandler(async (req, res) => {
      try {
        const scan = await securityService.getScanStatus(req.params.id);
        if (!scan) {
          return res
            .status(404)
            .json({ success: false, message: "Scan not found" });
        }
        res.json({ success: true, data: scan });
      } catch (error) {
        logger.error("Error getting security scan:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/security/scans/container/:containerId",
    asyncHandler(async (req, res) => {
      try {
        const scans = await securityService.getContainerScans(
          req.params.containerId,
        );
        res.json({ success: true, data: scans });
      } catch (error) {
        logger.error("Error getting container scans:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/security/policies",
    asyncHandler(async (req, res) => {
      try {
        const policies = await securityService.getPolicies();
        res.json({ success: true, data: policies });
      } catch (error) {
        logger.error("Error getting security policies:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.post(
    "/security/policies",
    asyncHandler(async (req, res) => {
      try {
        const policy = await securityService.createPolicy(req.body);
        res.json({ success: true, data: policy });
      } catch (error) {
        logger.error("Error creating security policy:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.put(
    "/security/policies/:id",
    asyncHandler(async (req, res) => {
      try {
        const policy = await securityService.updatePolicy(
          req.params.id,
          req.body,
        );
        res.json({ success: true, data: policy });
      } catch (error) {
        logger.error("Error updating security policy:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.delete(
    "/security/policies/:id",
    asyncHandler(async (req, res) => {
      try {
        const removed = await securityService.deletePolicy(req.params.id);
        if (!removed) {
          return res
            .status(404)
            .json({ success: false, message: "Policy not found" });
        }
        res.json({ success: true, message: "Policy deleted" });
      } catch (error) {
        logger.error("Error deleting security policy:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/security/alerts",
    asyncHandler(async (req, res) => {
      try {
        const { severity, status } = req.query;
        const limit = req.query.limit
          ? parseInt(req.query.limit as string)
          : 100;
        const alerts = await securityService.getAlerts(
          severity as string | undefined,
          status as string | undefined,
          limit,
        );
        res.json({ success: true, data: alerts });
      } catch (error) {
        logger.error("Error getting security alerts:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.put(
    "/security/alerts/:id",
    asyncHandler(async (req, res) => {
      try {
        const { status, assignedTo } = req.body;
        const updated = await securityService.updateAlertStatus(
          req.params.id,
          status,
          assignedTo,
        );
        if (!updated) {
          return res
            .status(404)
            .json({ success: false, message: "Alert not found" });
        }
        res.json({ success: true, message: "Alert updated" });
      } catch (error) {
        logger.error("Error updating security alert:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/security/metrics",
    asyncHandler(async (req, res) => {
      try {
        const metrics = await securityService.getSecurityMetrics();
        res.json({ success: true, data: metrics });
      } catch (error) {
        logger.error("Error getting security metrics:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/containers/:id/processes",
    asyncHandler(async (req, res) => {
      try {
        const processes = await dockerService.getContainerProcesses(
          req.params.id,
        );
        res.json({
          success: true,
          data: processes,
        });
      } catch (error) {
        logger.error(
          `Error getting processes for container ${req.params.id}:`,
          error,
        );
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Image routes
  router.get(
    "/images",
    asyncHandler(async (req, res) => {
      try {
        const images = await dockerService.getAllImages();
        res.json({
          success: true,
          data: images,
        });
      } catch (error) {
        logger.error("Error getting images:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/images/pull",
    asyncHandler(async (req, res) => {
      try {
        const { imageName } = req.body;
        await dockerService.pullImage(imageName);
        res.json({
          success: true,
          message: `Image ${imageName} pulled successfully`,
        });
      } catch (error) {
        logger.error(`Error pulling image ${req.body.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/images/:id",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.removeImage(req.params.id, true);
        res.json({
          success: true,
          message: `Image ${req.params.id} removed successfully`,
        });
      } catch (error) {
        logger.error(`Error removing image ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Network routes
  router.get(
    "/networks",
    asyncHandler(async (req, res) => {
      try {
        const networks = await dockerService.getAllNetworks();
        res.json({
          success: true,
          data: networks,
        });
      } catch (error) {
        logger.error("Error getting networks:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/networks",
    asyncHandler(async (req, res) => {
      try {
        const { name, options } = req.body;
        await dockerService.createNetwork(name, options);
        res.json({
          success: true,
          message: `Network ${name} created successfully`,
        });
      } catch (error) {
        logger.error(`Error creating network ${req.body.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/networks/:id",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.removeNetwork(req.params.id);
        res.json({
          success: true,
          message: `Network ${req.params.id} removed successfully`,
        });
      } catch (error) {
        logger.error(`Error removing network ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Volume routes
  router.get(
    "/volumes",
    asyncHandler(async (req, res) => {
      try {
        const volumes = await dockerService.getAllVolumes();
        res.json({
          success: true,
          data: volumes,
        });
      } catch (error) {
        logger.error("Error getting volumes:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/volumes",
    asyncHandler(async (req, res) => {
      try {
        const { name, options } = req.body;
        await dockerService.createVolume(name, options);
        res.json({
          success: true,
          message: `Volume ${name} created successfully`,
        });
      } catch (error) {
        logger.error(`Error creating volume ${req.body.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/volumes/:id",
    asyncHandler(async (req, res) => {
      try {
        await dockerService.removeVolume(req.params.id, true);
        res.json({
          success: true,
          message: `Volume ${req.params.id} removed successfully`,
        });
      } catch (error) {
        logger.error(`Error removing volume ${req.params.id}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Project routes
  router.get(
    "/projects/summary",
    asyncHandler(async (req, res) => {
      try {
        const summary = projectService.getProjectsSummary();
        res.json({
          success: true,
          data: summary,
        });
      } catch (error) {
        logger.error("Error getting projects summary:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/projects",
    asyncHandler(async (req, res) => {
      try {
        const projects = projectService.getProjects();
        res.json({
          success: true,
          data: Array.from(projects.values()),
        });
      } catch (error) {
        logger.error("Error getting projects:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/projects",
    asyncHandler(async (req, res) => {
      try {
        const {
          name,
          repoUrl,
          branch = "main",
          dockerfile = "Dockerfile",
          composeFile = "docker-compose.yml",
          environmentVars = {},
          accountId,
        } = req.body;

        const authenticatedUrl = accountId
          ? gitAccountService.getAuthenticatedUrl(accountId, repoUrl)
          : undefined;

        const project = await projectService.addProject(
          name,
          repoUrl,
          branch,
          dockerfile,
          composeFile,
          environmentVars,
          authenticatedUrl,
        );

        res.json({
          success: true,
          data: project,
        });
      } catch (error) {
        logger.error("Error adding project:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/projects/:name",
    asyncHandler(async (req, res) => {
      try {
        const project = projectService.getProject(req.params.name);
        if (!project) {
          return res.status(404).json({
            success: false,
            message: "Project not found",
          });
        }

        res.json({
          success: true,
          data: project,
        });
      } catch (error) {
        logger.error(`Error getting project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.put(
    "/projects/:name",
    asyncHandler(async (req, res) => {
      try {
        const {
          repoUrl,
          branch,
          environmentVars = {},
          composeFile,
          portUpdates = [],
        } = req.body;
        const project = await projectService.updateProjectSettings(
          req.params.name,
          {
            repoUrl,
            branch,
            environmentVars,
            composeFile,
            portUpdates,
          },
        );
        res.json({
          success: true,
          data: project,
        });
      } catch (error) {
        logger.error(`Error updating project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/projects/:name/build",
    asyncHandler(async (req, res) => {
      try {
        await projectService.buildProject(req.params.name);
        res.json({
          success: true,
          message: `Project ${req.params.name} built successfully`,
        });
      } catch (error) {
        logger.error(`Error building project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/projects/:name/sync",
    asyncHandler(async (req, res) => {
      try {
        const result = await projectService.pullLatestProject(req.params.name);
        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error(`Error syncing project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/projects/:name/deploy",
    asyncHandler(async (req, res) => {
      try {
        const result = await projectService.deployProject(req.params.name);
        res.json({
          success: true,
          message: `Project ${req.params.name} deployed successfully`,
          data: result,
        });
      } catch (error) {
        logger.error(`Error deploying project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/projects/:name/sync-deploy",
    asyncHandler(async (req, res) => {
      try {
        const { name } = req.params;
        const syncResult = await projectService.pullLatestProject(name);
        const deployResult = await projectService.deployProject(name);
        res.json({
          success: true,
          message: `Project ${name} synced and deployed`,
          data: { sync: syncResult, deploy: deployResult },
        });
      } catch (error) {
        logger.error(`Error in sync-deploy for ${req.params.name}:`, error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.post(
    "/projects/:name/stop",
    asyncHandler(async (req, res) => {
      try {
        await projectService.stopProject(req.params.name);
        res.json({
          success: true,
          message: `Project ${req.params.name} stopped successfully`,
        });
      } catch (error) {
        logger.error(`Error stopping project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/projects/:name",
    asyncHandler(async (req, res) => {
      try {
        await projectService.removeProject(req.params.name);
        res.json({
          success: true,
          message: `Project ${req.params.name} removed successfully`,
        });
      } catch (error) {
        logger.error(`Error removing project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/projects/:name/health",
    asyncHandler(async (req, res) => {
      try {
        const health = await projectService.getProjectHealth(req.params.name);
        res.json({
          success: true,
          data: health,
        });
      } catch (error) {
        logger.error(
          `Error getting project health for ${req.params.name}:`,
          error,
        );
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/projects/:name/logs",
    asyncHandler(async (req, res) => {
      try {
        const tail = req.query.tail ? parseInt(req.query.tail as string) : 200;
        const logs = await projectService.getProjectLogs(req.params.name, tail);
        res.json({
          success: true,
          data: logs,
        });
      } catch (error) {
        logger.error(
          `Error getting project logs for ${req.params.name}:`,
          error,
        );
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Project tunnel routes
  router.post(
    "/projects/:name/tunnel",
    asyncHandler(async (req, res) => {
      try {
        const project = projectService.getProject(req.params.name);
        if (!project) {
          return res.status(404).json({ success: false, message: "Project not found" });
        }
        if (project.tunnelId) {
          return res.status(409).json({ success: false, message: "Project already has a tunnel" });
        }
        const hostPort = project.ports.find((p) => p.hostPort)?.hostPort;
        if (!hostPort) {
          return res.status(400).json({ success: false, message: "Project has no mapped host port" });
        }
        const tunnelName = `project-${req.params.name.replace(/[^a-zA-Z0-9-_]/g, "-")}`;
        const tunnelUrl = await tunnelService.createTunnel(tunnelName, hostPort);
        const updated = projectService.linkTunnel(req.params.name, tunnelName, tunnelUrl);
        res.json({ success: true, data: updated });
      } catch (error) {
        logger.error(`Error creating tunnel for project ${req.params.name}:`, error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.delete(
    "/projects/:name/tunnel",
    asyncHandler(async (req, res) => {
      try {
        const project = projectService.getProject(req.params.name);
        if (!project) {
          return res.status(404).json({ success: false, message: "Project not found" });
        }
        if (project.tunnelId) {
          await tunnelService.stopTunnel(project.tunnelId);
        }
        const updated = projectService.unlinkTunnel(req.params.name);
        res.json({ success: true, data: updated });
      } catch (error) {
        logger.error(`Error removing tunnel for project ${req.params.name}:`, error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  // Global port registry
  router.get(
    "/ports/registry",
    asyncHandler(async (req, res) => {
      try {
        const containers = await dockerService.getAllContainers();
        const registry: Record<number, { type: "container" | "project"; name: string; protocol: string }> = {};

        for (const c of containers) {
          for (const [containerPort, bindings] of Object.entries(c.ports || {})) {
            for (const binding of bindings || []) {
              const hp = parseInt(binding.HostPort);
              if (hp) {
                const proto = containerPort.includes("/") ? containerPort.split("/")[1] : "tcp";
                registry[hp] = { type: "container", name: c.name, protocol: proto };
              }
            }
          }
        }

        const projects = Array.from(projectService.getProjects().values());
        for (const project of projects) {
          for (const port of project.ports || []) {
            if (port.hostPort && !registry[port.hostPort]) {
              registry[port.hostPort] = { type: "project", name: project.name, protocol: port.protocol || "tcp" };
            }
          }
        }

        res.json({ success: true, data: registry });
      } catch (error) {
        logger.error("Error building port registry:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  // Settings routes
  router.get("/settings", asyncHandler(async (req, res) => {
    res.json({ success: true, data: settingsService.getAll() });
  }));

  router.put("/settings", asyncHandler(async (req, res) => {
    try {
      const { section, settings } = req.body;
      if (!section || typeof settings !== "object") {
        return res.status(400).json({ success: false, message: "section and settings required" });
      }
      settingsService.saveSection(section, settings);
      res.json({ success: true, message: "Settings saved" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }));

  router.get("/settings/backup", asyncHandler(async (req, res) => {
    res.json({ success: true, data: { timestamp: new Date().toISOString(), version: "1.0.0", settings: settingsService.getAll() } });
  }));

  router.post("/settings/restore", asyncHandler(async (req, res) => {
    try {
      const { backup } = req.body;
      if (backup?.settings && typeof backup.settings === "object") {
        for (const [section, values] of Object.entries(backup.settings)) {
          settingsService.saveSection(section, values as Record<string, any>);
        }
      }
      res.json({ success: true, message: "Settings restored" });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }));

  // Backup routes
  router.post(
    "/backup/create",
    asyncHandler(async (req, res) => {
      try {
        const config = req.body;
        const backupId = await backupService.createBackup(config);

        res.json({
          success: true,
          data: { backupId },
        });
      } catch (error) {
        logger.error("Error creating backup:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/backup/list",
    asyncHandler(async (req, res) => {
      try {
        const backups = backupService.getBackups();

        res.json({
          success: true,
          data: backups,
        });
      } catch (error) {
        logger.error("Error listing backups:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/backup/:backupId/restore",
    asyncHandler(async (req, res) => {
      try {
        const { backupId } = req.params;
        await backupService.restoreBackup(backupId);

        res.json({
          success: true,
          message: "Backup restored successfully",
        });
      } catch (error) {
        logger.error(`Error restoring backup ${req.params.backupId}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/backup/:backupId",
    asyncHandler(async (req, res) => {
      try {
        const { backupId } = req.params;
        await backupService.deleteBackup(backupId);

        res.json({
          success: true,
          message: "Backup deleted successfully",
        });
      } catch (error) {
        logger.error(`Error deleting backup ${req.params.backupId}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/backup/stats",
    asyncHandler(async (req, res) => {
      try {
        const backups = backupService.getBackups();
        const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
        const stats = {
          totalBackups: backups.length,
          totalSize,
          latestBackup: backups[0]?.id || null,
        };

        res.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        logger.error("Error getting backup stats:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Audit routes
  router.get(
    "/audit/logs",
    asyncHandler(async (req, res) => {
      try {
        const { startDate, endDate, userId, action, resource, limit, offset } =
          req.query;

        const logs = auditService.getAuditLogs({
          startDate: startDate ? new Date(startDate as string) : undefined,
          endDate: endDate ? new Date(endDate as string) : undefined,
          userId: userId as string,
          action: action as string,
          resource: resource as string,
          limit: limit ? parseInt(limit as string) : undefined,
          offset: offset ? parseInt(offset as string) : undefined,
        });

        res.json({
          success: true,
          data: logs,
        });
      } catch (error) {
        logger.error("Error getting audit logs:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/audit/stats",
    asyncHandler(async (req, res) => {
      try {
        const stats = auditService.getAuditStats();

        res.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        logger.error("Error getting audit stats:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Advanced System Management
  router.post("/system/performance-mode", async (req, res) => {
    try {
      const { enabled } = req.body;
      dockerService.setPerformanceMode(enabled);
      res.json({
        success: true,
        message: `Performance mode ${enabled ? "enabled" : "disabled"}`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/system/performance-baseline", async (req, res) => {
    try {
      metricsCollector.setPerformanceBaseline();
      res.json({ success: true, message: "Performance baseline established" });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/system/alert-threshold", async (req, res) => {
    try {
      const { metric, threshold } = req.body;
      metricsCollector.setAlertThreshold(metric, threshold);
      res.json({ success: true, message: `Alert threshold set for ${metric}` });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/system/anomaly-detection", async (req, res) => {
    try {
      const { enabled } = req.body;
      metricsCollector.enableAnomalyDetection(enabled);
      res.json({
        success: true,
        message: `Anomaly detection ${enabled ? "enabled" : "disabled"}`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Advanced Container Operations
  router.post("/containers/batch", async (req, res) => {
    try {
      const { operations } = req.body;
      await dockerService.batchContainerOperations(operations);
      res.json({ success: true, message: "Batch operations completed" });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/containers/:id/advanced-stats", async (req, res) => {
    try {
      const { id } = req.params;
      const stats = await dockerService.getAdvancedContainerStats(id);
      res.json({ success: true, data: stats });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/containers/cached", async (req, res) => {
    try {
      const containers = await dockerService.getContainersWithCache();
      res.json({ success: true, data: containers });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/containers/:id/metrics/cached", async (req, res) => {
    try {
      const { id } = req.params;
      const metrics = await dockerService.getContainerMetricsWithCache(id);
      res.json({ success: true, data: metrics });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Analytics routes
  router.post("/analytics/predictive-metrics", async (req, res) => {
    try {
      const { metric, horizon } = req.body;
      const predictions = await analyticsService.generatePredictiveMetrics(
        metric,
        horizon,
      );
      res.json({ success: true, data: predictions });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/analytics/detect-anomalies", async (req, res) => {
    try {
      const { metrics } = req.body;
      const anomalies = await analyticsService.detectAnomalies(metrics);
      res.json({ success: true, data: anomalies });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/analytics/analyze-trends", async (req, res) => {
    try {
      const { metric, period } = req.body;
      const trends = await analyticsService.analyzeTrends(metric, period);
      res.json({ success: true, data: trends });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/analytics/capacity-planning", async (req, res) => {
    try {
      const { resources } = req.body;
      const plans = await analyticsService.generateCapacityPlanning(resources);
      res.json({ success: true, data: plans });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/analytics/cost-forecast", async (req, res) => {
    try {
      const { period } = req.body;
      const forecasts = await analyticsService.forecastCosts(period);
      res.json({ success: true, data: forecasts });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/analytics/predictive-metrics", async (req, res) => {
    try {
      const { metric } = req.query;
      const predictions = analyticsService.getPredictiveMetrics(
        metric as string,
      );
      res.json({ success: true, data: predictions });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/analytics/anomalies", async (req, res) => {
    try {
      const { severity, limit } = req.query;
      const anomalies = analyticsService.getAnomalies(
        severity as string,
        parseInt(limit as string) || 50,
      );
      res.json({ success: true, data: anomalies });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/analytics/trends", async (req, res) => {
    try {
      const { metric } = req.query;
      const trends = analyticsService.getTrends(metric as string);
      res.json({ success: true, data: trends });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/analytics/capacity-planning", async (req, res) => {
    try {
      const plans = analyticsService.getCapacityPlans();
      res.json({ success: true, data: plans });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/analytics/cost-forecast", async (req, res) => {
    try {
      const { period } = req.query;
      const forecasts = analyticsService.getCostForecasts(
        parseInt(period as string),
      );
      res.json({ success: true, data: forecasts });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/analytics/insights", async (req, res) => {
    try {
      const insights = await analyticsService.generateInsights();
      res.json({ success: true, data: insights });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Health check routes
  router.get(
    "/health",
    asyncHandler(async (req, res) => {
      try {
        const health = await healthService.getHealthStatus();

        // Set appropriate HTTP status code based on health status
        let statusCode = 200;
        if (health.status === "unhealthy") {
          statusCode = 503;
        } else if (health.status === "degraded") {
          statusCode = 200; // Still serve but indicate degraded state
        }

        res.status(statusCode).json({
          success: health.status !== "unhealthy",
          data: health,
        });
      } catch (error) {
        logger.error("Health check failed:", error);
        res.status(503).json({
          success: false,
          message: "Health check failed",
          data: {
            status: "unhealthy",
            checks: [],
            uptime: 0,
            version: "unknown",
            timestamp: new Date().toISOString(),
          },
        });
      }
    }),
  );

  router.get(
    "/health/detailed",
    asyncHandler(async (req, res) => {
      try {
        const health = await healthService.getDetailedHealth();

        res.json({
          success: true,
          data: health,
        });
      } catch (error) {
        logger.error("Detailed health check failed:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/health/check/:checkName",
    asyncHandler(async (req, res) => {
      try {
        const { checkName } = req.params;
        const checks = await healthService.runHealthCheck(checkName);

        res.json({
          success: true,
          data: checks,
        });
      } catch (error) {
        logger.error(`Health check ${req.params.checkName} failed:`, error);
        res.status(400).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Cloudflare Tunnel endpoints
  router.post(
    "/tunnels/create",
    asyncHandler(async (req, res) => {
      try {
        const { name, port, domain } = req.body;

        if (!name || !port) {
          return res.status(400).json({
            success: false,
            message: "Name and port are required",
          });
        }

        const tunnelUrl = await tunnelService.createTunnel(name, port, domain);
        res.json({
          success: true,
          data: {
            url: tunnelUrl,
            name,
            port,
            domain,
          },
        });
      } catch (error) {
        logger.error("Failed to create tunnel:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/tunnels/status",
    asyncHandler(async (req, res) => {
      try {
        const status = await tunnelService.getStatus();
        res.json({
          success: true,
          data: status,
        });
      } catch (error) {
        logger.error("Failed to fetch tunnel status:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/tunnels",
    asyncHandler(async (req, res) => {
      try {
        const tunnels = tunnelService.getTunnels();
        res.json({
          success: true,
          data: tunnels,
        });
      } catch (error) {
        logger.error("Failed to fetch tunnels:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Cloudflare API endpoints
  router.post(
    "/cloudflare/auth",
    asyncHandler(async (req, res) => {
      try {
        const { apiToken, accountId } = req.body;

        if (!apiToken) {
          return res.status(400).json({
            success: false,
            message: "API token is required",
          });
        }

        cloudflareService.setConfig({ apiToken, accountId });
        const isValid = await cloudflareService.validateToken();

        if (!isValid) {
          cloudflareService.clearConfig();
          return res.status(401).json({
            success: false,
            message: "Invalid Cloudflare API token",
          });
        }

        res.json({
          success: true,
          message: "Cloudflare authentication successful",
        });
      } catch (error) {
        logger.error("Cloudflare authentication failed:", error);
        cloudflareService.clearConfig();
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/cloudflare/zones",
    asyncHandler(async (req, res) => {
      try {
        if (!cloudflareService.isAuthenticated()) {
          return res.status(401).json({
            success: false,
            message: "Cloudflare not authenticated",
          });
        }

        const zones = await cloudflareService.getZones();
        res.json({
          success: true,
          data: zones,
        });
      } catch (error) {
        logger.error("Failed to fetch Cloudflare zones:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/cloudflare/zones",
    asyncHandler(async (req, res) => {
      try {
        if (!cloudflareService.isAuthenticated()) {
          return res.status(401).json({
            success: false,
            message: "Cloudflare not authenticated",
          });
        }

        const { domain, accountId } = req.body;

        if (!domain) {
          return res.status(400).json({
            success: false,
            message: "Domain is required",
          });
        }

        const zone = await cloudflareService.createZone(domain, accountId);
        res.json({
          success: true,
          data: zone,
          message:
            "Zone created successfully. Update your domain's nameservers to the values provided by Cloudflare.",
        });
      } catch (error) {
        logger.error("Failed to create Cloudflare zone:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/cloudflare/config",
    asyncHandler(async (req, res) => {
      try {
        const { apiToken, accountId } = req.body;

        if (!apiToken) {
          return res.status(400).json({
            success: false,
            message: "API token is required",
          });
        }

        cloudflareService.setConfig({ apiToken, accountId });
        res.json({
          success: true,
          message: "Cloudflare configuration updated",
        });
      } catch (error) {
        logger.error("Failed to update Cloudflare config:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/tunnels/:name",
    asyncHandler(async (req, res) => {
      try {
        const { name } = req.params;
        await tunnelService.stopTunnel(name);
        res.json({
          success: true,
          message: `Tunnel ${name} stopped successfully`,
        });
      } catch (error) {
        logger.error(`Failed to stop tunnel ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/projects/:name/webhook/generate",
    asyncHandler(async (req, res) => {
      try {
        const secret = projectService.generateWebhookSecret(req.params.name);
        res.json({ success: true, data: { secret } });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  // Webhook endpoint — public (verified by HMAC)
  router.post(
    "/webhook/:name",
    asyncHandler(async (req, res) => {
      const secret = projectService.getWebhookSecret(req.params.name);
      if (!secret) {
        return res.status(404).json({ success: false, message: "No webhook configured for this project" });
      }

      const signature = req.headers["x-hub-signature-256"] as string || req.headers["x-gitlab-token"] as string || "";
      const body = JSON.stringify(req.body);

      // GitHub uses HMAC-SHA256, GitLab uses plain secret token
      const expected = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
      const isGitHub = signature.startsWith("sha256=");
      const valid = isGitHub
        ? crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
        : signature === secret;

      if (!valid) {
        return res.status(401).json({ success: false, message: "Invalid webhook signature" });
      }

      res.json({ success: true, message: "Webhook received, deploying..." });

      // Run async without blocking response
      projectService.pullLatestProject(req.params.name)
        .then(() => projectService.deployProject(req.params.name))
        .catch((err) => logger.error(`Webhook deploy failed for ${req.params.name}:`, err));
    }),
  );

  router.get(
    "/projects/:name/compose-files",
    asyncHandler(async (req, res) => {
      try {
        const project = projectService.getProject(req.params.name);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });
        const files = projectService.findComposeFiles(project.path);
        res.json({ success: true, data: files });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  // Git account routes
  router.get(
    "/git-accounts",
    asyncHandler(async (req, res) => {
      res.json({ success: true, data: gitAccountService.getAccounts() });
    }),
  );

  router.post(
    "/git-accounts",
    asyncHandler(async (req, res) => {
      try {
        const { provider, token } = req.body;
        if (!provider || !token) {
          return res.status(400).json({ success: false, message: "provider and token are required" });
        }
        if (provider !== "github" && provider !== "gitlab") {
          return res.status(400).json({ success: false, message: "provider must be github or gitlab" });
        }
        const account = await gitAccountService.addAccount(provider, token);
        res.json({ success: true, data: { ...account, token: "***" } });
      } catch (error) {
        logger.error("Error adding git account:", error);
        res.status(400).json({ success: false, message: error.message });
      }
    }),
  );

  router.delete(
    "/git-accounts/:id",
    asyncHandler(async (req, res) => {
      const removed = gitAccountService.removeAccount(decodeURIComponent(req.params.id));
      if (!removed) {
        return res.status(404).json({ success: false, message: "Account not found" });
      }
      res.json({ success: true, message: "Account removed" });
    }),
  );

  router.get(
    "/git-accounts/:id/repos",
    asyncHandler(async (req, res) => {
      try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const repos = await gitAccountService.listRepos(decodeURIComponent(req.params.id), page);
        res.json({ success: true, data: repos });
      } catch (error) {
        logger.error("Error listing repos:", error);
        res.status(400).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/git-accounts/:id/repos/:owner/:repo/branches",
    asyncHandler(async (req, res) => {
      try {
        const { owner, repo } = req.params;
        const branches = await gitAccountService.listBranches(
          decodeURIComponent(req.params.id),
          `${owner}/${repo}`,
        );
        res.json({ success: true, data: branches });
      } catch (error) {
        logger.error("Error listing branches:", error);
        res.status(400).json({ success: false, message: error.message });
      }
    }),
  );

  return router;
}

export default routes;
