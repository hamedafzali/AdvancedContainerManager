import { Router } from "express";
import { asyncHandler } from "../middleware/error-handler";
import type { RouteDeps } from "./deps";

/**
 * Command-per-request terminal: a session pins a container, and each
 * command runs through `docker exec` in it. Sessions hold a socket field
 * that must never be serialized, so responses map to plain fields.
 */
export function registerTerminalRoutes(router: Router, deps: RouteDeps): void {
  const { terminalService, dockerService, logger } = deps;

  const toDto = (s: { id: string; containerId: string; createdAt: Date; lastActivity: Date }) => ({
    id: s.id,
    containerId: s.containerId,
    createdAt: s.createdAt,
    lastActivity: s.lastActivity,
  });

  router.get(
    "/terminal/sessions",
    asyncHandler(async (_req, res) => {
      res.json({ success: true, data: terminalService.getSessions().map(toDto) });
    }),
  );

  router.post(
    "/terminal/:containerId/session",
    asyncHandler(async (req, res) => {
      const { containerId } = req.params;
      let container;
      try {
        container = await dockerService.getContainer(containerId);
      } catch {
        return res.status(404).json({ success: false, message: "Container not found" });
      }
      if (container.status !== "running") {
        return res.status(409).json({
          success: false,
          message: `Container is ${container.status}; start it before opening a terminal`,
        });
      }
      const id = terminalService.createSession(container.id);
      logger.info(`Terminal session ${id} opened for ${container.name}`);
      res.json({ success: true, data: { id, containerId: container.id } });
    }),
  );

  router.delete(
    "/terminal/sessions/:sessionId",
    asyncHandler(async (req, res) => {
      terminalService.closeSession(req.params.sessionId);
      res.json({ success: true });
    }),
  );

  router.post(
    "/terminal/sessions/:sessionId/execute",
    asyncHandler(async (req, res) => {
      const command = typeof req.body?.command === "string" ? req.body.command.trim() : "";
      if (!command) {
        return res.status(400).json({ success: false, message: "Command is required" });
      }
      if (!terminalService.getSession(req.params.sessionId)) {
        return res.status(404).json({
          success: false,
          message: "Terminal session expired. Reconnect to continue.",
        });
      }
      const result = await terminalService.executeCommand(req.params.sessionId, command);
      res.json({ success: true, data: { output: result.output ?? "", error: result.error ?? "" } });
    }),
  );
}
