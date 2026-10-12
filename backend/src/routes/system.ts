import { Router } from "express";
import { asyncHandler } from "../middleware/error-handler";
import type { RouteDeps } from "./deps";

/** System, settings, backup, audit, health, port registry and prune routes. */
export function registerSystemRoutes(router: Router, deps: RouteDeps): void {
  const { dockerService, projectService, metricsCollector, settingsService, pruneService, logger, backupService, auditService, healthService } = deps;

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

  // Prune routes
  router.post("/system/prune", asyncHandler(async (req, res) => {
    try {
      const { target = "all" } = req.body;
      let result: any;
      if (target === "containers") result = { containers: await pruneService.pruneContainers() };
      else if (target === "images") result = { images: await pruneService.pruneImages() };
      else if (target === "volumes") result = { volumes: await pruneService.pruneVolumes() };
      else result = await pruneService.pruneAll();
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }));
}
