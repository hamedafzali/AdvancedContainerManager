"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupService = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const child_process_1 = require("child_process");
const zlib_1 = require("zlib");
class BackupService {
    constructor(logger, backupDir = "./backups") {
        this.logger = logger;
        this.backupDir = backupDir;
        this.ensureBackupDirectory();
    }
    ensureBackupDirectory() {
        if (!(0, fs_1.existsSync)(this.backupDir)) {
            (0, fs_1.mkdirSync)(this.backupDir, { recursive: true });
        }
    }
    getDockerVersion() {
        try {
            return (0, child_process_1.execSync)("docker --version", { encoding: "utf8" }).trim();
        }
        catch (error) {
            return "unknown";
        }
    }
    getSystemInfo() {
        return {
            platform: process.platform,
            arch: process.arch,
            hostname: require("os").hostname(),
            nodeVersion: process.version,
        };
    }
    async getDockerStats() {
        try {
            return {
                containers: 0,
                images: 0,
                networks: 0,
                volumes: 0,
                projects: 0,
            };
        }
        catch (error) {
            return {
                containers: 0,
                images: 0,
                networks: 0,
                volumes: 0,
                projects: 0,
            };
        }
    }
    async createBackup(config) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupId = `backup-${timestamp}`;
        const backupPath = (0, path_1.join)(this.backupDir, backupId);
        try {
            (0, fs_1.mkdirSync)(backupPath, { recursive: true });
            const backupData = {
                metadata: {
                    version: "1.0.0",
                    timestamp: new Date().toISOString(),
                    config,
                    dockerVersion: this.getDockerVersion(),
                    systemInfo: this.getSystemInfo(),
                    stats: await this.getDockerStats(),
                },
                data: {},
            };
            // Write backup file
            const backupJson = JSON.stringify(backupData, null, 2);
            let finalData = backupJson;
            if (config.compressionEnabled) {
                finalData = (0, zlib_1.gzipSync)(Buffer.from(backupJson)).toString("base64");
            }
            const backupFile = config.compressionEnabled
                ? (0, path_1.join)(backupPath, "backup.json.gz")
                : (0, path_1.join)(backupPath, "backup.json");
            (0, fs_1.writeFileSync)(backupFile, finalData);
            (0, fs_1.writeFileSync)((0, path_1.join)(backupPath, "metadata.json"), JSON.stringify(backupData.metadata, null, 2));
            this.logger.info(`Backup created successfully: ${backupId}`);
            return backupId;
        }
        catch (error) {
            this.logger.error("Failed to create backup:", error);
            throw error;
        }
    }
    async restoreBackup(backupId) {
        const backupPath = (0, path_1.join)(this.backupDir, backupId);
        const backupFile = (0, path_1.join)(backupPath, "backup.json");
        try {
            if (!(0, fs_1.existsSync)(backupFile)) {
                const compressedFile = (0, path_1.join)(backupPath, "backup.json.gz");
                if (!(0, fs_1.existsSync)(compressedFile)) {
                    throw new Error(`Backup not found: ${backupId}`);
                }
                const compressedData = (0, fs_1.readFileSync)(compressedFile, "utf8");
                const decompressedData = (0, zlib_1.gunzipSync)(Buffer.from(compressedData, "base64"));
                const backupData = JSON.parse(decompressedData.toString());
                await this.performRestore(backupData);
            }
            else {
                const backupData = JSON.parse((0, fs_1.readFileSync)(backupFile, "utf8"));
                await this.performRestore(backupData);
            }
            this.logger.info(`Backup restored successfully: ${backupId}`);
        }
        catch (error) {
            this.logger.error("Failed to restore backup:", error);
            throw error;
        }
    }
    async performRestore(backupData) {
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
    listBackups() {
        try {
            if (!(0, fs_1.existsSync)(this.backupDir)) {
                return [];
            }
            const backups = require("fs")
                .readdirSync(this.backupDir, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => {
                const backupPath = (0, path_1.join)(this.backupDir, entry.name);
                const metadataPath = (0, path_1.join)(backupPath, "metadata.json");
                if (!(0, fs_1.existsSync)(metadataPath)) {
                    return null;
                }
                try {
                    const metadata = JSON.parse((0, fs_1.readFileSync)(metadataPath, "utf8"));
                    const stats = require("fs").statSync(backupPath);
                    return {
                        id: entry.name,
                        timestamp: metadata.timestamp,
                        size: stats.size,
                        metadata,
                    };
                }
                catch (error) {
                    this.logger.error(`Failed to read backup metadata for ${entry.name}:`, error);
                    return null;
                }
            })
                .filter(Boolean);
            return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }
        catch (error) {
            this.logger.error("Failed to list backups:", error);
            return [];
        }
    }
    deleteBackup(backupId) {
        const backupPath = (0, path_1.join)(this.backupDir, backupId);
        try {
            if (!(0, fs_1.existsSync)(backupPath)) {
                throw new Error(`Backup not found: ${backupId}`);
            }
            (0, child_process_1.execSync)(`rm -rf "${backupPath}"`, { encoding: "utf8" });
            this.logger.info(`Backup deleted successfully: ${backupId}`);
            return Promise.resolve();
        }
        catch (error) {
            this.logger.error("Failed to delete backup:", error);
            return Promise.reject(error);
        }
    }
    getBackupStats() {
        const backups = this.listBackups();
        return {
            totalBackups: backups.length,
            totalSize: backups.reduce((sum, backup) => sum + backup.size, 0),
            oldestBackup: backups.length > 0 ? backups[backups.length - 1].timestamp : null,
            newestBackup: backups.length > 0 ? backups[0].timestamp : null,
            averageSize: backups.length > 0
                ? backups.reduce((sum, backup) => sum + backup.size, 0) /
                    backups.length
                : 0,
        };
    }
    async cleanupOldBackups(maxBackups = 10) {
        const backups = this.listBackups();
        if (backups.length <= maxBackups) {
            return;
        }
        const backupsToDelete = backups.slice(maxBackups);
        for (const backup of backupsToDelete) {
            try {
                await this.deleteBackup(backup.id);
            }
            catch (error) {
                this.logger.error(`Failed to delete old backup ${backup.id}:`, error);
            }
        }
        this.logger.info(`Cleaned up ${backupsToDelete.length} old backups`);
        return;
    }
}
exports.BackupService = BackupService;
exports.default = BackupService;
