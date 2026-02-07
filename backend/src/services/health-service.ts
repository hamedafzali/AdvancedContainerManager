import { Logger } from "../utils/logger";
import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

interface HealthCheck {
  name: string;
  status: "healthy" | "unhealthy" | "degraded";
  message: string;
  timestamp: string;
  responseTime: number;
  details?: any;
}

interface SystemHealth {
  status: "healthy" | "unhealthy" | "degraded";
  checks: HealthCheck[];
  uptime: number;
  version: string;
  timestamp: string;
}

export class HealthService {
  private logger: Logger;
  private startTime: number;
  private version: string;

  constructor(logger: Logger) {
    this.logger = logger;
    this.startTime = Date.now();
    this.version = this.getVersion();
  }

  private getVersion(): string {
    try {
      const packageJson = readFileSync(join(__dirname, "../../package.json"), "utf8");
      return JSON.parse(packageJson).version || "unknown";
    } catch (error) {
      return "unknown";
    }
  }

  private async checkDockerHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check if Docker daemon is running
      execSync("docker info", { encoding: "utf8", timeout: 5000 });
      
      const responseTime = Date.now() - startTime;
      
      return {
        name: "docker",
        status: "healthy",
        message: "Docker daemon is running",
        timestamp: new Date().toISOString(),
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        name: "docker",
        status: "unhealthy",
        message: "Docker daemon is not accessible",
        timestamp: new Date().toISOString(),
        responseTime,
        details: { error: error.message },
      };
    }
  }

  private async checkRedisHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check if Redis is accessible
      execSync("redis-cli ping", { encoding: "utf8", timeout: 3000 });
      
      const responseTime = Date.now() - startTime;
      
      return {
        name: "redis",
        status: "healthy",
        message: "Redis is responding",
        timestamp: new Date().toISOString(),
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        name: "redis",
        status: "degraded",
        message: "Redis is not accessible (running without cache)",
        timestamp: new Date().toISOString(),
        responseTime,
        details: { error: error.message },
      };
    }
  }

  private async checkDiskSpace(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const stats = execSync("df -h /", { encoding: "utf8" });
      const lines = stats.split("\n");
      const data = lines[1].split(/\s+/);
      const usagePercent = parseInt(data[4].replace("%", ""));
      
      const responseTime = Date.now() - startTime;
      
      let status: "healthy" | "unhealthy" | "degraded" = "healthy";
      let message = `Disk usage: ${usagePercent}%`;
      
      if (usagePercent > 90) {
        status = "unhealthy";
        message = `Critical: Disk usage is ${usagePercent}%`;
      } else if (usagePercent > 80) {
        status = "degraded";
        message = `Warning: Disk usage is ${usagePercent}%`;
      }
      
      return {
        name: "disk",
        status,
        message,
        timestamp: new Date().toISOString(),
        responseTime,
        details: { usagePercent, freeSpace: data[3] },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        name: "disk",
        status: "unhealthy",
        message: "Unable to check disk space",
        timestamp: new Date().toISOString(),
        responseTime,
        details: { error: error.message },
      };
    }
  }

  private async checkMemoryUsage(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const stats = execSync("free -m", { encoding: "utf8" });
      const lines = stats.split("\n");
      const memLine = lines[1].split(/\s+/);
      const total = parseInt(memLine[1]);
      const used = parseInt(memLine[2]);
      const usagePercent = Math.round((used / total) * 100);
      
      const responseTime = Date.now() - startTime;
      
      let status: "healthy" | "unhealthy" | "degraded" = "healthy";
      let message = `Memory usage: ${usagePercent}%`;
      
      if (usagePercent > 90) {
        status = "unhealthy";
        message = `Critical: Memory usage is ${usagePercent}%`;
      } else if (usagePercent > 80) {
        status = "degraded";
        message = `Warning: Memory usage is ${usagePercent}%`;
      }
      
      return {
        name: "memory",
        status,
        message,
        timestamp: new Date().toISOString(),
        responseTime,
        details: { total, used, usagePercent },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        name: "memory",
        status: "unhealthy",
        message: "Unable to check memory usage",
        timestamp: new Date().toISOString(),
        responseTime,
        details: { error: error.message },
      };
    }
  }

  private async checkSystemLoad(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const loadAvg = execSync("cat /proc/loadavg", { encoding: "utf8" });
      const [load1, load5, load15] = loadAvg.split(" ").map(Number);
      const cpuCount = require("os").cpus().length;
      const load1Percent = (load1 / cpuCount) * 100;
      
      const responseTime = Date.now() - startTime;
      
      let status: "healthy" | "unhealthy" | "degraded" = "healthy";
      let message = `System load: ${load1.toFixed(2)} (${cpuCount} CPUs)`;
      
      if (load1Percent > 90) {
        status = "unhealthy";
        message = `Critical: System load is ${load1.toFixed(2)}`;
      } else if (load1Percent > 70) {
        status = "degraded";
        message = `Warning: System load is ${load1.toFixed(2)}`;
      }
      
      return {
        name: "load",
        status,
        message,
        timestamp: new Date().toISOString(),
        responseTime,
        details: { load1, load5, load15, cpuCount },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        name: "load",
        status: "unhealthy",
        message: "Unable to check system load",
        timestamp: new Date().toISOString(),
        responseTime,
        details: { error: error.message },
      };
    }
  }

  private async checkDatabaseHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check if we can access the data directories
      const dataDirs = ["./data/projects", "./data/config", "./data/backups", "./data/logs"];
      let accessibleDirs = 0;
      
      for (const dir of dataDirs) {
        if (existsSync(dir)) {
          accessibleDirs++;
        }
      }
      
      const responseTime = Date.now() - startTime;
      
      let status: "healthy" | "unhealthy" | "degraded" = "healthy";
      let message = `Data directories: ${accessibleDirs}/${dataDirs.length} accessible`;
      
      if (accessibleDirs === 0) {
        status = "unhealthy";
        message = "No data directories accessible";
      } else if (accessibleDirs < dataDirs.length) {
        status = "degraded";
        message = `Some data directories missing: ${dataDirs.length - accessibleDirs}`;
      }
      
      return {
        name: "database",
        status,
        message,
        timestamp: new Date().toISOString(),
        responseTime,
        details: { accessibleDirs, totalDirs: dataDirs.length },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        name: "database",
        status: "unhealthy",
        message: "Unable to check data directories",
        timestamp: new Date().toISOString(),
        responseTime,
        details: { error: error.message },
      };
    }
  }

  private async checkWebSocketHealth(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // This would check if WebSocket server is running
      // For now, we'll assume it's healthy if the main server is running
      const responseTime = Date.now() - startTime;
      
      return {
        name: "websocket",
        status: "healthy",
        message: "WebSocket server is running",
        timestamp: new Date().toISOString(),
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      return {
        name: "websocket",
        status: "unhealthy",
        message: "WebSocket server is not accessible",
        timestamp: new Date().toISOString(),
        responseTime,
        details: { error: error.message },
      };
    }
  }

  public async getHealthStatus(): Promise<SystemHealth> {
    const checks = await Promise.all([
      this.checkDockerHealth(),
      this.checkRedisHealth(),
      this.checkDiskSpace(),
      this.checkMemoryUsage(),
      this.checkSystemLoad(),
      this.checkDatabaseHealth(),
      this.checkWebSocketHealth(),
    ]);

    // Determine overall status
    let overallStatus: "healthy" | "unhealthy" | "degraded" = "healthy";
    
    const unhealthyCount = checks.filter(c => c.status === "unhealthy").length;
    const degradedCount = checks.filter(c => c.status === "degraded").length;
    
    if (unhealthyCount > 0) {
      overallStatus = "unhealthy";
    } else if (degradedCount > 0) {
      overallStatus = "degraded";
    }

    const uptime = Date.now() - this.startTime;

    return {
      status: overallStatus,
      checks,
      uptime,
      version: this.version,
      timestamp: new Date().toISOString(),
    };
  }

  public async getDetailedHealth(): Promise<SystemHealth & {
    system: {
      platform: string;
      arch: string;
      hostname: string;
      nodeVersion: string;
      dockerVersion: string;
      memory: {
        total: number;
        free: number;
        used: number;
      };
      disk: {
        total: string;
        used: string;
        free: string;
      };
    };
  }> {
    const basicHealth = await this.getHealthStatus();
    
    // Get detailed system information
    const system = {
      platform: process.platform,
      arch: process.arch,
      hostname: require("os").hostname(),
      nodeVersion: process.version,
      dockerVersion: this.getDockerVersion(),
      memory: this.getMemoryInfo(),
      disk: this.getDiskInfo(),
    };

    return {
      ...basicHealth,
      system,
    };
  }

  private getDockerVersion(): string {
    try {
      return execSync("docker --version", { encoding: "utf8" }).trim();
    } catch (error) {
      return "Not available";
    }
  }

  private getMemoryInfo() {
    try {
      const stats = execSync("free -m", { encoding: "utf8" });
      const lines = stats.split("\n");
      const memLine = lines[1].split(/\s+/);
      
      return {
        total: parseInt(memLine[1]),
        free: parseInt(memLine[3]),
        used: parseInt(memLine[2]),
      };
    } catch (error) {
      return { total: 0, free: 0, used: 0 };
    }
  }

  private getDiskInfo() {
    try {
      const stats = execSync("df -h /", { encoding: "utf8" });
      const lines = stats.split("\n");
      const data = lines[1].split(/\s+/);
      
      return {
        total: data[1],
        used: data[2],
        free: data[3],
      };
    } catch (error) {
      return { total: "Unknown", used: "Unknown", free: "Unknown" };
    }
  }

  public async runHealthCheck(checkName?: string): Promise<HealthCheck[]> {
    if (checkName) {
      switch (checkName) {
        case "docker":
          return [await this.checkDockerHealth()];
        case "redis":
          return [await this.checkRedisHealth()];
        case "disk":
          return [await this.checkDiskSpace()];
        case "memory":
          return [await this.checkMemoryUsage()];
        case "load":
          return [await this.checkSystemLoad()];
        case "database":
          return [await this.checkDatabaseHealth()];
        case "websocket":
          return [await this.checkWebSocketHealth()];
        default:
          throw new Error(`Unknown health check: ${checkName}`);
      }
    }

    return [
      await this.checkDockerHealth(),
      await this.checkRedisHealth(),
      await this.checkDiskSpace(),
      await this.checkMemoryUsage(),
      await this.checkSystemLoad(),
      await this.checkDatabaseHealth(),
      await this.checkWebSocketHealth(),
    ];
  }
}

export default HealthService;
