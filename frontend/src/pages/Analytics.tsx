import { useState, useEffect } from "react";
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  Activity,
  RefreshCw,
  Download,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Server,
  Cpu,
  HardDrive,
  Wifi,
  TrendingDown,
} from "lucide-react";
import { apiUrl, apiFetch } from "@/utils/api";
import { usePolling } from "@/hooks/usePolling";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorBanner,
  IconButton,
  IconTile,
  List,
  ListItem,
  LoadingState,
  PageHeader,
  StatTile,
  StatusBadge,
  ToggleChip,
  type Tone,
} from "@/components/ui";

interface PredictiveMetric {
  timestamp: string;
  actual: number;
  predicted: number;
  confidence: number;
  metric: string;
  horizon: number;
}

interface Anomaly {
  timestamp: string;
  metric: string;
  value: number;
  expected: number;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  containerId?: string;
  provider?: string;
}

interface Trend {
  metric: string;
  trend: "increasing" | "decreasing" | "stable" | "volatile";
  changeRate: number;
  prediction: {
    nextHour: number;
    nextDay: number;
    nextWeek: number;
  };
  confidence: number;
  factors: string[];
}

interface CapacityPlan {
  resource: string;
  current: number;
  projected: {
    oneMonth: number;
    threeMonths: number;
    sixMonths: number;
    oneYear: number;
  };
  recommendations: Array<{
    action: string;
    priority: "low" | "medium" | "high";
    timeline: string;
    estimatedCost?: number;
  }>;
  riskLevel: "low" | "medium" | "high";
}

interface CostForecast {
  period: string;
  actual: number;
  forecast: number;
  variance: number;
  confidence: number;
  breakdown: {
    compute: number;
    storage: number;
    network: number;
    other: number;
  };
}

export default function Analytics() {
  const [predictiveMetrics, setPredictiveMetrics] = useState<
    PredictiveMetric[]
  >([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [trends, setTrends] = useState<Trend[]>([]);
  const [capacityPlans, setCapacityPlans] = useState<CapacityPlan[]>([]);
  const [costForecasts, setCostForecasts] = useState<CostForecast[]>([]);
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<string>("cpu");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const exportAnalytics = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      predictiveMetrics,
      anomalies,
      trends,
      capacityPlans,
      costForecasts,
      insights,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `analytics-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const fetchAnalyticsData = async () => {
    try {

      // Fetch all analytics data in parallel
      const [
        metricsResponse,
        anomaliesResponse,
        trendsResponse,
        capacityResponse,
        costResponse,
        insightsResponse,
      ] = await Promise.all([
        apiFetch("/api/analytics/predictive-metrics"),
        apiFetch("/api/analytics/anomalies?limit=50"),
        apiFetch("/api/analytics/trends"),
        apiFetch("/api/analytics/capacity-planning"),
        apiFetch("/api/analytics/cost-forecast?period=30"),
        apiFetch("/api/analytics/insights"),
      ]);

      const [
        metricsData,
        anomaliesData,
        trendsData,
        capacityData,
        costData,
        insightsData,
      ] = await Promise.all([
        metricsResponse.json(),
        anomaliesResponse.json(),
        trendsResponse.json(),
        capacityResponse.json(),
        costResponse.json(),
        insightsResponse.json(),
      ]);

      setPredictiveMetrics(metricsData.data || []);
      setAnomalies(anomaliesData.data || []);
      setTrends(trendsData.data || []);
      setCapacityPlans(capacityData.data || []);
      setCostForecasts(costData.data || []);
      setInsights(insightsData.data || null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch analytics data",
      );
    } finally {
      setLoading(false);
    }
  };

  usePolling(fetchAnalyticsData, 30000, autoRefresh);

  const severityTone = (severity: string): Tone =>
    severity === "critical" || severity === "high"
      ? "danger"
      : severity === "medium"
        ? "warning"
        : severity === "low"
          ? "info"
          : "neutral";

  const riskTone = (risk: string): Tone =>
    risk === "high" ? "danger" : risk === "medium" ? "warning" : risk === "low" ? "success" : "neutral";

  const trendIcon = (trend: string) => {
    switch (trend) {
      case "increasing":
        return <IconTile tone="success"><TrendingUp /></IconTile>;
      case "decreasing":
        return <IconTile tone="danger"><TrendingDown /></IconTile>;
      case "volatile":
        return <IconTile tone="warning"><AlertTriangle /></IconTile>;
      default:
        return <IconTile tone="info"><Activity /></IconTile>;
    }
  };

  const resourceIcon = (resource: string) =>
    resource === "cpu" ? <Cpu /> : resource === "memory" ? <HardDrive /> : resource === "network" ? <Wifi /> : <Server />;

  if (loading) return <LoadingState label="Loading analytics…" />;

  const criticalAnomalies = anomalies.filter((a) => a.severity === "critical").length;
  const increasing = trends.filter((t) => t.trend === "increasing").length;
  const highRisk = capacityPlans.filter((p) => p.riskLevel === "high").length;
  const forecastTotal = costForecasts.reduce((sum, f) => sum + f.forecast, 0);

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      <PageHeader
        title="Analytics"
        subtitle="Anomalies, trends and capacity forecasts from collected metrics"
        actions={
          <>
            <ToggleChip
              label="Auto refresh"
              checked={autoRefresh}
              onChange={setAutoRefresh}
            />
            <IconButton label="Refresh" onClick={fetchAnalyticsData}>
              <RefreshCw className="w-4 h-4" />
            </IconButton>
            <Button icon={<Download className="w-4 h-4" />} onClick={exportAnalytics}>
              Export
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={fetchAnalyticsData} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          label="Critical anomalies"
          value={<span className="tabular">{criticalAnomalies}</span>}
          icon={<AlertTriangle />}
          tone={criticalAnomalies > 0 ? "danger" : "neutral"}
        />
        <StatTile
          label="Rising trends"
          value={<span className="tabular">{increasing}</span>}
          icon={<TrendingUp />}
          tone="success"
        />
        <StatTile
          label="High-risk resources"
          value={<span className="tabular">{highRisk}</span>}
          icon={<AlertCircle />}
          tone={highRisk > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="30-day cost forecast"
          value={<span className="tabular">${forecastTotal.toFixed(0)}</span>}
          icon={<DollarSign />}
          tone="accent"
        />
      </div>

      {insights && (insights.summary || insights.keyFindings?.length > 0) && (
        <Card>
          <CardHeader
            leading={<IconTile tone="accent"><Brain /></IconTile>}
            title="Insights"
            subtitle={
              typeof insights.confidence === "number"
                ? `${(insights.confidence * 100).toFixed(0)}% confidence`
                : undefined
            }
            actions={
              insights.riskLevel ? (
                <StatusBadge tone={riskTone(insights.riskLevel)} label={`${insights.riskLevel} risk`} />
              ) : undefined
            }
          />
          <CardBody>
            <div className="grid gap-4 md:grid-cols-2">
              {insights.summary && (
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{insights.summary}</p>
              )}
              {insights.keyFindings?.length > 0 && (
                <ul className="space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
                  {insights.keyFindings.map((finding: string, index: number) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
                      <span className="min-w-0">{finding}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      <section aria-labelledby="anomalies-heading" className="space-y-3">
        <h2 id="anomalies-heading" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Recent anomalies
        </h2>
        {anomalies.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CheckCircle />}
              title="No anomalies"
              description="Metrics are within their expected ranges."
            />
          </Card>
        ) : (
          <List>
            {anomalies.slice(0, 8).map((anomaly, index) => (
              <ListItem
                key={`${anomaly.timestamp}-${index}`}
                leading={<IconTile tone={severityTone(anomaly.severity)}><AlertTriangle /></IconTile>}
                title={anomaly.metric}
                subtitle={anomaly.description}
                meta={
                  <span className="text-xs text-gray-500 dark:text-gray-400 tabular">
                    {new Date(anomaly.timestamp).toLocaleString()}
                  </span>
                }
                actions={<StatusBadge tone={severityTone(anomaly.severity)} label={anomaly.severity} />}
              />
            ))}
          </List>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card padded={false}>
          <div className="px-4 pt-4 sm:px-5">
            <CardHeader title="Trends" subtitle="Rate of change and next-hour prediction" />
          </div>
          {trends.length === 0 ? (
            <EmptyState title="No trend data yet" description="Trends appear once enough metrics are collected." />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {trends.slice(0, 6).map((trend) => (
                <li key={trend.metric} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  {trendIcon(trend.trend)}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{trend.metric}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 tabular">
                      {trend.changeRate > 0 ? "+" : ""}
                      {trend.changeRate.toFixed(1)}% · {trend.trend}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 tabular">
                      {trend.prediction.nextHour.toFixed(1)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 tabular">
                      next hour · {trend.confidence.toFixed(0)}%
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card padded={false}>
          <div className="px-4 pt-4 sm:px-5">
            <CardHeader title="Capacity planning" subtitle="Current usage against the six-month projection" />
          </div>
          {capacityPlans.length === 0 ? (
            <EmptyState title="No capacity data yet" description="Projections appear once enough metrics are collected." />
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {capacityPlans.slice(0, 6).map((plan) => {
                const projected = Math.min(100, Math.max(0, plan.projected.sixMonths));
                const current = Math.min(100, Math.max(0, plan.current));
                return (
                  <li key={plan.resource} className="px-4 py-3 sm:px-5 space-y-2">
                    <div className="flex items-center gap-3">
                      <IconTile>{resourceIcon(plan.resource)}</IconTile>
                      <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100 capitalize truncate">
                        {plan.resource}
                      </p>
                      <StatusBadge tone={riskTone(plan.riskLevel)} label={`${plan.riskLevel} risk`} />
                    </div>
                    <div
                      className="relative h-1.5 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden"
                      role="img"
                      aria-label={`${plan.resource}: ${plan.current.toFixed(1)}% now, ${plan.projected.sixMonths.toFixed(1)}% in six months`}
                    >
                      <div className="absolute inset-y-0 left-0 bg-primary-200 dark:bg-primary-900" style={{ width: `${projected}%` }} />
                      <div className="absolute inset-y-0 left-0 bg-primary-600 dark:bg-primary-400" style={{ width: `${current}%` }} />
                    </div>
                    <p className="flex justify-between text-xs text-gray-500 dark:text-gray-400 tabular">
                      <span>Now {plan.current.toFixed(1)}%</span>
                      <span>6 months {plan.projected.sixMonths.toFixed(1)}%</span>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
