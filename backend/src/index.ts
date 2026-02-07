import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";

import { AppConfig } from "./types";
import { Logger, LogLevel } from "./utils/logger";
import { MetricsCollector } from "./services/metrics-collector";
import { DockerService } from "./services/docker-service";
import { ProjectService } from "./services/project-service";
import { TerminalService } from "./services/terminal-service";
import { WebSocketHandler } from "./services/websocket-handler";
import { errorHandler } from "./middleware/error-handler";
import { routes } from "./routes";

// Load environment variables
dotenv.config();

class AdvancedContainerManager {
  private app: express.Application;
  private server: any;
  private io: SocketIOServer;
  private config: AppConfig;
  private logger: Logger;
  private metricsCollector: MetricsCollector;
  private dockerService: DockerService;
  private projectService: ProjectService;
  private terminalService: TerminalService;
  private wsHandler: WebSocketHandler;

  constructor() {
    this.config = this.loadConfig();
    this.logger = new Logger(
      LogLevel[this.config.logLevel as keyof typeof LogLevel],
    );
    this.app = express();
    this.server = createServer(this.app);
    this.io = new SocketIOServer(this.server, {
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

  private loadConfig(): AppConfig {
    return {
      port: parseInt(process.env.PORT || "5003"),
      host: process.env.HOST || "0.0.0.0",
      debug: process.env.DEBUG === "true",
      logLevel: (process.env.LOG_LEVEL as any) || "info",
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
      configPath:
        process.env.CONFIG_PATH || "/tmp/advanced_manager_config.json",
      websocketTimeout: parseInt(process.env.WEBSOCKET_TIMEOUT || "300000"),
      terminalTimeout: parseInt(process.env.TERMINAL_TIMEOUT || "3600000"),
      maxTerminalSessions: parseInt(process.env.MAX_TERMINAL_SESSIONS || "100"),
      metricsInterval: parseInt(process.env.METRICS_INTERVAL || "5000"),
      metricsRetention: parseInt(process.env.METRICS_RETENTION || "24"),
    };
  }

  private initializeServices(): void {
    this.metricsCollector = new MetricsCollector(this.config, this.logger);
    this.dockerService = new DockerService(this.config, this.logger);
    this.projectService = new ProjectService(this.config, this.logger);
    this.terminalService = new TerminalService(this.config, this.logger);
    this.wsHandler = new WebSocketHandler(
      this.io,
      this.metricsCollector,
      this.logger,
    );

    // Start background services
    this.metricsCollector.start();
    this.terminalService.start();
  }

  private setupMiddleware(): void {
    const corsOrigin = process.env.CORS_ORIGIN || (this.config.debug ? "*" : false);
    const socketOrigin = process.env.SOCKET_ORIGIN || corsOrigin;

    // Security middleware
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
          },
        },
      }),
    );

    // CORS
    this.app.use(
      cors({
        origin: corsOrigin,
        credentials: true,
      }),
    );

    // Compression
    this.app.use(compression());

    // Logging
    this.app.use(
      morgan("combined", {
        stream: {
          write: (message: string) => this.logger.info(message.trim()),
        },
      }),
    );

    // Body parsing
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // API routes
    this.app.use(
      "/api",
      routes(
        this.dockerService,
        this.projectService,
        this.terminalService,
        this.metricsCollector,
      ),
    );

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
    this.app.use(
      "/api",
      routes(
        this.dockerService,
        this.projectService,
        this.terminalService,
        this.metricsCollector,
      ),
    );

    // Serve frontend (SPA)
    this.app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "public", "index.html"));
    });
  }

  private setupWebSocket(): void {
    this.io.on("connection", (socket) => {
      this.logger.info(`Client connected: ${socket.id}`);
      this.wsHandler.handleConnectionPublic(socket);
    });
  }

  private setupErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Test Docker connection
      await this.dockerService.testConnection();
      this.logger.info("Docker connection established");

      // Start server
      this.server.listen(this.config.port, this.config.host, () => {
        this.logger.info(
          `Advanced Container Manager started on ${this.config.host}:${this.config.port}`,
        );
        this.logger.info(
          `Environment: ${this.config.debug ? "development" : "production"}`,
        );
        this.logger.info(`Docker: Connected`);
        this.logger.info(`Redis: Connected`);
      });

      // Graceful shutdown
      process.on("SIGTERM", () => this.shutdown());
      process.on("SIGINT", () => this.shutdown());
    } catch (error) {
      this.logger.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  public async shutdown(): Promise<void> {
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

export default AdvancedContainerManager;
