import { Router } from "express";
import { asyncHandler } from "../middleware/error-handler";
import type { RouteDeps } from "./deps";

/** Cloudflare tunnel and API routes. */
export function registerTunnelRoutes(router: Router, deps: RouteDeps): void {
  const { tunnelService, cloudflareService, logger } = deps;

  // Cloudflare Tunnel endpoints
  router.post(
    "/tunnels/create",
    asyncHandler(async (req, res) => {
      try {
        const { name, port, domain } = req.body;

        if (!name || !port) {
          return res.status(400).json({
            success: false,
            message: "Name and port are required",
          });
        }

        const tunnelUrl = await tunnelService.createTunnel(name, port, domain);
        res.json({
          success: true,
          data: {
            url: tunnelUrl,
            name,
            port,
            domain,
          },
        });
      } catch (error) {
        logger.error("Failed to create tunnel:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/tunnels/status",
    asyncHandler(async (req, res) => {
      try {
        const status = await tunnelService.getStatus();
        res.json({
          success: true,
          data: status,
        });
      } catch (error) {
        logger.error("Failed to fetch tunnel status:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/tunnels",
    asyncHandler(async (req, res) => {
      try {
        const tunnels = tunnelService.getTunnels();
        res.json({
          success: true,
          data: tunnels,
        });
      } catch (error) {
        logger.error("Failed to fetch tunnels:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Recognizes cloudflared containers already running on the host (e.g.
  // created by hand or via docker-compose before ACM managed tunnels) and
  // starts tracking them — no recreation, no token churn. Runs automatically
  // on startup too; this lets the UI trigger it again on demand (e.g. after
  // Cloudflare auth is added, so hostname/zone metadata can be resolved).
  router.post(
    "/tunnels/adopt",
    asyncHandler(async (req, res) => {
      try {
        const adopted = await tunnelService.adoptExistingTunnels();
        res.json({
          success: true,
          data: adopted,
        });
      } catch (error) {
        logger.error("Failed to adopt existing tunnels:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Cloudflare API endpoints
  router.post(
    "/cloudflare/auth",
    asyncHandler(async (req, res) => {
      try {
        const { apiToken, accountId } = req.body;

        if (!apiToken) {
          return res.status(400).json({
            success: false,
            message: "API token is required",
          });
        }

        cloudflareService.setConfig({ apiToken, accountId });
        const isValid = await cloudflareService.validateToken();

        if (!isValid) {
          cloudflareService.clearConfig();
          // 403, not 401 — see the comment on the /projects/:name/tunnel/domain
          // check above. This is the submitted Cloudflare token being rejected,
          // not the caller's own ACM session; a 401 here made the global
          // unauthorized handler log the ACM user out of the very form they
          // were using to fix this.
          return res.status(403).json({
            success: false,
            message: "Invalid Cloudflare API token",
          });
        }

        res.json({
          success: true,
          message: "Cloudflare authentication successful",
        });
      } catch (error) {
        logger.error("Cloudflare authentication failed:", error);
        cloudflareService.clearConfig();
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/cloudflare/zones",
    asyncHandler(async (req, res) => {
      try {
        if (!cloudflareService.isAuthenticated()) {
          // 403, not 401 — same reasoning as the other Cloudflare checks in
          // this file: this endpoint is polled from the Edge → Cloudflare
          // tab as soon as it mounts, so a 401 here logged a fully
          // authenticated ACM user straight out on first render, and logging
          // back in just re-triggered the same poll and looped.
          return res.status(403).json({
            success: false,
            message: "Cloudflare not authenticated",
          });
        }

        const zones = await cloudflareService.getZones();
        res.json({
          success: true,
          data: zones,
        });
      } catch (error) {
        logger.error("Failed to fetch Cloudflare zones:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/cloudflare/zones",
    asyncHandler(async (req, res) => {
      try {
        if (!cloudflareService.isAuthenticated()) {
          // 403, not 401 — see the GET handler for this same route above.
          return res.status(403).json({
            success: false,
            message: "Cloudflare not authenticated",
          });
        }

        const { domain, accountId } = req.body;

        if (!domain) {
          return res.status(400).json({
            success: false,
            message: "Domain is required",
          });
        }

        const zone = await cloudflareService.createZone(domain, accountId);
        res.json({
          success: true,
          data: zone,
          message:
            "Zone created successfully. Update your domain's nameservers to the values provided by Cloudflare.",
        });
      } catch (error) {
        logger.error("Failed to create Cloudflare zone:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/cloudflare/config",
    asyncHandler(async (req, res) => {
      try {
        const { apiToken, accountId } = req.body;

        if (!apiToken) {
          return res.status(400).json({
            success: false,
            message: "API token is required",
          });
        }

        cloudflareService.setConfig({ apiToken, accountId });
        res.json({
          success: true,
          message: "Cloudflare configuration updated",
        });
      } catch (error) {
        logger.error("Failed to update Cloudflare config:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/tunnels/:name",
    asyncHandler(async (req, res) => {
      try {
        const { name } = req.params;
        await tunnelService.stopTunnel(name);
        res.json({
          success: true,
          message: `Tunnel ${name} stopped successfully`,
        });
      } catch (error) {
        logger.error(`Failed to stop tunnel ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );
}
