import * as si from "systeminformation";
import { SystemMetrics, ContainerMetrics, AppConfig } from "../types";
import { Logger } from "../utils/logger";

export class MetricsCollector {
  private config: AppConfig;
  private logger: Logger;
  private intervalId: NodeJS.Timeout | null = null;
  private metricsHistory: Map<string, ContainerMetrics[]> = new Map();
  private systemMetricsHistory: SystemMetrics[] = [];
  private redisClient: any = null;
  private _isRedisConnected: boolean = false;
  private startTime: number;
  private alertThresholds: Map<string, number> = new Map();
  private performanceBaseline: SystemMetrics | null = null;
  private anomalyDetection: boolean = true;
  private metricsBuffer: SystemMetrics[] = [];
  private bufferSize: number = 100;

  constructor(config: AppConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.startTime = Date.now();
    this.initializeRedis();
    this.initializeAlertThresholds();
  }

  private initializeAlertThresholds(): void {
    this.alertThresholds.set("cpu", 80);
    this.alertThresholds.set("memory", 85);
    this.alertThresholds.set("disk", 90);
    this.alertThresholds.set("network", 1000000); // 1MB/s
  }

  public setAlertThreshold(metric: string, threshold: number): void {
    this.alertThresholds.set(metric, threshold);
    this.logger.info(`Alert threshold set for ${metric}: ${threshold}%`);
  }

  public enableAnomalyDetection(enabled: boolean): void {
    this.anomalyDetection = enabled;
    this.logger.info(`Anomaly detection ${enabled ? "enabled" : "disabled"}`);
  }

  private detectAnomalies(current: SystemMetrics): boolean {
    if (!this.anomalyDetection || !this.performanceBaseline) {
      return false;
    }

    const cpuAnomaly =
      Math.abs(current.cpuPercent - this.performanceBaseline.cpuPercent) > 30;
    const memoryAnomaly =
      Math.abs(current.memoryPercent - this.performanceBaseline.memoryPercent) >
      25;
    const diskAnomaly =
      Math.abs(current.diskUsage - this.performanceBaseline.diskUsage) > 20;

    return cpuAnomaly || memoryAnomaly || diskAnomaly;
  }

  private checkAlerts(metrics: SystemMetrics): string[] {
    const alerts: string[] = [];

    if (metrics.cpuPercent > this.alertThresholds.get("cpu")!) {
      alerts.push(`High CPU usage: ${metrics.cpuPercent.toFixed(1)}%`);
    }

    if (metrics.memoryPercent > this.alertThresholds.get("memory")!) {
      alerts.push(`High memory usage: ${metrics.memoryPercent.toFixed(1)}%`);
    }

    if (metrics.diskUsage > this.alertThresholds.get("disk")!) {
      alerts.push(`High disk usage: ${metrics.diskUsage.toFixed(1)}%`);
    }

    return alerts;
  }

  public setPerformanceBaseline(): void {
    if (this.systemMetricsHistory.length > 0) {
      const recent = this.systemMetricsHistory.slice(-10);
      this.performanceBaseline = {
        cpuPercent:
          recent.reduce((sum, m) => sum + m.cpuPercent, 0) / recent.length,
        memoryPercent:
          recent.reduce((sum, m) => sum + m.memoryPercent, 0) / recent.length,
        diskUsage:
          recent.reduce((sum, m) => sum + m.diskUsage, 0) / recent.length,
        networkIO: recent[0].networkIO,
        loadAverage: recent[0].loadAverage,
        timestamp: new Date().toISOString(),
        uptime: recent[0].uptime,
      };
      this.logger.info("Performance baseline established");
    }
  }

  private async initializeRedis(): Promise<void> {
    try {
      const Redis = require("redis");
      this.redisClient = Redis.createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port,
          db: this.config.redis.db,
          password: this.config.redis.password,
        },
      });

      await this.redisClient.connect();
      this._isRedisConnected = true;
      this.logger.info("Metrics collector initialized successfully");
    } catch (error) {
      this._isRedisConnected = false;
      this.logger.warn("Redis not available, using in-memory storage:", error);
    }
  }

  public start(): void {
    this.logger.info("Starting metrics collection");
    this.intervalId = setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.metricsInterval);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.logger.info("Metrics collection stopped");
  }

  public isRedisConnected(): boolean {
    return this._isRedisConnected;
  }

  public async collectSystemMetrics(): Promise<SystemMetrics> {
    try {
      const [cpu, mem, disk, network, loadAvg] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.osInfo(),
      ]);

      const diskData = disk as any;
      const networkData = network as any;
      const loadAvgData = loadAvg as any;

      const metrics: SystemMetrics = {
        timestamp: new Date().toISOString(),
        cpuPercent: Math.round(cpu.currentLoad * 100) / 100,
        memoryPercent: Math.round((mem.used / mem.total) * 100) / 100,
        diskUsage:
          diskData && diskData.length > 0
            ? Math.round((diskData[0].used / diskData[0].size) * 100) / 100
            : 0,
        networkIO: {
          bytesRecv:
            networkData && networkData.length > 0
              ? networkData[0].rx_sec || 0
              : 0,
          bytesSent:
            networkData && networkData.length > 0
              ? networkData[0].tx_sec || 0
              : 0,
          dropin:
            networkData && networkData.length > 0
              ? networkData[0].rx_dropped || 0
              : 0,
          dropout:
            networkData && networkData.length > 0
              ? networkData[0].tx_dropped || 0
              : 0,
          errin:
            networkData && networkData.length > 0
              ? networkData[0].rx_errs || 0
              : 0,
          errout:
            networkData && networkData.length > 0
              ? networkData[0].tx_errs || 0
              : 0,
          packetsRecv:
            networkData && networkData.length > 0
              ? networkData[0].rx_packets || 0
              : 0,
          packetsSent:
            networkData && networkData.length > 0
              ? networkData[0].tx_packets || 0
              : 0,
        },
        loadAverage:
          loadAvgData && loadAvgData.length > 0
            ? loadAvgData[0].loadavg || [0, 0, 0]
            : [0, 0, 0],
        uptime: Date.now() - (this.startTime || Date.now()),
      };

      // Store metrics
      await this.storeSystemMetrics(metrics);

      return metrics;
    } catch (error) {
      this.logger.error("Error collecting system metrics:", error);
      throw error;
    }
  }

  public async collectContainerMetrics(
    containerId: string,
  ): Promise<ContainerMetrics> {
    try {
      // This would typically use Docker API
      // For now, return mock data
      const metrics: ContainerMetrics = {
        timestamp: new Date().toISOString(),
        cpuPercent: Math.random() * 80,
        memoryPercent: Math.random() * 80,
        memoryUsage: Math.floor(Math.random() * 1024 * 1024 * 1024), // Random up to 1GB
        memoryLimit: 1024 * 1024 * 1024, // 1GB
        networkRx: Math.floor(Math.random() * 1024 * 1024),
        networkTx: Math.floor(Math.random() * 1024 * 1024),
        blockRead: Math.floor(Math.random() * 1024 * 1024),
        blockWrite: Math.floor(Math.random() * 1024 * 1024),
      };

      // Store metrics
      await this.storeContainerMetrics(containerId, metrics);

      return metrics;
    } catch (error) {
      this.logger.error(
        `Error collecting metrics for container ${containerId}:`,
        error,
      );
      throw error;
    }
  }

  public async getSystemMetricsHistory(
    limit: number = 100,
  ): Promise<SystemMetrics[]> {
    if (this.isRedisConnected) {
      try {
        const keys = await this.redisClient.lRange(
          `${this.config.redis.keyPrefix}system:metrics`,
          0,
          limit - 1,
        );
        const metrics = await Promise.all(
          keys.map((key) => this.redisClient.get(key)),
        );
        return metrics.filter((m) => m).map((m) => JSON.parse(m));
      } catch (error) {
        this.logger.error("Error fetching system metrics from Redis:", error);
      }
    }

    return this.systemMetricsHistory.slice(-limit);
  }

  public async getContainerMetricsHistory(
    containerId: string,
    limit: number = 100,
  ): Promise<ContainerMetrics[]> {
    if (this.isRedisConnected) {
      try {
        const key = `${this.config.redis.keyPrefix}container:${containerId}`;
        const keys = await this.redisClient.lRange(key, 0, limit - 1);
        const metrics = await Promise.all(
          keys.map((key) => this.redisClient.get(key)),
        );
        return metrics.filter((m) => m).map((m) => JSON.parse(m));
      } catch (error) {
        this.logger.error(
          `Error fetching container metrics from Redis: ${error}`,
        );
      }
    }

    return this.metricsHistory.get(containerId) || [];
  }

  private async storeSystemMetrics(metrics: SystemMetrics): Promise<void> {
    try {
      // Store in Redis
      if (this.isRedisConnected) {
        const key = `${this.config.redis.keyPrefix}system:metrics`;
        await this.redisClient.lPush(key, JSON.stringify(metrics));
        await this.redisClient.lTrim(key, 0, this.config.metricsRetention - 1);
        await this.redisClient.expire(key, this.config.metricsRetention * 3600); // Convert hours to seconds
      }

      // Store in memory
      this.systemMetricsHistory.push(metrics);
      if (this.systemMetricsHistory.length > this.config.metricsRetention) {
        this.systemMetricsHistory.shift();
      }
    } catch (error) {
      this.logger.error("Error storing system metrics:", error);
    }
  }

  private async storeContainerMetrics(
    containerId: string,
    metrics: ContainerMetrics,
  ): Promise<void> {
    try {
      // Store in Redis
      if (this.isRedisConnected) {
        const key = `${this.config.redis.keyPrefix}container:${containerId}`;
        await this.redisClient.lPush(key, JSON.stringify(metrics));
        await this.redisClient.lTrim(key, 0, this.config.metricsRetention - 1);
        await this.redisClient.expire(key, this.config.metricsRetention * 3600);
      }

      // Store in memory
      if (!this.metricsHistory.has(containerId)) {
        this.metricsHistory.set(containerId, []);
      }
      const history = this.metricsHistory.get(containerId)!;
      history.push(metrics);
      if (history.length > this.config.metricsRetention) {
        history.shift();
      }
    } catch (error) {
      this.logger.error(
        `Error storing container metrics for ${containerId}:`,
        error,
      );
    }
  }

  // Get metrics history
  getMetricsHistory(limit?: number): SystemMetrics[] {
    const history = this.systemMetricsHistory;
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  // Clear metrics history
  clearMetricsHistory(): void {
    this.systemMetricsHistory = [];
  }

  // Get latest metrics
  getLatestMetrics(): SystemMetrics | null {
    return (
      this.systemMetricsHistory[this.systemMetricsHistory.length - 1] || null
    );
  }

  // Get metrics by time range
  getMetricsByTimeRange(startTime: Date, endTime: Date): SystemMetrics[] {
    return this.systemMetricsHistory.filter(
      (metric) =>
        new Date(metric.timestamp) >= startTime &&
        new Date(metric.timestamp) <= endTime,
    );
  }

  // Get average metrics
  getAverageMetrics(count: number = 10): Partial<SystemMetrics> {
    const recentMetrics = this.systemMetricsHistory.slice(-count);
    if (recentMetrics.length === 0) return {};

    const avgCpu =
      recentMetrics.reduce((sum, m) => sum + m.cpuPercent, 0) /
      recentMetrics.length;
    const avgMemory =
      recentMetrics.reduce((sum, m) => sum + m.memoryPercent, 0) /
      recentMetrics.length;
    const avgDisk =
      recentMetrics.reduce((sum, m) => sum + (m.diskUsage || 0), 0) /
      recentMetrics.length;
    const avgNetworkIn =
      recentMetrics.reduce((sum, m) => sum + m.networkIO.bytesRecv, 0) /
      recentMetrics.length;
    const avgNetworkOut =
      recentMetrics.reduce((sum, m) => sum + m.networkIO.bytesSent, 0) /
      recentMetrics.length;

    return {
      cpuPercent: Math.round(avgCpu * 100) / 100,
      memoryPercent: Math.round(avgMemory * 100) / 100,
      diskUsage: Math.round(avgDisk * 100) / 100,
      networkIO: {
        bytesRecv: Math.round(avgNetworkIn),
        bytesSent: Math.round(avgNetworkOut),
        dropin: 0,
        dropout: 0,
        errin: 0,
        errout: 0,
        packetsRecv: 0,
        packetsSent: 0,
      },
      loadAverage: [0, 0, 0],
      timestamp: new Date().toISOString(),
      uptime: Date.now() - (this.startTime || Date.now()),
    };
  }

  public async cleanupOldMetrics(): Promise<void> {
    try {
      if (this.isRedisConnected) {
        // Clean up old metrics based on retention policy
        const pattern = `${this.config.redis.keyPrefix}*`;
        const keys = await this.redisClient.keys(pattern);

        for (const key of keys) {
          const ttl = await this.redisClient.ttl(key);
          if (ttl === -1) {
            // No expiry set, set one
            await this.redisClient.expire(
              key,
              this.config.metricsRetention * 3600,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error("Error cleaning up old metrics:", error);
    }
  }

  public getMetricsSummary(): {
    systemMetricsCount: number;
    containerMetricsCount: number;
    redisConnected: boolean;
    collectionInterval: number;
    retentionHours: number;
  } {
    return {
      systemMetricsCount: this.systemMetricsHistory.length,
      containerMetricsCount: this.metricsHistory.size,
      redisConnected: this.isRedisConnected(),
      collectionInterval: this.config.metricsInterval,
      retentionHours: this.config.metricsRetention,
    };
  }
}

export default MetricsCollector;
