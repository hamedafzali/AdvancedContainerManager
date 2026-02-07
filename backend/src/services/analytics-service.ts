import { Logger } from "../utils/logger";

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
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  containerId?: string;
  provider?: string;
}

export interface TrendAnalysis {
  metric: string;
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
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
    priority: 'low' | 'medium' | 'high';
    timeline: string;
    estimatedCost?: number;
  }>;
  riskLevel: 'low' | 'medium' | 'high';
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
  private predictiveMetrics: PredictiveMetric[] = [];
  private anomalies: AnomalyDetection[] = [];
  private trends: TrendAnalysis[] = [];
  private capacityPlans: CapacityPlanning[] = [];
  private costForecasts: CostForecast[] = [];

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public async generatePredictiveMetrics(
    metric: string,
    horizon: number = 60
  ): Promise<PredictiveMetric[]> {
    try {
      this.logger.info(`Generating predictive metrics for ${metric} with ${horizon}min horizon`);
      
      const predictions: PredictiveMetric[] = [];
      const now = new Date();
      
      // Generate predictions for the next horizon minutes
      for (let i = 1; i <= horizon; i += 5) { // Every 5 minutes
        const timestamp = new Date(now.getTime() + i * 5 * 60000);
        const prediction = await this.predictMetric(metric, i);
        
        predictions.push({
          timestamp: timestamp.toISOString(),
          actual: 0, // Will be filled when actual data is available
          predicted: prediction.value,
          confidence: prediction.confidence,
          metric,
          horizon: i,
        });
      }
      
      // Store predictions
      this.predictiveMetrics.push(...predictions);
      
      // Keep only last 1000 predictions
      if (this.predictiveMetrics.length > 1000) {
        this.predictiveMetrics = this.predictiveMetrics.slice(-1000);
      }
      
      this.logger.info(`Generated ${predictions.length} predictive metrics for ${metric}`);
      return predictions;
      
    } catch (error) {
      this.logger.error(`Error generating predictive metrics for ${metric}:`, error);
      throw error;
    }
  }

  public async detectAnomalies(
    metrics: Array<{ metric: string; value: number; timestamp: string; containerId?: string; provider?: string }>
  ): Promise<AnomalyDetection[]> {
    try {
      this.logger.info(`Detecting anomalies in ${metrics.length} metrics`);
      
      const detectedAnomalies: AnomalyDetection[] = [];
      
      for (const metricData of metrics) {
        const anomaly = await this.analyzeAnomaly(metricData);
        if (anomaly) {
          detectedAnomalies.push(anomaly);
        }
      }
      
      // Store anomalies
      this.anomalies.push(...detectedAnomalies);
      
      // Keep only last 500 anomalies
      if (this.anomalies.length > 500) {
        this.anomalies = this.anomalies.slice(-500);
      }
      
      this.logger.info(`Detected ${detectedAnomalies.length} anomalies`);
      return detectedAnomalies;
      
    } catch (error) {
      this.logger.error('Error detecting anomalies:', error);
      throw error;
    }
  }

  public async analyzeTrends(
    metric: string,
    period: number = 7 // days
  ): Promise<TrendAnalysis> {
    try {
      this.logger.info(`Analyzing trends for ${metric} over ${period} days`);
      
      // Mock trend analysis - in real implementation, this would use historical data
      const trend: TrendAnalysis = {
        metric,
        trend: this.calculateTrend(metric),
        changeRate: Math.random() * 20 - 10, // -10% to +10%
        prediction: {
          nextHour: Math.random() * 100,
          nextDay: Math.random() * 100,
          nextWeek: Math.random() * 100,
        },
        confidence: Math.random() * 0.3 + 0.7, // 70% to 100%
        factors: this.identifyTrendFactors(metric),
      };
      
      // Store trend
      const existingIndex = this.trends.findIndex(t => t.metric === metric);
      if (existingIndex >= 0) {
        this.trends[existingIndex] = trend;
      } else {
        this.trends.push(trend);
      }
      
      this.logger.info(`Trend analysis completed for ${metric}`);
      return trend;
      
    } catch (error) {
      this.logger.error(`Error analyzing trends for ${metric}:`, error);
      throw error;
    }
  }

  public async generateCapacityPlanning(
    resources: string[] = ['cpu', 'memory', 'storage', 'network']
  ): Promise<CapacityPlanning[]> {
    try {
      this.logger.info('Generating capacity planning recommendations');
      
      const plans: CapacityPlanning[] = [];
      
      for (const resource of resources) {
        const plan = await this.analyzeCapacity(resource);
        plans.push(plan);
      }
      
      // Store capacity plans
      this.capacityPlans = plans;
      
      this.logger.info(`Generated capacity plans for ${resources.length} resources`);
      return plans;
      
    } catch (error) {
      this.logger.error('Error generating capacity planning:', error);
      throw error;
    }
  }

  public async forecastCosts(
    period: number = 30 // days
  ): Promise<CostForecast[]> {
    try {
      this.logger.info(`Forecasting costs for next ${period} days`);
      
      const forecasts: CostForecast[] = [];
      
      for (let i = 1; i <= period; i++) {
        const date = new Date();
        date.setDate(date.getDate() + i);
        
        const forecast = await this.predictCost(date);
        forecasts.push(forecast);
      }
      
      // Store forecasts
      this.costForecasts.push(...forecasts);
      
      // Keep only last 90 days of forecasts
      if (this.costForecasts.length > 90) {
        this.costForecasts = this.costForecasts.slice(-90);
      }
      
      this.logger.info(`Generated cost forecasts for ${period} days`);
      return forecasts;
      
    } catch (error) {
      this.logger.error('Error forecasting costs:', error);
      throw error;
    }
  }

  public getPredictiveMetrics(metric?: string): PredictiveMetric[] {
    if (metric) {
      return this.predictiveMetrics.filter(p => p.metric === metric);
    }
    return this.predictiveMetrics;
  }

  public getAnomalies(severity?: string, limit: number = 50): AnomalyDetection[] {
    let anomalies = this.anomalies;
    
    if (severity) {
      anomalies = anomalies.filter(a => a.severity === severity);
    }
    
    return anomalies.slice(-limit);
  }

  public getTrends(metric?: string): TrendAnalysis[] {
    if (metric) {
      return this.trends.filter(t => t.metric === metric);
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
    riskLevel: 'low' | 'medium' | 'high';
    confidence: number;
  }> {
    try {
      this.logger.info('Generating comprehensive insights');
      
      const insights = {
        summary: this.generateSummary(),
        keyFindings: this.extractKeyFindings(),
        recommendations: this.generateRecommendations(),
        riskLevel: this.calculateRiskLevel(),
        confidence: this.calculateConfidence(),
      };
      
      this.logger.info('Insights generation completed');
      return insights;
      
    } catch (error) {
      this.logger.error('Error generating insights:', error);
      throw error;
    }
  }

  private async predictMetric(metric: string, horizon: number): Promise<{ value: number; confidence: number }> {
    // Mock prediction - in real implementation, this would use ML models
    const baseValue = Math.random() * 100;
    const trend = Math.random() * 20 - 10; // -10 to +10
    const seasonal = Math.sin(Date.now() / 86400000) * 10; // Daily seasonality
    
    const value = baseValue + (trend * horizon / 60) + seasonal;
    const confidence = Math.max(0.5, 1 - (horizon / 360)); // Confidence decreases with horizon
    
    return { value, confidence };
  }

  private async analyzeAnomaly(
    metricData: { metric: string; value: number; timestamp: string; containerId?: string; provider?: string }
  ): Promise<AnomalyDetection | null> {
    // Mock anomaly detection - in real implementation, this would use statistical methods
    const expected = Math.random() * 100;
    const threshold = 20; // 20% deviation threshold
    const deviation = Math.abs(metricData.value - expected) / expected;
    
    if (deviation > threshold / 100) {
      const severity = deviation > 0.5 ? 'critical' : deviation > 0.3 ? 'high' : deviation > 0.2 ? 'medium' : 'low';
      
      return {
        timestamp: metricData.timestamp,
        metric: metricData.metric,
        value: metricData.value,
        expected,
        severity,
        description: `${metricData.metric} value ${metricData.value} deviates significantly from expected ${expected}`,
        containerId: metricData.containerId,
        provider: metricData.provider,
      };
    }
    
    return null;
  }

  private calculateTrend(metric: string): 'increasing' | 'decreasing' | 'stable' | 'volatile' {
    // Mock trend calculation - in real implementation, this would analyze historical data
    const random = Math.random();
    if (random < 0.25) return 'increasing';
    if (random < 0.5) return 'decreasing';
    if (random < 0.75) return 'stable';
    return 'volatile';
  }

  private identifyTrendFactors(metric: string): string[] {
    // Mock factor identification - in real implementation, this would analyze correlations
    const factors = [
      'Seasonal usage patterns',
      'Application deployment cycles',
      'User activity patterns',
      'Resource allocation changes',
      'Network traffic variations',
    ];
    
    return factors.slice(0, Math.floor(Math.random() * 3) + 1);
  }

  private async analyzeCapacity(resource: string): Promise<CapacityPlanning> {
    // Mock capacity analysis - in real implementation, this would use growth models
    const current = Math.random() * 100;
    const growthRate = Math.random() * 0.1 + 0.05; // 5% to 15% monthly growth
    
    return {
      resource,
      current,
      projected: {
        oneMonth: current * (1 + growthRate),
        threeMonths: current * Math.pow(1 + growthRate, 3),
        sixMonths: current * Math.pow(1 + growthRate, 6),
        oneYear: current * Math.pow(1 + growthRate, 12),
      },
      recommendations: [
        {
          action: `Upgrade ${resource} capacity by 25%`,
          priority: 'medium',
          timeline: '3 months',
          estimatedCost: Math.random() * 1000,
        },
        {
          action: `Implement auto-scaling for ${resource}`,
          priority: 'high',
          timeline: '1 month',
        },
      ],
      riskLevel: current > 80 ? 'high' : current > 60 ? 'medium' : 'low',
    };
  }

  private async predictCost(date: Date): Promise<CostForecast> {
    // Mock cost prediction - in real implementation, this would use cost models
    const baseCost = 1000;
    const growth = Math.random() * 100 - 50; // -50 to +50
    const forecast = baseCost + growth;
    
    return {
      period: date.toISOString().split('T')[0],
      actual: 0, // Will be filled when actual data is available
      forecast,
      variance: 0,
      confidence: Math.random() * 0.3 + 0.7, // 70% to 100%
      breakdown: {
        compute: forecast * 0.6,
        storage: forecast * 0.2,
        network: forecast * 0.15,
        other: forecast * 0.05,
      },
    };
  }

  private generateSummary(): string {
    const recentAnomalies = this.anomalies.slice(-10);
    const criticalAnomalies = recentAnomalies.filter(a => a.severity === 'critical').length;
    
    if (criticalAnomalies > 0) {
      return `System showing ${criticalAnomalies} critical anomalies requiring immediate attention. Performance metrics indicate potential capacity constraints.`;
    } else if (recentAnomalies.length > 5) {
      return `System experiencing elevated anomaly levels. Resource utilization trending upward, recommend proactive scaling.`;
    } else {
      return `System operating within normal parameters. Predictive models indicate stable performance for the next 24 hours.`;
    }
  }

  private extractKeyFindings(): string[] {
    const findings = [];
    
    // Analyze recent anomalies
    const recentAnomalies = this.anomalies.slice(-20);
    const anomalyMetrics = [...new Set(recentAnomalies.map(a => a.metric))];
    
    if (anomalyMetrics.length > 0) {
      findings.push(`Primary anomaly sources: ${anomalyMetrics.join(', ')}`);
    }
    
    // Analyze trends
    const increasingTrends = this.trends.filter(t => t.trend === 'increasing');
    if (increasingTrends.length > 0) {
      findings.push(`${increasingTrends.length} metrics showing upward trends`);
    }
    
    // Analyze capacity
    const highRiskResources = this.capacityPlans.filter(p => p.riskLevel === 'high');
    if (highRiskResources.length > 0) {
      findings.push(`${highRiskResources.length} resources at high risk of capacity exhaustion`);
    }
    
    return findings;
  }

  private generateRecommendations(): string[] {
    const recommendations = [];
    
    // Based on anomalies
    const criticalAnomalies = this.anomalies.filter(a => a.severity === 'critical');
    if (criticalAnomalies.length > 0) {
      recommendations.push('Immediately investigate critical anomalies to prevent service disruption');
    }
    
    // Based on trends
    const increasingTrends = this.trends.filter(t => t.trend === 'increasing' && t.changeRate > 10);
    if (increasingTrends.length > 0) {
      recommendations.push('Consider scaling resources to accommodate growth trends');
    }
    
    // Based on capacity
    const highRiskResources = this.capacityPlans.filter(p => p.riskLevel === 'high');
    if (highRiskResources.length > 0) {
      recommendations.push('Implement capacity planning for high-risk resources');
    }
    
    return recommendations;
  }

  private calculateRiskLevel(): 'low' | 'medium' | 'high' {
    const criticalAnomalies = this.anomalies.filter(a => a.severity === 'critical').length;
    const highRiskResources = this.capacityPlans.filter(p => p.riskLevel === 'high').length;
    
    if (criticalAnomalies > 0 || highRiskResources > 0) {
      return 'high';
    } else if (this.anomalies.filter(a => a.severity === 'high').length > 5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private calculateConfidence(): number {
    // Calculate overall confidence based on data quality and model performance
    const dataPoints = this.predictiveMetrics.length + this.anomalies.length;
    const baseConfidence = Math.min(0.95, dataPoints / 1000);
    
    return Math.max(0.5, baseConfidence);
  }
}
