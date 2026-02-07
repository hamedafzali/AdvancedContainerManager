"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DockerService = void 0;
const dockerode_1 = __importDefault(require("dockerode"));
class DockerService {
    constructor(config, logger) {
        this._isConnected = false;
        this.containerCache = new Map();
        this.metricsCache = new Map();
        this.cacheTimeout = 30000; // 30 seconds
        this.performanceMode = true;
        this.batchOperations = true;
        this.config = config.docker;
        this.logger = logger;
        this.initializeDocker();
        this.startCacheCleanup();
    }
    startCacheCleanup() {
        setInterval(() => {
            this.cleanupCache();
        }, this.cacheTimeout);
    }
    cleanupCache() {
        const now = Date.now();
        for (const [key, value] of this.containerCache.entries()) {
            if (now - new Date(value.created || "").getTime() > this.cacheTimeout) {
                this.containerCache.delete(key);
            }
        }
        for (const [key, value] of this.metricsCache.entries()) {
            if (now - new Date(value.timestamp).getTime() > this.cacheTimeout) {
                this.metricsCache.delete(key);
            }
        }
    }
    setPerformanceMode(enabled) {
        this.performanceMode = enabled;
        this.logger.info(`Performance mode ${enabled ? "enabled" : "disabled"}`);
    }
    setBatchOperations(enabled) {
        this.batchOperations = enabled;
        this.logger.info(`Batch operations ${enabled ? "enabled" : "disabled"}`);
    }
    async getContainersWithCache() {
        if (this.performanceMode) {
            const cached = Array.from(this.containerCache.values());
            if (cached.length > 0) {
                return cached;
            }
        }
        const containers = await this.getAllContainers();
        containers.forEach((container) => {
            this.containerCache.set(container.id, container);
        });
        return containers;
    }
    async getContainerMetricsWithCache(containerId) {
        if (this.performanceMode) {
            const cached = this.metricsCache.get(containerId);
            if (cached &&
                Date.now() - new Date(cached.timestamp).getTime() < this.cacheTimeout) {
                return cached;
            }
        }
        const metrics = await this.getContainerStats(containerId);
        this.metricsCache.set(containerId, metrics);
        return metrics;
    }
    async batchContainerOperations(operations) {
        if (!this.batchOperations) {
            for (const op of operations) {
                await this.performContainerAction(op.id, op.action);
            }
            return;
        }
        const promises = operations.map((op) => this.performContainerAction(op.id, op.action));
        await Promise.allSettled(promises);
    }
    async performContainerAction(containerId, action) {
        const container = this.docker.getContainer(containerId);
        switch (action) {
            case "start":
                await container.start();
                break;
            case "stop":
                await container.stop();
                break;
            case "restart":
                await container.restart();
                break;
            case "pause":
                await container.pause();
                break;
            case "unpause":
                await container.unpause();
                break;
        }
    }
    async getAdvancedContainerStats(containerId) {
        const container = this.docker.getContainer(containerId);
        const stats = await container.stats({ stream: false });
        return {
            id: containerId,
            cpu: {
                usage: stats.cpu_stats.cpu_usage.total_usage,
                system: stats.cpu_stats.system_cpu_usage,
                percent: this.calculateCPUPercent(stats),
            },
            memory: {
                usage: stats.memory_stats.usage,
                limit: stats.memory_stats.limit,
                percent: (stats.memory_stats.usage / stats.memory_stats.limit) * 100,
            },
            network: {
                rx_bytes: stats.networks?.rx_bytes || 0,
                tx_bytes: stats.networks?.tx_bytes || 0,
                rx_packets: stats.networks?.rx_packets || 0,
                tx_packets: stats.networks?.tx_packets || 0,
            },
            block_io: {
                read: stats.blkio_stats?.io_service_bytes_recursive?.find((b) => b.op === "Read")?.value || 0,
                write: stats.blkio_stats?.io_service_bytes_recursive?.find((b) => b.op === "Write")?.value || 0,
            },
            pids: stats.pids_stats?.current || 0,
            timestamp: new Date().toISOString(),
        };
    }
    calculateCPUPercent(stats) {
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage -
            stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
        return Math.round(cpuPercent * 100) / 100;
    }
    initializeDocker() {
        try {
            const options = {};
            if (this.config.socketPath) {
                options.socketPath = this.config.socketPath;
            }
            else if (this.config.host && this.config.port) {
                options.host = this.config.host;
                options.port = this.config.port;
            }
            if (this.config.ca)
                options.ca = this.config.ca;
            if (this.config.cert)
                options.cert = this.config.cert;
            if (this.config.key)
                options.key = this.config.key;
            if (this.config.protocol)
                options.protocol = this.config.protocol;
            if (this.config.timeout)
                options.timeout = this.config.timeout;
            this.docker = new dockerode_1.default(options);
            this._isConnected = true;
            this.logger.info("Docker service initialized successfully");
        }
        catch (error) {
            this.logger.error("Failed to initialize Docker service:", error);
            this._isConnected = false;
        }
    }
    async testConnection() {
        try {
            await this.docker.ping();
            this._isConnected = true;
            this.logger.info("Docker connection test successful");
        }
        catch (error) {
            this._isConnected = false;
            this.logger.error("Docker connection test failed:", error);
            throw error;
        }
    }
    isConnected() {
        return this._isConnected;
    }
    // Container Management
    async getAllContainers() {
        try {
            const containers = await this.docker.listContainers({ all: true });
            return containers.map((container) => this.formatContainerInfo(container));
        }
        catch (error) {
            this.logger.error("Error fetching containers:", error);
            throw error;
        }
    }
    async getContainer(containerId) {
        try {
            const container = await this.docker.getContainer(containerId);
            const info = await container.inspect();
            return this.formatContainerInfo(info);
        }
        catch (error) {
            this.logger.error(`Error fetching container ${containerId}:`, error);
            throw error;
        }
    }
    async startContainer(containerId) {
        try {
            const container = await this.docker.getContainer(containerId);
            await container.start();
            this.logger.info(`Container ${containerId} started successfully`);
        }
        catch (error) {
            this.logger.error(`Error starting container ${containerId}:`, error);
            throw error;
        }
    }
    async stopContainer(containerId) {
        try {
            const container = await this.docker.getContainer(containerId);
            await container.stop();
            this.logger.info(`Container ${containerId} stopped successfully`);
        }
        catch (error) {
            this.logger.error(`Error stopping container ${containerId}:`, error);
            throw error;
        }
    }
    async restartContainer(containerId) {
        try {
            const container = await this.docker.getContainer(containerId);
            await container.restart();
            this.logger.info(`Container ${containerId} restarted successfully`);
        }
        catch (error) {
            this.logger.error(`Error restarting container ${containerId}:`, error);
            throw error;
        }
    }
    async removeContainer(containerId, force = false) {
        try {
            const container = await this.docker.getContainer(containerId);
            await container.remove({ force });
            this.logger.info(`Container ${containerId} removed successfully`);
        }
        catch (error) {
            this.logger.error(`Error removing container ${containerId}:`, error);
            throw error;
        }
    }
    async getContainerLogs(containerId, options = {}) {
        try {
            const container = await this.docker.getContainer(containerId);
            const logs = await container.logs({
                tail: options.tail || 100,
                since: options.since,
                until: options.until,
                timestamps: options.timestamps !== false,
                stdout: options.stdout !== false,
                stderr: options.stderr !== false,
            });
            return logs.toString();
        }
        catch (error) {
            this.logger.error(`Error fetching logs for container ${containerId}:`, error);
            throw error;
        }
    }
    async getContainerStats(containerId) {
        try {
            const container = await this.docker.getContainer(containerId);
            const stats = await container.stats({ stream: false });
            // Calculate CPU usage
            let cpuUsage = 0;
            if (stats.cpu_stats.cpu_usage.total_usage > 0) {
                const cpuDelta = stats.cpu_stats.cpu_usage.total_usage -
                    stats.precpu_stats.cpu_usage.total_usage;
                const systemDelta = stats.cpu_stats.system_cpu_usage -
                    stats.precpu_stats.system_cpu_usage;
                if (systemDelta > 0) {
                    cpuUsage =
                        (cpuDelta / systemDelta) *
                            stats.cpu_stats.cpu_usage.percpu_usage.length *
                            100;
                }
            }
            // Calculate memory usage
            let memoryUsage = 0;
            if (stats.memory_stats.limit > 0) {
                memoryUsage =
                    (stats.memory_stats.usage / stats.memory_stats.limit) * 100;
            }
            // Network I/O
            let networkRx = 0;
            let networkTx = 0;
            if (stats.networks) {
                for (const network of Object.values(stats.networks)) {
                    const netData = network;
                    networkRx += netData.rx_bytes || 0;
                    networkTx += netData.tx_bytes || 0;
                }
            }
            return {
                timestamp: new Date().toISOString(),
                cpuPercent: Math.round(cpuUsage * 100) / 100,
                memoryPercent: Math.round(memoryUsage * 100) / 100,
                memoryUsage: stats.memory_stats.usage,
                memoryLimit: stats.memory_stats.limit,
                networkRx,
                networkTx,
                blockRead: stats.blkio_stats.read_bytes || 0,
                blockWrite: stats.blkio_stats.write_bytes || 0,
            };
        }
        catch (error) {
            this.logger.error(`Error fetching stats for container ${containerId}:`, error);
            throw error;
        }
    }
    async getContainerProcesses(containerId) {
        try {
            const container = await this.docker.getContainer(containerId);
            const top = await container.top();
            const processes = [];
            if (top && top.Processes) {
                for (const process of top.Processes) {
                    processes.push({
                        pid: process.PID,
                        user: process.USER,
                        time: process.TIME,
                        command: process.COMMAND,
                        cpu: process.CPU,
                        memory: process.MEM,
                    });
                }
            }
            return processes;
        }
        catch (error) {
            this.logger.error(`Error fetching processes for container ${containerId}:`, error);
            throw error;
        }
    }
    // Image Management
    async getAllImages() {
        try {
            const images = await this.docker.listImages();
            return images.map((image) => this.formatImageInfo(image));
        }
        catch (error) {
            this.logger.error("Error fetching images:", error);
            throw error;
        }
    }
    async pullImage(imageName) {
        try {
            await this.docker.pull(imageName);
            this.logger.info(`Image ${imageName} pulled successfully`);
        }
        catch (error) {
            this.logger.error(`Error pulling image ${imageName}:`, error);
            throw error;
        }
    }
    async removeImage(imageId, force = false) {
        try {
            await this.docker.getImage(imageId).remove({ force });
            this.logger.info(`Image ${imageId} removed successfully`);
        }
        catch (error) {
            this.logger.error(`Error removing image ${imageId}:`, error);
            throw error;
        }
    }
    // Network Management
    async getAllNetworks() {
        try {
            const networks = await this.docker.listNetworks();
            return networks.map((network) => this.formatNetworkInfo(network));
        }
        catch (error) {
            this.logger.error("Error fetching networks:", error);
            throw error;
        }
    }
    async createNetwork(name, options = {}) {
        try {
            await this.docker.createNetwork({ Name: name, ...options });
            this.logger.info(`Network ${name} created successfully`);
        }
        catch (error) {
            this.logger.error(`Error creating network ${name}:`, error);
            throw error;
        }
    }
    async removeNetwork(networkId) {
        try {
            await this.docker.getNetwork(networkId).remove();
            this.logger.info(`Network ${networkId} removed successfully`);
        }
        catch (error) {
            this.logger.error(`Error removing network ${networkId}:`, error);
            throw error;
        }
    }
    // Volume Management
    async getAllVolumes() {
        try {
            const volumes = await this.docker.listVolumes();
            // Docker API returns {Volumes: [...], Warnings: [...]}
            const volumeList = volumes.Volumes || volumes;
            return Array.isArray(volumeList)
                ? volumeList.map((volume) => this.formatVolumeInfo(volume))
                : [];
        }
        catch (error) {
            this.logger.error("Error fetching volumes:", error);
            throw error;
        }
    }
    async createVolume(name, options = {}) {
        try {
            await this.docker.createVolume({ Name: name, ...options });
            this.logger.info(`Volume ${name} created successfully`);
        }
        catch (error) {
            this.logger.error(`Error creating volume ${name}:`, error);
            throw error;
        }
    }
    async removeVolume(volumeId, force = false) {
        try {
            await this.docker.getVolume(volumeId).remove({ force });
            this.logger.info(`Volume ${volumeId} removed successfully`);
        }
        catch (error) {
            this.logger.error(`Error removing volume ${volumeId}:`, error);
            throw error;
        }
    }
    // System Information
    async getSystemInfo() {
        try {
            return await this.docker.info();
        }
        catch (error) {
            this.logger.error("Error fetching system info:", error);
            throw error;
        }
    }
    async getVersion() {
        try {
            return await this.docker.version();
        }
        catch (error) {
            this.logger.error("Error fetching Docker version:", error);
            throw error;
        }
    }
    // Private helper methods
    formatContainerInfo(container) {
        return {
            id: container.Id.substring(0, 12),
            name: container.Names?.[0] || container.Name || "unknown",
            status: container.State?.Status || "unknown",
            image: container.Image || "unknown",
            created: container.Created || new Date().toISOString(),
            startedAt: container.State?.StartedAt || "",
            finishedAt: container.State?.FinishedAt || "",
            exitCode: container.State?.ExitCode || 0,
            ports: container.Ports || {},
            mountPoints: container.Mounts || [],
            networks: container.NetworkSettings?.Networks || {},
            labels: container.Labels || {},
            env: container.Env || [],
            cmd: container.Cmd || [],
            entrypoint: container.Entrypoint || [],
            workingDir: container.WorkingDir || "",
            restartPolicy: container.HostConfig?.RestartPolicy || {},
            resources: {
                memoryLimit: container.HostConfig?.Memory || 0,
                cpuShares: container.HostConfig?.CpuShares || 0,
                cpuQuota: container.HostConfig?.CpuQuota || 0,
                cpuPeriod: container.HostConfig?.CpuPeriod || 0,
            },
            health: container.State?.Health || {},
            logPath: container.LogPath || "",
            driver: container.Driver || "",
            execIds: [],
        };
    }
    formatImageInfo(image) {
        return {
            id: image.Id.substring(0, 12),
            tags: image.RepoTags || [],
            size: image.Size || 0,
            created: image.Created || "",
            labels: image.Labels || {},
        };
    }
    formatNetworkInfo(network) {
        return {
            id: network.Id.substring(0, 12),
            name: network.Name,
            driver: network.Driver,
            scope: network.Scope || "local",
            containers: Object.keys(network.Containers || {}).length,
            created: network.Created || "",
            internal: network.Internal || false,
            enableIPv6: network.EnableIPv6 || false,
            IPAM: network.IPAM || { Driver: "", Options: {}, Config: [] },
        };
    }
    formatVolumeInfo(volume) {
        return {
            name: volume.Name,
            driver: volume.Driver || "local",
            mountpoint: volume.Mountpoint || "",
            created: volume.CreatedAt || "",
            labels: volume.Labels || {},
            usage: volume.UsageData || { Size: 0, RefCount: 0 },
        };
    }
}
exports.DockerService = DockerService;
exports.default = DockerService;
