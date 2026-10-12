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
import { apiUrl, apiFetch } from "@/utils/api";
import { usePolling } from "@/hooks/usePolling";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  ErrorBanner,
  IconButton,
  IconTile,
  List,
  ListItem,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  StatTile,
  StatusBadge,
  Toolbar,
  type DescriptionItem,
  type Tone,
} from "@/components/ui";

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

      const [scansResponse, alertsResponse, policiesResponse, metricsResponse] =
        await Promise.all([
          apiFetch("/api/security/scans"),
          apiFetch("/api/security/alerts?limit=100"),
          apiFetch("/api/security/policies"),
          apiFetch("/api/security/metrics"),
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

  usePolling(fetchSecurityData, 30000);

  const handleStartScan = async (containerId: string, imageName: string) => {
    try {
      const response = await apiFetch("/api/security/scans", {
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
      const response = await apiFetch(`/api/security/alerts/${alertId}`, {
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

  const severityTone = (severity: string): Tone =>
    severity === "critical" || severity === "high"
      ? "danger"
      : severity === "medium"
        ? "warning"
        : severity === "low"
          ? "info"
          : "neutral";

  const scanTone = (status: SecurityScan["status"]): Tone =>
    status === "completed" ? "success" : status === "failed" ? "danger" : status === "running" ? "info" : "warning";

  const riskOf = (score: number): { label: string; tone: Tone } => {
    if (score >= 80) return { label: "Critical", tone: "danger" };
    if (score >= 60) return { label: "High", tone: "danger" };
    if (score >= 40) return { label: "Medium", tone: "warning" };
    if (score >= 20) return { label: "Low", tone: "info" };
    return { label: "Minimal", tone: "success" };
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

  const criticalVulnerabilities = scans.reduce((sum, scan) => sum + (scan.summary?.critical || 0), 0);
  const highVulnerabilities = scans.reduce((sum, scan) => sum + (scan.summary?.high || 0), 0);
  const openAlerts = alerts.filter((alert) => alert.status === "open").length;
  const criticalAlerts = alerts.filter(
    (alert) => alert.severity === "critical" && alert.status === "open",
  ).length;

  if (loading) return <LoadingState label="Loading security data…" />;

  const posture: DescriptionItem[] = metrics
    ? [
        { label: "Compliance rate", value: <span className="tabular">{metrics.complianceRate?.toFixed(1) ?? "–"}%</span> },
        { label: "Average risk score", value: <span className="tabular">{metrics.averageRiskScore?.toFixed(1) ?? "–"}</span> },
        { label: "Total scans", value: <span className="tabular">{metrics.totalScans ?? scans.length}</span> },
        { label: "Active scans", value: <span className="tabular">{metrics.activeScans ?? 0}</span> },
      ]
    : [];

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      <PageHeader
        title="Security"
        subtitle="Image vulnerability scans, compliance checks and alerts"
        actions={
          <>
            <IconButton label="Refresh" onClick={fetchSecurityData}>
              <RefreshCw className="w-4 h-4" />
            </IconButton>
            <Button icon={<Settings className="w-4 h-4" />} onClick={() => setShowPolicyModal(true)}>
              Policies
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={fetchSecurityData} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          label="Critical vulnerabilities"
          value={<span className="tabular">{criticalVulnerabilities}</span>}
          icon={<AlertTriangle />}
          tone={criticalVulnerabilities > 0 ? "danger" : "neutral"}
        />
        <StatTile
          label="High vulnerabilities"
          value={<span className="tabular">{highVulnerabilities}</span>}
          icon={<AlertCircle />}
          tone={highVulnerabilities > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Open alerts"
          value={<span className="tabular">{openAlerts}</span>}
          icon={<Shield />}
          tone={openAlerts > 0 ? "warning" : "success"}
        />
        <StatTile
          label="Critical open alerts"
          value={<span className="tabular">{criticalAlerts}</span>}
          icon={<Zap />}
          tone={criticalAlerts > 0 ? "danger" : "neutral"}
        />
      </div>

      {metrics && (
        <Card>
          <CardHeader
            leading={<IconTile tone="accent"><Shield /></IconTile>}
            title="Security posture"
            subtitle="Across all completed scans"
          />
          <CardBody>
            <DescriptionList items={posture} layout="stacked" columns={2} />
          </CardBody>
        </Card>
      )}

      <section aria-labelledby="scans-heading" className="space-y-3">
        <h2 id="scans-heading" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Recent scans
        </h2>
        {scans.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Shield />}
              title="No scans yet"
              description="Scans run when images are built or pulled."
            />
          </Card>
        ) : (
          <List>
            {scans.slice(0, 8).map((scan) => {
              const risk = riskOf(scan.riskScore);
              return (
                <ListItem
                  key={scan.id}
                  leading={<IconTile tone={risk.tone}><Shield /></IconTile>}
                  title={<span className="font-mono text-[13px] break-all">{scan.imageName}</span>}
                  subtitle={new Date(scan.timestamp).toLocaleString()}
                  meta={
                    <>
                      <StatusBadge tone={scanTone(scan.status)} label={scan.status} busy={scan.status === "running"} />
                      <Badge tone={risk.tone} title="Risk score">
                        {risk.label} · {scan.riskScore}
                      </Badge>
                    </>
                  }
                  actions={
                    <IconButton label={`View scan of ${scan.imageName}`} onClick={() => setSelectedScan(scan)}>
                      <Eye className="w-4 h-4" />
                    </IconButton>
                  }
                />
              );
            })}
          </List>
        )}
      </section>

      <section aria-labelledby="alerts-heading" className="space-y-3">
        <h2 id="alerts-heading" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Alerts
        </h2>
        <Toolbar>
          <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search alerts…" />
          <select
            aria-label="Severity"
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value)}
            className="field w-auto"
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            aria-label="Status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="field w-auto"
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="false_positive">False positive</option>
          </select>
        </Toolbar>
        {filteredAlerts.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CheckCircle />}
              title={alerts.length === 0 ? "No alerts" : "No matching alerts"}
              description={alerts.length === 0 ? "Nothing needs attention." : "Try a different search or filter."}
            />
          </Card>
        ) : (
          <List>
            {filteredAlerts.slice(0, 20).map((alert) => (
              <ListItem
                key={alert.id}
                leading={<IconTile tone={severityTone(alert.severity)}><AlertTriangle /></IconTile>}
                title={alert.title}
                subtitle={alert.description}
                meta={
                  <>
                    <StatusBadge tone={severityTone(alert.severity)} label={alert.severity} />
                    <span className="text-xs text-gray-500 dark:text-gray-400 tabular">
                      {new Date(alert.timestamp).toLocaleString()}
                    </span>
                  </>
                }
                actions={
                  <select
                    aria-label={`Status of ${alert.title}`}
                    value={alert.status}
                    onChange={(e) => handleUpdateAlert(alert.id, e.target.value as SecurityAlert["status"])}
                    className="field h-8 w-auto text-xs"
                  >
                    <option value="open">Open</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="resolved">Resolved</option>
                    <option value="false_positive">False positive</option>
                  </select>
                }
              />
            ))}
          </List>
        )}
      </section>

      <Modal
        open={showPolicyModal}
        onClose={() => setShowPolicyModal(false)}
        title="Security policies"
        footer={<Button onClick={() => setShowPolicyModal(false)}>Close</Button>}
      >
        {policies.length === 0 ? (
          <EmptyState icon={<Settings />} title="No policies" description="No security policies are defined on this server." />
        ) : (
          <ul className="space-y-3">
            {policies.map((policy) => (
              <li key={policy.id} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{policy.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{policy.description}</p>
                  </div>
                  <StatusBadge tone={policy.enabled ? "success" : "neutral"} label={policy.enabled ? "enabled" : "disabled"} />
                </div>
                {policy.rules?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {policy.rules.map((rule, i) => (
                      <Badge key={i} tone={rule.action === "block" ? "danger" : rule.action === "warn" ? "warning" : "neutral"}>
                        {rule.action} · {rule.type}
                      </Badge>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {selectedScan && (
        <Modal
          open
          wide
          onClose={() => setSelectedScan(null)}
          title={selectedScan.imageName}
          footer={<Button onClick={() => setSelectedScan(null)}>Close</Button>}
        >
          <div className="space-y-5">
            <DescriptionList
              layout="stacked"
              columns={2}
              items={[
                { label: "Status", value: <StatusBadge tone={scanTone(selectedScan.status)} label={selectedScan.status} /> },
                { label: "Risk", value: <Badge tone={riskOf(selectedScan.riskScore).tone}>{riskOf(selectedScan.riskScore).label} · {selectedScan.riskScore}</Badge> },
                { label: "Scanned", value: new Date(selectedScan.timestamp).toLocaleString() },
                { label: "Container", value: <span className="font-mono text-xs break-all">{selectedScan.containerId || "–"}</span> },
              ]}
            />
            <div className="flex flex-wrap gap-1.5">
              {(["critical", "high", "medium", "low", "info"] as const).map((level) => (
                <Badge key={level} tone={severityTone(level)}>
                  {level} <span className="tabular">{selectedScan.summary?.[level] ?? 0}</span>
                </Badge>
              ))}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Vulnerabilities</h3>
              {selectedScan.vulnerabilities?.length ? (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-800">
                  {selectedScan.vulnerabilities.slice(0, 50).map((v) => (
                    <li key={v.id} className="p-3 flex items-start gap-3">
                      <StatusBadge tone={severityTone(v.severity)} label={v.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {v.cveId ? `${v.cveId}: ` : ""}
                          {v.title}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all">
                          {v.package}@{v.version}
                          {v.fixedVersion ? ` → fixed in ${v.fixedVersion}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No vulnerabilities found.</p>
              )}
            </div>
            {selectedScan.compliance?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Compliance</h3>
                <ul className="space-y-2">
                  {selectedScan.compliance.map((check, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <StatusBadge
                        tone={check.status === "pass" ? "success" : check.status === "fail" ? "danger" : "warning"}
                        label={check.status}
                      />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 dark:text-gray-100">{check.name}</p>
                        {check.recommendation && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{check.recommendation}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
