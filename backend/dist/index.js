"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("./utils/logger");
const metrics_collector_1 = require("./services/metrics-collector");
const docker_service_1 = require("./services/docker-service");
const project_service_1 = require("./services/project-service");
const terminal_service_1 = require("./services/terminal-service");
const websocket_handler_1 = require("./services/websocket-handler");
const error_handler_1 = require("./middleware/error-handler");
const routes_1 = require("./routes");
// Load environment variables
dotenv_1.default.config();
class AdvancedContainerManager {
    constructor() {
        this.config = this.loadConfig();
        this.logger = new logger_1.Logger(logger_1.LogLevel[this.config.logLevel]);
        this.app = (0, express_1.default)();
        this.server = (0, http_1.createServer)(this.app);
        this.io = new socket_io_1.Server(this.server, {
            cors: {
                origin: process.env.SOCKET_ORIGIN || (this.config.debug ? "*" : false),
                methods: ["GET", "POST"],
            },
        });
        this.initializeServices();
        this.setupMiddleware();
        this.setupWebSocket();
        this.setupErrorHandling();
    }
    loadConfig() {
        return {
            port: parseInt(process.env.PORT || "5003"),
            host: process.env.HOST || "0.0.0.0",
            debug: process.env.DEBUG === "true",
            logLevel: process.env.LOG_LEVEL || "info",
            docker: {
                host: process.env.DOCKER_HOST,
                socketPath: process.env.DOCKER_SOCKET_PATH || "/var/run/docker.sock",
                protocol: process.env.DOCKER_PROTOCOL || "http",
                timeout: parseInt(process.env.DOCKER_TIMEOUT || "2000"),
            },
            redis: {
                host: process.env.REDIS_HOST || "localhost",
                port: parseInt(process.env.REDIS_PORT || "6379"),
                db: parseInt(process.env.REDIS_DB || "0"),
                password: process.env.REDIS_PASSWORD,
                keyPrefix: "advanced_manager:",
            },
            projectsDir: process.env.PROJECTS_DIR || "/tmp/advanced_manager_projects",
            configPath: process.env.CONFIG_PATH || "/tmp/advanced_manager_config.json",
            websocketTimeout: parseInt(process.env.WEBSOCKET_TIMEOUT || "300000"),
            terminalTimeout: parseInt(process.env.TERMINAL_TIMEOUT || "3600000"),
            maxTerminalSessions: parseInt(process.env.MAX_TERMINAL_SESSIONS || "100"),
            metricsInterval: parseInt(process.env.METRICS_INTERVAL || "5000"),
            metricsRetention: parseInt(process.env.METRICS_RETENTION || "24"),
        };
    }
    initializeServices() {
        this.metricsCollector = new metrics_collector_1.MetricsCollector(this.config, this.logger);
        this.dockerService = new docker_service_1.DockerService(this.config, this.logger);
        this.projectService = new project_service_1.ProjectService(this.config, this.logger);
        this.terminalService = new terminal_service_1.TerminalService(this.config, this.logger);
        this.wsHandler = new websocket_handler_1.WebSocketHandler(this.io, this.metricsCollector, this.logger);
        // Start background services
        this.metricsCollector.start();
        this.terminalService.start();
    }
    setupMiddleware() {
        const corsOrigin = process.env.CORS_ORIGIN || (this.config.debug ? "*" : false);
        const socketOrigin = process.env.SOCKET_ORIGIN || corsOrigin;
        // Security middleware
        this.app.use((0, helmet_1.default)({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
                    styleSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
                    imgSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
                },
            },
        }));
        // CORS
        this.app.use((0, cors_1.default)({
            origin: corsOrigin,
            credentials: true,
        }));
        // Compression
        this.app.use((0, compression_1.default)());
        // Logging
        this.app.use((0, morgan_1.default)("combined", {
            stream: {
                write: (message) => this.logger.info(message.trim()),
            },
        }));
        // Body parsing
        this.app.use(express_1.default.json({ limit: "10mb" }));
        this.app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" }));
        // API routes
        this.app.use("/api", (0, routes_1.routes)(this.dockerService, this.projectService, this.terminalService, this.metricsCollector));
        // Health check
        this.app.get("/health", (req, res) => {
            res.json({
                status: "healthy",
                timestamp: new Date().toISOString(),
                version: "1.0.0",
                services: {
                    docker: this.dockerService.isConnected(),
                    redisConnected: this.metricsCollector.isRedisConnected(),
                    terminal: this.terminalService.isRunning(),
                },
            });
        });
        // API routes
        this.app.use("/api", (0, routes_1.routes)(this.dockerService, this.projectService, this.terminalService, this.metricsCollector));
    }
    setupWebSocket() {
        this.io.on("connection", (socket) => {
            this.logger.info(`Client connected: ${socket.id}`);
            this.wsHandler.handleConnectionPublic(socket);
        });
    }
    setupErrorHandling() {
        this.app.use(error_handler_1.errorHandler);
    }
    async start() {
        try {
            // Test Docker connection
            await this.dockerService.testConnection();
            this.logger.info("Docker connection established");
            // Start server
            this.server.listen(this.config.port, this.config.host, () => {
                this.logger.info(`Advanced Container Manager started on ${this.config.host}:${this.config.port}`);
                this.logger.info(`Environment: ${this.config.debug ? "development" : "production"}`);
                this.logger.info(`Docker: Connected`);
                this.logger.info(`Redis: Connected`);
            });
            // Graceful shutdown
            process.on("SIGTERM", () => this.shutdown());
            process.on("SIGINT", () => this.shutdown());
        }
        catch (error) {
            this.logger.error("Failed to start server:", error);
            process.exit(1);
        }
    }
    async shutdown() {
        this.logger.info("Shutting down gracefully...");
        // Stop accepting new connections
        this.server.close(() => {
            this.logger.info("HTTP server closed");
        });
        // Stop services
        this.metricsCollector.stop();
        this.terminalService.stop();
        // Close WebSocket connections
        this.io.close(() => {
            this.logger.info("WebSocket server closed");
        });
        process.exit(0);
    }
}
// Start the application
const app = new AdvancedContainerManager();
app.start().catch((error) => {
    console.error("Failed to start application:", error);
    process.exit(1);
});
exports.default = AdvancedContainerManager;
