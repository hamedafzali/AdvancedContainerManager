"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.routes = routes;
const express_1 = require("express");
const logger_1 = require("../utils/logger");
const error_handler_1 = require("../middleware/error-handler");
const backup_service_1 = require("../services/backup-service");
const audit_service_1 = require("../services/audit-service");
const ai_optimizer_1 = require("../services/ai-optimizer");
const health_service_1 = require("../services/health-service");
const multi_cloud_service_1 = require("../services/multi-cloud-service");
const analytics_service_1 = require("../services/analytics-service");
function routes(dockerService, projectService, terminalService, metricsCollector) {
    const router = (0, express_1.Router)();
    const logger = new logger_1.Logger(logger_1.LogLevel.INFO);
    const backupService = new backup_service_1.BackupService(logger);
    const auditService = new audit_service_1.AuditService(logger);
    const healthService = new health_service_1.HealthService(logger);
    const aiOptimizer = new ai_optimizer_1.AIOptimizer(dockerService, metricsCollector, logger);
    const multiCloudService = new multi_cloud_service_1.MultiCloudService(logger);
    const analyticsService = new analytics_service_1.AnalyticsService(logger);
    // System routes
    router.get("/system/status", (0, error_handler_1.asyncHandler)(async (req, res) => {
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
        }
        catch (error) {
            logger.error("Error getting system status:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/system/metrics", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const metrics = await metricsCollector.collectSystemMetrics();
            res.json({
                success: true,
                data: metrics,
            });
        }
        catch (error) {
            logger.error("Error getting system metrics:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/system/metrics/history", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 100;
            const history = await metricsCollector.getSystemMetricsHistory(limit);
            res.json({
                success: true,
                data: history,
            });
        }
        catch (error) {
            logger.error("Error getting system metrics history:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    // Container routes
    router.get("/containers", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const containers = await dockerService.getAllContainers();
            res.json({
                success: true,
                data: containers,
            });
        }
        catch (error) {
            logger.error("Error getting containers:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/containers/:id", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const container = await dockerService.getContainer(req.params.id);
            res.json({
                success: true,
                data: container,
            });
        }
        catch (error) {
            logger.error(`Error getting container ${req.params.id}:`, error);
            res.status(404).json({
                success: false,
                message: "Container not found",
            });
        }
    }));
    router.post("/containers/:id/start", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            await dockerService.startContainer(req.params.id);
            res.json({
                success: true,
                message: `Container ${req.params.id} started successfully`,
            });
        }
        catch (error) {
            logger.error(`Error starting container ${req.params.id}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.post("/containers/:id/stop", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            await dockerService.stopContainer(req.params.id);
            res.json({
                success: true,
                message: `Container ${req.params.id} stopped successfully`,
            });
        }
        catch (error) {
            logger.error(`Error stopping container ${req.params.id}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.post("/containers/:id/restart", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            await dockerService.restartContainer(req.params.id);
            res.json({
                success: true,
                message: `Container ${req.params.id} restarted successfully`,
            });
        }
        catch (error) {
            logger.error(`Error restarting container ${req.params.id}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.delete("/containers/:id", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            await dockerService.removeContainer(req.params.id, true);
            res.json({
                success: true,
                message: `Container ${req.params.id} removed successfully`,
            });
        }
        catch (error) {
            logger.error(`Error removing container ${req.params.id}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/containers/:id/logs", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const options = {
                tail: req.query.tail ? parseInt(req.query.tail) : 100,
                since: req.query.since
                    ? new Date(req.query.since)
                    : undefined,
                until: req.query.until
                    ? new Date(req.query.until)
                    : undefined,
                timestamps: req.query.timestamps !== "false",
                stdout: req.query.stdout !== "false",
                stderr: req.query.stderr !== "false",
            };
            const logs = await dockerService.getContainerLogs(req.params.id, options);
            res.setHeader("Content-Type", "text/plain");
            res.send(logs);
        }
        catch (error) {
            logger.error(`Error getting logs for container ${req.params.id}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/containers/:id/stats", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const stats = await dockerService.getContainerStats(req.params.id);
            res.json({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            logger.error(`Error getting stats for container ${req.params.id}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/containers/:id/processes", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const processes = await dockerService.getContainerProcesses(req.params.id);
            res.json({
                success: true,
                data: processes,
            });
        }
        catch (error) {
            logger.error(`Error getting processes for container ${req.params.id}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    // Image routes
    router.get("/images", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const images = await dockerService.getAllImages();
            res.json({
                success: true,
                data: images,
            });
        }
        catch (error) {
            logger.error("Error getting images:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.post("/images/pull", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { imageName } = req.body;
            await dockerService.pullImage(imageName);
            res.json({
                success: true,
                message: `Image ${imageName} pulled successfully`,
            });
        }
        catch (error) {
            logger.error(`Error pulling image ${req.body.name}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.delete("/images/:id", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            await dockerService.removeImage(req.params.id, true);
            res.json({
                success: true,
                message: `Image ${req.params.id} removed successfully`,
            });
        }
        catch (error) {
            logger.error(`Error removing image ${req.params.id}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    // Network routes
    router.get("/networks", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const networks = await dockerService.getAllNetworks();
            res.json({
                success: true,
                data: networks,
            });
        }
        catch (error) {
            logger.error("Error getting networks:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.post("/networks", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { name, options } = req.body;
            await dockerService.createNetwork(name, options);
            res.json({
                success: true,
                message: `Network ${name} created successfully`,
            });
        }
        catch (error) {
            logger.error(`Error creating network ${req.body.name}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.delete("/networks/:id", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            await dockerService.removeNetwork(req.params.id);
            res.json({
                success: true,
                message: `Network ${req.params.id} removed successfully`,
            });
        }
        catch (error) {
            logger.error(`Error removing network ${req.params.id}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    // Volume routes
    router.get("/volumes", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const volumes = await dockerService.getAllVolumes();
            res.json({
                success: true,
                data: volumes,
            });
        }
        catch (error) {
            logger.error("Error getting volumes:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.post("/volumes", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { name, options } = req.body;
            await dockerService.createVolume(name, options);
            res.json({
                success: true,
                message: `Volume ${name} created successfully`,
            });
        }
        catch (error) {
            logger.error(`Error creating volume ${req.body.name}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.delete("/volumes/:id", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            await dockerService.removeVolume(req.params.id, true);
            res.json({
                success: true,
                message: `Volume ${req.params.id} removed successfully`,
            });
        }
        catch (error) {
            logger.error(`Error removing volume ${req.params.id}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    // Project routes
    router.get("/projects", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const projects = projectService.getProjects();
            res.json({
                success: true,
                data: Array.from(projects.values()),
            });
        }
        catch (error) {
            logger.error("Error getting projects:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.post("/projects", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { name, repoUrl, branch = "main", dockerfile = "Dockerfile", composeFile = "docker-compose.yml", environmentVars = {}, } = req.body;
            const project = await projectService.addProject(name, repoUrl, branch, dockerfile, composeFile, environmentVars);
            res.json({
                success: true,
                data: project,
            });
        }
        catch (error) {
            logger.error("Error adding project:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/projects/:name", (0, error_handler_1.asyncHandler)(async (req, res) => {
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
        }
        catch (error) {
            logger.error(`Error getting project ${req.params.name}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.post("/projects/:name/build", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            await projectService.buildProject(req.params.name);
            res.json({
                success: true,
                message: `Project ${req.params.name} built successfully`,
            });
        }
        catch (error) {
            logger.error(`Error building project ${req.params.name}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.post("/projects/:name/deploy", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            await projectService.deployProject(req.params.name);
            res.json({
                success: true,
                message: `Project ${req.params.name} deployed successfully`,
            });
        }
        catch (error) {
            logger.error(`Error deploying project ${req.params.name}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.post("/projects/:name/stop", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            await projectService.stopProject(req.params.name);
            res.json({
                success: true,
                message: `Project ${req.params.name} stopped successfully`,
            });
        }
        catch (error) {
            logger.error(`Error stopping project ${req.params.name}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.delete("/projects/:name", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            await projectService.removeProject(req.params.name);
            res.json({
                success: true,
                message: `Project ${req.params.name} removed successfully`,
            });
        }
        catch (error) {
            logger.error(`Error removing project ${req.params.name}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/projects/:name/health", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const health = await projectService.getProjectHealth(req.params.name);
            res.json({
                success: true,
                data: health,
            });
        }
        catch (error) {
            logger.error(`Error getting project health for ${req.params.name}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/projects/:name/logs", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const tail = req.query.tail ? parseInt(req.query.tail) : 200;
            const logs = await projectService.getProjectLogs(req.params.name, tail);
            res.json({
                success: true,
                data: logs,
            });
        }
        catch (error) {
            logger.error(`Error getting project logs for ${req.params.name}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/projects/summary", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const summary = projectService.getProjectsSummary();
            res.json({
                success: true,
                data: summary,
            });
        }
        catch (error) {
            logger.error("Error getting projects summary:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    // Terminal routes
    router.post("/terminal/:containerId/session", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { userId } = req.body;
            const sessionId = terminalService.createSession(req.params.containerId, userId);
            res.json({
                success: true,
                data: { sessionId },
            });
        }
        catch (error) {
            logger.error(`Error creating terminal session: ${error}`);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/terminal/sessions", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const sessions = terminalService.getSessions();
            res.json({
                success: true,
                data: sessions,
            });
        }
        catch (error) {
            logger.error("Error getting terminal sessions:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/terminal/sessions/summary", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const summary = terminalService.getSessionsSummary();
            res.json({
                success: true,
                data: summary,
            });
        }
        catch (error) {
            logger.error("Error getting terminal sessions summary:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.delete("/terminal/sessions/:sessionId", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            terminalService.closeSession(req.params.sessionId);
            res.json({
                success: true,
                message: `Terminal session ${req.params.sessionId} closed`,
            });
        }
        catch (error) {
            logger.error(`Error closing terminal session: ${error}`);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    // Settings routes
    router.get("/settings", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const settings = {
                general: {
                    theme: "light",
                    language: "en",
                    autoRefresh: true,
                    refreshInterval: 5000,
                },
                notifications: {
                    enabled: true,
                    containerEvents: true,
                    systemAlerts: true,
                    emailNotifications: false,
                },
                docker: {
                    defaultRegistry: "docker.io",
                    autoPrune: false,
                    pruneInterval: 86400000, // 24 hours
                    maxContainers: 50,
                },
                security: {
                    requireAuth: false,
                    sessionTimeout: 3600000, // 1 hour
                    maxLoginAttempts: 5,
                },
                api: {
                    rateLimit: true,
                    maxRequests: 100,
                    windowMs: 900000, // 15 minutes
                },
            };
            res.json({
                success: true,
                data: settings,
            });
        }
        catch (error) {
            logger.error("Error getting settings:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.put("/settings", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { section, settings } = req.body;
            // In a real implementation, this would save to a database or config file
            // For now, we'll just return success
            logger.info(`Settings updated for section: ${section}`);
            res.json({
                success: true,
                message: "Settings updated successfully",
            });
        }
        catch (error) {
            logger.error("Error updating settings:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/settings/backup", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const settings = {
                general: {
                    theme: "light",
                    language: "en",
                    autoRefresh: true,
                    refreshInterval: 5000,
                },
                notifications: {
                    enabled: true,
                    containerEvents: true,
                    systemAlerts: true,
                    emailNotifications: false,
                },
                docker: {
                    defaultRegistry: "docker.io",
                    autoPrune: false,
                    pruneInterval: 86400000,
                    maxContainers: 50,
                },
                security: {
                    requireAuth: false,
                    sessionTimeout: 3600000,
                    maxLoginAttempts: 5,
                },
                api: {
                    rateLimit: true,
                    maxRequests: 100,
                    windowMs: 900000,
                },
            };
            const backup = {
                timestamp: new Date().toISOString(),
                version: "1.0.0",
                settings,
            };
            res.json({
                success: true,
                data: backup,
            });
        }
        catch (error) {
            logger.error("Error creating settings backup:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.post("/settings/restore", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { backup } = req.body;
            // In a real implementation, this would restore from backup
            logger.info("Settings restored from backup");
            res.json({
                success: true,
                message: "Settings restored successfully",
            });
        }
        catch (error) {
            logger.error("Error restoring settings:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    // System metrics history
    router.get("/api/system/metrics/history", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { limit = 100 } = req.query;
            const history = await metricsCollector.getMetricsHistory(limit ? parseInt(limit) : undefined);
            res.json({
                success: true,
                data: history,
            });
        }
        catch (error) {
            logger.error("Error getting metrics history:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    // Terminal routes
    router.post("/api/terminal/:containerId/session", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { containerId } = req.params;
            const sessionId = await terminalService.createSession(containerId);
            res.json({
                success: true,
                data: { id: sessionId, containerId },
            });
        }
        catch (error) {
            logger.error(`Error creating terminal session for ${req.params.containerId}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/api/terminal/sessions", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const sessions = await terminalService.getSessions();
            res.json({
                success: true,
                data: sessions,
            });
        }
        catch (error) {
            logger.error("Error getting terminal sessions:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.post("/api/terminal/sessions/:sessionId/execute", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { sessionId } = req.params;
            const { command } = req.body;
            const result = await terminalService.executeCommand(sessionId, command);
            res.json({
                success: true,
                data: result,
            });
        }
        catch (error) {
            logger.error(`Error executing command in session ${req.params.sessionId}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.delete("/api/terminal/sessions/:sessionId", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { sessionId } = req.params;
            await terminalService.closeSession(sessionId);
            res.json({
                success: true,
                message: "Session closed successfully",
            });
        }
        catch (error) {
            logger.error(`Error closing terminal session ${req.params.sessionId}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    // Backup routes
    router.post("/api/backup/create", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const config = req.body;
            const backupId = await backupService.createBackup(config);
            res.json({
                success: true,
                data: { backupId },
            });
        }
        catch (error) {
            logger.error("Error creating backup:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/api/backup/list", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const backups = backupService.listBackups();
            res.json({
                success: true,
                data: backups,
            });
        }
        catch (error) {
            logger.error("Error listing backups:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.post("/api/backup/:backupId/restore", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { backupId } = req.params;
            await backupService.restoreBackup(backupId);
            res.json({
                success: true,
                message: "Backup restored successfully",
            });
        }
        catch (error) {
            logger.error(`Error restoring backup ${req.params.backupId}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.delete("/api/backup/:backupId", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { backupId } = req.params;
            await backupService.deleteBackup(backupId);
            res.json({
                success: true,
                message: "Backup deleted successfully",
            });
        }
        catch (error) {
            logger.error(`Error deleting backup ${req.params.backupId}:`, error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/api/backup/stats", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const stats = backupService.getBackupStats();
            res.json({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            logger.error("Error getting backup stats:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    // Audit routes
    router.get("/api/audit/logs", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { startDate, endDate, userId, action, resource, limit, offset } = req.query;
            const logs = auditService.getAuditLogs({
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                userId: userId,
                action: action,
                resource: resource,
                limit: limit ? parseInt(limit) : undefined,
                offset: offset ? parseInt(offset) : undefined,
            });
            res.json({
                success: true,
                data: logs,
            });
        }
        catch (error) {
            logger.error("Error getting audit logs:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/api/audit/stats", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const stats = auditService.getAuditStats();
            res.json({
                success: true,
                data: stats,
            });
        }
        catch (error) {
            logger.error("Error getting audit stats:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    // Advanced System Management
    router.post("/system/performance-mode", async (req, res) => {
        try {
            const { enabled } = req.body;
            dockerService.setPerformanceMode(enabled);
            res.json({
                success: true,
                message: `Performance mode ${enabled ? "enabled" : "disabled"}`,
            });
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    // AI Optimization routes
    router.post("/ai/optimization/analyze", async (req, res) => {
        try {
            const result = await aiOptimizer.performOptimizationAnalysis();
            res.json({ success: true, data: result });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.get("/ai/optimization/history", async (req, res) => {
        try {
            const history = aiOptimizer.getOptimizationHistory();
            res.json({ success: true, data: history });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.post("/ai/optimization/apply/:recommendationId", async (req, res) => {
        try {
            const { recommendationId } = req.params;
            const success = await aiOptimizer.applyOptimizationRecommendation(recommendationId);
            res.json({ success, data: { recommendationId, applied: success } });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.get("/ai/optimization/learning-data", async (req, res) => {
        try {
            const learningData = aiOptimizer.getLearningData();
            res.json({ success: true, data: Object.fromEntries(learningData) });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    // Multi-Cloud routes
    router.post("/multi-cloud/providers", async (req, res) => {
        try {
            const provider = await multiCloudService.addProvider(req.body);
            res.json({ success: true, data: provider });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.get("/multi-cloud/providers", async (req, res) => {
        try {
            const providers = await multiCloudService.getProviders();
            res.json({ success: true, data: providers });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.delete("/multi-cloud/providers/:providerId", async (req, res) => {
        try {
            const { providerId } = req.params;
            const success = await multiCloudService.removeProvider(providerId);
            res.json({ success, data: { providerId } });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.get("/multi-cloud/instances", async (req, res) => {
        try {
            const { provider } = req.query;
            const instances = await multiCloudService.getInstances(provider);
            res.json({ success: true, data: instances });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.get("/multi-cloud/metrics", async (req, res) => {
        try {
            const { provider } = req.query;
            const metrics = await multiCloudService.getMetrics(provider);
            res.json({ success: true, data: metrics });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.post("/multi-cloud/optimize-costs", async (req, res) => {
        try {
            const optimization = await multiCloudService.optimizeCosts();
            res.json({ success: true, data: optimization });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.post("/multi-cloud/deploy", async (req, res) => {
        try {
            const { providerName, config } = req.body;
            const instance = await multiCloudService.deployInstance(providerName, config);
            res.json({ success: true, data: instance });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.delete("/multi-cloud/instances/:providerName/:instanceId", async (req, res) => {
        try {
            const { providerName, instanceId } = req.params;
            const success = await multiCloudService.terminateInstance(providerName, instanceId);
            res.json({ success, data: { providerName, instanceId } });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.get("/multi-cloud/config", async (req, res) => {
        try {
            const config = multiCloudService.getConfig();
            res.json({ success: true, data: config });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.put("/multi-cloud/config", async (req, res) => {
        try {
            multiCloudService.updateConfig(req.body);
            const config = multiCloudService.getConfig();
            res.json({ success: true, data: config });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.get("/multi-cloud/metrics/history", async (req, res) => {
        try {
            const history = multiCloudService.getMetricsHistory();
            res.json({ success: true, data: history });
        }
        catch (error) {
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
            const predictions = await analyticsService.generatePredictiveMetrics(metric, horizon);
            res.json({ success: true, data: predictions });
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.get("/analytics/predictive-metrics", async (req, res) => {
        try {
            const { metric } = req.query;
            const predictions = analyticsService.getPredictiveMetrics(metric);
            res.json({ success: true, data: predictions });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.get("/analytics/anomalies", async (req, res) => {
        try {
            const { severity, limit } = req.query;
            const anomalies = analyticsService.getAnomalies(severity, parseInt(limit) || 50);
            res.json({ success: true, data: anomalies });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.get("/analytics/trends", async (req, res) => {
        try {
            const { metric } = req.query;
            const trends = analyticsService.getTrends(metric);
            res.json({ success: true, data: trends });
        }
        catch (error) {
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
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    router.get("/analytics/cost-forecast", async (req, res) => {
        try {
            const { period } = req.query;
            const forecasts = analyticsService.getCostForecasts(parseInt(period));
            res.json({ success: true, data: forecasts });
        }
        catch (error) {
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
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    // Health check routes
    router.get("/health", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const health = await healthService.getHealthStatus();
            // Set appropriate HTTP status code based on health status
            let statusCode = 200;
            if (health.status === "unhealthy") {
                statusCode = 503;
            }
            else if (health.status === "degraded") {
                statusCode = 200; // Still serve but indicate degraded state
            }
            res.status(statusCode).json({
                success: health.status !== "unhealthy",
                data: health,
            });
        }
        catch (error) {
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
    }));
    router.get("/health/detailed", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const health = await healthService.getDetailedHealth();
            res.json({
                success: true,
                data: health,
            });
        }
        catch (error) {
            logger.error("Detailed health check failed:", error);
            res.status(500).json({
                success: false,
                message: error.message,
            });
        }
    }));
    router.get("/health/check/:checkName", (0, error_handler_1.asyncHandler)(async (req, res) => {
        try {
            const { checkName } = req.params;
            const checks = await healthService.runHealthCheck(checkName);
            res.json({
                success: true,
                data: checks,
            });
        }
        catch (error) {
            logger.error(`Health check ${req.params.checkName} failed:`, error);
            res.status(400).json({
                success: false,
                message: error.message,
            });
        }
    }));
    return router;
}
exports.default = routes;
