"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalService = void 0;
const uuid_1 = require("uuid");
const child_process_1 = require("child_process");
const ws_1 = require("ws");
class TerminalService {
    constructor(config, logger) {
        this.sessions = new Map();
        this.wsServer = null;
        this._isRunning = false;
        this.config = config;
        this.logger = logger;
    }
    start() {
        if (this._isRunning) {
            this.logger.warn("Terminal service already running");
            return;
        }
        try {
            // Create WebSocket server for terminal connections
            this.wsServer = new ws_1.WebSocket.Server({ port: 0 });
            this.wsServer.on("connection", this.handleWebSocketConnection.bind(this));
            this.wsServer.on("error", (error) => {
                this.logger.error("WebSocket server error:", error);
            });
            this._isRunning = true;
            this.logger.info("Terminal service started");
        }
        catch (error) {
            this.logger.error("Failed to start terminal service:", error);
        }
    }
    stop() {
        if (!this._isRunning) {
            return;
        }
        try {
            // Close all active sessions
            for (const session of this.sessions.values()) {
                if (session.socket && session.socket.readyState === ws_1.WebSocket.OPEN) {
                    session.socket.close();
                }
            }
            // Clear sessions
            this.sessions.clear();
            // Close WebSocket server
            if (this.wsServer) {
                this.wsServer.close();
                this.wsServer = null;
            }
            this._isRunning = false;
            this.logger.info("Terminal service stopped");
        }
        catch (error) {
            this.logger.error("Error stopping terminal service:", error);
        }
    }
    isRunning() {
        return this._isRunning;
    }
    createSession(containerId, userId) {
        try {
            const sessionId = (0, uuid_1.v4)();
            const session = {
                id: sessionId,
                containerId,
                socket: null,
                createdAt: new Date(),
                lastActivity: new Date(),
                userId,
            };
            this.sessions.set(sessionId, session);
            // Clean up old sessions
            this.cleanupOldSessions();
            this.logger.info(`Created terminal session ${sessionId} for container ${containerId}`);
            return sessionId;
        }
        catch (error) {
            this.logger.error("Error creating terminal session:", error);
            throw error;
        }
    }
    getSessions() {
        return Array.from(this.sessions.values());
    }
    async executeCommand(sessionId, command) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Command timeout"));
            }, 30000);
            const cleanup = () => clearTimeout(timeout);
            if (session.socket && session.socket.readyState === ws_1.WebSocket.OPEN) {
                session.socket.send(JSON.stringify({
                    type: "command",
                    command,
                    timestamp: new Date().toISOString(),
                }));
                const messageHandler = (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        if (message.type === "output" || message.type === "error") {
                            cleanup();
                            resolve(message);
                        }
                    }
                    catch (error) {
                        cleanup();
                        reject(error);
                    }
                };
                session.socket.once("message", messageHandler);
                session.socket.on("error", (error) => {
                    cleanup();
                    reject(error);
                });
            }
            else {
                cleanup();
                reject(new Error(`Session ${sessionId} is not connected`));
            }
        });
    }
    async connectToContainer(sessionId, socket) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        try {
            session.socket = socket;
            // Create pty process for terminal
            const ptyProcess = (0, child_process_1.spawn)("docker", ["exec", "-it", session.containerId, "/bin/bash"], {
                stdio: "inherit",
                env: {
                    ...process.env,
                    TERM: "xterm-256color",
                },
            });
            // Handle pty output
            ptyProcess.stdout?.on("data", (data) => {
                if (socket.readyState === ws_1.WebSocket.OPEN) {
                    socket.send(data.toString());
                }
            });
            ptyProcess.stderr?.on("data", (data) => {
                if (socket.readyState === ws_1.WebSocket.OPEN) {
                    socket.send(data.toString());
                }
            });
            ptyProcess.on("close", (code) => {
                if (socket.readyState === ws_1.WebSocket.OPEN) {
                    socket.send(`\r\n[Process exited with code ${code}]\r\n`);
                    socket.close();
                }
                this.sessions.delete(sessionId);
            });
            ptyProcess.on("error", (error) => {
                this.logger.error(`Terminal session error: ${error}`);
                if (socket.readyState === ws_1.WebSocket.OPEN) {
                    socket.send(`\r\n[Error: ${error.message}]\r\n`);
                    socket.close();
                }
                this.sessions.delete(sessionId);
            });
            // Handle socket input
            socket.on("message", (data) => {
                if (ptyProcess.stdin) {
                    ptyProcess.stdin.write(data);
                }
                session.lastActivity = new Date();
            });
            // Handle socket close
            socket.on("close", () => {
                ptyProcess.kill();
                this.sessions.delete(sessionId);
            });
            session.lastActivity = new Date();
            this.logger.info(`Terminal session ${sessionId} connected to container ${session.containerId}`);
        }
        catch (error) {
            this.logger.error(`Error connecting to container ${session.containerId}:`, error);
            throw error;
        }
    }
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    getSessionByContainer(containerId) {
        return Array.from(this.sessions.values()).filter((session) => session.containerId === containerId);
    }
    async sendCommand(sessionId, command) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        if (session.socket && session.socket.readyState === ws_1.WebSocket.OPEN) {
            session.socket.send(command);
            session.lastActivity = new Date();
        }
        else {
            throw new Error(`Session ${sessionId} is not connected`);
        }
    }
    closeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            if (session.socket && session.socket.readyState === ws_1.WebSocket.OPEN) {
                session.socket.close();
            }
            this.sessions.delete(sessionId);
            this.logger.info(`Terminal session ${sessionId} closed`);
        }
    }
    handleWebSocketConnection(ws) {
        this.logger.info("New WebSocket connection to terminal service");
        ws.on("message", (data) => {
            try {
                const message = JSON.parse(data.toString());
                switch (message.type) {
                    case "connect":
                        this.handleConnectRequest(ws, message);
                        break;
                    case "command":
                        this.handleCommandRequest(ws, message);
                        break;
                    case "resize":
                        this.handleResizeRequest(ws, message);
                        break;
                    default:
                        this.logger.warn(`Unknown message type: ${message.type}`);
                }
            }
            catch (error) {
                this.logger.error("Error handling WebSocket message:", error);
                ws.send(JSON.stringify({
                    type: "error",
                    message: error.message,
                }));
            }
        });
        ws.on("close", () => {
            this.logger.info("WebSocket connection closed");
        });
    }
    handleConnectRequest(ws, message) {
        try {
            const { containerId, userId } = message.data;
            const sessionId = this.createSession(containerId, userId);
            // Create WebSocket connection to terminal
            const terminalWs = new ws_1.WebSocket(`ws://localhost:0`);
            terminalWs.on("open", () => {
                this.connectToContainer(sessionId, terminalWs)
                    .then(() => {
                    ws.send(JSON.stringify({
                        type: "connected",
                        data: { sessionId },
                    }));
                })
                    .catch((error) => {
                    this.logger.error("Failed to connect to terminal:", error);
                    ws.send(JSON.stringify({
                        type: "error",
                        message: error.message,
                    }));
                });
            });
            terminalWs.on("error", (error) => {
                this.logger.error("Terminal WebSocket error:", error);
                ws.send(JSON.stringify({
                    type: "error",
                    message: error.message,
                }));
            });
            terminalWs.on("close", () => {
                this.sessions.delete(sessionId);
            });
        }
        catch (error) {
            this.logger.error("Error handling connect request:", error);
            ws.send(JSON.stringify({
                type: "error",
                message: error.message,
            }));
        }
    }
    handleCommandRequest(ws, message) {
        try {
            const { sessionId, command } = message.data;
            this.sendCommand(sessionId, command)
                .then(() => {
                ws.send(JSON.stringify({
                    type: "command_sent",
                    data: { sessionId },
                }));
            })
                .catch((error) => {
                ws.send(JSON.stringify({
                    type: "error",
                    message: error.message,
                }));
            });
        }
        catch (error) {
            this.logger.error("Error handling command request:", error);
            ws.send(JSON.stringify({
                type: "error",
                message: error.message,
            }));
        }
    }
    handleResizeRequest(ws, message) {
        try {
            const { sessionId, cols, rows } = message.data;
            // Send resize command to terminal
            this.sendCommand(sessionId, `\x1b[8;${rows};${cols}t`)
                .then(() => {
                ws.send(JSON.stringify({
                    type: "resized",
                    data: { sessionId },
                }));
            })
                .catch((error) => {
                ws.send(JSON.stringify({
                    type: "error",
                    message: error.message,
                }));
            });
        }
        catch (error) {
            this.logger.error("Error handling resize request:", error);
            ws.send(JSON.stringify({
                type: "error",
                message: error.message,
            }));
        }
    }
    cleanupOldSessions() {
        const now = new Date();
        const timeout = this.config.terminalTimeout;
        for (const [sessionId, session] of this.sessions.entries()) {
            if (now.getTime() - session.lastActivity.getTime() > timeout) {
                this.closeSession(sessionId);
            }
        }
    }
    getSessionsSummary() {
        return {
            total: this.sessions.size,
            active: Array.from(this.sessions.values()).filter((session) => session.socket && session.socket.readyState === ws_1.WebSocket.OPEN).length,
            maxSessions: this.config.maxTerminalSessions,
            timeout: this.config.terminalTimeout,
        };
    }
}
exports.TerminalService = TerminalService;
exports.default = TerminalService;
