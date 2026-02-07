import { Server as SocketIOServer } from "socket.io";
import { MetricsCollector } from "./metrics-collector";
import { Logger } from "../utils/logger";
export declare class WebSocketHandler {
    private io;
    private metricsCollector;
    private logger;
    private connectedClients;
    constructor(io: SocketIOServer, metricsCollector: MetricsCollector, logger: Logger);
    private setupEventHandlers;
    private handleConnection;
    private handleDisconnection;
    private setupClientHandlers;
    private sendSystemStatus;
    broadcastSystemMetrics(metrics: any): void;
    broadcastContainerMetrics(containerId: string, metrics: any): void;
    broadcastSystemStatus(status: any): void;
    broadcastNotification(notification: {
        type: "info" | "warning" | "error" | "success";
        message: string;
        data?: any;
    }): void;
    getClientCount(): number;
    getConnectedClients(): string[];
}
export default WebSocketHandler;
//# sourceMappingURL=websocket-handler.d.ts.map