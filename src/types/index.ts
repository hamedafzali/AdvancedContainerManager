export interface ContainerInfo {
  id: string;
  name: string;
  status: 'running' | 'exited' | 'paused' | 'restarting' | 'dead' | 'created' | 'removing';
  image: string;
  created: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  ports: Record<string, Array<{HostPort: string; HostIp: string}>>;
  mountPoints: Array<{
    Name: string;
    Source: string;
    Destination: string;
    Driver: string;
    Mode: string;
    RW: boolean;
  }>;
  networks: Record<string, {
    IPAMConfig: Array<{
      IPv4Address: string;
      IPv6Address?: string;
    }>;
  }>;
  labels: Record<string, string>;
  env: string[];
  cmd: string[];
  entrypoint: string[];
  workingDir: string;
  restartPolicy: {
    Name: string;
    MaximumRetryCount: number;
  };
  resources: {
    memoryLimit: number;
    cpuShares: number;
    cpuQuota: number;
    cpuPeriod: number;
  };
  health: {
    Status: string;
    FailingStreak: number;
    Log: Array<{
      Start: string;
      End: string;
      ExitCode: number;
      Output: string;
    }>;
  };
  logPath: string;
  driver: string;
  execIds: string[];
}

export interface SystemMetrics {
  timestamp: string;
  cpuPercent: number;
  memoryPercent: number;
  diskUsage: number;
  networkIO: {
    bytesRecv: number;
    bytesSent: number;
    dropin: number;
    dropout: number;
    errin: number;
    errout: number;
    packetsRecv: number;
    packetsSent: number;
  };
  loadAverage: number[];
}

export interface ContainerMetrics {
  timestamp: string;
  cpuPercent: number;
  memoryPercent: number;
  memoryUsage: number;
  memoryLimit: number;
  networkRx: number;
  networkTx: number;
  blockRead: number;
  blockWrite: number;
}

export interface ProjectInfo {
  name: string;
  repoUrl: string;
  branch: string;
  path: string;
  dockerfile: string;
  composeFile: string;
  environmentVars: Record<string, string>;
  containers: string[];
  status: 'configured' | 'building' | 'built' | 'running' | 'stopped' | 'error';
  createdAt: string;
  lastUpdated: string;
  buildHistory: Array<{
    timestamp: string;
    status: string;
    imageId?: string;
    error?: string;
  }>;
  deployHistory: Array<{
    timestamp: string;
    status: string;
    containerIds: string[];
    error?: string;
  }>;
  healthChecks: Array<{
    timestamp: string;
    status: 'healthy' | 'unhealthy' | 'unknown';
    issues: string[];
  }>;
  autoRestart: boolean;
  resourceLimits: {
    memory: string;
    cpu: string;
  };
}

export interface ProjectHealth {
  overall: 'healthy' | 'unhealthy' | 'no_containers' | 'error';
  containers: Array<{
    name: string;
    status: string;
    health: string;
    failingStreak?: number;
  }>;
  lastCheck: string;
  issues: string[];
}

export interface TerminalSession {
  id: string;
  containerId: string;
  socket: any;
  createdAt: Date;
  lastActivity: Date;
  userId?: string;
}

export interface CompressionLevel {
  HIGH: 'high';
  MEDIUM: 'medium';
  LOW: 'low';
}

export interface CompressionSettings {
  [CompressionLevel.HIGH]: 95;
  [CompressionLevel.MEDIUM]: 85;
  [CompressionLevel.LOW]: 70;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: string;
}

export interface DockerConnectionConfig {
  host?: string;
  port?: number;
  socketPath?: string;
  ca?: string;
  cert?: string;
  key?: string;
  protocol?: string;
  timeout?: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  db: number;
  password?: string;
  keyPrefix: string;
}

export interface AppConfig {
  port: number;
  host: string;
  debug: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  docker: DockerConnectionConfig;
  redis: RedisConfig;
  projectsDir: string;
  configPath: string;
  websocketTimeout: number;
  terminalTimeout: number;
  maxTerminalSessions: number;
  metricsInterval: number;
  metricsRetention: number;
}

export interface ImageInfo {
  id: string;
  tags: string[];
  size: number;
  created: string;
  labels: Record<string, string>;
}

export interface NetworkInfo {
  id: string;
  name: string;
  driver: string;
  scope: string;
  containers: number;
  created: string;
  internal: boolean;
  enableIPv6: boolean;
  IPAM: {
    Driver: string;
    Options: Record<string, string>;
    Config: Array<{
      Subnet: string;
      IPRange: string;
      Gateway: string;
    }>;
  };
}

export interface VolumeInfo {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
  labels: Record<string, string>;
  usage: {
    Size: number;
    RefCount: number;
  };
}

export interface ProcessInfo {
  pid: string;
  user: string;
  time: string;
  command: string;
  cpu: string;
  memory: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  container?: string;
}

export interface UserSession {
  id: string;
  userId: number;
  tempFiles: string[];
  compressionSetting: CompressionLevel;
  createdAt: Date;
  lastActivity: Date;
}

export enum CompressionLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export const COMPRESSION_QUALITY: Record<CompressionLevel, number> = {
  [CompressionLevel.HIGH]: 95,
  [CompressionLevel.MEDIUM]: 85,
  [CompressionLevel.LOW]: 70
};
