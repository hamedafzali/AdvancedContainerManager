import * as si from 'systeminformation';
import { SystemMetrics, ContainerMetrics, AppConfig } from '../types';
import { Logger } from '../utils/logger';

export class MetricsCollector {
  private config: AppConfig;
  private logger: Logger;
  private intervalId: NodeJS.Timeout | null = null;
  private metricsHistory: Map<string, ContainerMetrics[]> = new Map();
  private systemMetricsHistory: SystemMetrics[] = [];
  private redisClient: any = null;
  private isRedisConnected: boolean = false;

  constructor(config: AppConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    try {
      const Redis = require('redis');
      this.redisClient = Redis.createClient({
        socket: {
          host: this.config.redis.host,
          port: this.config.redis.port,
          db: this.config.redis.db,
          password: this.config.redis.password
        }
      });

      await this.redisClient.connect();
      this.isRedisConnected = true;
      this.logger.info('Redis connected successfully');
    } catch (error) {
      this.logger.warn('Redis not available, using in-memory storage:', error);
      this.isRedisConnected = false;
    }
  }

  public start(): void {
    this.logger.info('Starting metrics collection');
    this.intervalId = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsInterval);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.logger.info('Metrics collection stopped');
  }

  public isRedisConnected(): boolean {
    return this.isRedisConnected;
  }

  public async collectSystemMetrics(): Promise<SystemMetrics> {
    try {
      const [cpu, mem, disk, network, loadAvg] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.osInfo()
      ]);

      const metrics: SystemMetrics = {
        timestamp: new Date().toISOString(),
        cpuPercent: Math.round(cpu.currentLoad * 100) / 100,
        memoryPercent: Math.round((mem.used / mem.total) * 100) / 100,
        diskUsage: Math.round((disk.used / disk.size) * 100) / 100,
        networkIO: {
          bytesRecv: network.rx_sec,
          bytesSent: network.tx_sec,
          dropin: network.rx_dropped,
          dropout: network.tx_dropped,
          errin: network.rx_errs,
          errout: network.tx_errs,
          packetsRecv: network.rx_packets,
          packetsSent: network.tx_packets
        },
        loadAverage: loadAvg.loadavg || [0, 0, 0]
      };

      // Store metrics
      await this.storeSystemMetrics(metrics);
      
      return metrics;
    } catch (error) {
      this.logger.error('Error collecting system metrics:', error);
      throw error;
    }
  }

  public async collectContainerMetrics(containerId: string): Promise<ContainerMetrics> {
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
        blockWrite: Math.floor(Math.random() * 1024 * 1024)
      };

      // Store metrics
      await this.storeContainerMetrics(containerId, metrics);
      
      return metrics;
    } catch (error) {
      this.logger.error(`Error collecting metrics for container ${containerId}:`, error);
      throw error;
    }
  }

  public async getSystemMetricsHistory(limit: number = 100): Promise<SystemMetrics[]> {
    if (this.isRedisConnected) {
      try {
        const keys = await this.redisClient.lRange(`${this.config.redis.keyPrefix}system:metrics`, 0, limit - 1);
        const metrics = await Promise.all(keys.map(key => this.redisClient.get(key)));
        return metrics.filter(m => m).map(m => JSON.parse(m));
      } catch (error) {
        this.logger.error('Error fetching system metrics from Redis:', error);
      }
    }
    
    return this.systemMetricsHistory.slice(-limit);
  }

  public async getContainerMetricsHistory(containerId: string, limit: number = 100): Promise<ContainerMetrics[]> {
    if (this.isRedisConnected) {
      try {
        const key = `${this.config.redis.keyPrefix}container:${containerId}`;
        const keys = await this.redisClient.lRange(key, 0, limit - 1);
        const metrics = await Promise.all(keys.map(key => this.redisClient.get(key)));
        return metrics.filter(m => m).map(m => JSON.parse(m));
      } catch (error) {
        this.logger.error(`Error fetching container metrics from Redis: ${error}`);
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
      this.logger.error('Error storing system metrics:', error);
    }
  }

  private async storeContainerMetrics(containerId: string, metrics: ContainerMetrics): Promise<void> {
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
      this.logger.error(`Error storing container metrics for ${containerId}:`, error);
    }
  }

  public async cleanupOldMetrics(): Promise<void> {
    try {
      if (this.isRedisConnected) {
        // Clean up old metrics based on retention policy
        const pattern = `${this.config.redis.keyPrefix}*`;
        const keys = await this.redisClient.keys(pattern);
        
        for (const key of keys) {
          const ttl = await this.redisClient.ttl(key);
          if (ttl === -1) { // No expiry set, set one
            await this.redisClient.expire(key, this.config.metricsRetention * 3600);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error cleaning up old metrics:', error);
    }
  }

  public getMetricsSummary(): {
    return {
      systemMetricsCount: this.systemMetricsHistory.length,
      containerMetricsCount: this.metricsHistory.size,
      redisConnected: this.isRedisConnected,
      collectionInterval: this.config.metricsInterval,
      retentionHours: this.config.metricsRetention
    };
  }
}

export default MetricsCollector;
