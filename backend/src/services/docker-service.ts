import Docker from "dockerode";
import {
  ContainerInfo,
  SystemMetrics,
  ContainerMetrics,
  DockerConnectionConfig,
  ImageInfo,
  NetworkInfo,
  VolumeInfo,
  ProcessInfo,
} from "../types";
import { AppConfig } from "../types";
import { Logger } from "../utils/logger";

export class DockerService {
  private docker: Docker;
  private config: DockerConnectionConfig;
  private logger: Logger;
  private _isConnected: boolean = false;
  private containerCache: Map<string, ContainerInfo> = new Map();
  private metricsCache: Map<string, ContainerMetrics> = new Map();
  private cacheTimeout: number = 30000; // 30 seconds
  private performanceMode: boolean = true;
  private batchOperations: boolean = true;

  constructor(config: AppConfig, logger: Logger) {
    this.config = config.docker;
    this.logger = logger;
    this.initializeDocker();
    this.startCacheCleanup();
  }

  private startCacheCleanup(): void {
    setInterval(() => {
      this.cleanupCache();
    }, this.cacheTimeout);
  }

  private cleanupCache(): void {
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

  public setPerformanceMode(enabled: boolean): void {
    this.performanceMode = enabled;
    this.logger.info(`Performance mode ${enabled ? "enabled" : "disabled"}`);
  }

  public setBatchOperations(enabled: boolean): void {
    this.batchOperations = enabled;
    this.logger.info(`Batch operations ${enabled ? "enabled" : "disabled"}`);
  }

  public async getContainersWithCache(): Promise<ContainerInfo[]> {
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

  public async getContainerMetricsWithCache(
    containerId: string,
  ): Promise<ContainerMetrics> {
    if (this.performanceMode) {
      const cached = this.metricsCache.get(containerId);
      if (
        cached &&
        Date.now() - new Date(cached.timestamp).getTime() < this.cacheTimeout
      ) {
        return cached;
      }
    }

    const metrics = await this.getContainerStats(containerId);
    this.metricsCache.set(containerId, metrics);
    return metrics;
  }

  public async batchContainerOperations(
    operations: Array<{ id: string; action: string }>,
  ): Promise<void> {
    if (!this.batchOperations) {
      for (const op of operations) {
        await this.performContainerAction(op.id, op.action);
      }
      return;
    }

    const promises = operations.map((op) =>
      this.performContainerAction(op.id, op.action),
    );
    await Promise.allSettled(promises);
  }

  private async performContainerAction(
    containerId: string,
    action: string,
  ): Promise<void> {
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

  public async getAdvancedContainerStats(containerId: string): Promise<any> {
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
        read:
          stats.blkio_stats?.io_service_bytes_recursive?.find(
            (b: any) => b.op === "Read",
          )?.value || 0,
        write:
          stats.blkio_stats?.io_service_bytes_recursive?.find(
            (b: any) => b.op === "Write",
          )?.value || 0,
      },
      pids: stats.pids_stats?.current || 0,
      timestamp: new Date().toISOString(),
    };
  }

  private calculateCPUPercent(stats: any): number {
    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage -
      stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta =
      stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuPercent =
      (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;
    return Math.round(cpuPercent * 100) / 100;
  }

  private initializeDocker(): void {
    try {
      const options: any = {};

      if (this.config.socketPath) {
        options.socketPath = this.config.socketPath;
      } else if (this.config.host && this.config.port) {
        options.host = this.config.host;
        options.port = this.config.port;
      }

      if (this.config.ca) options.ca = this.config.ca;
      if (this.config.cert) options.cert = this.config.cert;
      if (this.config.key) options.key = this.config.key;
      if (this.config.protocol) options.protocol = this.config.protocol;
      if (this.config.timeout) options.timeout = this.config.timeout;

      this.docker = new Docker(options);
      this._isConnected = true;
      this.logger.info("Docker service initialized successfully");
    } catch (error) {
      this.logger.error("Failed to initialize Docker service:", error);
      this._isConnected = false;
    }
  }

  async testConnection(): Promise<void> {
    try {
      await this.docker.ping();
      this._isConnected = true;
      this.logger.info("Docker connection test successful");
    } catch (error) {
      this._isConnected = false;
      this.logger.error("Docker connection test failed:", error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this._isConnected;
  }

  // Container Management
  async getAllContainers(): Promise<ContainerInfo[]> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      return (containers || [])
        .filter((container) => container && (container.Id || container.id))
        .map((container) => this.formatContainerInfo(container));
    } catch (error) {
      this.logger.error("Error fetching containers:", error);
      throw error;
    }
  }

  async getContainer(containerId: string): Promise<ContainerInfo> {
    try {
      const container = await this.docker.getContainer(containerId);
      const info = await container.inspect();
      return this.formatContainerInfo(info);
    } catch (error) {
      this.logger.error(`Error fetching container ${containerId}:`, error);
      throw error;
    }
  }

  async startContainer(containerId: string): Promise<void> {
    try {
      const container = await this.docker.getContainer(containerId);
      await container.start();
      this.logger.info(`Container ${containerId} started successfully`);
    } catch (error) {
      this.logger.error(`Error starting container ${containerId}:`, error);
      throw error;
    }
  }

  async stopContainer(containerId: string): Promise<void> {
    try {
      const container = await this.docker.getContainer(containerId);
      await container.stop();
      this.logger.info(`Container ${containerId} stopped successfully`);
    } catch (error) {
      this.logger.error(`Error stopping container ${containerId}:`, error);
      throw error;
    }
  }

  async restartContainer(containerId: string): Promise<void> {
    try {
      const container = await this.docker.getContainer(containerId);
      await container.restart();
      this.logger.info(`Container ${containerId} restarted successfully`);
    } catch (error) {
      this.logger.error(`Error restarting container ${containerId}:`, error);
      throw error;
    }
  }

  async removeContainer(
    containerId: string,
    force: boolean = false,
  ): Promise<void> {
    try {
      const container = await this.docker.getContainer(containerId);
      await container.remove({ force });
      this.logger.info(`Container ${containerId} removed successfully`);
    } catch (error) {
      this.logger.error(`Error removing container ${containerId}:`, error);
      throw error;
    }
  }

  async getContainerLogs(
    containerId: string,
    options: {
      tail?: number;
      since?: Date;
      until?: Date;
      timestamps?: boolean;
      stdout?: boolean;
      stderr?: boolean;
    } = {},
  ): Promise<string> {
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
    } catch (error) {
      this.logger.error(
        `Error fetching logs for container ${containerId}:`,
        error,
      );
      throw error;
    }
  }

  async getContainerStats(containerId: string): Promise<ContainerMetrics> {
    try {
      const container = await this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });

      // Calculate CPU usage
      let cpuUsage = 0;
      const cpuStats = stats.cpu_stats || {};
      const preCpuStats = stats.precpu_stats || {};
      const cpuUsageStats = cpuStats.cpu_usage || {};
      const preCpuUsageStats = preCpuStats.cpu_usage || {};
      const perCpu = cpuUsageStats.percpu_usage || [];
      const cpuCount = cpuStats.online_cpus || perCpu.length || 1;
      if (cpuUsageStats.total_usage > 0 && preCpuUsageStats.total_usage > 0) {
        const cpuDelta =
          cpuUsageStats.total_usage - preCpuUsageStats.total_usage;
        const systemDelta =
          (cpuStats.system_cpu_usage || 0) -
          (preCpuStats.system_cpu_usage || 0);
        if (systemDelta > 0) {
          cpuUsage =
            (cpuDelta / systemDelta) *
            cpuCount *
            100;
        }
      }

      // Calculate memory usage
      let memoryUsage = 0;
      if (stats.memory_stats && stats.memory_stats.limit > 0) {
        memoryUsage =
          (stats.memory_stats.usage / stats.memory_stats.limit) * 100;
      }

      // Network I/O
      let networkRx = 0;
      let networkTx = 0;
      if (stats.networks) {
        for (const network of Object.values(stats.networks)) {
          const netData = network as any;
          networkRx += netData.rx_bytes || 0;
          networkTx += netData.tx_bytes || 0;
        }
      }

      const blkio = stats.blkio_stats || {};
      const blkioEntries = blkio.io_service_bytes_recursive || [];
      const blockRead =
        blkioEntries.find((b: any) => b.op === "Read")?.value || 0;
      const blockWrite =
        blkioEntries.find((b: any) => b.op === "Write")?.value || 0;

      return {
        timestamp: new Date().toISOString(),
        cpuPercent: Math.round(cpuUsage * 100) / 100,
        memoryPercent: Math.round(memoryUsage * 100) / 100,
        memoryUsage: stats.memory_stats?.usage || 0,
        memoryLimit: stats.memory_stats?.limit || 0,
        networkRx,
        networkTx,
        blockRead,
        blockWrite,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching stats for container ${containerId}:`,
        error,
      );
      throw error;
    }
  }

  async getContainerProcesses(containerId: string): Promise<ProcessInfo[]> {
    try {
      const container = await this.docker.getContainer(containerId);
      const top = await container.top();

      const processes: ProcessInfo[] = [];
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
    } catch (error) {
      this.logger.error(
        `Error fetching processes for container ${containerId}:`,
        error,
      );
      throw error;
    }
  }

  // Image Management
  async getAllImages(): Promise<ImageInfo[]> {
    try {
      const images = await this.docker.listImages();
      return images.map((image) => this.formatImageInfo(image));
    } catch (error) {
      this.logger.error("Error fetching images:", error);
      throw error;
    }
  }

  async pullImage(imageName: string): Promise<void> {
    try {
      await this.docker.pull(imageName);
      this.logger.info(`Image ${imageName} pulled successfully`);
    } catch (error) {
      this.logger.error(`Error pulling image ${imageName}:`, error);
      throw error;
    }
  }

  async removeImage(imageId: string, force: boolean = false): Promise<void> {
    try {
      await this.docker.getImage(imageId).remove({ force });
      this.logger.info(`Image ${imageId} removed successfully`);
    } catch (error) {
      this.logger.error(`Error removing image ${imageId}:`, error);
      throw error;
    }
  }

  // Network Management
  async getAllNetworks(): Promise<NetworkInfo[]> {
    try {
      const networks = await this.docker.listNetworks();
      return networks.map((network) => this.formatNetworkInfo(network));
    } catch (error) {
      this.logger.error("Error fetching networks:", error);
      throw error;
    }
  }

  async createNetwork(name: string, options: any = {}): Promise<void> {
    try {
      await this.docker.createNetwork({ Name: name, ...options });
      this.logger.info(`Network ${name} created successfully`);
    } catch (error) {
      this.logger.error(`Error creating network ${name}:`, error);
      throw error;
    }
  }

  async removeNetwork(networkId: string): Promise<void> {
    try {
      await this.docker.getNetwork(networkId).remove();
      this.logger.info(`Network ${networkId} removed successfully`);
    } catch (error) {
      this.logger.error(`Error removing network ${networkId}:`, error);
      throw error;
    }
  }

  // Volume Management
  async getAllVolumes(): Promise<VolumeInfo[]> {
    try {
      const volumes = await this.docker.listVolumes();
      // Docker API returns {Volumes: [...], Warnings: [...]}
      const volumeList = volumes.Volumes || volumes;
      return Array.isArray(volumeList)
        ? volumeList.map((volume) => this.formatVolumeInfo(volume))
        : [];
    } catch (error) {
      this.logger.error("Error fetching volumes:", error);
      throw error;
    }
  }

  async createVolume(name: string, options: any = {}): Promise<void> {
    try {
      await this.docker.createVolume({ Name: name, ...options });
      this.logger.info(`Volume ${name} created successfully`);
    } catch (error) {
      this.logger.error(`Error creating volume ${name}:`, error);
      throw error;
    }
  }

  async removeVolume(volumeId: string, force: boolean = false): Promise<void> {
    try {
      await this.docker.getVolume(volumeId).remove({ force });
      this.logger.info(`Volume ${volumeId} removed successfully`);
    } catch (error) {
      this.logger.error(`Error removing volume ${volumeId}:`, error);
      throw error;
    }
  }

  // System Information
  async getSystemInfo(): Promise<any> {
    try {
      return await this.docker.info();
    } catch (error) {
      this.logger.error("Error fetching system info:", error);
      throw error;
    }
  }

  async getVersion(): Promise<any> {
    try {
      return await this.docker.version();
    } catch (error) {
      this.logger.error("Error fetching Docker version:", error);
      throw error;
    }
  }

  // Private helper methods
  private formatContainerInfo(container: any): ContainerInfo {
    const rawStatus =
      typeof container?.State === "string"
        ? container.State
        : container?.State?.Status || container?.Status;
    const normalizedStatus = this.normalizeContainerStatus(rawStatus);

    return {
      id: (container?.Id || container?.id || "unknown").substring(0, 12),
      name:
        container?.Names?.[0] ||
        container?.Name ||
        container?.name ||
        "unknown",
      status: (normalizedStatus as ContainerInfo["status"]) || "created",
      image: container?.Image || container?.Config?.Image || "unknown",
      created:
        container?.Created ||
        container?.CreatedAt ||
        new Date().toISOString(),
      startedAt: container?.State?.StartedAt || "",
      finishedAt: container?.State?.FinishedAt || "",
      exitCode: container?.State?.ExitCode || 0,
      ports: container?.Ports || {},
      mountPoints: container?.Mounts || [],
      networks: container?.NetworkSettings?.Networks || {},
      labels: container?.Labels || container?.Config?.Labels || {},
      env: container?.Env || container?.Config?.Env || [],
      cmd: container?.Cmd || container?.Config?.Cmd || [],
      entrypoint: container?.Entrypoint || container?.Config?.Entrypoint || [],
      workingDir: container?.WorkingDir || container?.Config?.WorkingDir || "",
      restartPolicy: container?.HostConfig?.RestartPolicy || {},
      resources: {
        memoryLimit: container?.HostConfig?.Memory || 0,
        cpuShares: container?.HostConfig?.CpuShares || 0,
        cpuQuota: container?.HostConfig?.CpuQuota || 0,
        cpuPeriod: container?.HostConfig?.CpuPeriod || 0,
      },
      health: container?.State?.Health || {},
      logPath: container?.LogPath || "",
      driver: container?.Driver || "",
      execIds: [],
    };
  }

  private normalizeContainerStatus(status?: string): ContainerInfo["status"] {
    if (!status) {
      return "created";
    }
    const lower = status.toLowerCase();
    if (lower.includes("up") || lower.includes("running")) return "running";
    if (lower.includes("exited") || lower.includes("stopped")) return "exited";
    if (lower.includes("paused")) return "paused";
    if (lower.includes("restarting")) return "restarting";
    if (lower.includes("dead")) return "dead";
    if (lower.includes("removing")) return "removing";
    if (lower.includes("created")) return "created";
    return "created";
  }

  private formatImageInfo(image: any): ImageInfo {
    return {
      id: image.Id.substring(0, 12),
      tags: image.RepoTags || [],
      size: image.Size || 0,
      created: image.Created || "",
      labels: image.Labels || {},
    };
  }

  private formatNetworkInfo(network: any): NetworkInfo {
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

  private formatVolumeInfo(volume: any): VolumeInfo {
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

export default DockerService;
