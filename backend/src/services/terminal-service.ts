import { v4 as uuidv4 } from "uuid";
import { spawn } from "child_process";
import { WebSocket } from "ws";
import { AppConfig, TerminalSession } from "../types";
import { Logger } from "../utils/logger";

export class TerminalService {
  private config: AppConfig;
  private logger: Logger;
  private sessions: Map<string, TerminalSession> = new Map();
  private wsServer: any = null;
  private _isRunning: boolean = false;

  constructor(config: AppConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  public start(): void {
    if (this._isRunning) {
      this.logger.warn("Terminal service already running");
      return;
    }

    try {
      // Create WebSocket server for terminal connections
      this.wsServer = new WebSocket.Server({ port: 0 });

      this.wsServer.on("connection", this.handleWebSocketConnection.bind(this));
      this.wsServer.on("error", (error) => {
        this.logger.error("WebSocket server error:", error);
      });

      this._isRunning = true;
      this.logger.info("Terminal service started");
    } catch (error) {
      this.logger.error("Failed to start terminal service:", error);
    }
  }

  public stop(): void {
    if (!this._isRunning) {
      return;
    }

    try {
      // Close all active sessions
      for (const session of this.sessions.values()) {
        if (session.socket && session.socket.readyState === WebSocket.OPEN) {
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
    } catch (error) {
      this.logger.error("Error stopping terminal service:", error);
    }
  }

  public isRunning(): boolean {
    return this._isRunning;
  }

  public createSession(containerId: string, userId?: string): string {
    try {
      const sessionId = uuidv4();

      const session: TerminalSession = {
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

      this.logger.info(
        `Created terminal session ${sessionId} for container ${containerId}`,
      );
      return sessionId;
    } catch (error) {
      this.logger.error("Error creating terminal session:", error);
      throw error;
    }
  }

  public getSessions(): TerminalSession[] {
    return Array.from(this.sessions.values());
  }

  public async executeCommand(
    sessionId: string,
    command: string,
  ): Promise<{ output?: string; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      const runWithShell = (shellPath: string) =>
        new Promise<{ output?: string; error?: string; code: number }>(
          (resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Command timeout"));
            }, 30000);

            const cleanup = () => clearTimeout(timeout);

            const dockerProcess = spawn(
              "docker",
              ["exec", session.containerId, shellPath, "-lc", command],
              {
                stdio: ["pipe", "pipe", "pipe"],
                env: {
                  ...process.env,
                  TERM: "xterm-256color",
                },
              },
            );

            let stdout = "";
            let stderr = "";

            dockerProcess.stdout?.on("data", (data: Buffer) => {
              stdout += data.toString();
            });

            dockerProcess.stderr?.on("data", (data: Buffer) => {
              stderr += data.toString();
            });

            dockerProcess.on("close", (code: number) => {
              cleanup();
              if (code === 0) {
                resolve({ output: stdout, code });
              } else {
                resolve({
                  error: stderr || `Command failed with code ${code}`,
                  code,
                });
              }
            });

            dockerProcess.on("error", (error: Error) => {
              cleanup();
              reject(error);
            });

            session.lastActivity = new Date();
          },
        );

      const shResult = await runWithShell("/bin/sh");
      if (shResult.error && /not found|no such file/i.test(shResult.error)) {
        const bashResult = await runWithShell("/bin/bash");
        return { output: bashResult.output, error: bashResult.error };
      }

      return { output: shResult.output, error: shResult.error };
    } catch (error) {
      this.logger.error("Error executing command:", error);
      throw error;
    }
  }

  public async connectToContainer(
    sessionId: string,
    socket: WebSocket,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      session.socket = socket;

      // Create pty process for terminal
      const ptyProcess = spawn(
        "docker",
        ["exec", "-it", session.containerId, "/bin/bash"],
        {
          stdio: "inherit",
          env: {
            ...process.env,
            TERM: "xterm-256color",
          },
        },
      );

      // Handle pty output
      ptyProcess.stdout?.on("data", (data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(data.toString());
        }
      });

      ptyProcess.stderr?.on("data", (data) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(data.toString());
        }
      });

      ptyProcess.on("close", (code) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(`\r\n[Process exited with code ${code}]\r\n`);
          socket.close();
        }
        this.sessions.delete(sessionId);
      });

      ptyProcess.on("error", (error) => {
        this.logger.error(`Terminal session error: ${error}`);
        if (socket.readyState === WebSocket.OPEN) {
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
      this.logger.info(
        `Terminal session ${sessionId} connected to container ${session.containerId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error connecting to container ${session.containerId}:`,
        error,
      );
      throw error;
    }
  }

  public getSession(sessionId: string): TerminalSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getSessionByContainer(containerId: string): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.containerId === containerId,
    );
  }

  public async sendCommand(sessionId: string, command: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.socket && session.socket.readyState === WebSocket.OPEN) {
      session.socket.send(command);
      session.lastActivity = new Date();
    } else {
      throw new Error(`Session ${sessionId} is not connected`);
    }
  }

  public closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (session.socket && session.socket.readyState === WebSocket.OPEN) {
        session.socket.close();
      }
      this.sessions.delete(sessionId);
      this.logger.info(`Terminal session ${sessionId} closed`);
    }
  }

  private handleWebSocketConnection(ws: WebSocket): void {
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
      } catch (error) {
        this.logger.error("Error handling WebSocket message:", error);
        ws.send(
          JSON.stringify({
            type: "error",
            message: error.message,
          }),
        );
      }
    });

    ws.on("close", () => {
      this.logger.info("WebSocket connection closed");
    });
  }

  private handleConnectRequest(ws: WebSocket, message: any): void {
    try {
      const { containerId, userId } = message.data;
      const sessionId = this.createSession(containerId, userId);

      // Create WebSocket connection to terminal
      const terminalWs = new WebSocket(`ws://localhost:0`);

      terminalWs.on("open", () => {
        this.connectToContainer(sessionId, terminalWs)
          .then(() => {
            ws.send(
              JSON.stringify({
                type: "connected",
                data: { sessionId },
              }),
            );
          })
          .catch((error) => {
            this.logger.error("Failed to connect to terminal:", error);
            ws.send(
              JSON.stringify({
                type: "error",
                message: error.message,
              }),
            );
          });
      });

      terminalWs.on("error", (error) => {
        this.logger.error("Terminal WebSocket error:", error);
        ws.send(
          JSON.stringify({
            type: "error",
            message: error.message,
          }),
        );
      });

      terminalWs.on("close", () => {
        this.sessions.delete(sessionId);
      });
    } catch (error) {
      this.logger.error("Error handling connect request:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: error.message,
        }),
      );
    }
  }

  private handleCommandRequest(ws: WebSocket, message: any): void {
    try {
      const { sessionId, command } = message.data;

      this.sendCommand(sessionId, command)
        .then(() => {
          ws.send(
            JSON.stringify({
              type: "command_sent",
              data: { sessionId },
            }),
          );
        })
        .catch((error) => {
          ws.send(
            JSON.stringify({
              type: "error",
              message: error.message,
            }),
          );
        });
    } catch (error) {
      this.logger.error("Error handling command request:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: error.message,
        }),
      );
    }
  }

  private handleResizeRequest(ws: WebSocket, message: any): void {
    try {
      const { sessionId, cols, rows } = message.data;

      // Send resize command to terminal
      this.sendCommand(sessionId, `\x1b[8;${rows};${cols}t`)
        .then(() => {
          ws.send(
            JSON.stringify({
              type: "resized",
              data: { sessionId },
            }),
          );
        })
        .catch((error) => {
          ws.send(
            JSON.stringify({
              type: "error",
              message: error.message,
            }),
          );
        });
    } catch (error) {
      this.logger.error("Error handling resize request:", error);
      ws.send(
        JSON.stringify({
          type: "error",
          message: error.message,
        }),
      );
    }
  }

  private cleanupOldSessions(): void {
    const now = new Date();
    const timeout = this.config.terminalTimeout;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now.getTime() - session.lastActivity.getTime() > timeout) {
        this.closeSession(sessionId);
      }
    }
  }

  public getSessionsSummary() {
    return {
      total: this.sessions.size,
      active: Array.from(this.sessions.values()).filter(
        (session) =>
          session.socket && session.socket.readyState === WebSocket.OPEN,
      ).length,
      maxSessions: this.config.maxTerminalSessions,
      timeout: this.config.terminalTimeout,
    };
  }
}

export default TerminalService;
