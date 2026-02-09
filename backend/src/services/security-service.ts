import { Logger } from "../utils/logger";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface SecurityScan {
  id: string;
  containerId: string;
  imageName: string;
  timestamp: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  vulnerabilities: Vulnerability[];
  compliance: ComplianceCheck[];
  riskScore: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
}

export interface Vulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  package: string;
  version: string;
  fixedVersion?: string;
  cveId?: string;
  cvssScore?: number;
  references: string[];
  category: string;
}

export interface ComplianceCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  description: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendation?: string;
}

export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rules: SecurityRule[];
  createdAt: string;
  updatedAt: string;
}

export interface SecurityRule {
  type: 'vulnerability' | 'compliance' | 'image' | 'runtime';
  condition: string;
  action: 'block' | 'warn' | 'log';
  severity: 'critical' | 'high' | 'medium' | 'low';
  enabled: boolean;
}

export interface SecurityAlert {
  id: string;
  type: 'vulnerability' | 'compliance' | 'policy' | 'anomaly';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  containerId?: string;
  imageName?: string;
  timestamp: string;
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
  assignedTo?: string;
  metadata: Record<string, any>;
}

export class SecurityService {
  private logger: Logger;
  private scans: Map<string, SecurityScan> = new Map();
  private policies: SecurityPolicy[] = [];
  private alerts: SecurityAlert[] = [];
  private scanQueue: string[] = [];
  private isScanning = false;

  constructor(logger: Logger) {
    this.logger = logger;
    this.initializeDefaultPolicies();
  }

  public async startSecurityScan(containerId: string, imageName: string): Promise<SecurityScan> {
    try {
      this.logger.info(`Starting security scan for container ${containerId}`);
      
      const scanId = `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const scan: SecurityScan = {
        id: scanId,
        containerId,
        imageName,
        timestamp: new Date().toISOString(),
        status: 'pending',
        vulnerabilities: [],
        compliance: [],
        riskScore: 0,
        summary: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          info: 0,
        },
      };

      this.scans.set(scanId, scan);
      this.scanQueue.push(scanId);
      
      // Start processing scan queue if not already running
      if (!this.isScanning) {
        this.processScanQueue();
      }

      this.logger.info(`Security scan ${scanId} queued for container ${containerId}`);
      return scan;
      
    } catch (error) {
      this.logger.error(`Error starting security scan for container ${containerId}:`, error);
      throw error;
    }
  }

  public async getScanStatus(scanId: string): Promise<SecurityScan | null> {
    return this.scans.get(scanId) || null;
  }

  public async getAllScans(): Promise<SecurityScan[]> {
    return Array.from(this.scans.values()).sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public async getContainerScans(containerId: string): Promise<SecurityScan[]> {
    return Array.from(this.scans.values())
      .filter(scan => scan.containerId === containerId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public async createPolicy(policy: Omit<SecurityPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<SecurityPolicy> {
    try {
      this.logger.info(`Creating security policy: ${policy.name}`);
      
      const newPolicy: SecurityPolicy = {
        ...policy,
        id: `policy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.policies.push(newPolicy);
      
      this.logger.info(`Security policy ${newPolicy.id} created successfully`);
      return newPolicy;
      
    } catch (error) {
      this.logger.error(`Error creating security policy:`, error);
      throw error;
    }
  }

  public async updatePolicy(policyId: string, updates: Partial<SecurityPolicy>): Promise<SecurityPolicy> {
    try {
      const policyIndex = this.policies.findIndex(p => p.id === policyId);
      if (policyIndex === -1) {
        throw new Error('Policy not found');
      }

      this.policies[policyIndex] = {
        ...this.policies[policyIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      this.logger.info(`Security policy ${policyId} updated successfully`);
      return this.policies[policyIndex];
      
    } catch (error) {
      this.logger.error(`Error updating security policy ${policyId}:`, error);
      throw error;
    }
  }

  public async deletePolicy(policyId: string): Promise<boolean> {
    try {
      const policyIndex = this.policies.findIndex(p => p.id === policyId);
      if (policyIndex === -1) {
        throw new Error('Policy not found');
      }

      this.policies.splice(policyIndex, 1);
      
      this.logger.info(`Security policy ${policyId} deleted successfully`);
      return true;
      
    } catch (error) {
      this.logger.error(`Error deleting security policy ${policyId}:`, error);
      return false;
    }
  }

  public async getPolicies(): Promise<SecurityPolicy[]> {
    return this.policies;
  }

  public async evaluatePolicies(containerId: string, imageName: string, scanId?: string): Promise<SecurityAlert[]> {
    try {
      this.logger.info(`Evaluating security policies for container ${containerId}`);
      
      const alerts: SecurityAlert[] = [];
      const scan = scanId ? this.scans.get(scanId) : null;

      for (const policy of this.policies.filter(p => p.enabled)) {
        for (const rule of policy.rules.filter(r => r.enabled)) {
          const alert = await this.evaluateRule(rule, containerId, imageName, scan);
          if (alert) {
            alerts.push(alert);
          }
        }
      }

      // Store alerts
      this.alerts.push(...alerts);
      
      // Keep only last 1000 alerts
      if (this.alerts.length > 1000) {
        this.alerts = this.alerts.slice(-1000);
      }

      this.logger.info(`Policy evaluation completed. Generated ${alerts.length} alerts`);
      return alerts;
      
    } catch (error) {
      this.logger.error(`Error evaluating policies for container ${containerId}:`, error);
      throw error;
    }
  }

  public async getAlerts(severity?: string, status?: string, limit: number = 100): Promise<SecurityAlert[]> {
    let alerts = this.alerts;

    if (severity) {
      alerts = alerts.filter(a => a.severity === severity);
    }

    if (status) {
      alerts = alerts.filter(a => a.status === status);
    }

    return alerts
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  public async updateAlertStatus(alertId: string, status: SecurityAlert['status'], assignedTo?: string): Promise<boolean> {
    try {
      const alert = this.alerts.find(a => a.id === alertId);
      if (!alert) {
        throw new Error('Alert not found');
      }

      alert.status = status;
      if (assignedTo) {
        alert.assignedTo = assignedTo;
      }

      this.logger.info(`Alert ${alertId} status updated to ${status}`);
      return true;
      
    } catch (error) {
      this.logger.error(`Error updating alert ${alertId} status:`, error);
      return false;
    }
  }

  public async getSecurityMetrics(): Promise<{
    totalScans: number;
    activeScans: number;
    totalAlerts: number;
    openAlerts: number;
    criticalAlerts: number;
    averageRiskScore: number;
    complianceRate: number;
  }> {
    const totalScans = this.scans.size;
    const activeScans = Array.from(this.scans.values()).filter(s => s.status === 'running').length;
    const totalAlerts = this.alerts.length;
    const openAlerts = this.alerts.filter(a => a.status === 'open').length;
    const criticalAlerts = this.alerts.filter(a => a.severity === 'critical' && a.status === 'open').length;
    
    const completedScans = Array.from(this.scans.values()).filter(s => s.status === 'completed');
    const averageRiskScore = completedScans.length > 0 
      ? completedScans.reduce((sum, s) => sum + s.riskScore, 0) / completedScans.length 
      : 0;

    const totalComplianceChecks = completedScans.reduce((sum, s) => sum + s.compliance.length, 0);
    const passedComplianceChecks = completedScans.reduce((sum, s) => 
      sum + s.compliance.filter(c => c.status === 'pass').length, 0);
    const complianceRate = totalComplianceChecks > 0 ? (passedComplianceChecks / totalComplianceChecks) * 100 : 0;

    return {
      totalScans,
      activeScans,
      totalAlerts,
      openAlerts,
      criticalAlerts,
      averageRiskScore,
      complianceRate,
    };
  }

  private async processScanQueue(): Promise<void> {
    if (this.isScanning || this.scanQueue.length === 0) {
      return;
    }

    this.isScanning = true;

    while (this.scanQueue.length > 0) {
      const scanId = this.scanQueue.shift()!;
      const scan = this.scans.get(scanId);
      
      if (!scan || scan.status !== 'pending') {
        continue;
      }

      try {
        await this.performSecurityScan(scan);
      } catch (error) {
        this.logger.error(`Error performing scan ${scanId}:`, error);
        scan.status = 'failed';
      }
    }

    this.isScanning = false;
  }

  private async performSecurityScan(scan: SecurityScan): Promise<void> {
    try {
      this.logger.info(`Performing security scan ${scan.id}`);
      
      scan.status = 'running';

      const vulnerabilities = await this.runTrivyScan(scan.imageName);
      scan.vulnerabilities = vulnerabilities;
      scan.compliance = [];
      scan.summary = this.calculateVulnerabilitySummary(scan.vulnerabilities);
      scan.riskScore = this.calculateRiskScore(scan.vulnerabilities, scan.compliance);
      scan.status = 'completed';

      await this.generateScanAlerts(scan);
      
      this.logger.info(`Security scan ${scan.id} completed successfully`);
      
    } catch (error) {
      scan.status = 'failed';
      throw error;
    }
  }

  private async runTrivyScan(imageName: string): Promise<Vulnerability[]> {
    const trivyPath = process.env.TRIVY_PATH || "trivy";
    try {
      const { stdout } = await execFileAsync(
        trivyPath,
        ["image", "--quiet", "--format", "json", imageName],
        { maxBuffer: 10 * 1024 * 1024 },
      );

      const data = JSON.parse(stdout || "{}");
      const results = Array.isArray(data.Results) ? data.Results : [];
      const vulns: Vulnerability[] = [];

      for (const result of results) {
        const vulnerabilities = Array.isArray(result.Vulnerabilities)
          ? result.Vulnerabilities
          : [];
        for (const vuln of vulnerabilities) {
          vulns.push({
            id: vuln.VulnerabilityID || `vuln-${Date.now()}`,
            severity: (vuln.Severity || "info").toLowerCase(),
            title: vuln.Title || vuln.VulnerabilityID || "Vulnerability",
            description: vuln.Description || "",
            package: vuln.PkgName || "unknown",
            version: vuln.InstalledVersion || "unknown",
            fixedVersion: vuln.FixedVersion,
            cveId: vuln.VulnerabilityID,
            cvssScore: this.extractCvssScore(vuln),
            references: vuln.References || [],
            category: vuln.Class || "Package",
          });
        }
      }

      return vulns;
    } catch (error) {
      this.logger.error(`Trivy scan failed for ${imageName}:`, error);
      throw new Error(
        `Trivy scan failed. Ensure trivy is installed in the backend container.`,
      );
    }
  }

  private extractCvssScore(vuln: any): number | undefined {
    const cvss = vuln.CVSS || {};
    const sources = Object.values(cvss) as any[];
    for (const source of sources) {
      if (source && typeof source.V3Score === "number") {
        return source.V3Score;
      }
      if (source && typeof source.V2Score === "number") {
        return source.V2Score;
      }
    }
    return undefined;
  }

  private calculateVulnerabilitySummary(vulnerabilities: Vulnerability[]): SecurityScan['summary'] {
    const summary = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    vulnerabilities.forEach(vuln => {
      summary[vuln.severity]++;
    });

    return summary;
  }

  private calculateRiskScore(vulnerabilities: Vulnerability[], compliance: ComplianceCheck[]): number {
    // Calculate risk score based on vulnerabilities and compliance failures
    const severityWeights = {
      critical: 10,
      high: 7,
      medium: 4,
      low: 2,
      info: 1,
    };

    const vulnerabilityScore = vulnerabilities.reduce((sum, vuln) => 
      sum + severityWeights[vuln.severity], 0);

    const complianceFailures = compliance.filter(c => c.status === 'fail').length;
    const complianceScore = complianceFailures * 5;

    // Normalize to 0-100 scale
    const totalScore = vulnerabilityScore + complianceScore;
    return Math.min(100, totalScore);
  }

  private async generateScanAlerts(scan: SecurityScan): Promise<void> {
    // Generate alerts for critical and high vulnerabilities
    const criticalVulns = scan.vulnerabilities.filter(v => v.severity === 'critical');
    const highVulns = scan.vulnerabilities.filter(v => v.severity === 'high');

    for (const vuln of criticalVulns) {
      this.alerts.push({
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'vulnerability',
        severity: 'critical',
        title: `Critical vulnerability: ${vuln.title}`,
        description: `Critical vulnerability found in ${vuln.package}:${vuln.version}`,
        containerId: scan.containerId,
        imageName: scan.imageName,
        timestamp: new Date().toISOString(),
        status: 'open',
        metadata: {
          vulnerabilityId: vuln.id,
          cveId: vuln.cveId,
          cvssScore: vuln.cvssScore,
        },
      });
    }

    for (const vuln of highVulns) {
      this.alerts.push({
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'vulnerability',
        severity: 'high',
        title: `High severity vulnerability: ${vuln.title}`,
        description: `High severity vulnerability found in ${vuln.package}:${vuln.version}`,
        containerId: scan.containerId,
        imageName: scan.imageName,
        timestamp: new Date().toISOString(),
        status: 'open',
        metadata: {
          vulnerabilityId: vuln.id,
          cveId: vuln.cveId,
          cvssScore: vuln.cvssScore,
        },
      });
    }

    // Generate alerts for compliance failures
    const complianceFailures = scan.compliance.filter(c => c.status === 'fail' && c.severity === 'critical');
    for (const check of complianceFailures) {
      this.alerts.push({
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'compliance',
        severity: 'critical',
        title: `Compliance failure: ${check.name}`,
        description: check.description,
        containerId: scan.containerId,
        imageName: scan.imageName,
        timestamp: new Date().toISOString(),
        status: 'open',
        metadata: {
          complianceCheck: check.name,
          category: check.category,
        },
      });
    }
  }

  private async evaluateRule(
    rule: SecurityRule,
    containerId: string,
    imageName: string,
    scan?: SecurityScan
  ): Promise<SecurityAlert | null> {
    // Mock rule evaluation - in real implementation, this would evaluate actual conditions
    if (Math.random() > 0.8) { // 20% chance of rule violation
      return {
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: 'policy',
        severity: rule.severity,
        title: `Security policy violation: ${rule.condition}`,
        description: `Container ${containerId} violated security rule: ${rule.condition}`,
        containerId,
        imageName,
        timestamp: new Date().toISOString(),
        status: 'open',
        metadata: {
          ruleType: rule.type,
          condition: rule.condition,
          action: rule.action,
        },
      };
    }

    return null;
  }

  private initializeDefaultPolicies(): void {
    // Initialize with default security policies
    const defaultPolicies: Omit<SecurityPolicy, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        name: 'Critical Vulnerability Policy',
        description: 'Block containers with critical vulnerabilities',
        enabled: true,
        rules: [
          {
            type: 'vulnerability',
            condition: 'severity == "critical"',
            action: 'block',
            severity: 'critical',
            enabled: true,
          },
        ],
      },
      {
        name: 'Compliance Policy',
        description: 'Ensure compliance with security standards',
        enabled: true,
        rules: [
          {
            type: 'compliance',
            condition: 'status == "fail" AND severity == "critical"',
            action: 'warn',
            severity: 'high',
            enabled: true,
          },
        ],
      },
      {
        name: 'Image Security Policy',
        description: 'Validate image security before deployment',
        enabled: true,
        rules: [
          {
            type: 'image',
            condition: 'contains("root")',
            action: 'warn',
            severity: 'medium',
            enabled: true,
          },
        ],
      },
    ];

    defaultPolicies.forEach(policy => {
      this.policies.push({
        ...policy,
        id: `policy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
  }

  private getVulnerabilityCategory(): string {
    return "Package";
  }
}
