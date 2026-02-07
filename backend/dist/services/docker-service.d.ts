import { ContainerInfo, ContainerMetrics, ImageInfo, NetworkInfo, VolumeInfo, ProcessInfo } from '../types';
import { AppConfig } from '../types';
import { Logger } from '../utils/logger';
export declare class DockerService {
    private docker;
    private config;
    private logger;
    private isConnected;
    constructor(config: AppConfig, logger: Logger);
    private initializeDocker;
    testConnection(): Promise<void>;
    isConnected(): boolean;
    getAllContainers(): Promise<ContainerInfo[]>;
    getContainer(containerId: string): Promise<ContainerInfo>;
    startContainer(containerId: string): Promise<void>;
    stopContainer(containerId: string): Promise<void>;
    restartContainer(containerId: string): Promise<void>;
    removeContainer(containerId: string, force?: boolean): Promise<void>;
    getContainerLogs(containerId: string, options?: {
        tail?: number;
        since?: Date;
        until?: Date;
        timestamps?: boolean;
        stdout?: boolean;
        stderr?: boolean;
    }): Promise<string>;
    getContainerStats(containerId: string): Promise<ContainerMetrics>;
    getContainerProcesses(containerId: string): Promise<ProcessInfo[]>;
    getAllImages(): Promise<ImageInfo[]>;
    pullImage(imageName: string): Promise<void>;
    removeImage(imageId: string, force?: boolean): Promise<void>;
    getAllNetworks(): Promise<NetworkInfo[]>;
    createNetwork(name: string, options?: any): Promise<void>;
    removeNetwork(networkId: string): Promise<void>;
    getAllVolumes(): Promise<VolumeInfo[]>;
    createVolume(name: string, options?: any): Promise<void>;
    removeVolume(volumeId: string, force?: boolean): Promise<void>;
    getSystemInfo(): Promise<any>;
    getVersion(): Promise<any>;
    private formatContainerInfo;
    private formatImageInfo;
    private formatNetworkInfo;
    private formatVolumeInfo;
}
export default DockerService;
//# sourceMappingURL=docker-service.d.ts.map