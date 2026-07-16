import { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

import DockerService from "./docker-service";
import ProjectService, { PROJECT_ENVIRONMENTS } from "./project-service";
import { MetricsCollector } from "./metrics-collector";
import { PipelineService } from "./pipeline-service";
import { SettingsService } from "./settings-service";
import { AuthService } from "./auth-service";
import { Logger } from "../utils/logger";

/**
 * MCP (Model Context Protocol) server for Advanced Container Manager.
 *
 * Exposes the platform's project/container/image/system actions as MCP tools
 * so an AI assistant (Claude Code, claude.ai connectors, or any MCP client)
 * can manage the host without SSH access. Mounted at POST /mcp using the
 * stateless Streamable HTTP transport — every request carries a full
 * initialize/call cycle, so no session state is kept server-side.
 */

interface McpDeps {
  dockerService: DockerService;
  projectService: ProjectService;
  metricsCollector: MetricsCollector;
  pipelineService: PipelineService;
  settingsService: SettingsService;
  authService: AuthService;
  logger: Logger;
}

const ENV_VALUES = [...PROJECT_ENVIRONMENTS] as [string, ...string[]];

function ok(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data ?? { success: true }, null, 2) },
    ],
  };
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

/** Wrap a handler so service errors come back as MCP tool errors, not crashes. */
function tool<T>(fn: (args: T) => Promise<unknown>) {
  return async (args: T) => {
    try {
      return ok(await fn(args));
    } catch (error) {
      return fail(error);
    }
  };
}

function buildServer(deps: McpDeps): McpServer {
  const { dockerService, projectService, metricsCollector, pipelineService } =
    deps;

  const server = new McpServer({
    name: "advanced-container-manager",
    version: "1.0.0",
  });

  /* ── Projects ─────────────────────────────────────────────── */

  server.registerTool(
    "list_projects",
    {
      description:
        "List all projects with status, branch, repository, ports and tunnel info. Start here to discover what is deployed.",
    },
    tool(async () => projectService.getProjectsSummary()),
  );

  server.registerTool(
    "get_project",
    {
      description:
        "Get full details for one project: status, repo, branch, compose file, ports, env var keys, build/deploy history, health checks.",
      inputSchema: { name: z.string().describe("Project name") },
    },
    tool(async ({ name }) => {
      const project = projectService.getProject(name);
      if (!project) throw new Error(`Project ${name} not found`);
      // Never expose env var values over MCP — keys only.
      return {
        ...project,
        environmentVars: Object.keys(project.environmentVars || {}),
        envOverrides: Object.fromEntries(
          Object.entries(project.envOverrides || {}).map(([env, vars]) => [
            env,
            Object.keys(vars || {}),
          ]),
        ),
      };
    }),
  );

  server.registerTool(
    "list_environments",
    {
      description:
        "Live status of a project's environments (dev/test/prod) — which are running and their compose project names.",
      inputSchema: { name: z.string().describe("Project name") },
    },
    tool(async ({ name }) => projectService.getEnvironments(name)),
  );

  server.registerTool(
    "sync_project",
    {
      description:
        "Git-pull the project's repository to the latest commit on its configured branch. Does not deploy.",
      inputSchema: { name: z.string().describe("Project name") },
    },
    tool(async ({ name }) => projectService.pullLatestProject(name)),
  );

  server.registerTool(
    "deploy_project",
    {
      description:
        "Sync the repository, then build and deploy the project to PRODUCTION (docker compose up -d --build). Long-running.",
      inputSchema: { name: z.string().describe("Project name") },
    },
    tool(async ({ name }) => {
      const sync = await projectService.pullLatestProject(name);
      const deploy = await projectService.deployProject(name);
      return { sync, deploy: { containerIds: deploy.containerIds, command: deploy.command } };
    }),
  );

  server.registerTool(
    "build_project",
    {
      description:
        "Build the project's images without starting containers. Long-running.",
      inputSchema: { name: z.string().describe("Project name") },
    },
    tool(async ({ name }) => {
      await projectService.buildProject(name);
      return { built: name };
    }),
  );

  server.registerTool(
    "deploy_environment",
    {
      description:
        "Start (deploy) one environment of a project — dev, test or prod — with its per-environment variable overrides applied. Long-running.",
      inputSchema: {
        name: z.string().describe("Project name"),
        env: z.enum(ENV_VALUES).describe("Environment: dev, test or prod"),
      },
    },
    tool(async ({ name, env }) => projectService.deployEnvironment(name, env)),
  );

  server.registerTool(
    "stop_environment",
    {
      description: "Stop one environment of a project (docker compose down).",
      inputSchema: {
        name: z.string().describe("Project name"),
        env: z.enum(ENV_VALUES).describe("Environment: dev, test or prod"),
      },
    },
    tool(async ({ name, env }) => {
      await projectService.stopEnvironment(name, env);
      return { stopped: `${name} (${env})` };
    }),
  );

  server.registerTool(
    "restart_environment",
    {
      description:
        "Restart one environment's containers in place (no rebuild, no config reload).",
      inputSchema: {
        name: z.string().describe("Project name"),
        env: z.enum(ENV_VALUES).describe("Environment: dev, test or prod"),
      },
    },
    tool(async ({ name, env }) => {
      await projectService.restartEnvironment(name, env);
      return { restarted: `${name} (${env})` };
    }),
  );

  server.registerTool(
    "get_project_logs",
    {
      description:
        "Recent logs from every container of a project. Use after a deploy or when diagnosing a failing project.",
      inputSchema: {
        name: z.string().describe("Project name"),
        tail: z
          .number()
          .int()
          .min(1)
          .max(2000)
          .optional()
          .describe("Number of log lines per container (default 200)"),
      },
    },
    tool(async ({ name, tail }) => projectService.getProjectLogs(name, tail ?? 200)),
  );

  server.registerTool(
    "get_project_health",
    {
      description:
        "Health check for a project: container states plus HTTP checks on its exposed ports.",
      inputSchema: { name: z.string().describe("Project name") },
    },
    tool(async ({ name }) => projectService.getProjectHealth(name)),
  );

  server.registerTool(
    "trigger_pipeline",
    {
      description:
        "Trigger a project's CI pipeline run (checkout → stages → deploy). Returns the run id; poll get_pipeline_run for status.",
      inputSchema: { name: z.string().describe("Project name") },
    },
    tool(async ({ name }) => {
      if (!projectService.getProject(name)) {
        throw new Error(`Project ${name} not found`);
      }
      if (pipelineService.isRunning(name)) {
        throw new Error(`Pipeline already running for ${name}`);
      }
      const run = pipelineService.startRun(name, "mcp");
      return { runId: run.id, status: run.status };
    }),
  );

  /* ── Containers ───────────────────────────────────────────── */

  server.registerTool(
    "list_containers",
    {
      description:
        "List all Docker containers with status, image, ports and labels.",
    },
    tool(async () => {
      const containers = await dockerService.getAllContainers();
      return containers.map((c: any) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        image: c.image,
        ports: c.ports,
        labels: c.labels,
      }));
    }),
  );

  server.registerTool(
    "container_action",
    {
      description:
        "Start, stop, restart or remove a Docker container by id or name.",
      inputSchema: {
        containerId: z.string().describe("Container id (or 12-char short id)"),
        action: z.enum(["start", "stop", "restart", "remove"]),
      },
    },
    tool(async ({ containerId, action }) => {
      switch (action) {
        case "start":
          await dockerService.startContainer(containerId);
          break;
        case "stop":
          await dockerService.stopContainer(containerId);
          break;
        case "restart":
          await dockerService.restartContainer(containerId);
          break;
        case "remove":
          await dockerService.removeContainer(containerId, true);
          break;
      }
      return { [action]: containerId };
    }),
  );

  server.registerTool(
    "get_container_logs",
    {
      description: "Fetch recent logs from one container.",
      inputSchema: {
        containerId: z.string().describe("Container id"),
        tail: z
          .number()
          .int()
          .min(1)
          .max(5000)
          .optional()
          .describe("Number of log lines (default 200)"),
      },
    },
    tool(async ({ containerId, tail }) =>
      dockerService.getContainerLogs(containerId, { tail: tail ?? 200 }),
    ),
  );

  server.registerTool(
    "get_container_stats",
    {
      description:
        "Live CPU/memory/network/disk stats for one running container.",
      inputSchema: { containerId: z.string().describe("Container id") },
    },
    tool(async ({ containerId }) => dockerService.getContainerStats(containerId)),
  );

  /* ── Images / volumes / networks ──────────────────────────── */

  server.registerTool(
    "list_images",
    { description: "List Docker images with tags and sizes." },
    tool(async () => {
      const images = await dockerService.getAllImages();
      return images.map((img: any) => ({
        id: img.id,
        tags: img.tags,
        size: img.size,
        created: img.created,
      }));
    }),
  );

  server.registerTool(
    "pull_image",
    {
      description:
        "Pull a Docker image from a registry (e.g. 'nginx:latest'). Long-running.",
      inputSchema: {
        image: z.string().describe("Image reference, e.g. redis:7-alpine"),
      },
    },
    tool(async ({ image }) => {
      await dockerService.pullImage(image);
      return { pulled: image };
    }),
  );

  server.registerTool(
    "list_volumes",
    { description: "List Docker volumes." },
    tool(async () => dockerService.getAllVolumes()),
  );

  server.registerTool(
    "list_networks",
    { description: "List Docker networks." },
    tool(async () => dockerService.getAllNetworks()),
  );

  /* ── System ───────────────────────────────────────────────── */

  server.registerTool(
    "get_system_metrics",
    {
      description:
        "Current host metrics: CPU, memory, disk usage, network IO, load average, uptime.",
    },
    tool(async () => metricsCollector.collectSystemMetrics()),
  );

  server.registerTool(
    "get_system_status",
    {
      description:
        "Docker daemon status and version plus a metrics summary — use to confirm the host is healthy.",
    },
    tool(async () => ({
      docker: {
        connected: dockerService.isConnected(),
        version: await dockerService.getVersion(),
      },
      metrics: metricsCollector.getMetricsSummary(),
      timestamp: new Date().toISOString(),
    })),
  );

  return server;
}

/**
 * Express handler for POST /mcp (stateless Streamable HTTP).
 * Honors the same auth rule as the REST API: when security.requireAuth is
 * enabled, a valid Bearer session token is required.
 */
export function createMcpHandler(deps: McpDeps) {
  return async (req: Request, res: Response): Promise<void> => {
    const requireAuth = deps.settingsService.getSectionValue<boolean>(
      "security",
      "requireAuth",
    );
    if (requireAuth) {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token || !deps.authService.validateSession(token)) {
        res.status(401).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Unauthorized" },
          id: null,
        });
        return;
      }
    }

    try {
      const server = buildServer(deps);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless — one exchange per request
        enableJsonResponse: true,
      });
      res.on("close", () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      deps.logger.error("MCP request failed:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  };
}

/** GET/DELETE /mcp are not supported in stateless mode. */
export function mcpMethodNotAllowed(_req: Request, res: Response): void {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST /mcp." },
    id: null,
  });
}
