import Docker from 'dockerode';
import { ContainerInfo, SystemMetrics, ContainerMetrics, DockerConnectionConfig, ImageInfo, NetworkInfo, VolumeInfo, ProcessInfo } from '../types';
import { AppConfig } from '../types';
import { Logger } from '../utils/logger';

export class DockerService {
  private docker: Docker;
  private config: DockerConnectionConfig;
  private logger: Logger;
  private isConnected: boolean = false;

  constructor(config: AppConfig, logger: Logger) {
    this.config = config.docker;
    this.logger = logger;
    this.initializeDocker();
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
      this.isConnected = true;
      this.logger.info('Docker service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Docker service:', error);
      this.isConnected = false;
    }
  }

  async testConnection(): Promise<void> {
    try {
      await this.docker.ping();
      this.isConnected = true;
      this.logger.info('Docker connection test successful');
    } catch (error) {
      this.isConnected = false;
      this.logger.error('Docker connection test failed:', error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this.isConnected;
  }

  // Container Management
  async getAllContainers(): Promise<ContainerInfo[]> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      return containers.map(container => this.formatContainerInfo(container));
    } catch (error) {
      this.logger.error('Error fetching containers:', error);
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

  async removeContainer(containerId: string, force: boolean = false): Promise<void> {
    try {
      const container = await this.docker.getContainer(containerId);
      await container.remove({ force });
      this.logger.info(`Container ${containerId} removed successfully`);
    } catch (error) {
      this.logger.error(`Error removing container ${containerId}:`, error);
      throw error;
    }
  }

  async getContainerLogs(containerId: string, options: {
    tail?: number;
    since?: Date;
    until?: Date;
    timestamps?: boolean;
    stdout?: boolean;
    stderr?: boolean;
  } = {}): Promise<string> {
    try {
      const container = await this.docker.getContainer(containerId);
      const logs = await container.logs({
        tail: options.tail || 100,
        since: options.since,
        until: options.until,
        timestamps: options.timestamps !== false,
        stdout: options.stdout !== false,
        stderr: options.stderr !== false
      });
      return logs.toString();
    } catch (error) {
      this.logger.error(`Error fetching logs for container ${containerId}:`, error);
      throw error;
    }
  }

  async getContainerStats(containerId: string): Promise<ContainerMetrics> {
    try {
      const container = await this.docker.getContainer(containerId);
      const stats = await container.stats({ stream: false });
      
      // Calculate CPU usage
      let cpuUsage = 0;
      if (stats.cpu_stats.cpu_usage.total_usage > 0) {
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        if (systemDelta > 0) {
          cpuUsage = (cpuDelta / systemDelta) * stats.cpu_stats.cpu_usage.percpu_usage.length * 100;
        }
      }

      // Calculate memory usage
      let memoryUsage = 0;
      if (stats.memory_stats.limit > 0) {
        memoryUsage = (stats.memory_stats.usage / stats.memory_stats.limit) * 100;
      }

      // Network I/O
      let networkRx = 0;
      let networkTx = 0;
      if (stats.networks) {
        for (const network of Object.values(stats.networks)) {
          networkRx += network.rx_bytes;
          networkTx += network.tx_bytes;
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
        blockWrite: stats.blkio_stats.write_bytes || 0
      };
    } catch (error) {
      this.logger.error(`Error fetching stats for container ${containerId}:`, error);
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
            memory: process.MEM
          });
        }
      }
      
      return processes;
    } catch (error) {
      this.logger.error(`Error fetching processes for container ${containerId}:`, error);
      throw error;
    }
  }

  // Image Management
  async getAllImages(): Promise<ImageInfo[]> {
    try {
      const images = await this.docker.listImages();
      return images.map(image => this.formatImageInfo(image));
    } catch (error) {
      this.logger.error('Error fetching images:', error);
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
      return networks.map(network => this.formatNetworkInfo(network));
    } catch (error) {
      this.logger.error('Error fetching networks:', error);
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
      return volumes.map(volume => this.formatVolumeInfo(volume));
    } catch (error) {
      this.logger.error('Error fetching volumes:', error);
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
      this.logger.error('Error fetching system info:', error);
      throw error;
    }
  }

  async getVersion(): Promise<any> {
    try {
      return await this.docker.version();
    } catch (error) {
      this.logger.error('Error fetching Docker version:', error);
      throw error;
    }
  }

  // Private helper methods
  private formatContainerInfo(container: any): ContainerInfo {
    return {
      id: container.Id.substring(0, 12),
      name: container.Name,
      status: container.State.Status,
      image: container.Config.Image,
      created: container.Created,
      startedAt: container.State.StartedAt,
      finishedAt: container.State.FinishedAt,
      exitCode: container.State.ExitCode,
      ports: container.NetworkSettings.Ports || {},
      mountPoints: container.Mounts || [],
      networks: container.NetworkSettings.Networks || {},
      labels: container.Config.Labels || {},
      env: container.Config.Env || [],
      cmd: container.Config.Cmd || [],
      entrypoint: container.Config.Entrypoint || [],
      workingDir: container.Config.WorkingDir || '',
      restartPolicy: container.HostConfig.RestartPolicy || {},
      resources: {
        memoryLimit: container.HostConfig.Memory || 0,
        cpuShares: container.HostConfig.CpuShares || 0,
        cpuQuota: container.HostConfig.CpuQuota || 0,
        cpuPeriod: container.HostConfig.CpuPeriod || 0
      },
      health: container.State.Health || {},
      logPath: container.LogPath || '',
      driver: container.Driver || '',
      execIds: []
    };
  }

  private formatImageInfo(image: any): ImageInfo {
    return {
      id: image.Id.substring(0, 12),
      tags: image.RepoTags || [],
      size: image.Size || 0,
      created: image.Created || '',
      labels: image.Labels || {}
    };
  }

  private formatNetworkInfo(network: any): NetworkInfo {
    return {
      id: network.Id.substring(0, 12),
      name: network.Name,
      driver: network.Driver,
      scope: network.Scope || 'local',
      containers: Object.keys(network.Containers || {}).length,
      created: network.Created || '',
      internal: network.Internal || false,
      enableIPv6: network.EnableIPv6 || false,
      IPAM: network.IPAM || { Driver: '', Options: {}, Config: [] }
    };
  }

  private formatVolumeInfo(volume: any): VolumeInfo {
    return {
      name: volume.Name,
      driver: volume.Driver || 'local',
      mountpoint: volume.Mountpoint || '',
      created: volume.CreatedAt || '',
      labels: volume.Labels || {},
      usage: volume.UsageData || { Size: 0, RefCount: 0 }
    };
  }
}

export default DockerService;
