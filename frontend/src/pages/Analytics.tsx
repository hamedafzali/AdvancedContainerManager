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
} from "lucide-react";
import { apiUrl } from "@/utils/api";

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
  const [timeRange, setTimeRange] = useState<string>("7d");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);

      // Fetch all analytics data in parallel
      const [
        metricsResponse,
        anomaliesResponse,
        trendsResponse,
        capacityResponse,
        costResponse,
        insightsResponse,
      ] = await Promise.all([
        fetch(apiUrl("/api/analytics/predictive-metrics")),
        fetch(apiUrl("/api/analytics/anomalies?limit=50")),
        fetch(apiUrl("/api/analytics/trends")),
        fetch(apiUrl("/api/analytics/capacity-planning")),
        fetch(apiUrl("/api/analytics/cost-forecast?period=30")),
        fetch(apiUrl("/api/analytics/insights")),
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

  useEffect(() => {
    fetchAnalyticsData();

    if (autoRefresh) {
      const interval = setInterval(fetchAnalyticsData, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

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
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "increasing":
        return <TrendingUp className="w-4 h-4 text-green-600" />;
      case "decreasing":
        return <TrendingUp className="w-4 h-4 text-red-600 rotate-180" />;
      case "stable":
        return <Activity className="w-4 h-4 text-blue-600" />;
      case "volatile":
        return <AlertTriangle className="w-4 h-4 text-orange-600" />;
      default:
        return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "high":
        return "text-red-600 bg-red-50";
      case "medium":
        return "text-yellow-600 bg-yellow-50";
      case "low":
        return "text-green-600 bg-green-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Loading Analytics...
          </h2>
          <p className="text-gray-500">
            Fetching predictive insights and analytics
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Error Loading Analytics
          </h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchAnalyticsData}
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
                  Advanced Analytics
                </h1>
                <p className="text-gray-500 text-sm tracking-wide">
                  AI-powered insights and predictive analytics
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <select
                  value={timeRange}
                  onChange={(e) => setTimeRange(e.target.value)}
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="1d">Last 24 Hours</option>
                  <option value="7d">Last 7 Days</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                </select>
                <button
                  onClick={() => setAutoRefresh(!autoRefresh)}
                  className={`px-4 py-2 rounded-lg transition-colors duration-200 ${
                    autoRefresh
                      ? "bg-green-600 hover:bg-green-700 text-white"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  }`}
                >
                  <RefreshCw
                    className={`w-4 h-4 ${autoRefresh ? "animate-spin" : ""}`}
                  />
                </button>
                <button className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* AI Insights Summary */}
        {insights && (
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-sm border border-gray-200 p-8 text-white">
            <div className="flex items-center space-x-3 mb-6">
              <Brain className="w-8 h-8" />
              <h2 className="text-2xl font-light">AI Insights</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Summary</h3>
                <p className="text-blue-100 text-sm">{insights.summary}</p>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Key Findings</h3>
                <ul className="text-blue-100 text-sm space-y-1">
                  {insights.keyFindings?.map(
                    (finding: string, index: number) => (
                      <li key={index} className="flex items-start">
                        <CheckCircle className="w-3 h-3 mr-2 mt-1 flex-shrink-0" />
                        {finding}
                      </li>
                    ),
                  )}
                </ul>
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Risk Level</h3>
                <div
                  className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    insights.riskLevel === "high"
                      ? "bg-red-500"
                      : insights.riskLevel === "medium"
                        ? "bg-yellow-500"
                        : "bg-green-500"
                  }`}
                >
                  {insights.riskLevel?.toUpperCase()}
                </div>
                <p className="text-blue-100 text-sm mt-2">
                  Confidence: {(insights.confidence * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {anomalies.filter((a) => a.severity === "critical").length}
                </div>
                <div className="text-sm text-gray-500">Critical Anomalies</div>
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
                  {trends.filter((t) => t.trend === "increasing").length}
                </div>
                <div className="text-sm text-gray-500">Increasing Trends</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {capacityPlans.filter((p) => p.riskLevel === "high").length}
                </div>
                <div className="text-sm text-gray-500">High Risk Resources</div>
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
                  $
                  {costForecasts
                    .reduce((sum, f) => sum + f.forecast, 0)
                    .toFixed(0)}
                </div>
                <div className="text-sm text-gray-500">30-Day Forecast</div>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Anomalies */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-light text-gray-900">
                Recent Anomalies
              </h2>
              <button className="text-blue-600 hover:text-blue-700 text-sm">
                View All
              </button>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {anomalies.slice(0, 5).map((anomaly, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <div
                      className={`p-2 rounded-lg ${getSeverityColor(anomaly.severity)}`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {anomaly.metric}
                      </div>
                      <div className="text-sm text-gray-500">
                        {anomaly.description}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(anomaly.severity)}`}
                    >
                      {anomaly.severity}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(anomaly.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Trends Analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-light text-gray-900">
                Trend Analysis
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {trends.slice(0, 4).map((trend, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      {getTrendIcon(trend.trend)}
                      <div>
                        <div className="font-medium text-gray-900">
                          {trend.metric}
                        </div>
                        <div className="text-sm text-gray-500">
                          {trend.changeRate > 0 ? "+" : ""}
                          {trend.changeRate.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-gray-900">
                        Next Hour: {trend.prediction.nextHour.toFixed(1)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {trend.confidence.toFixed(1)}% confidence
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-light text-gray-900">
                Capacity Planning
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                {capacityPlans.slice(0, 4).map((plan, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        {plan.resource === "cpu" && (
                          <Cpu className="w-4 h-4 text-gray-600" />
                        )}
                        {plan.resource === "memory" && (
                          <HardDrive className="w-4 h-4 text-gray-600" />
                        )}
                        {plan.resource === "storage" && (
                          <Server className="w-4 h-4 text-gray-600" />
                        )}
                        {plan.resource === "network" && (
                          <Wifi className="w-4 h-4 text-gray-600" />
                        )}
                        <span className="font-medium text-gray-900 capitalize">
                          {plan.resource}
                        </span>
                      </div>
                      <div
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskColor(plan.riskLevel)}`}
                      >
                        {plan.riskLevel}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Current:</span>
                        <span className="ml-2 font-medium">
                          {plan.current.toFixed(1)}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">6 Months:</span>
                        <span className="ml-2 font-medium">
                          {plan.projected.sixMonths.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
