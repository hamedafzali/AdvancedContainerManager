import { Logger } from "../utils/logger";
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
} from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
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

  private runDocker(args: string[], cwd?: string): string {
    return execFileSync("docker", args, { encoding: "utf8", cwd }).trim();
  }

  private getDockerVersion(): string {
    try {
      return execFileSync("docker", ["--version"], { encoding: "utf8" }).trim();
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
      const containers = this.runDocker(["ps", "-aq"]).split("\n").filter(Boolean);
      const images = this.runDocker(["images", "-q"]).split("\n").filter(Boolean);
      const networks = this.runDocker(["network", "ls", "-q"]).split("\n").filter(Boolean);
      const volumes = this.runDocker(["volume", "ls", "-q"]).split("\n").filter(Boolean);
      return {
        containers: containers.length,
        images: images.length,
        networks: networks.length,
        volumes: volumes.length,
        projects: this.countProjects(),
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

  private countProjects(): number {
    const projectsDir = process.env.PROJECTS_DIR || "/tmp/advanced_manager_projects";
    if (!existsSync(projectsDir)) return 0;
    return readdirSync(projectsDir).length;
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

      if (config.includeImages) {
        const images = this.runDocker(["images", "-q"]).split("\n").filter(Boolean);
        if (images.length > 0) {
          this.runDocker(["save", "-o", join(backupPath, "images.tar"), ...images]);
          backupData.data.images = images;
        }
      }

      if (config.includeContainers) {
        const containers = this.runDocker(["ps", "-aq"]).split("\n").filter(Boolean);
        if (containers.length > 0) {
          const containerDir = join(backupPath, "containers");
          mkdirSync(containerDir, { recursive: true });
          for (const id of containers) {
            this.runDocker(["export", "-o", join(containerDir, `${id}.tar`), id]);
            const inspect = this.runDocker(["inspect", id]);
            writeFileSync(join(containerDir, `${id}.json`), inspect);
          }
          backupData.data.containers = containers;
        }
      }

      if (config.includeVolumes) {
        const volumes = this.runDocker(["volume", "ls", "-q"]).split("\n").filter(Boolean);
        if (volumes.length > 0) {
          const volumeDir = join(backupPath, "volumes");
          mkdirSync(volumeDir, { recursive: true });
          for (const name of volumes) {
            execFileSync(
              "docker",
              [
                "run",
                "--rm",
                "-v",
                `${name}:/data:ro",
                "-v",
                `${volumeDir}:/backup",
                "alpine",
                "sh",
                "-c",
                `tar -cf /backup/${name}.tar -C /data .`,
              ],
              { encoding: "utf8" },
            );
          }
          backupData.data.volumes = volumes;
        }
      }

      if (config.includeNetworks) {
        const networks = this.runDocker(["network", "ls", "-q"]).split("\n").filter(Boolean);
        if (networks.length > 0) {
          const inspect = this.runDocker(["network", "inspect", ...networks]);
          writeFileSync(join(backupPath, "networks.json"), inspect);
          backupData.data.networks = networks;
        }
      }

      if (config.includeProjects) {
        const projectsDir = process.env.PROJECTS_DIR || "/tmp/advanced_manager_projects";
        if (existsSync(projectsDir)) {
          this.copyRecursive(projectsDir, join(backupPath, "projects"));
          backupData.data.projects = true;
        }
      }

      if (config.includeSettings) {
        const configPath = process.env.CONFIG_PATH || "/tmp/advanced_manager_config.json";
        if (existsSync(configPath) && statSync(configPath).isFile()) {
          copyFileSync(configPath, join(backupPath, "config.json"));
          backupData.data.settings = true;
        }
      }

      if (config.includeLogs) {
        const logsDir = process.env.LOG_DIR || "./logs";
        if (existsSync(logsDir)) {
          this.copyRecursive(logsDir, join(backupPath, "logs"));
          backupData.data.logs = true;
        }
      }

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
      let backupData: any;
      if (!existsSync(backupFile)) {
        const compressedFile = join(backupPath, "backup.json.gz");
        if (!existsSync(compressedFile)) {
          throw new Error(`Backup not found: ${backupId}`);
        }

        const compressedData = readFileSync(compressedFile, "utf8");
        const decompressedData = gunzipSync(
          Buffer.from(compressedData, "base64"),
        );
        backupData = JSON.parse(decompressedData.toString());
      } else {
        backupData = JSON.parse(readFileSync(backupFile, "utf8"));
      }

      const config: BackupConfig = backupData.metadata.config;

      if (config.includeImages && existsSync(join(backupPath, "images.tar"))) {
        this.runDocker(["load", "-i", join(backupPath, "images.tar")]);
      }

      if (config.includeVolumes && existsSync(join(backupPath, "volumes"))) {
        const volumeDir = join(backupPath, "volumes");
        const volumeFiles = readdirSync(volumeDir).filter((f) => f.endsWith(".tar"));
        for (const file of volumeFiles) {
          const name = file.replace(/\.tar$/, "");
          try {
            this.runDocker(["volume", "create", name]);
          } catch (_) {
            // ignore if already exists
          }
          execFileSync(
            "docker",
            [
              "run",
              "--rm",
              "-v",
              `${name}:/data",
              "-v",
              `${volumeDir}:/backup",
              "alpine",
              "sh",
              "-c",
              `tar -xf /backup/${file} -C /data`,
            ],
            { encoding: "utf8" },
          );
        }
      }

      if (config.includeProjects && existsSync(join(backupPath, "projects"))) {
        const projectsDir = process.env.PROJECTS_DIR || "/tmp/advanced_manager_projects";
        this.copyRecursive(join(backupPath, "projects"), projectsDir);
      }

      if (config.includeSettings && existsSync(join(backupPath, "config.json"))) {
        const configPath = process.env.CONFIG_PATH || "/tmp/advanced_manager_config.json";
        copyFileSync(join(backupPath, "config.json"), configPath);
      }

      if (config.includeLogs && existsSync(join(backupPath, "logs"))) {
        const logsDir = process.env.LOG_DIR || "./logs";
        this.copyRecursive(join(backupPath, "logs"), logsDir);
      }

      this.logger.info(`Backup restored successfully: ${backupId}`);
    } catch (error) {
      this.logger.error("Failed to restore backup:", error);
      throw error;
    }
  }

  public async deleteBackup(backupId: string): Promise<void> {
    const backupPath = join(this.backupDir, backupId);
    try {
      if (existsSync(backupPath)) {
        this.removeRecursive(backupPath);
      }
      this.logger.info(`Backup deleted successfully: ${backupId}`);
    } catch (error) {
      this.logger.error("Failed to delete backup:", error);
      throw error;
    }
  }

  public getBackups(): Array<{ id: string; timestamp: string; size: number }> {
    try {
      if (!existsSync(this.backupDir)) {
        return [];
      }
      return readdirSync(this.backupDir)
        .map((name) => {
          const fullPath = join(this.backupDir, name);
          const stats = statSync(fullPath);
          return {
            id: name,
            timestamp: stats.mtime.toISOString(),
            size: stats.isDirectory() ? this.getDirectorySize(fullPath) : stats.size,
          };
        })
        .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    } catch (error) {
      this.logger.error("Failed to list backups:", error);
      return [];
    }
  }

  private copyRecursive(src: string, dest: string): void {
    if (!existsSync(src)) return;
    const stats = statSync(src);
    if (stats.isDirectory()) {
      mkdirSync(dest, { recursive: true });
      for (const entry of readdirSync(src)) {
        this.copyRecursive(join(src, entry), join(dest, entry));
      }
    } else {
      mkdirSync(join(dest, ".."), { recursive: true });
      copyFileSync(src, dest);
    }
  }

  private removeRecursive(target: string): void {
    if (!existsSync(target)) return;
    const stats = statSync(target);
    if (stats.isDirectory()) {
      for (const entry of readdirSync(target)) {
        this.removeRecursive(join(target, entry));
      }
      require("fs").rmdirSync(target);
    } else {
      require("fs").unlinkSync(target);
    }
  }

  private getDirectorySize(dir: string): number {
    let size = 0;
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stats = statSync(fullPath);
      if (stats.isDirectory()) {
        size += this.getDirectorySize(fullPath);
      } else {
        size += stats.size;
      }
    }
    return size;
  }
}
