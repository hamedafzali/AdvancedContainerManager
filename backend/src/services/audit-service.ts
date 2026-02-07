import { Logger } from "../utils/logger";
import { writeFileSync, appendFileSync, existsSync } from "fs";
import { join } from "path";

interface AuditLog {
  id: string;
  timestamp: string;
  userId?: string;
  user?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
  success: boolean;
  error?: string;
  level: "info" | "warn" | "error" | "debug";
}

export class AuditService {
  private logger: Logger;
  private logFile: string;
  private maxFileSize: number = 10 * 1024 * 1024; // 10MB
  private maxFiles: number = 5;

  constructor(logger: Logger, logDir: string = "./logs") {
    this.logger = logger;
    this.logFile = join(logDir, "audit.log");
    this.ensureLogDirectory();
  }

  private ensureLogDirectory(): void {
    const dir = require("path").dirname(this.logFile);
    if (!existsSync(dir)) {
      require("fs").mkdirSync(dir, { recursive: true });
    }
  }

  private rotateLogFile(): void {
    if (!existsSync(this.logFile)) return;

    const stats = require("fs").statSync(this.logFile);
    if (stats.size < this.maxFileSize) return;

    // Rotate log files
    for (let i = this.maxFiles - 1; i > 0; i--) {
      const oldFile = `${this.logFile}.${i}`;
      const newFile = `${this.logFile}.${i + 1}`;
      
      if (existsSync(oldFile)) {
        if (i === this.maxFiles - 1) {
          require("fs").unlinkSync(oldFile);
        } else {
          require("fs").renameSync(oldFile, newFile);
        }
      }
    }

    // Move current log to .1
    require("fs").renameSync(this.logFile, `${this.logFile}.1`);
  }

  private writeLog(log: AuditLog): void {
    this.rotateLogFile();
    
    const logEntry = JSON.stringify({
      ...log,
      timestamp: new Date().toISOString(),
    }) + "\n";

    try {
      appendFileSync(this.logFile, logEntry);
    } catch (error) {
      this.logger.error("Failed to write audit log:", error);
    }
  }

  public logAction(params: {
    action: string;
    resource: string;
    resourceId?: string;
    userId?: string;
    user?: string;
    details?: Record<string, any>;
    ip?: string;
    userAgent?: string;
    success?: boolean;
    error?: string;
    level?: "info" | "warn" | "error" | "debug";
  }): void {
    const auditLog: AuditLog = {
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

  public logUserAction(params: {
    userId: string;
    user: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: Record<string, any>;
    ip?: string;
    userAgent?: string;
    success?: boolean;
    error?: string;
  }): void {
    this.logAction({
      ...params,
      level: "info",
    });
  }

  public logSecurityEvent(params: {
    action: string;
    resource: string;
    resourceId?: string;
    userId?: string;
    user?: string;
    details?: Record<string, any>;
    ip?: string;
    userAgent?: string;
    success?: boolean;
    error?: string;
  }): void {
    this.logAction({
      ...params,
      level: "warn",
    });
  }

  public logSystemEvent(params: {
    action: string;
    resource: string;
    details?: Record<string, any>;
    success?: boolean;
    error?: string;
  }): void {
    this.logAction({
      ...params,
      level: "debug",
    });
  }

  public logError(params: {
    action: string;
    resource: string;
    resourceId?: string;
    userId?: string;
    user?: string;
    details?: Record<string, any>;
    ip?: string;
    userAgent?: string;
    error: string;
  }): void {
    this.logAction({
      ...params,
      success: false,
      level: "error",
    });
  }

  public getAuditLogs(params?: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    action?: string;
    resource?: string;
    limit?: number;
    offset?: number;
  }): AuditLog[] {
    try {
      if (!existsSync(this.logFile)) {
        return [];
      }

      const content = require("fs").readFileSync(this.logFile, "utf8");
      const lines = content.trim().split("\n").filter(line => line.length > 0);
      
      let logs: AuditLog[] = [];
      
      for (const line of lines) {
        try {
          const log = JSON.parse(line);
          logs.push(log);
        } catch (error) {
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
    } catch (error) {
      this.logger.error("Failed to read audit logs:", error);
      return [];
    }
  }

  public getAuditStats(): {
    totalLogs: number;
    logsByLevel: Record<string, number>;
    logsByAction: Record<string, number>;
    logsByResource: Record<string, number>;
    recentErrors: number;
    recentSecurityEvents: number;
  } {
    const logs = this.getAuditLogs({ limit: 10000 });
    
    const stats = {
      totalLogs: logs.length,
      logsByLevel: {} as Record<string, number>,
      logsByAction: {} as Record<string, number>,
      logsByResource: {} as Record<string, number>,
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

  public cleanup(): void {
    // Clean up old log files
    for (let i = this.maxFiles; i > 0; i--) {
      const logFile = `${this.logFile}.${i}`;
      if (existsSync(logFile)) {
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

export default AuditService;
