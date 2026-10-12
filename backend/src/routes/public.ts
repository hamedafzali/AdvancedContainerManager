import { Router } from "express";
import * as crypto from "crypto";
import { asyncHandler } from "../middleware/error-handler";
import type { RouteDeps } from "./deps";

/** Constant-time compare that returns false (instead of throwing) when the
 *  lengths differ. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Public routes: login and the git/pipeline webhooks. Registered before the auth middleware; each webhook checks its own secret. */
export function registerPublicRoutes(router: Router, deps: RouteDeps): void {
  const { projectService, authService, pipelineService, logger } = deps;

  // Auth routes (public — no auth required)
  router.post("/auth/login", asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "username and password required" });
    }
    if (!authService.verifyPassword(username, password)) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    const session = authService.createSession(username);
    res.json({ success: true, data: session });
  }));

  router.post("/auth/logout", asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) authService.revokeSession(token);
    res.json({ success: true });
  }));

  router.post("/auth/change-password", asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const username = token ? authService.validateSession(token) : null;
    if (!username) return res.status(401).json({ success: false, message: "Unauthorized" });
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "oldPassword and newPassword required" });
    }
    authService.changePassword(username, oldPassword, newPassword);
    res.json({ success: true, message: "Password changed. Please log in again." });
  }));

  router.get("/auth/me", asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const username = token ? authService.validateSession(token) : null;
    if (!username) return res.status(401).json({ success: false, message: "Unauthorized" });
    res.json({ success: true, data: { username } });
  }));

  // Public pipeline webhook (git push → run pipeline). Authenticated by a
  // per-project secret, so it sits BEFORE the auth middleware.
  router.post(
    "/webhooks/pipeline/:name",
    asyncHandler(async (req, res) => {
      const { name } = req.params;
      const provided =
        (req.headers["x-acm-secret"] as string) ||
        (req.query.secret as string) ||
        "";
      if (!pipelineService.verifySecret(name, provided)) {
        return res.status(401).json({ success: false, message: "Invalid webhook secret" });
      }
      if (!projectService.getProject(name)) {
        return res.status(404).json({ success: false, message: "Project not found" });
      }
      if (pipelineService.isRunning(name)) {
        return res.status(409).json({ success: false, message: "Pipeline already running" });
      }
      const run = pipelineService.startRun(name, "webhook");
      res.status(202).json({ success: true, data: { runId: run.id } });
    }),
  );

  // Webhook endpoint — public (verified by HMAC)
  router.post(
    "/webhook/:name",
    asyncHandler(async (req, res) => {
      const secret = projectService.getWebhookSecret(req.params.name);
      if (!secret) {
        return res.status(404).json({ success: false, message: "No webhook configured for this project" });
      }

      const signature = req.headers["x-hub-signature-256"] as string || req.headers["x-gitlab-token"] as string || "";
      // GitHub signs the exact bytes it sent, so verify against the raw body
      // (kept by express.json's verify hook). Re-serialized JSON can differ.
      const body: Buffer = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));

      // GitHub uses HMAC-SHA256, GitLab uses plain secret token
      const expected = `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
      const isGitHub = signature.startsWith("sha256=");
      const valid = isGitHub ? safeEqual(signature, expected) : safeEqual(signature, secret);

      if (!valid) {
        return res.status(401).json({ success: false, message: "Invalid webhook signature" });
      }

      res.json({ success: true, message: "Webhook received, deploying..." });

      // Run async without blocking response
      projectService.pullLatestProject(req.params.name)
        .then(() => projectService.deployProject(req.params.name))
        .catch((err) => logger.error(`Webhook deploy failed for ${req.params.name}:`, err));
    }),
  );
}
