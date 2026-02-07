"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsCollector = void 0;
const si = __importStar(require("systeminformation"));
class MetricsCollector {
    constructor(config, logger) {
        this.intervalId = null;
        this.metricsHistory = new Map();
        this.systemMetricsHistory = [];
        this.redisClient = null;
        this._isRedisConnected = false;
        this.alertThresholds = new Map();
        this.performanceBaseline = null;
        this.anomalyDetection = true;
        this.metricsBuffer = [];
        this.bufferSize = 100;
        this.config = config;
        this.logger = logger;
        this.startTime = Date.now();
        this.initializeRedis();
        this.initializeAlertThresholds();
    }
    initializeAlertThresholds() {
        this.alertThresholds.set("cpu", 80);
        this.alertThresholds.set("memory", 85);
        this.alertThresholds.set("disk", 90);
        this.alertThresholds.set("network", 1000000); // 1MB/s
    }
    setAlertThreshold(metric, threshold) {
        this.alertThresholds.set(metric, threshold);
        this.logger.info(`Alert threshold set for ${metric}: ${threshold}%`);
    }
    enableAnomalyDetection(enabled) {
        this.anomalyDetection = enabled;
        this.logger.info(`Anomaly detection ${enabled ? "enabled" : "disabled"}`);
    }
    detectAnomalies(current) {
        if (!this.anomalyDetection || !this.performanceBaseline) {
            return false;
        }
        const cpuAnomaly = Math.abs(current.cpuPercent - this.performanceBaseline.cpuPercent) > 30;
        const memoryAnomaly = Math.abs(current.memoryPercent - this.performanceBaseline.memoryPercent) >
            25;
        const diskAnomaly = Math.abs(current.diskUsage - this.performanceBaseline.diskUsage) > 20;
        return cpuAnomaly || memoryAnomaly || diskAnomaly;
    }
    checkAlerts(metrics) {
        const alerts = [];
        if (metrics.cpuPercent > this.alertThresholds.get("cpu")) {
            alerts.push(`High CPU usage: ${metrics.cpuPercent.toFixed(1)}%`);
        }
        if (metrics.memoryPercent > this.alertThresholds.get("memory")) {
            alerts.push(`High memory usage: ${metrics.memoryPercent.toFixed(1)}%`);
        }
        if (metrics.diskUsage > this.alertThresholds.get("disk")) {
            alerts.push(`High disk usage: ${metrics.diskUsage.toFixed(1)}%`);
        }
        return alerts;
    }
    setPerformanceBaseline() {
        if (this.systemMetricsHistory.length > 0) {
            const recent = this.systemMetricsHistory.slice(-10);
            this.performanceBaseline = {
                cpuPercent: recent.reduce((sum, m) => sum + m.cpuPercent, 0) / recent.length,
                memoryPercent: recent.reduce((sum, m) => sum + m.memoryPercent, 0) / recent.length,
                diskUsage: recent.reduce((sum, m) => sum + m.diskUsage, 0) / recent.length,
                networkIO: recent[0].networkIO,
                loadAverage: recent[0].loadAverage,
                timestamp: new Date().toISOString(),
                uptime: recent[0].uptime,
            };
            this.logger.info("Performance baseline established");
        }
    }
    async initializeRedis() {
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
        }
        catch (error) {
            this._isRedisConnected = false;
            this.logger.warn("Redis not available, using in-memory storage:", error);
        }
    }
    start() {
        this.logger.info("Starting metrics collection");
        this.intervalId = setInterval(() => {
            this.collectSystemMetrics();
        }, this.config.metricsInterval);
    }
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.logger.info("Metrics collection stopped");
    }
    isRedisConnected() {
        return this._isRedisConnected;
    }
    async collectSystemMetrics() {
        try {
            const [cpu, mem, disk, network, loadAvg] = await Promise.all([
                si.currentLoad(),
                si.mem(),
                si.fsSize(),
                si.networkStats(),
                si.osInfo(),
            ]);
            const diskData = disk;
            const networkData = network;
            const loadAvgData = loadAvg;
            const metrics = {
                timestamp: new Date().toISOString(),
                cpuPercent: Math.round(cpu.currentLoad * 100) / 100,
                memoryPercent: Math.round((mem.used / mem.total) * 100) / 100,
                diskUsage: diskData && diskData.length > 0
                    ? Math.round((diskData[0].used / diskData[0].size) * 100) / 100
                    : 0,
                networkIO: {
                    bytesRecv: networkData && networkData.length > 0
                        ? networkData[0].rx_sec || 0
                        : 0,
                    bytesSent: networkData && networkData.length > 0
                        ? networkData[0].tx_sec || 0
                        : 0,
                    dropin: networkData && networkData.length > 0
                        ? networkData[0].rx_dropped || 0
                        : 0,
                    dropout: networkData && networkData.length > 0
                        ? networkData[0].tx_dropped || 0
                        : 0,
                    errin: networkData && networkData.length > 0
                        ? networkData[0].rx_errs || 0
                        : 0,
                    errout: networkData && networkData.length > 0
                        ? networkData[0].tx_errs || 0
                        : 0,
                    packetsRecv: networkData && networkData.length > 0
                        ? networkData[0].rx_packets || 0
                        : 0,
                    packetsSent: networkData && networkData.length > 0
                        ? networkData[0].tx_packets || 0
                        : 0,
                },
                loadAverage: loadAvgData && loadAvgData.length > 0
                    ? loadAvgData[0].loadavg || [0, 0, 0]
                    : [0, 0, 0],
                uptime: Date.now() - (this.startTime || Date.now()),
            };
            // Store metrics
            await this.storeSystemMetrics(metrics);
            return metrics;
        }
        catch (error) {
            this.logger.error("Error collecting system metrics:", error);
            throw error;
        }
    }
    async collectContainerMetrics(containerId) {
        try {
            // This would typically use Docker API
            // For now, return mock data
            const metrics = {
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
        }
        catch (error) {
            this.logger.error(`Error collecting metrics for container ${containerId}:`, error);
            throw error;
        }
    }
    async getSystemMetricsHistory(limit = 100) {
        if (this.isRedisConnected) {
            try {
                const keys = await this.redisClient.lRange(`${this.config.redis.keyPrefix}system:metrics`, 0, limit - 1);
                const metrics = await Promise.all(keys.map((key) => this.redisClient.get(key)));
                return metrics.filter((m) => m).map((m) => JSON.parse(m));
            }
            catch (error) {
                this.logger.error("Error fetching system metrics from Redis:", error);
            }
        }
        return this.systemMetricsHistory.slice(-limit);
    }
    async getContainerMetricsHistory(containerId, limit = 100) {
        if (this.isRedisConnected) {
            try {
                const key = `${this.config.redis.keyPrefix}container:${containerId}`;
                const keys = await this.redisClient.lRange(key, 0, limit - 1);
                const metrics = await Promise.all(keys.map((key) => this.redisClient.get(key)));
                return metrics.filter((m) => m).map((m) => JSON.parse(m));
            }
            catch (error) {
                this.logger.error(`Error fetching container metrics from Redis: ${error}`);
            }
        }
        return this.metricsHistory.get(containerId) || [];
    }
    async storeSystemMetrics(metrics) {
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
        }
        catch (error) {
            this.logger.error("Error storing system metrics:", error);
        }
    }
    async storeContainerMetrics(containerId, metrics) {
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
            const history = this.metricsHistory.get(containerId);
            history.push(metrics);
            if (history.length > this.config.metricsRetention) {
                history.shift();
            }
        }
        catch (error) {
            this.logger.error(`Error storing container metrics for ${containerId}:`, error);
        }
    }
    // Get metrics history
    getMetricsHistory(limit) {
        const history = this.systemMetricsHistory;
        if (limit) {
            return history.slice(-limit);
        }
        return history;
    }
    // Clear metrics history
    clearMetricsHistory() {
        this.systemMetricsHistory = [];
    }
    // Get latest metrics
    getLatestMetrics() {
        return (this.systemMetricsHistory[this.systemMetricsHistory.length - 1] || null);
    }
    // Get metrics by time range
    getMetricsByTimeRange(startTime, endTime) {
        return this.systemMetricsHistory.filter((metric) => new Date(metric.timestamp) >= startTime &&
            new Date(metric.timestamp) <= endTime);
    }
    // Get average metrics
    getAverageMetrics(count = 10) {
        const recentMetrics = this.systemMetricsHistory.slice(-count);
        if (recentMetrics.length === 0)
            return {};
        const avgCpu = recentMetrics.reduce((sum, m) => sum + m.cpuPercent, 0) /
            recentMetrics.length;
        const avgMemory = recentMetrics.reduce((sum, m) => sum + m.memoryPercent, 0) /
            recentMetrics.length;
        const avgDisk = recentMetrics.reduce((sum, m) => sum + (m.diskUsage || 0), 0) /
            recentMetrics.length;
        const avgNetworkIn = recentMetrics.reduce((sum, m) => sum + m.networkIO.bytesRecv, 0) /
            recentMetrics.length;
        const avgNetworkOut = recentMetrics.reduce((sum, m) => sum + m.networkIO.bytesSent, 0) /
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
    async cleanupOldMetrics() {
        try {
            if (this.isRedisConnected) {
                // Clean up old metrics based on retention policy
                const pattern = `${this.config.redis.keyPrefix}*`;
                const keys = await this.redisClient.keys(pattern);
                for (const key of keys) {
                    const ttl = await this.redisClient.ttl(key);
                    if (ttl === -1) {
                        // No expiry set, set one
                        await this.redisClient.expire(key, this.config.metricsRetention * 3600);
                    }
                }
            }
        }
        catch (error) {
            this.logger.error("Error cleaning up old metrics:", error);
        }
    }
    getMetricsSummary() {
        return {
            systemMetricsCount: this.systemMetricsHistory.length,
            containerMetricsCount: this.metricsHistory.size,
            redisConnected: this.isRedisConnected(),
            collectionInterval: this.config.metricsInterval,
            retentionHours: this.config.metricsRetention,
        };
    }
}
exports.MetricsCollector = MetricsCollector;
exports.default = MetricsCollector;
