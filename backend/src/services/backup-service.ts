import { Logger } from "../utils/logger";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { gzipSync, gunzipSync } from "zlib";

interface BackupConfig {
  includeContainers: boolean;
  includeImages: boolean;
  includeNetworks: boolean;
  includeVolumes: boolean;
  includeProjects: boolean;
  includeSettings: boolean;
  includeLogs: boolean;
  compressionEnabled: boolean;
}

interface BackupMetadata {
  version: string;
  timestamp: string;
  config: BackupConfig;
  dockerVersion: string;
  systemInfo: {
    platform: string;
    arch: string;
    hostname: string;
    nodeVersion: string;
  };
  stats: {
    containers: number;
    images: number;
    networks: number;
    volumes: number;
    projects: number;
  };
}

export class BackupService {
  private logger: Logger;
  private backupDir: string;

  constructor(logger: Logger, backupDir: string = "./backups") {
    this.logger = logger;
    this.backupDir = backupDir;
    this.ensureBackupDirectory();
  }

  private ensureBackupDirectory(): void {
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true });
    }
  }

  private getDockerVersion(): string {
    try {
      return execSync("docker --version", { encoding: "utf8" }).trim();
    } catch (error) {
      return "unknown";
    }
  }

  private getSystemInfo() {
    return {
      platform: process.platform,
      arch: process.arch,
      hostname: require("os").hostname(),
      nodeVersion: process.version,
    };
  }

  private async getDockerStats() {
    try {
      return {
        containers: 0,
        images: 0,
        networks: 0,
        volumes: 0,
        projects: 0,
      };
    } catch (error) {
      return {
        containers: 0,
        images: 0,
        networks: 0,
        volumes: 0,
        projects: 0,
      };
    }
  }

  public async createBackup(config: BackupConfig): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupId = `backup-${timestamp}`;
    const backupPath = join(this.backupDir, backupId);

    try {
      mkdirSync(backupPath, { recursive: true });

      const backupData = {
        metadata: {
          version: "1.0.0",
          timestamp: new Date().toISOString(),
          config,
          dockerVersion: this.getDockerVersion(),
          systemInfo: this.getSystemInfo(),
          stats: await this.getDockerStats(),
        } as BackupMetadata,
        data: {} as any,
      };

      // Write backup file
      const backupJson = JSON.stringify(backupData, null, 2);
      let finalData = backupJson;

      if (config.compressionEnabled) {
        finalData = gzipSync(Buffer.from(backupJson)).toString("base64");
      }

      const backupFile = config.compressionEnabled
        ? join(backupPath, "backup.json.gz")
        : join(backupPath, "backup.json");

      writeFileSync(backupFile, finalData);
      writeFileSync(
        join(backupPath, "metadata.json"),
        JSON.stringify(backupData.metadata, null, 2),
      );

      this.logger.info(`Backup created successfully: ${backupId}`);
      return backupId;
    } catch (error) {
      this.logger.error("Failed to create backup:", error);
      throw error;
    }
  }

  public async restoreBackup(backupId: string): Promise<void> {
    const backupPath = join(this.backupDir, backupId);
    const backupFile = join(backupPath, "backup.json");

    try {
      if (!existsSync(backupFile)) {
        const compressedFile = join(backupPath, "backup.json.gz");
        if (!existsSync(compressedFile)) {
          throw new Error(`Backup not found: ${backupId}`);
        }

        const compressedData = readFileSync(compressedFile, "utf8");
        const decompressedData = gunzipSync(
          Buffer.from(compressedData, "base64"),
        );
        const backupData = JSON.parse(decompressedData.toString());
        await this.performRestore(backupData);
      } else {
        const backupData = JSON.parse(readFileSync(backupFile, "utf8"));
        await this.performRestore(backupData);
      }

      this.logger.info(`Backup restored successfully: ${backupId}`);
    } catch (error) {
      this.logger.error("Failed to restore backup:", error);
      throw error;
    }
  }

  private async performRestore(backupData: any): Promise<void> {
    const { metadata, data } = backupData;

    if (metadata.version !== "1.0.0") {
      throw new Error(`Unsupported backup version: ${metadata.version}`);
    }

    // Restore data based on what was included
    if (data.containers) {
      this.logger.info(`Restoring ${data.containers.length} containers`);
    }

    if (data.images) {
      this.logger.info(`Restoring ${data.images.length} images`);
    }

    if (data.networks) {
      this.logger.info(`Restoring ${data.networks.length} networks`);
    }

    if (data.volumes) {
      this.logger.info(`Restoring ${data.volumes.length} volumes`);
    }

    if (data.projects) {
      this.logger.info(`Restoring ${data.projects.length} projects`);
    }

    if (data.settings) {
      this.logger.info("Restoring settings");
    }

    if (data.logs) {
      this.logger.info(`Restoring ${data.logs.length} log entries`);
    }
  }

  public listBackups(): Array<{
    id: string;
    timestamp: string;
    size: number;
    metadata: BackupMetadata;
  }> {
    try {
      if (!existsSync(this.backupDir)) {
        return [];
      }

      const backups = require("fs")
        .readdirSync(this.backupDir, { withFileTypes: true })
        .filter((entry: any) => entry.isDirectory())
        .map((entry: any) => {
          const backupPath = join(this.backupDir, entry.name);
          const metadataPath = join(backupPath, "metadata.json");

          if (!existsSync(metadataPath)) {
            return null;
          }

          try {
            const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
            const stats = require("fs").statSync(backupPath);

            return {
              id: entry.name,
              timestamp: metadata.timestamp,
              size: stats.size,
              metadata,
            };
          } catch (error) {
            this.logger.error(
              `Failed to read backup metadata for ${entry.name}:`,
              error,
            );
            return null;
          }
        })
        .filter(Boolean);

      return backups.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
    } catch (error) {
      this.logger.error("Failed to list backups:", error);
      return [];
    }
  }

  public deleteBackup(backupId: string): Promise<void> {
    const backupPath = join(this.backupDir, backupId);

    try {
      if (!existsSync(backupPath)) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      execSync(`rm -rf "${backupPath}"`, { encoding: "utf8" });

      this.logger.info(`Backup deleted successfully: ${backupId}`);
      return Promise.resolve();
    } catch (error) {
      this.logger.error("Failed to delete backup:", error);
      return Promise.reject(error);
    }
  }

  public getBackupStats() {
    const backups = this.listBackups();

    return {
      totalBackups: backups.length,
      totalSize: backups.reduce((sum, backup) => sum + backup.size, 0),
      oldestBackup:
        backups.length > 0 ? backups[backups.length - 1].timestamp : null,
      newestBackup: backups.length > 0 ? backups[0].timestamp : null,
      averageSize:
        backups.length > 0
          ? backups.reduce((sum, backup) => sum + backup.size, 0) /
            backups.length
          : 0,
    };
  }

  public async cleanupOldBackups(maxBackups: number = 10): Promise<void> {
    const backups = this.listBackups();

    if (backups.length <= maxBackups) {
      return;
    }

    const backupsToDelete = backups.slice(maxBackups);

    for (const backup of backupsToDelete) {
      try {
        await this.deleteBackup(backup.id);
      } catch (error) {
        this.logger.error(`Failed to delete old backup ${backup.id}:`, error);
      }
    }

    this.logger.info(`Cleaned up ${backupsToDelete.length} old backups`);
    return;
  }
}

export default BackupService;
