"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketHandler = void 0;
class WebSocketHandler {
    constructor(io, metricsCollector, logger) {
        this.connectedClients = new Set();
        this.io = io;
        this.metricsCollector = metricsCollector;
        this.logger = logger;
        this.setupEventHandlers();
    }
    setupEventHandlers() {
        this.io.on("connection", (socket) => {
            this.handleConnection(socket);
        });
        this.io.on("disconnect", (socket) => {
            this.handleDisconnection(socket);
        });
    }
    handleConnection(socket) {
        const clientId = socket.id;
        this.connectedClients.add(clientId);
        this.logger.info(`Client connected: ${clientId}`);
        // Join system room for global updates
        socket.join("system");
        // Send initial system status
        this.sendSystemStatus(socket);
        // Set up client-specific event handlers
        this.setupClientHandlers(socket);
    }
    handleConnectionPublic(socket) {
        this.handleConnection(socket);
    }
    handleDisconnection(socket) {
        const clientId = socket.id;
        this.connectedClients.delete(clientId);
        this.logger.info(`Client disconnected: ${clientId}`);
    }
    setupClientHandlers(socket) {
        // Subscribe to container updates
        socket.on("subscribe_container", (data) => {
            const { containerId } = data;
            socket.join(`container:${containerId}`);
            this.logger.info(`Client ${socket.id} subscribed to container ${containerId}`);
        });
        // Unsubscribe from container updates
        socket.on("unsubscribe_container", (data) => {
            const { containerId } = data;
            socket.leave(`container:${containerId}`);
            this.logger.info(`Client ${socket.id} unsubscribed from container ${containerId}`);
        });
        // Request system metrics
        socket.on("get_system_metrics", async () => {
            try {
                const metrics = await this.metricsCollector.collectSystemMetrics();
                socket.emit("system_metrics", metrics);
            }
            catch (error) {
                this.logger.error("Error getting system metrics:", error);
                socket.emit("error", { message: "Failed to get system metrics" });
            }
        });
        // Request container metrics
        socket.on("get_container_metrics", async (data) => {
            try {
                const { containerId } = data;
                const metrics = await this.metricsCollector.collectContainerMetrics(containerId);
                socket.emit("container_metrics", { containerId, metrics });
            }
            catch (error) {
                const { containerId } = data;
                this.logger.error(`Error getting container metrics for ${containerId}:`, error);
                socket.emit("error", {
                    message: `Failed to get container metrics for ${containerId}`,
                });
            }
        });
        // Request metrics history
        socket.on("get_system_metrics_history", async (data) => {
            try {
                const { limit = 100 } = data;
                const history = await this.metricsCollector.getSystemMetricsHistory(limit);
                socket.emit("system_metrics_history", history);
            }
            catch (error) {
                this.logger.error("Error getting system metrics history:", error);
                socket.emit("error", {
                    message: "Failed to get system metrics history",
                });
            }
        });
        // Request container metrics history
        socket.on("get_container_metrics_history", async (data) => {
            try {
                const { containerId, limit = 100 } = data;
                const history = await this.metricsCollector.getContainerMetricsHistory(containerId, limit);
                socket.emit("container_metrics_history", { containerId, history });
            }
            catch (error) {
                const { containerId } = data;
                this.logger.error(`Error getting container metrics history for ${containerId}:`, error);
                socket.emit("error", {
                    message: `Failed to get container metrics history for ${containerId}`,
                });
            }
        });
    }
    async sendSystemStatus(socket) {
        try {
            const metrics = await this.metricsCollector.collectSystemMetrics();
            const metricsSummary = this.metricsCollector.getMetricsSummary();
            socket.emit("system_status", {
                timestamp: new Date().toISOString(),
                metrics,
                summary: metricsSummary,
                connectedClients: this.connectedClients.size,
            });
        }
        catch (error) {
            this.logger.error("Error sending system status:", error);
        }
    }
    broadcastSystemMetrics(metrics) {
        this.io.to("system").emit("system_metrics_update", metrics);
    }
    broadcastContainerMetrics(containerId, metrics) {
        this.io.to(`container:${containerId}`).emit("container_metrics_update", {
            containerId,
            metrics,
        });
    }
    broadcastSystemStatus(status) {
        this.io.to("system").emit("system_status_update", status);
    }
    broadcastNotification(notification) {
        this.io.emit("notification", notification);
    }
    getClientCount() {
        return this.connectedClients.size;
    }
    getConnectedClients() {
        return Array.from(this.connectedClients);
    }
}
exports.WebSocketHandler = WebSocketHandler;
exports.default = WebSocketHandler;
