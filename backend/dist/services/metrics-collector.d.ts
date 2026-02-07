import { SystemMetrics, ContainerMetrics, AppConfig } from "../types";
import { Logger } from "../utils/logger";
export declare class MetricsCollector {
    private config;
    private logger;
    private intervalId;
    private metricsHistory;
    private systemMetricsHistory;
    private redisClient;
    private isRedisConnected;
    constructor(config: AppConfig, logger: Logger);
    private initializeRedis;
    start(): void;
    stop(): void;
    isRedisConnected(): boolean;
    collectSystemMetrics(): Promise<SystemMetrics>;
    collectContainerMetrics(containerId: string): Promise<ContainerMetrics>;
    getSystemMetricsHistory(limit?: number): Promise<SystemMetrics[]>;
    getContainerMetricsHistory(containerId: string, limit?: number): Promise<ContainerMetrics[]>;
    private storeSystemMetrics;
    private storeContainerMetrics;
    cleanupOldMetrics(): Promise<void>;
    getMetricsSummary(): {
        systemMetricsCount: number;
        containerMetricsCount: number;
        redisConnected: boolean;
        collectionInterval: number;
        retentionHours: number;
    };
}
export default MetricsCollector;
//# sourceMappingURL=metrics-collector.d.ts.map