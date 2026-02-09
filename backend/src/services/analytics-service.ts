import { Logger } from "../utils/logger";
import { MetricsCollector } from "./metrics-collector";
import { SystemMetrics } from "../types";

export interface PredictiveMetric {
  timestamp: string;
  actual: number;
  predicted: number;
  confidence: number;
  metric: string;
  horizon: number; // minutes ahead
}

export interface AnomalyDetection {
  timestamp: string;
  metric: string;
  value: number;
  expected: number;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  containerId?: string;
  provider?: string;
}

export interface TrendAnalysis {
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

export interface CapacityPlanning {
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

export interface CostForecast {
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

export class AnalyticsService {
  private logger: Logger;
  private metricsCollector?: MetricsCollector;
  private predictiveMetrics: PredictiveMetric[] = [];
  private anomalies: AnomalyDetection[] = [];
  private trends: TrendAnalysis[] = [];
  private capacityPlans: CapacityPlanning[] = [];
  private costForecasts: CostForecast[] = [];

  constructor(logger: Logger, metricsCollector?: MetricsCollector) {
    this.logger = logger;
    this.metricsCollector = metricsCollector;
  }

  public async generatePredictiveMetrics(
    metric: string,
    horizon: number = 60,
  ): Promise<PredictiveMetric[]> {
    this.logger.info(
      `Generating predictive metrics for ${metric} with ${horizon}min horizon`,
    );

    const history = this.getHistory(metric);
    if (history.length < 3) {
      throw new Error("Not enough historical data to generate predictions");
    }

    const { slope, intercept, intervalMinutes } = this.computeTrend(history);
    const predictions: PredictiveMetric[] = [];
    const now = new Date();

    for (let i = 1; i <= horizon; i += 5) {
      const timestamp = new Date(now.getTime() + i * 5 * 60000);
      const minutesAhead = i * 5;
      const predicted = intercept + slope * (minutesAhead / intervalMinutes);
      predictions.push({
        timestamp: timestamp.toISOString(),
        actual: 0,
        predicted: Math.max(0, predicted),
        confidence: this.computeConfidence(history),
        metric,
        horizon: i,
      });
    }

    this.predictiveMetrics.push(...predictions);
    if (this.predictiveMetrics.length > 1000) {
      this.predictiveMetrics = this.predictiveMetrics.slice(-1000);
    }

    return predictions;
  }

  public async detectAnomalies(
    metrics: Array<{ metric: string; value: number; timestamp: string; containerId?: string; provider?: string }>,
  ): Promise<AnomalyDetection[]> {
    this.logger.info(`Detecting anomalies in ${metrics.length} metrics`);

    const detected: AnomalyDetection[] = [];
    for (const metricData of metrics) {
      const anomaly = this.analyzeAnomaly(metricData);
      if (anomaly) {
        detected.push(anomaly);
      }
    }

    this.anomalies.push(...detected);
    if (this.anomalies.length > 500) {
      this.anomalies = this.anomalies.slice(-500);
    }

    return detected;
  }

  public async analyzeTrends(
    metric: string,
    period: number = 7,
  ): Promise<TrendAnalysis> {
    this.logger.info(`Analyzing trends for ${metric} over ${period} days`);

    const history = this.getHistory(metric);
    if (history.length < 3) {
      throw new Error("Not enough historical data to analyze trends");
    }

    const { slope, intercept, intervalMinutes } = this.computeTrend(history);
    const trend = this.classifyTrend(slope);
    const changeRate = slope * (60 / intervalMinutes);
    const currentValue = history[history.length - 1].value;

    const trendResult: TrendAnalysis = {
      metric,
      trend,
      changeRate,
      prediction: {
        nextHour: Math.max(0, intercept + slope * (60 / intervalMinutes)),
        nextDay: Math.max(0, intercept + slope * (24 * 60 / intervalMinutes)),
        nextWeek: Math.max(0, intercept + slope * (7 * 24 * 60 / intervalMinutes)),
      },
      confidence: this.computeConfidence(history),
      factors: this.identifyTrendFactors(metric, currentValue),
    };

    const existingIndex = this.trends.findIndex((t) => t.metric === metric);
    if (existingIndex >= 0) {
      this.trends[existingIndex] = trendResult;
    } else {
      this.trends.push(trendResult);
    }

    return trendResult;
  }

  public async generateCapacityPlanning(
    resources: string[] = ["cpu", "memory", "storage", "network"],
  ): Promise<CapacityPlanning[]> {
    this.logger.info("Generating capacity planning recommendations");

    const plans: CapacityPlanning[] = [];
    for (const resource of resources) {
      const history = this.getHistory(resource);
      if (history.length < 3) {
        continue;
      }
      const { slope, intervalMinutes } = this.computeTrend(history);
      const current = history[history.length - 1].value;
      const monthlyGrowth = slope * (30 * 24 * 60 / intervalMinutes);

      const plan: CapacityPlanning = {
        resource,
        current,
        projected: {
          oneMonth: current + monthlyGrowth,
          threeMonths: current + monthlyGrowth * 3,
          sixMonths: current + monthlyGrowth * 6,
          oneYear: current + monthlyGrowth * 12,
        },
        recommendations: [
          {
            action: `Review ${resource} utilization and adjust limits`,
            priority: current > 80 ? "high" : "medium",
            timeline: "1-3 months",
          },
        ],
        riskLevel: current > 80 ? "high" : current > 60 ? "medium" : "low",
      };

      plans.push(plan);
    }

    this.capacityPlans = plans;
    return plans;
  }

  public async forecastCosts(period: number = 30): Promise<CostForecast[]> {
    this.logger.info(`Forecasting costs for next ${period} days`);

    const cpuHistory = this.getHistory("cpu");
    const memHistory = this.getHistory("memory");
    const base =
      (cpuHistory[cpuHistory.length - 1]?.value || 0) * 2 +
      (memHistory[memHistory.length - 1]?.value || 0) * 1.5;

    const forecasts: CostForecast[] = [];
    for (let i = 1; i <= period; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);
      const forecast = Math.max(0, base * (1 + i / (period * 10)));
      forecasts.push({
        period: date.toISOString().split("T")[0],
        actual: 0,
        forecast,
        variance: forecast - base,
        confidence: this.computeConfidence([...cpuHistory, ...memHistory]),
        breakdown: {
          compute: forecast * 0.6,
          storage: forecast * 0.2,
          network: forecast * 0.15,
          other: forecast * 0.05,
        },
      });
    }

    this.costForecasts = forecasts;
    return forecasts;
  }

  public getPredictiveMetrics(metric?: string): PredictiveMetric[] {
    if (metric) {
      return this.predictiveMetrics.filter((p) => p.metric === metric);
    }
    return this.predictiveMetrics;
  }

  public getAnomalies(severity?: string, limit: number = 50): AnomalyDetection[] {
    let anomalies = this.anomalies;
    if (severity) {
      anomalies = anomalies.filter((a) => a.severity === severity);
    }
    return anomalies.slice(-limit);
  }

  public getTrends(metric?: string): TrendAnalysis[] {
    if (metric) {
      return this.trends.filter((t) => t.metric === metric);
    }
    return this.trends;
  }

  public getCapacityPlans(): CapacityPlanning[] {
    return this.capacityPlans;
  }

  public getCostForecasts(period?: number): CostForecast[] {
    let forecasts = this.costForecasts;
    if (period) {
      forecasts = forecasts.slice(0, period);
    }
    return forecasts;
  }

  public async generateInsights(): Promise<{
    summary: string;
    keyFindings: string[];
    recommendations: string[];
    riskLevel: "low" | "medium" | "high";
    confidence: number;
  }> {
    this.logger.info("Generating comprehensive insights");

    return {
      summary: this.generateSummary(),
      keyFindings: this.extractKeyFindings(),
      recommendations: this.generateRecommendations(),
      riskLevel: this.calculateRiskLevel(),
      confidence: this.calculateConfidence(),
    };
  }

  private analyzeAnomaly(metricData: { metric: string; value: number; timestamp: string; containerId?: string; provider?: string }): AnomalyDetection | null {
    const history = this.getHistory(metricData.metric);
    if (history.length < 5) {
      return null;
    }

    const values = history.map((h) => h.value);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const deviation = Math.abs(metricData.value - mean);

    if (stdDev === 0 || deviation < stdDev * 2) {
      return null;
    }

    const severity =
      deviation > stdDev * 4
        ? "critical"
        : deviation > stdDev * 3
          ? "high"
          : "medium";

    return {
      timestamp: metricData.timestamp,
      metric: metricData.metric,
      value: metricData.value,
      expected: mean,
      severity,
      description: `${metricData.metric} value ${metricData.value} deviates from expected ${mean.toFixed(2)}`,
      containerId: metricData.containerId,
      provider: metricData.provider,
    };
  }

  private getHistory(metric: string): Array<{ timestamp: string; value: number }> {
    const history = this.metricsCollector?.getMetricsHistory(200) || [];
    return history
      .map((entry) => ({
        timestamp: entry.timestamp,
        value: this.extractMetricValue(entry, metric),
      }))
      .filter((entry) => Number.isFinite(entry.value));
  }

  private extractMetricValue(metrics: SystemMetrics, metric: string): number {
    switch (metric) {
      case "cpu":
      case "cpuPercent":
        return metrics.cpuPercent;
      case "memory":
      case "memoryPercent":
        return metrics.memoryPercent;
      case "disk":
      case "diskUsage":
        return metrics.diskUsage || 0;
      case "networkRx":
        return metrics.networkIO.bytesRecv;
      case "networkTx":
        return metrics.networkIO.bytesSent;
      default:
        return metrics.cpuPercent;
    }
  }

  private computeTrend(history: Array<{ timestamp: string; value: number }>) {
    const n = history.length;
    const xs = history.map((_, idx) => idx);
    const ys = history.map((point) => point.value);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
    const sumXX = xs.reduce((sum, x) => sum + x * x, 0);

    const denominator = n * sumXX - sumX * sumX || 1;
    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = sumY / n;
    const intervalMinutes = this.estimateIntervalMinutes(history);

    return { slope, intercept, intervalMinutes };
  }

  private estimateIntervalMinutes(history: Array<{ timestamp: string; value: number }>): number {
    if (history.length < 2) {
      return 5;
    }
    const last = new Date(history[history.length - 1].timestamp).getTime();
    const prev = new Date(history[history.length - 2].timestamp).getTime();
    const diff = Math.max(1, (last - prev) / 60000);
    return diff;
  }

  private classifyTrend(slope: number): TrendAnalysis["trend"] {
    if (slope > 0.5) return "increasing";
    if (slope < -0.5) return "decreasing";
    return "stable";
  }

  private computeConfidence(history: Array<{ timestamp: string; value: number }>): number {
    if (history.length < 5) {
      return 0.5;
    }
    return Math.min(0.95, 0.6 + history.length / 200);
  }

  private identifyTrendFactors(metric: string, currentValue: number): string[] {
    return [
      `Recent ${metric} value: ${currentValue.toFixed(2)}`,
      "Historical usage patterns",
      "Workload variability",
    ];
  }

  private generateSummary(): string {
    const recentAnomalies = this.anomalies.slice(-10);
    const criticalAnomalies = recentAnomalies.filter(
      (a) => a.severity === "critical",
    ).length;

    if (criticalAnomalies > 0) {
      return `System showing ${criticalAnomalies} critical anomalies requiring immediate attention.`;
    }
    if (recentAnomalies.length > 5) {
      return "System experiencing elevated anomaly levels.";
    }
    return "System operating within normal parameters.";
  }

  private extractKeyFindings(): string[] {
    const findings: string[] = [];
    const recentAnomalies = this.anomalies.slice(-20);
    const anomalyMetrics = [...new Set(recentAnomalies.map((a) => a.metric))];

    if (anomalyMetrics.length > 0) {
      findings.push(`Primary anomaly sources: ${anomalyMetrics.join(", ")}`);
    }

    const increasingTrends = this.trends.filter((t) => t.trend === "increasing");
    if (increasingTrends.length > 0) {
      findings.push(`${increasingTrends.length} metrics showing upward trends`);
    }

    const highRiskResources = this.capacityPlans.filter(
      (p) => p.riskLevel === "high",
    );
    if (highRiskResources.length > 0) {
      findings.push(`${highRiskResources.length} resources at high risk of capacity exhaustion`);
    }

    return findings;
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.anomalies.some((a) => a.severity === "critical")) {
      recommendations.push("Investigate critical anomalies promptly");
    }

    if (this.trends.some((t) => t.trend === "increasing" && t.changeRate > 10)) {
      recommendations.push("Consider scaling resources to accommodate growth");
    }

    if (this.capacityPlans.some((p) => p.riskLevel === "high")) {
      recommendations.push("Implement capacity planning for high-risk resources");
    }

    return recommendations;
  }

  private calculateRiskLevel(): "low" | "medium" | "high" {
    const criticalAnomalies = this.anomalies.filter(
      (a) => a.severity === "critical",
    ).length;
    const highRiskResources = this.capacityPlans.filter(
      (p) => p.riskLevel === "high",
    ).length;

    if (criticalAnomalies > 0 || highRiskResources > 0) {
      return "high";
    }
    if (this.anomalies.filter((a) => a.severity === "high").length > 5) {
      return "medium";
    }
    return "low";
  }

  private calculateConfidence(): number {
    const dataPoints = this.predictiveMetrics.length + this.anomalies.length;
    const baseConfidence = Math.min(0.95, dataPoints / 1000);
    return Math.max(0.5, baseConfidence);
  }
}
