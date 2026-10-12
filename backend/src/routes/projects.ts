import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { DeployInProgressError } from "../services/project-service";
import { validateBranch, validateProjectName, validateRepoUrl } from "../utils/project-input";
import { asyncHandler } from "../middleware/error-handler";
import type { RouteDeps } from "./deps";

/** Project, environment, git account and pipeline routes. */
export function registerProjectRoutes(router: Router, deps: RouteDeps): void {
  const { projectService, tunnelService, gitAccountService, pipelineService, cloudflareService, logger } = deps;

  // Project routes
  router.get(
    "/projects/summary",
    asyncHandler(async (req, res) => {
      try {
        const summary = projectService.getProjectsSummary();
        res.json({
          success: true,
          data: summary,
        });
      } catch (error) {
        logger.error("Error getting projects summary:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/projects",
    asyncHandler(async (req, res) => {
      try {
        const projects = projectService.getProjects();
        res.json({
          success: true,
          data: Array.from(projects.values()),
        });
      } catch (error) {
        logger.error("Error getting projects:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/projects",
    asyncHandler(async (req, res) => {
      try {
        const {
          name,
          repoUrl,
          branch = "main",
          dockerfile = "Dockerfile",
          composeFile = "docker-compose.yml",
          environmentVars = {},
          accountId,
        } = req.body;

        try {
          validateProjectName(name);
          validateRepoUrl(repoUrl);
          validateBranch(branch);
        } catch (e: any) {
          return res.status(400).json({ success: false, message: e.message });
        }
        if (projectService.getProject(name)) {
          return res.status(409).json({ success: false, message: `A project named ${name} already exists` });
        }

        const authenticatedUrl = accountId
          ? gitAccountService.getAuthenticatedUrl(accountId, repoUrl)
          : undefined;

        const project = await projectService.addProject(
          name,
          repoUrl,
          branch,
          dockerfile,
          composeFile,
          environmentVars,
          authenticatedUrl,
          accountId,
        );

        res.json({
          success: true,
          data: project,
        });
      } catch (error) {
        logger.error("Error adding project:", error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/projects/:name",
    asyncHandler(async (req, res) => {
      try {
        const project = projectService.getProject(req.params.name);
        if (!project) {
          return res.status(404).json({
            success: false,
            message: "Project not found",
          });
        }

        res.json({
          success: true,
          data: project,
          // Keys the project has saved that the resolved compose file doesn't
          // reference anywhere (environment/env_file/build.args) — editing
          // these in the UI cannot take effect on the next deploy. Lets the
          // env editor warn on a variable before someone spends a save cycle
          // wondering why it didn't do anything.
          unmanagedEnvVars: projectService.getUnmanagedEnvVarKeys(req.params.name),
        });
      } catch (error) {
        logger.error(`Error getting project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.put(
    "/projects/:name",
    asyncHandler(async (req, res) => {
      try {
        const {
          repoUrl,
          branch,
          environmentVars = {},
          composeFile,
          portUpdates = [],
        } = req.body;
        // Diagnostic: logs only the KEY NAMES received in this request, never
        // values (some are secrets). Added to pin down a reported case where a
        // newly-added common env var (NEXT_PUBLIC_SITE_URL) 200'd and produced
        // a fresh lastUpdated write, yet never appeared in the persisted
        // environmentVars — this settles whether the key ever reached the
        // backend at all vs. was dropped somewhere in updateProjectSettings.
        logger.info(
          `PUT /projects/${req.params.name}: environmentVars keys in request = [${Object.keys(environmentVars).join(", ")}]`,
        );
        const project = await projectService.updateProjectSettings(
          req.params.name,
          {
            repoUrl,
            branch,
            environmentVars,
            composeFile,
            portUpdates,
          },
        );
        res.json({
          success: true,
          data: project,
          unmanagedEnvVars: projectService.getUnmanagedEnvVarKeys(req.params.name),
        });
      } catch (error) {
        logger.error(`Error updating project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/projects/:name/build",
    asyncHandler(async (req, res) => {
      try {
        await projectService.buildProject(req.params.name);
        res.json({
          success: true,
          message: `Project ${req.params.name} built successfully`,
        });
      } catch (error) {
        logger.error(`Error building project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/projects/:name/sync",
    asyncHandler(async (req, res) => {
      try {
        const result = await projectService.pullLatestProject(req.params.name);
        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error(`Error syncing project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/projects/:name/deploy",
    asyncHandler(async (req, res) => {
      try {
        const result = await projectService.deployProject(req.params.name);
        res.json({
          success: true,
          message: `Project ${req.params.name} deployed successfully`,
          data: result,
        });
      } catch (error) {
        if (error instanceof DeployInProgressError) {
          return res.status(409).json({
            success: false,
            message: error.message,
            data: { projectName: error.projectName, startedAt: error.startedAt },
          });
        }
        logger.error(`Error deploying project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.post(
    "/projects/:name/sync-deploy",
    asyncHandler(async (req, res) => {
      try {
        const { name } = req.params;
        const syncResult = await projectService.pullLatestProject(name);
        const deployResult = await projectService.deployProject(name);
        res.json({
          success: true,
          message: `Project ${name} synced and deployed`,
          data: { sync: syncResult, deploy: deployResult },
        });
      } catch (error) {
        if (error instanceof DeployInProgressError) {
          return res.status(409).json({
            success: false,
            message: error.message,
            data: { projectName: error.projectName, startedAt: error.startedAt },
          });
        }
        logger.error(`Error in sync-deploy for ${req.params.name}:`, error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.post(
    "/projects/:name/stop",
    asyncHandler(async (req, res) => {
      try {
        await projectService.stopProject(req.params.name);
        res.json({
          success: true,
          message: `Project ${req.params.name} stopped successfully`,
        });
      } catch (error) {
        logger.error(`Error stopping project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.delete(
    "/projects/:name",
    asyncHandler(async (req, res) => {
      try {
        await projectService.removeProject(req.params.name);
        res.json({
          success: true,
          message: `Project ${req.params.name} removed successfully`,
        });
      } catch (error) {
        logger.error(`Error removing project ${req.params.name}:`, error);
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/projects/:name/health",
    asyncHandler(async (req, res) => {
      try {
        const env = (req.query.env as string) || "prod";
        const health = await projectService.getProjectHealth(req.params.name, env);
        res.json({
          success: true,
          data: health,
        });
      } catch (error) {
        logger.error(
          `Error getting project health for ${req.params.name}:`,
          error,
        );
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  router.get(
    "/projects/:name/logs",
    asyncHandler(async (req, res) => {
      try {
        const tail = req.query.tail ? parseInt(req.query.tail as string) : 200;
        const env = (req.query.env as string) || "prod";
        const logs = await projectService.getProjectLogs(req.params.name, tail, env);
        res.json({
          success: true,
          data: logs,
        });
      } catch (error) {
        logger.error(
          `Error getting project logs for ${req.params.name}:`,
          error,
        );
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    }),
  );

  // Project tunnel routes
  router.post(
    "/projects/:name/tunnel",
    asyncHandler(async (req, res) => {
      try {
        const project = projectService.getProject(req.params.name);
        if (!project) {
          return res.status(404).json({ success: false, message: "Project not found" });
        }
        if (project.tunnelId) {
          return res.status(409).json({ success: false, message: "Project already has a tunnel" });
        }

        // Caller must specify which host port to expose when project has multiple
        const portsWithHost = project.ports.filter((p) => p.hostPort);
        if (portsWithHost.length === 0) {
          return res.status(400).json({ success: false, message: "Project has no mapped host ports" });
        }

        let selectedPort: typeof portsWithHost[0];
        if (req.body?.port) {
          const requested = parseInt(String(req.body.port), 10);
          const match = portsWithHost.find((p) => p.hostPort === requested);
          if (!match) {
            return res.status(400).json({
              success: false,
              message: `Port ${requested} is not a mapped host port for this project. Available: ${portsWithHost.map((p) => p.hostPort).join(", ")}`,
            });
          }
          selectedPort = match;
        } else if (portsWithHost.length === 1) {
          selectedPort = portsWithHost[0];
        } else {
          return res.status(400).json({
            success: false,
            message: "Project has multiple ports — specify which to expose",
            data: { ports: portsWithHost },
          });
        }

        const tunnelName = `project-${req.params.name.replace(/[^a-zA-Z0-9-_]/g, "-")}`;
        const tunnelUrl = await tunnelService.createTunnel(
          tunnelName,
          selectedPort.hostPort!,
          req.body?.domain,
        );
        const updated = projectService.linkTunnel(
          req.params.name,
          tunnelName,
          tunnelUrl,
          selectedPort.hostPort,
          selectedPort.service,
        );
        res.json({ success: true, data: updated });
      } catch (error) {
        logger.error(`Error creating tunnel for project ${req.params.name}:`, error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.delete(
    "/projects/:name/tunnel",
    asyncHandler(async (req, res) => {
      try {
        const project = projectService.getProject(req.params.name);
        if (!project) {
          return res.status(404).json({ success: false, message: "Project not found" });
        }
        // stopTunnel tears down the Cloudflare tunnel and its DNS record for
        // named tunnels, so no separate DNS cleanup is needed here.
        if (project.tunnelId) {
          await tunnelService.stopTunnel(project.tunnelId);
        }
        const updated = projectService.unlinkTunnel(req.params.name);
        res.json({ success: true, data: updated });
      } catch (error) {
        logger.error(`Error removing tunnel for project ${req.params.name}:`, error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  // Attach a Cloudflare domain to an existing project tunnel
  router.post(
    "/projects/:name/tunnel/domain",
    asyncHandler(async (req, res) => {
      try {
        const project = projectService.getProject(req.params.name);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });
        if (!project.tunnelUrl) return res.status(400).json({ success: false, message: "Project has no active tunnel" });
        if (!cloudflareService.isAuthenticated()) {
          // 403, not 401: this is "Cloudflare has no API token configured",
          // not "you aren't logged into ACM". apiFetch (frontend/src/utils/api.ts)
          // treats ANY 401 from ANY endpoint as an expired ACM session and force
          // logs the user out — so a 401 here meant simply opening this tab
          // before configuring Cloudflare would immediately bounce a fully
          // logged-in user back to <Login>, and logging back in re-triggered
          // the same fetch and looped. See the sibling checks below.
          return res.status(403).json({ success: false, message: "Cloudflare not authenticated — go to Settings → Cloudflare" });
        }

        const { zoneId, subdomain } = req.body;
        if (!zoneId || !subdomain) {
          return res.status(400).json({ success: false, message: "zoneId and subdomain are required" });
        }

        const zones = await cloudflareService.getZones();
        const zone = zones.find((z) => z.id === zoneId);
        if (!zone) {
          return res.status(400).json({ success: false, message: "Zone not found in this Cloudflare account" });
        }

        // Accept "app", "app.example.com", or "@" for the apex.
        const entered = String(subdomain).trim().toLowerCase().replace(/\.$/, "");
        const hostname =
          entered === "" || entered === "@"
            ? zone.name
            : entered === zone.name || entered.endsWith(`.${zone.name}`)
              ? entered
              : `${entered}.${zone.name}`;

        // A quick tunnel's hostname is issued by the provider and cannot carry a
        // custom domain, so swap it for a named Cloudflare tunnel bound to this
        // hostname. Reuses the port the project tunnel was already exposing.
        const port = project.tunnelPort;
        if (!port) {
          return res.status(400).json({ success: false, message: "Project tunnel has no recorded port — recreate the tunnel" });
        }

        const tunnelName = project.tunnelId ?? `project-${req.params.name.replace(/[^a-zA-Z0-9-_]/g, "-")}`;
        await tunnelService.stopTunnel(tunnelName).catch(() => {});
        const tunnelUrl = await tunnelService.createTunnel(tunnelName, port, hostname);

        const tunnel = tunnelService.getTunnel(tunnelName);
        projectService.linkTunnel(req.params.name, tunnelName, tunnelUrl, port, project.tunnelService);
        const updated = projectService.linkDomain(
          req.params.name,
          hostname,
          tunnel?.cfDnsRecordId ?? "",
          zoneId,
        );
        res.json({ success: true, data: { project: updated, hostname } });
      } catch (error) {
        logger.error(`Error attaching domain to project ${req.params.name}:`, error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.delete(
    "/projects/:name/tunnel/domain",
    asyncHandler(async (req, res) => {
      try {
        const project = projectService.getProject(req.params.name);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        // Drop the named tunnel (removing its DNS record and Cloudflare tunnel)
        // and fall back to a quick tunnel so the project stays reachable.
        if (project.tunnelId) {
          await tunnelService.stopTunnel(project.tunnelId).catch((e) =>
            logger.warn(`Failed to stop named tunnel: ${e}`)
          );
        }

        if (project.tunnelId && project.tunnelPort) {
          const tunnelUrl = await tunnelService.createTunnel(project.tunnelId, project.tunnelPort);
          projectService.linkTunnel(
            req.params.name,
            project.tunnelId,
            tunnelUrl,
            project.tunnelPort,
            project.tunnelService,
          );
        } else {
          projectService.unlinkTunnel(req.params.name);
        }

        const updated = projectService.unlinkDomain(req.params.name);
        res.json({ success: true, data: updated });
      } catch (error) {
        logger.error(`Error detaching domain from project ${req.params.name}:`, error);
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.post(
    "/projects/:name/webhook/generate",
    asyncHandler(async (req, res) => {
      try {
        const secret = projectService.generateWebhookSecret(req.params.name);
        res.json({ success: true, data: { secret } });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/projects/:name/port-conflicts",
    asyncHandler(async (req, res) => {
      try {
        const project = projectService.getProject(req.params.name);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });
        const composeFile = (projectService as any).resolveComposeFile(project);
        if (!composeFile) return res.json({ success: true, data: [] });
        const conflicts = await projectService.checkPortConflicts(req.params.name, composeFile);
        res.json({ success: true, data: conflicts });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/projects/:name/compose-files",
    asyncHandler(async (req, res) => {
      try {
        const project = projectService.getProject(req.params.name);
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });
        const files = projectService.findComposeFiles(project.path);
        res.json({ success: true, data: files });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    }),
  );

  // Git account routes
  router.get(
    "/git-accounts",
    asyncHandler(async (req, res) => {
      res.json({ success: true, data: gitAccountService.getAccounts() });
    }),
  );

  router.post(
    "/git-accounts",
    asyncHandler(async (req, res) => {
      try {
        const { provider, token } = req.body;
        if (!provider || !token) {
          return res.status(400).json({ success: false, message: "provider and token are required" });
        }
        if (provider !== "github" && provider !== "gitlab") {
          return res.status(400).json({ success: false, message: "provider must be github or gitlab" });
        }
        const account = await gitAccountService.addAccount(provider, token);
        res.json({ success: true, data: { ...account, token: "***" } });
      } catch (error) {
        logger.error("Error adding git account:", error);
        res.status(400).json({ success: false, message: error.message });
      }
    }),
  );

  router.delete(
    "/git-accounts/:id",
    asyncHandler(async (req, res) => {
      const removed = gitAccountService.removeAccount(decodeURIComponent(req.params.id));
      if (!removed) {
        return res.status(404).json({ success: false, message: "Account not found" });
      }
      res.json({ success: true, message: "Account removed" });
    }),
  );

  router.get(
    "/git-accounts/:id/repos",
    asyncHandler(async (req, res) => {
      try {
        const page = req.query.page ? parseInt(req.query.page as string) : 1;
        const repos = await gitAccountService.listRepos(decodeURIComponent(req.params.id), page);
        res.json({ success: true, data: repos });
      } catch (error) {
        logger.error("Error listing repos:", error);
        res.status(400).json({ success: false, message: error.message });
      }
    }),
  );

  router.get(
    "/git-accounts/:id/repos/:owner/:repo/branches",
    asyncHandler(async (req, res) => {
      try {
        const { owner, repo } = req.params;
        const branches = await gitAccountService.listBranches(
          decodeURIComponent(req.params.id),
          `${owner}/${repo}`,
        );
        res.json({ success: true, data: branches });
      } catch (error) {
        logger.error("Error listing branches:", error);
        res.status(400).json({ success: false, message: error.message });
      }
    }),
  );

  // ── Environments (dev / test / prod) ─────────────────────
  router.get(
    "/projects/:name/environments",
    asyncHandler(async (req, res) => {
      if (!projectService.getProject(req.params.name)) {
        return res.status(404).json({ success: false, message: "Project not found" });
      }
      res.json({ success: true, data: await projectService.getEnvironments(req.params.name) });
    }),
  );

  // A lock held by another deploy/promote on the same env is a 409, not a 400,
  // so the UI can say "already running" instead of showing it as a failure.
  const envError = (res: any, e: any) =>
    e instanceof DeployInProgressError
      ? res.status(409).json({ success: false, message: e.message, data: { startedAt: e.startedAt } })
      : res.status(400).json({ success: false, message: e.message });

  router.post(
    "/projects/:name/environments/:env/deploy",
    asyncHandler(async (req, res) => {
      try {
        const result = await projectService.deployEnvironment(req.params.name, req.params.env);
        res.json({ success: true, data: result });
      } catch (e: any) {
        envError(res, e);
      }
    }),
  );

  router.post(
    "/projects/:name/environments/:env/promote",
    asyncHandler(async (req, res) => {
      const to = String(req.body?.to || "");
      if (!to) return res.status(400).json({ success: false, message: "Body must name the target env: { to }" });
      try {
        const result = await projectService.promoteEnvironment(req.params.name, req.params.env, to);
        res.json({ success: true, data: result });
      } catch (e: any) {
        envError(res, e);
      }
    }),
  );

  router.post(
    "/projects/:name/environments/:env/stop",
    asyncHandler(async (req, res) => {
      try {
        await projectService.stopEnvironment(req.params.name, req.params.env);
        res.json({ success: true });
      } catch (e: any) {
        envError(res, e);
      }
    }),
  );

  router.post(
    "/projects/:name/environments/:env/restart",
    asyncHandler(async (req, res) => {
      try {
        await projectService.restartEnvironment(req.params.name, req.params.env);
        res.json({ success: true });
      } catch (e: any) {
        envError(res, e);
      }
    }),
  );

  router.get(
    "/projects/:name/environments/:env/env",
    asyncHandler(async (req, res) => {
      try {
        res.json({ success: true, data: projectService.getEnvVars(req.params.name, req.params.env) });
      } catch (e: any) {
        res.status(404).json({ success: false, message: e.message });
      }
    }),
  );

  router.put(
    "/projects/:name/environments/:env/env",
    asyncHandler(async (req, res) => {
      try {
        projectService.setEnvVars(req.params.name, req.params.env, req.body?.vars || {});
        res.json({ success: true });
      } catch (e: any) {
        res.status(400).json({ success: false, message: e.message });
      }
    }),
  );

  // ── Pipelines ────────────────────────────────────────────
  // Overview of all projects' pipelines (powers the Pipelines page).
  router.get(
    "/pipelines",
    asyncHandler(async (_req, res) => {
      res.json({ success: true, data: pipelineService.listOverview() });
    }),
  );

  // Run a project's pipeline now (non-blocking; stream via WebSocket room
  // `project:pipeline:<name>`). Body `{ stage }` runs a single step.
  router.post(
    "/projects/:name/pipeline/run",
    asyncHandler(async (req, res) => {
      const { name } = req.params;
      const stage = (req.body?.stage as string) || undefined;
      if (!projectService.getProject(name)) {
        return res.status(404).json({ success: false, message: "Project not found" });
      }
      if (pipelineService.isRunning(name)) {
        return res.status(409).json({ success: false, message: "Pipeline already running" });
      }
      const run = pipelineService.startRun(name, "manual", stage ? [stage] : undefined);
      res.status(202).json({ success: true, data: run });
    }),
  );

  // The resolved stage definition for a project (from .acm/pipeline.yml or default).
  router.get(
    "/projects/:name/pipeline/definition",
    asyncHandler(async (req, res) => {
      const project = projectService.getProject(req.params.name);
      if (!project) {
        return res.status(404).json({ success: false, message: "Project not found" });
      }
      res.json({ success: true, data: pipelineService.loadDefinition(project.path) });
    }),
  );

  router.get(
    "/projects/:name/pipeline/runs",
    asyncHandler(async (req, res) => {
      res.json({ success: true, data: pipelineService.listRuns(req.params.name) });
    }),
  );

  router.get(
    "/projects/:name/pipeline/runs/:id",
    asyncHandler(async (req, res) => {
      const run = pipelineService.getRun(req.params.id);
      if (!run || run.projectName !== req.params.name) {
        return res.status(404).json({ success: false, message: "Run not found" });
      }
      res.json({ success: true, data: run });
    }),
  );

  // Webhook URL + secret for a project (creates one on first read).
  router.get(
    "/projects/:name/pipeline/webhook",
    asyncHandler(async (req, res) => {
      if (!projectService.getProject(req.params.name)) {
        return res.status(404).json({ success: false, message: "Project not found" });
      }
      const secret = pipelineService.getOrCreateSecret(req.params.name);
      res.json({
        success: true,
        data: { path: `/api/webhooks/pipeline/${req.params.name}`, secret },
      });
    }),
  );

  router.post(
    "/projects/:name/pipeline/webhook/regenerate",
    asyncHandler(async (req, res) => {
      if (!projectService.getProject(req.params.name)) {
        return res.status(404).json({ success: false, message: "Project not found" });
      }
      const secret = pipelineService.regenerateSecret(req.params.name);
      res.json({
        success: true,
        data: { path: `/api/webhooks/pipeline/${req.params.name}`, secret },
      });
    }),
  );

  // Approve or reject a stage paused at a manual gate. Body: { decision }.
  router.post(
    "/projects/:name/pipeline/runs/:id/stages/:stage/approve",
    asyncHandler(async (req, res) => {
      const { name, id, stage } = req.params;
      const decision = req.body?.decision === "reject" ? "reject" : "approve";
      const run = pipelineService.getRun(id);
      if (!run || run.projectName !== name) {
        return res.status(404).json({ success: false, message: "Run not found" });
      }
      const ok = pipelineService.resolveApproval(id, stage, decision);
      if (!ok) {
        return res
          .status(409)
          .json({ success: false, message: "Stage is not awaiting approval" });
      }
      res.json({ success: true, data: { decision } });
    }),
  );

  // Download a captured artifact from a stage. A file is sent as-is; a directory
  // (e.g. a Playwright HTML report) is streamed as a .tgz so the whole report
  // comes down as one archive — the pipeline definition just lists the folder.
  router.get(
    "/projects/:name/pipeline/runs/:id/stages/:stage/artifacts/:file",
    asyncHandler(async (req, res) => {
      const { name, id, stage, file } = req.params;
      const run = pipelineService.getRun(id);
      if (!run || run.projectName !== name) {
        return res.status(404).json({ success: false, message: "Run not found" });
      }
      const abs = pipelineService.resolveArtifact(id, stage, file);
      if (!abs) {
        return res.status(404).json({ success: false, message: "Artifact not found" });
      }
      if (!fs.statSync(abs).isDirectory()) {
        return res.download(abs);
      }
      // Directory → stream a gzipped tar of it.
      const base = path.basename(abs);
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="${base}.tgz"`);
      const tar = spawn("tar", ["-czf", "-", "-C", path.dirname(abs), base]);
      tar.stdout.pipe(res);
      tar.stderr.on("data", () => {});
      tar.on("error", () => {
        if (!res.headersSent) res.status(500).json({ success: false, message: "Failed to archive artifact" });
        else res.end();
      });
    }),
  );
}
