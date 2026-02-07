declare class AdvancedContainerManager {
    private app;
    private server;
    private io;
    private config;
    private logger;
    private metricsCollector;
    private dockerService;
    private projectService;
    private terminalService;
    private wsHandler;
    constructor();
    private loadConfig;
    private initializeServices;
    private setupMiddleware;
    private setupWebSocket;
    private setupErrorHandling;
    start(): Promise<void>;
    shutdown(): Promise<void>;
}
export default AdvancedContainerManager;
//# sourceMappingURL=index.d.ts.map