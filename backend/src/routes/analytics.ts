import { Router } from "express";
import type { RouteDeps } from "./deps";

/** Metrics analytics routes. */
export function registerAnalyticsRoutes(router: Router, deps: RouteDeps): void {
  const { analyticsService } = deps;

  // Analytics routes
  router.post("/analytics/predictive-metrics", async (req, res) => {
    try {
      const { metric, horizon } = req.body;
      const predictions = await analyticsService.generatePredictiveMetrics(
        metric,
        horizon,
      );
      res.json({ success: true, data: predictions });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/analytics/detect-anomalies", async (req, res) => {
    try {
      const { metrics } = req.body;
      const anomalies = await analyticsService.detectAnomalies(metrics);
      res.json({ success: true, data: anomalies });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/analytics/analyze-trends", async (req, res) => {
    try {
      const { metric, period } = req.body;
      const trends = await analyticsService.analyzeTrends(metric, period);
      res.json({ success: true, data: trends });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/analytics/capacity-planning", async (req, res) => {
    try {
      const { resources } = req.body;
      const plans = await analyticsService.generateCapacityPlanning(resources);
      res.json({ success: true, data: plans });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.post("/analytics/cost-forecast", async (req, res) => {
    try {
      const { period } = req.body;
      const forecasts = await analyticsService.forecastCosts(period);
      res.json({ success: true, data: forecasts });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/analytics/predictive-metrics", async (req, res) => {
    try {
      const { metric } = req.query;
      const predictions = analyticsService.getPredictiveMetrics(
        metric as string,
      );
      res.json({ success: true, data: predictions });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/analytics/anomalies", async (req, res) => {
    try {
      const { severity, limit } = req.query;
      const anomalies = analyticsService.getAnomalies(
        severity as string,
        parseInt(limit as string) || 50,
      );
      res.json({ success: true, data: anomalies });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/analytics/trends", async (req, res) => {
    try {
      const { metric } = req.query;
      const trends = analyticsService.getTrends(metric as string);
      res.json({ success: true, data: trends });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/analytics/capacity-planning", async (req, res) => {
    try {
      const plans = analyticsService.getCapacityPlans();
      res.json({ success: true, data: plans });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/analytics/cost-forecast", async (req, res) => {
    try {
      const { period } = req.query;
      const forecasts = analyticsService.getCostForecasts(
        parseInt(period as string),
      );
      res.json({ success: true, data: forecasts });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  router.get("/analytics/insights", async (req, res) => {
    try {
      const insights = await analyticsService.generateInsights();
      res.json({ success: true, data: insights });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });
}
