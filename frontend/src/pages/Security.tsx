import { useState, useEffect } from "react";
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Search,
  RefreshCw,
  Plus,
  Settings,
  AlertCircle,
  Activity,
  Clock,
  Zap,
} from "lucide-react";
import { apiUrl } from "@/utils/api";

interface SecurityScan {
  id: string;
  containerId: string;
  imageName: string;
  timestamp: string;
  status: "pending" | "running" | "completed" | "failed";
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

interface Vulnerability {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
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

interface ComplianceCheck {
  name: string;
  status: "pass" | "fail" | "warning";
  description: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  recommendation?: string;
}

interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rules: SecurityRule[];
  createdAt: string;
  updatedAt: string;
}

interface SecurityRule {
  type: "vulnerability" | "compliance" | "image" | "runtime";
  condition: string;
  action: "block" | "warn" | "log";
  severity: "critical" | "high" | "medium" | "low";
  enabled: boolean;
}

interface SecurityAlert {
  id: string;
  type: "vulnerability" | "compliance" | "policy" | "anomaly";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  containerId?: string;
  imageName?: string;
  timestamp: string;
  status: "open" | "acknowledged" | "resolved" | "false_positive";
  assignedTo?: string;
  metadata: Record<string, any>;
}

export default function Security() {
  const [scans, setScans] = useState<SecurityScan[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [policies, setPolicies] = useState<SecurityPolicy[]>([]);
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedScan, setSelectedScan] = useState<SecurityScan | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const fetchSecurityData = async () => {
    try {
      setLoading(true);

      const [scansResponse, alertsResponse, policiesResponse, metricsResponse] =
        await Promise.all([
          fetch(apiUrl("/api/security/scans")),
          fetch(apiUrl("/api/security/alerts?limit=100")),
          fetch(apiUrl("/api/security/policies")),
          fetch(apiUrl("/api/security/metrics")),
        ]);

      const parseResponse = async (response: Response) => {
        const text = await response.text();
        if (!response.ok) {
          throw new Error(text || "Failed to fetch security data");
        }
        try {
          return JSON.parse(text);
        } catch (parseError) {
          throw new Error(
            `Invalid JSON from ${response.url}. First 200 chars: ${text.slice(0, 200)}`,
          );
        }
      };

      const [scansData, alertsData, policiesData, metricsData] =
        await Promise.all([
          parseResponse(scansResponse),
          parseResponse(alertsResponse),
          parseResponse(policiesResponse),
          parseResponse(metricsResponse),
        ]);

      setScans(scansData.data || []);
      setAlerts(alertsData.data || []);
      setPolicies(policiesData.data || []);
      setMetrics(metricsData.data || null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch security data",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
    const interval = setInterval(fetchSecurityData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const handleStartScan = async (containerId: string, imageName: string) => {
    try {
      const response = await fetch(apiUrl("/api/security/scans"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId, imageName }),
      });

      if (!response.ok) {
        throw new Error("Failed to start security scan");
      }

      await fetchSecurityData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to start security scan",
      );
    }
  };

  const handleUpdateAlert = async (
    alertId: string,
    status: SecurityAlert["status"],
  ) => {
    try {
      const response = await fetch(apiUrl(`/api/security/alerts/${alertId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error("Failed to update alert");
      }

      await fetchSecurityData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update alert");
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-red-600 bg-red-50";
      case "high":
        return "text-orange-600 bg-orange-50";
      case "medium":
        return "text-yellow-600 bg-yellow-50";
      case "low":
        return "text-blue-600 bg-blue-50";
      case "info":
        return "text-gray-600 bg-gray-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
      case "pass":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "failed":
      case "fail":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "running":
        return <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />;
      case "pending":
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      default:
        return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getRiskLevel = (score: number) => {
    if (score >= 80)
      return { level: "Critical", color: "text-red-600 bg-red-50" };
    if (score >= 60)
      return { level: "High", color: "text-orange-600 bg-orange-50" };
    if (score >= 40)
      return { level: "Medium", color: "text-yellow-600 bg-yellow-50" };
    if (score >= 20) return { level: "Low", color: "text-blue-600 bg-blue-50" };
    return { level: "Minimal", color: "text-green-600 bg-green-50" };
  };

  const filteredAlerts = alerts.filter((alert) => {
    const matchesSeverity =
      filterSeverity === "all" || alert.severity === filterSeverity;
    const matchesStatus =
      filterStatus === "all" || alert.status === filterStatus;
    const matchesSearch =
      alert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSeverity && matchesStatus && matchesSearch;
  });

  const criticalVulnerabilities = scans.reduce(
    (sum, scan) => sum + scan.summary.critical,
    0,
  );
  const highVulnerabilities = scans.reduce(
    (sum, scan) => sum + scan.summary.high,
    0,
  );
  const openAlerts = alerts.filter((alert) => alert.status === "open").length;
  const criticalAlerts = alerts.filter(
    (alert) => alert.severity === "critical" && alert.status === "open",
  ).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Loading Security Data...
          </h2>
          <p className="text-gray-500">
            Fetching security scans and vulnerability data
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Error Loading Security Data
          </h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchSecurityData}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-8">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-light text-gray-900 tracking-tight">
                  Security Center
                </h1>
                <p className="text-gray-500 text-sm tracking-wide">
                  Container vulnerability scanning and compliance monitoring
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowPolicyModal(true)}
                  className="flex items-center px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors duration-200"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Policies
                </button>
                <button
                  onClick={() => setShowScanModal(true)}
                  className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Scan
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Security Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {criticalVulnerabilities}
                </div>
                <div className="text-sm text-gray-500">
                  Critical Vulnerabilities
                </div>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {highVulnerabilities}
                </div>
                <div className="text-sm text-gray-500">
                  High Vulnerabilities
                </div>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {openAlerts}
                </div>
                <div className="text-sm text-gray-500">Open Alerts</div>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg">
                <Shield className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {criticalAlerts}
                </div>
                <div className="text-sm text-gray-500">Critical Alerts</div>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <Zap className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Security Metrics */}
        {metrics && (
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl shadow-sm border border-gray-200 p-8 text-white">
            <div className="flex items-center space-x-3 mb-6">
              <Shield className="w-8 h-8" />
              <h2 className="text-2xl font-light">Security Posture</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Compliance Rate</h3>
                <div className="text-3xl font-light">
                  {metrics.complianceRate?.toFixed(1)}%
                </div>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Average Risk Score</h3>
                <div className="text-3xl font-light">
                  {metrics.averageRiskScore?.toFixed(1)}
                </div>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Total Scans</h3>
                <div className="text-3xl font-light">{metrics.totalScans}</div>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Active Scans</h3>
                <div className="text-3xl font-light">{metrics.activeScans}</div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Security Scans */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-light text-gray-900">
                Recent Security Scans
              </h2>
              <button className="text-blue-600 hover:text-blue-700 text-sm">
                View All
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {scans.slice(0, 5).map((scan) => {
                const risk = getRiskLevel(scan.riskScore);
                return (
                  <div
                    key={scan.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="p-2 bg-gray-100 rounded-lg">
                        <Shield className="w-4 h-4 text-gray-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">
                          {scan.imageName}
                        </div>
                        <div className="text-sm text-gray-500">
                          Container: {scan.containerId} •{" "}
                          {new Date(scan.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(scan.status)}`}
                      >
                        {getStatusIcon(scan.status)}
                        <span className="ml-1">{scan.status}</span>
                      </div>
                      <div
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${risk.color}`}
                      >
                        {risk.level} ({scan.riskScore})
                      </div>
                      <button
                        onClick={() => setSelectedScan(scan)}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Security Alerts */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-light text-gray-900">
                Security Alerts
              </h2>
            </div>
          </div>

          {/* Filters */}
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center space-x-4">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search alerts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
                <option value="false_positive">False Positive</option>
              </select>
            </div>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              {filteredAlerts.slice(0, 10).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <div
                      className={`p-2 rounded-lg ${getSeverityColor(alert.severity)}`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {alert.title}
                      </div>
                      <div className="text-sm text-gray-500">
                        {alert.description}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {alert.containerId &&
                          `Container: ${alert.containerId} • `}
                        {new Date(alert.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}
                    >
                      {alert.severity}
                    </div>
                    <select
                      value={alert.status}
                      onChange={(e) =>
                        handleUpdateAlert(
                          alert.id,
                          e.target.value as SecurityAlert["status"],
                        )
                      }
                      className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-gray-900"
                    >
                      <option value="open">Open</option>
                      <option value="acknowledged">Acknowledged</option>
                      <option value="resolved">Resolved</option>
                      <option value="false_positive">False Positive</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
