"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
class AuditService {
    constructor(logger, logDir = "./logs") {
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.maxFiles = 5;
        this.logger = logger;
        this.logFile = (0, path_1.join)(logDir, "audit.log");
        this.ensureLogDirectory();
    }
    ensureLogDirectory() {
        const dir = require("path").dirname(this.logFile);
        if (!(0, fs_1.existsSync)(dir)) {
            require("fs").mkdirSync(dir, { recursive: true });
        }
    }
    rotateLogFile() {
        if (!(0, fs_1.existsSync)(this.logFile))
            return;
        const stats = require("fs").statSync(this.logFile);
        if (stats.size < this.maxFileSize)
            return;
        // Rotate log files
        for (let i = this.maxFiles - 1; i > 0; i--) {
            const oldFile = `${this.logFile}.${i}`;
            const newFile = `${this.logFile}.${i + 1}`;
            if ((0, fs_1.existsSync)(oldFile)) {
                if (i === this.maxFiles - 1) {
                    require("fs").unlinkSync(oldFile);
                }
                else {
                    require("fs").renameSync(oldFile, newFile);
                }
            }
        }
        // Move current log to .1
        require("fs").renameSync(this.logFile, `${this.logFile}.1`);
    }
    writeLog(log) {
        this.rotateLogFile();
        const logEntry = JSON.stringify({
            ...log,
            timestamp: new Date().toISOString(),
        }) + "\n";
        try {
            (0, fs_1.appendFileSync)(this.logFile, logEntry);
        }
        catch (error) {
            this.logger.error("Failed to write audit log:", error);
        }
    }
    logAction(params) {
        const auditLog = {
            id: require("crypto").randomUUID(),
            timestamp: new Date().toISOString(),
            action: params.action,
            resource: params.resource,
            resourceId: params.resourceId,
            userId: params.userId,
            user: params.user,
            details: params.details,
            ip: params.ip,
            userAgent: params.userAgent,
            success: params.success ?? true,
            error: params.error,
            level: params.level || "info",
        };
        this.writeLog(auditLog);
        this.logger.info(`Audit: ${params.action} on ${params.resource}`, auditLog);
    }
    logUserAction(params) {
        this.logAction({
            ...params,
            level: "info",
        });
    }
    logSecurityEvent(params) {
        this.logAction({
            ...params,
            level: "warn",
        });
    }
    logSystemEvent(params) {
        this.logAction({
            ...params,
            level: "debug",
        });
    }
    logError(params) {
        this.logAction({
            ...params,
            success: false,
            level: "error",
        });
    }
    getAuditLogs(params) {
        try {
            if (!(0, fs_1.existsSync)(this.logFile)) {
                return [];
            }
            const content = require("fs").readFileSync(this.logFile, "utf8");
            const lines = content.trim().split("\n").filter(line => line.length > 0);
            let logs = [];
            for (const line of lines) {
                try {
                    const log = JSON.parse(line);
                    logs.push(log);
                }
                catch (error) {
                    // Skip invalid log lines
                    continue;
                }
            }
            // Sort by timestamp (newest first)
            logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            // Apply filters
            if (params?.startDate) {
                logs = logs.filter(log => new Date(log.timestamp) >= params.startDate);
            }
            if (params?.endDate) {
                logs = logs.filter(log => new Date(log.timestamp) <= params.endDate);
            }
            if (params?.userId) {
                logs = logs.filter(log => log.userId === params.userId);
            }
            if (params?.action) {
                logs = logs.filter(log => log.action.includes(params.action));
            }
            if (params?.resource) {
                logs = logs.filter(log => log.resource === params.resource);
            }
            // Apply pagination
            if (params?.offset || params?.limit) {
                const start = params.offset || 0;
                const end = start + (params.limit || 100);
                logs = logs.slice(start, end);
            }
            return logs;
        }
        catch (error) {
            this.logger.error("Failed to read audit logs:", error);
            return [];
        }
    }
    getAuditStats() {
        const logs = this.getAuditLogs({ limit: 10000 });
        const stats = {
            totalLogs: logs.length,
            logsByLevel: {},
            logsByAction: {},
            logsByResource: {},
            recentErrors: 0,
            recentSecurityEvents: 0,
        };
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        for (const log of logs) {
            // Count by level
            stats.logsByLevel[log.level] = (stats.logsByLevel[log.level] || 0) + 1;
            // Count by action
            stats.logsByAction[log.action] = (stats.logsByAction[log.action] || 0) + 1;
            // Count by resource
            stats.logsByResource[log.resource] = (stats.logsByResource[log.resource] || 0) + 1;
            // Count recent errors
            if (log.level === "error" && new Date(log.timestamp) > oneHourAgo) {
                stats.recentErrors++;
            }
            // Count recent security events
            if (log.action.includes("login") || log.action.includes("auth") || log.action.includes("security")) {
                if (new Date(log.timestamp) > oneHourAgo) {
                    stats.recentSecurityEvents++;
                }
            }
        }
        return stats;
    }
    cleanup() {
        // Clean up old log files
        for (let i = this.maxFiles; i > 0; i--) {
            const logFile = `${this.logFile}.${i}`;
            if ((0, fs_1.existsSync)(logFile)) {
                const stats = require("fs").statSync(logFile);
                const age = Date.now() - stats.mtime.getTime();
                // Delete files older than 30 days
                if (age > 30 * 24 * 60 * 60 * 1000) {
                    require("fs").unlinkSync(logFile);
                    this.logger.info(`Deleted old audit log file: ${logFile}`);
                }
            }
        }
    }
}
exports.AuditService = AuditService;
exports.default = AuditService;
