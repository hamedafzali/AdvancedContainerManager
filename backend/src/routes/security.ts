import { Router } from "express";
import { asyncHandler } from "../middleware/error-handler";
import type { RouteDeps } from "./deps";

/** Security scan and policy routes. */
export function registerSecurityRoutes(router: Router, deps: RouteDeps): void {
  const { logger, securityService } = deps;

  // Security routes
  router.get(
    "/security/scans",
    asyncHandler(async (req, res) => {
      try {
        const scans = await securityService.getAllScans();
        res.json({ success: true, data: scans });
      } catch (error) {
        logger.error("Error getting security scans:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.post(
    "/security/scans",
    asyncHandler(async (req, res) => {
      try {
        const { containerId, imageName } = req.body;
        if (!containerId || !imageName) {
          return res.status(400).json({
            success: false,
            message: "containerId and imageName are required",
          });
        }
        const scan = await securityService.startSecurityScan(
          containerId,
          imageName,
        );
        res.json({ success: true, data: scan });
      } catch (error) {
        logger.error("Error starting security scan:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/security/scans/:id",
    asyncHandler(async (req, res) => {
      try {
        const scan = await securityService.getScanStatus(req.params.id);
        if (!scan) {
          return res
            .status(404)
            .json({ success: false, message: "Scan not found" });
        }
        res.json({ success: true, data: scan });
      } catch (error) {
        logger.error("Error getting security scan:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/security/scans/container/:containerId",
    asyncHandler(async (req, res) => {
      try {
        const scans = await securityService.getContainerScans(
          req.params.containerId,
        );
        res.json({ success: true, data: scans });
      } catch (error) {
        logger.error("Error getting container scans:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/security/policies",
    asyncHandler(async (req, res) => {
      try {
        const policies = await securityService.getPolicies();
        res.json({ success: true, data: policies });
      } catch (error) {
        logger.error("Error getting security policies:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.post(
    "/security/policies",
    asyncHandler(async (req, res) => {
      try {
        const policy = await securityService.createPolicy(req.body);
        res.json({ success: true, data: policy });
      } catch (error) {
        logger.error("Error creating security policy:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.put(
    "/security/policies/:id",
    asyncHandler(async (req, res) => {
      try {
        const policy = await securityService.updatePolicy(
          req.params.id,
          req.body,
        );
        res.json({ success: true, data: policy });
      } catch (error) {
        logger.error("Error updating security policy:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.delete(
    "/security/policies/:id",
    asyncHandler(async (req, res) => {
      try {
        const removed = await securityService.deletePolicy(req.params.id);
        if (!removed) {
          return res
            .status(404)
            .json({ success: false, message: "Policy not found" });
        }
        res.json({ success: true, message: "Policy deleted" });
      } catch (error) {
        logger.error("Error deleting security policy:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/security/alerts",
    asyncHandler(async (req, res) => {
      try {
        const { severity, status } = req.query;
        const limit = req.query.limit
          ? parseInt(req.query.limit as string)
          : 100;
        const alerts = await securityService.getAlerts(
          severity as string | undefined,
          status as string | undefined,
          limit,
        );
        res.json({ success: true, data: alerts });
      } catch (error) {
        logger.error("Error getting security alerts:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.put(
    "/security/alerts/:id",
    asyncHandler(async (req, res) => {
      try {
        const { status, assignedTo } = req.body;
        const updated = await securityService.updateAlertStatus(
          req.params.id,
          status,
          assignedTo,
        );
        if (!updated) {
          return res
            .status(404)
            .json({ success: false, message: "Alert not found" });
        }
        res.json({ success: true, message: "Alert updated" });
      } catch (error) {
        logger.error("Error updating security alert:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/security/metrics",
    asyncHandler(async (req, res) => {
      try {
        const metrics = await securityService.getSecurityMetrics();
        res.json({ success: true, data: metrics });
      } catch (error) {
        logger.error("Error getting security metrics:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );
}
