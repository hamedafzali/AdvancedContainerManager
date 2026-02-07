import { WebSocket } from "ws";
import { AppConfig, TerminalSession } from "../types";
import { Logger } from "../utils/logger";
export declare class TerminalService {
    private config;
    private logger;
    private sessions;
    private wsServer;
    private _isRunning;
    constructor(config: AppConfig, logger: Logger);
    start(): void;
    stop(): void;
    isRunning(): boolean;
    createSession(containerId: string, userId?: string): string;
    connectToContainer(sessionId: string, socket: WebSocket): Promise<void>;
    getSession(sessionId: string): TerminalSession | undefined;
    getSessions(): TerminalSession[];
    getSessionByContainer(containerId: string): TerminalSession[];
    sendCommand(sessionId: string, command: string): Promise<void>;
    closeSession(sessionId: string): void;
    private handleWebSocketConnection;
    private handleConnectRequest;
    private handleCommandRequest;
    private handleResizeRequest;
    private cleanupOldSessions;
    getSessionsSummary(): {
        total: number;
        active: number;
        maxSessions: number;
        timeout: number;
    };
}
export default TerminalService;
//# sourceMappingURL=terminal-service.d.ts.map