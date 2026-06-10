import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import * as crypto from "crypto";
import * as yaml from "js-yaml";
import { AppConfig } from "../types";
import { Logger } from "../utils/logger";
import type { WebSocketHandler } from "./websocket-handler";
import type { ProjectService } from "./project-service";

const Database = require("better-sqlite3");

const LOG_CAP = 100_000; // per-stage log cap (chars) to keep DB rows sane

// ── Definition schema ──────────────────────────────────────
// When a stage runs relative to the rest of the run.
//   on_success (default): run only if nothing has failed yet
//   on_failure          : run only if a prior stage failed (rollback/cleanup hooks)
//   always              : run regardless of prior failure
//   manual              : pause and wait for an explicit approve/reject (gate)
export type StageWhen = "on_success" | "on_failure" | "always" | "manual";

export interface HealthCheckDef {
  url?: string; // HTTP GET — passes when the response status matches expectStatus
  command?: string; // shell command — passes on exit 0
  expectStatus?: number; // default 200
  retries?: number; // default 20 attempts
  intervalSec?: number; // default 3s between attempts
}

export interface PipelineStageDef {
  name: string;
  run: string[];
  continueOnError?: boolean;
  needs?: string[]; // DAG deps (other stage names). Empty ⇒ depends only on checkout.
  branches?: string[]; // glob list; stage is skipped unless the current branch matches
  when?: StageWhen; // default "on_success"
  timeoutSec?: number; // per-command timeout; the command is killed if exceeded
  retries?: number; // retry the whole stage this many times on failure (default 0)
  healthcheck?: HealthCheckDef; // run after the stage's commands; failure fails the stage
  artifacts?: string[]; // file/dir paths to capture after the stage (relative to project)
}

export interface PipelineNotifyDef {
  webhook?: string; // Slack-compatible incoming webhook (JSON { text })
  onFailureOnly?: boolean; // only notify on failure (default: notify on both)
}

export interface PipelineDefinition {
  stages: PipelineStageDef[];
  notify?: PipelineNotifyDef;
}

export type StageStatus =
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "skipped"
  | "awaiting_approval";

export type RunStatus = "running" | "success" | "failed" | "awaiting_approval";

export interface PipelineStageResult {
  name: string;
  status: StageStatus;
  exitCode?: number;
  durationMs?: number;
  log: string;
  attempts?: number; // how many times the stage ran (incl. retries)
  artifacts?: string[]; // captured artifact file names (relative to the run's artifact dir)
}

export interface PipelineRun {
  id: string;
  projectName: string;
  trigger: "manual" | "webhook" | "schedule";
  status: RunStatus;
  branch?: string;
  stages: PipelineStageResult[];
  startedAt: string;
  finishedAt?: string;
}

// Mirrors the current ACM behavior so a project with no pipeline file still works.
const DEFAULT_STAGES: PipelineStageDef[] = [
  { name: "deploy", run: ["docker compose up -d --build"] },
];

/**
 * Native CI/CD for ACM projects. Reuses the existing project model (git clone/
 * pull, env vars, SQLite, WebSocket log rooms) and adds a real pipeline engine:
 *
 *   • DAG scheduling with `needs` — independent stages run in parallel
 *   • conditions — `branches` (glob) and `when` (on_success / on_failure / always / manual)
 *   • manual approval gates that pause the run until approved/rejected
 *   • per-stage timeouts and retries
 *   • health-gated stages (HTTP/command probe) for safe deploys
 *   • rollback/cleanup hooks via `when: on_failure`
 *   • artifact capture (downloadable) and failure/success notifications
 *
 * Pipeline definition: `.acm/pipeline.yml` in the repo, e.g.
 *   notify:
 *     webhook: https://hooks.slack.com/services/...
 *   stages:
 *     - name: quality
 *       run: ["docker compose -f docker-compose.ci.yml run --rm quality"]
 *       timeoutSec: 900
 *     - name: e2e
 *       needs: [quality]
 *       run: ["..."]
 *     - name: approve-prod
 *       needs: [e2e]
 *       when: manual
 *       branches: [main]
 *       run: ["echo approved"]
 *     - name: deploy
 *       needs: [approve-prod]
 *       branches: [main]
 *       run: ["docker compose up -d --build"]
 *       healthcheck: { url: "http://localhost:3001/api/lessons", retries: 30, intervalSec: 2 }
 *     - name: rollback
 *       needs: [deploy]
 *       when: on_failure
 *       run: ["git reset --hard HEAD@{1}", "docker compose up -d --build"]
 *
 * Trust note: stages run arbitrary shell in the project dir. This is the same
 * trust boundary ACM already has (it builds Dockerfiles/compose from cloned
 * repos) — only add projects you trust. Webhook triggers require a secret.
 */
export class PipelineService {
  private db: any;
  private wsHandler?: WebSocketHandler;
  private running = new Set<string>(); // project names with an in-flight run
  // Pending manual-approval gates, keyed `${runId}:${stageName}` → resolver.
  private approvals = new Map<string, (decision: "approve" | "reject") => void>();
  private readonly artifactsRoot: string;

  constructor(
    private config: AppConfig,
    private logger: Logger,
    private projects: ProjectService,
  ) {
    this.db = new Database(this.config.databasePath);
    this.artifactsRoot = path.join(
      path.dirname(this.config.databasePath),
      "pipeline-artifacts",
    );
    this.initDb();
    this.reconcileInterruptedRuns();
  }

  /** A run can't survive a backend restart (the child process dies), so any run
   *  left "running"/"awaiting_approval" in the DB is orphaned — mark it failed on
   *  startup instead of leaving it stuck forever. */
  private reconcileInterruptedRuns(): void {
    const rows = this.db
      .prepare(
        "SELECT id, stages FROM pipeline_runs WHERE status IN ('running','awaiting_approval')",
      )
      .all();
    for (const r of rows) {
      let stages: PipelineStageResult[] = [];
      try {
        stages = JSON.parse(r.stages);
      } catch {
        /* leave empty */
      }
      for (const s of stages) {
        if (s.status === "running" || s.status === "awaiting_approval") {
          s.status = "failed";
          s.log = (s.log || "") + "\n[interrupted — server restarted]\n";
        } else if (s.status === "pending") {
          s.status = "skipped";
        }
      }
      this.db
        .prepare("UPDATE pipeline_runs SET status='failed', stages=?, finished_at=? WHERE id=?")
        .run(JSON.stringify(stages), new Date().toISOString(), r.id);
    }
    if (rows.length) {
      this.logger.warn(`Marked ${rows.length} interrupted pipeline run(s) as failed on startup`);
    }
  }

  public setWebSocketHandler(handler: WebSocketHandler): void {
    this.wsHandler = handler;
  }

  private initDb(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id           TEXT PRIMARY KEY,
        project_name TEXT NOT NULL,
        trigger      TEXT NOT NULL,
        status       TEXT NOT NULL,
        stages       TEXT NOT NULL,
        started_at   TEXT NOT NULL,
        finished_at  TEXT,
        branch       TEXT
      )
    `);
    // Older installs may predate the branch column — add it if missing.
    try {
      const cols = this.db.prepare("PRAGMA table_info(pipeline_runs)").all() as Array<{ name: string }>;
      if (!cols.some((c) => c.name === "branch")) {
        this.db.exec("ALTER TABLE pipeline_runs ADD COLUMN branch TEXT");
      }
    } catch {
      /* best-effort migration */
    }
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_pipeline_runs_project ON pipeline_runs (project_name, started_at)`,
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_config (
        project_name   TEXT PRIMARY KEY,
        webhook_secret TEXT NOT NULL
      )
    `);
  }

  // ── Definition ───────────────────────────────────────────
  private parseDefinition(file: string): PipelineDefinition {
    const doc = yaml.load(fs.readFileSync(file, "utf8")) as any;
    const raw = Array.isArray(doc?.stages) ? doc.stages : [];
    const stages: PipelineStageDef[] = raw
      .map((s: any) => this.normalizeStage(s))
      .filter((s: PipelineStageDef) => s.name && s.run.length > 0);

    // Drop `needs` that reference unknown stages so the scheduler can't deadlock.
    const names = new Set(stages.map((s) => s.name));
    for (const s of stages) {
      if (s.needs) s.needs = s.needs.filter((n) => names.has(n) && n !== s.name);
    }

    const notify =
      doc?.notify && typeof doc.notify === "object"
        ? {
            webhook: doc.notify.webhook ? String(doc.notify.webhook) : undefined,
            onFailureOnly: Boolean(doc.notify.onFailureOnly),
          }
        : undefined;

    return { stages, notify };
  }

  private normalizeStage(s: any): PipelineStageDef {
    const run = Array.isArray(s?.run)
      ? s.run.map((c: any) => String(c))
      : s?.run
        ? [String(s.run)]
        : [];
    const when: StageWhen = ["on_success", "on_failure", "always", "manual"].includes(s?.when)
      ? s.when
      : "on_success";
    const hc = s?.healthcheck;
    return {
      name: String(s?.name ?? "").trim(),
      run,
      continueOnError: Boolean(s?.continueOnError),
      needs: Array.isArray(s?.needs) ? s.needs.map((n: any) => String(n)) : undefined,
      branches: Array.isArray(s?.branches) ? s.branches.map((b: any) => String(b)) : undefined,
      when,
      timeoutSec: Number.isFinite(s?.timeoutSec) ? Number(s.timeoutSec) : undefined,
      retries: Number.isFinite(s?.retries) ? Math.max(0, Number(s.retries)) : undefined,
      healthcheck:
        hc && typeof hc === "object"
          ? {
              url: hc.url ? String(hc.url) : undefined,
              command: hc.command ? String(hc.command) : undefined,
              expectStatus: Number.isFinite(hc.expectStatus) ? Number(hc.expectStatus) : undefined,
              retries: Number.isFinite(hc.retries) ? Number(hc.retries) : undefined,
              intervalSec: Number.isFinite(hc.intervalSec) ? Number(hc.intervalSec) : undefined,
            }
          : undefined,
      artifacts: Array.isArray(s?.artifacts) ? s.artifacts.map((a: any) => String(a)) : undefined,
    };
  }

  private definitionFile(projectPath: string): string | undefined {
    return [
      path.join(projectPath, ".acm", "pipeline.yml"),
      path.join(projectPath, ".acm", "pipeline.yaml"),
    ].find((f) => fs.existsSync(f));
  }

  /** Full definition (stages + notify). Falls back to the default deploy-only flow. */
  public loadFullDefinition(projectPath: string): PipelineDefinition {
    const file = this.definitionFile(projectPath);
    if (!file) return { stages: DEFAULT_STAGES };
    try {
      const def = this.parseDefinition(file);
      return def.stages.length ? def : { stages: DEFAULT_STAGES };
    } catch (error) {
      this.logger.warn(`Failed to parse pipeline definition (${file}): ${error}`);
      return { stages: DEFAULT_STAGES };
    }
  }

  /** Stage list only — preserves the original array contract for the API/UI. */
  public loadDefinition(projectPath: string): PipelineStageDef[] {
    return this.loadFullDefinition(projectPath).stages;
  }

  // ── Webhook secrets ──────────────────────────────────────
  public getOrCreateSecret(projectName: string): string {
    const row = this.db
      .prepare("SELECT webhook_secret FROM pipeline_config WHERE project_name = ?")
      .get(projectName);
    if (row?.webhook_secret) return row.webhook_secret;
    const secret = crypto.randomBytes(24).toString("hex");
    this.db
      .prepare("INSERT INTO pipeline_config (project_name, webhook_secret) VALUES (?, ?)")
      .run(projectName, secret);
    return secret;
  }

  public regenerateSecret(projectName: string): string {
    const secret = crypto.randomBytes(24).toString("hex");
    this.db
      .prepare(
        `INSERT INTO pipeline_config (project_name, webhook_secret) VALUES (?, ?)
         ON CONFLICT(project_name) DO UPDATE SET webhook_secret = excluded.webhook_secret`,
      )
      .run(projectName, secret);
    return secret;
  }

  public verifySecret(projectName: string, provided: string | undefined): boolean {
    const row = this.db
      .prepare("SELECT webhook_secret FROM pipeline_config WHERE project_name = ?")
      .get(projectName);
    if (!row?.webhook_secret || !provided) return false;
    const a = Buffer.from(row.webhook_secret);
    const b = Buffer.from(String(provided));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // ── Run history ──────────────────────────────────────────
  public listRuns(projectName: string, limit = 20): PipelineRun[] {
    const rows = this.db
      .prepare("SELECT * FROM pipeline_runs WHERE project_name = ? ORDER BY started_at DESC LIMIT ?")
      .all(projectName, limit);
    return rows.map((r: any) => this.rowToRun(r));
  }

  public getRun(id: string): PipelineRun | null {
    const r = this.db.prepare("SELECT * FROM pipeline_runs WHERE id = ?").get(id);
    return r ? this.rowToRun(r) : null;
  }

  private rowToRun(r: any): PipelineRun {
    return {
      id: r.id,
      projectName: r.project_name,
      trigger: r.trigger,
      status: r.status,
      branch: r.branch ?? undefined,
      stages: JSON.parse(r.stages),
      startedAt: r.started_at,
      finishedAt: r.finished_at ?? undefined,
    };
  }

  private saveRun(run: PipelineRun): void {
    this.db
      .prepare(
        `INSERT INTO pipeline_runs (id, project_name, trigger, status, stages, started_at, finished_at, branch)
         VALUES (@id, @projectName, @trigger, @status, @stages, @startedAt, @finishedAt, @branch)
         ON CONFLICT(id) DO UPDATE SET status=excluded.status, stages=excluded.stages, finished_at=excluded.finished_at, branch=excluded.branch`,
      )
      .run({
        id: run.id,
        projectName: run.projectName,
        trigger: run.trigger,
        status: run.status,
        stages: JSON.stringify(run.stages),
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? null,
        branch: run.branch ?? null,
      });
  }

  // ── Overview (powers the Pipelines page) ─────────────────
  public listOverview(): Array<{
    name: string;
    stages: string[];
    hasDefinition: boolean;
    running: boolean;
    lastRun: { id: string; status: string; startedAt: string; finishedAt?: string } | null;
  }> {
    const projects = Array.from(
      (this.projects.getProjects() as Map<string, { name: string; path: string }>).values(),
    );
    return projects.map((p) => {
      const def = this.loadDefinition(p.path);
      const hasDefinition = !!this.definitionFile(p.path);
      const last = this.db
        .prepare(
          "SELECT id, status, started_at, finished_at FROM pipeline_runs WHERE project_name = ? ORDER BY started_at DESC LIMIT 1",
        )
        .get(p.name);
      return {
        name: p.name,
        stages: def.map((s) => s.name),
        hasDefinition,
        running: this.isRunning(p.name),
        lastRun: last
          ? {
              id: last.id,
              status: last.status,
              startedAt: last.started_at,
              finishedAt: last.finished_at ?? undefined,
            }
          : null,
      };
    });
  }

  // ── Execution ────────────────────────────────────────────
  public isRunning(projectName: string): boolean {
    return this.running.has(projectName);
  }

  /** Start a run (non-blocking). Returns the created run immediately; stages
   *  execute in the background and stream over WebSocket.
   *  `only` restricts execution to the named stages (the rest are skipped);
   *  use it to run a single step. checkout always runs. */
  public startRun(
    projectName: string,
    trigger: PipelineRun["trigger"],
    only?: string[],
  ): PipelineRun {
    const project = this.projects.getProject(projectName);
    if (!project) throw new Error(`Project ${projectName} not found`);
    if (this.running.has(projectName)) {
      throw new Error(`A pipeline is already running for ${projectName}`);
    }

    const def = this.loadFullDefinition(project.path);
    const stages: PipelineStageResult[] = [
      { name: "checkout", status: "pending", log: "" },
      ...def.stages.map((d) => ({
        name: d.name,
        status: (only && !only.includes(d.name) ? "skipped" : "pending") as StageStatus,
        log: "",
      })),
    ];
    const run: PipelineRun = {
      id: crypto.randomUUID(),
      projectName,
      trigger,
      status: "running",
      branch: project.branch,
      stages,
      startedAt: new Date().toISOString(),
    };
    this.running.add(projectName);
    this.saveRun(run);
    this.broadcastStatus(run, "started");

    // fire and forget — errors are captured into the run record
    void this.execute(run, project.path, project.environmentVars || {}, def);
    return run;
  }

  /** Approve or reject a stage that is paused at a manual gate. */
  public resolveApproval(runId: string, stageName: string, decision: "approve" | "reject"): boolean {
    const key = `${runId}:${stageName}`;
    const resolver = this.approvals.get(key);
    if (!resolver) return false;
    this.approvals.delete(key);
    resolver(decision);
    return true;
  }

  private async execute(
    run: PipelineRun,
    projectPath: string,
    env: Record<string, string>,
    def: PipelineDefinition,
  ): Promise<void> {
    try {
      // Capture the commit BEFORE checkout pulls — that's the rollback target
      // (the previously-deployed code), exposed to stages as ACM_PREVIOUS_SHA.
      const previousSha = (await this.gitSha(projectPath)) || "";

      // Stage 0: checkout — pull latest so the pipeline runs on fresh code.
      const checkout = run.stages[0];
      const okCheckout = await this.runStageCheckout(run, checkout, projectPath, env);
      if (!okCheckout) {
        this.markRemainingSkipped(run, 1);
        return this.finishRun(run, "failed", def, env);
      }

      // Resolve the real current branch after checkout for branch conditions.
      const branch = (await this.currentBranch(projectPath)) || run.branch || "main";
      run.branch = branch;
      this.saveRun(run);

      // CI variables injected into every stage command (like other CI systems).
      // ACM_PREVIOUS_SHA gives rollback hooks a deterministic target instead of
      // relying on the reflog.
      const stageEnv: Record<string, string> = {
        ...env,
        ACM_RUN_ID: run.id,
        ACM_PROJECT: run.projectName,
        ACM_BRANCH: branch,
        ACM_PREVIOUS_SHA: previousSha,
        ACM_COMMIT_SHA: (await this.gitSha(projectPath)) || "",
      };

      await this.runGraph(run, def, projectPath, stageEnv, branch);

      const failed = run.stages.some(
        (s, i) => i > 0 && s.status === "failed" && !def.stages[i - 1]?.continueOnError,
      );
      this.finishRun(run, failed ? "failed" : "success", def, env);
    } catch (error) {
      this.logger.error(`Pipeline ${run.id} crashed: ${error}`);
      this.finishRun(run, "failed", def, env);
    }
  }

  /**
   * DAG scheduler: repeatedly run every stage whose `needs` are all terminal, in
   * parallel. `when`/`branches` decide whether a ready stage runs or is skipped.
   * A non-continueOnError failure flips `failed`, after which only on_failure /
   * always hooks run.
   */
  private async runGraph(
    run: PipelineRun,
    def: PipelineDefinition,
    projectPath: string,
    env: Record<string, string>,
    branch: string,
  ): Promise<void> {
    const stages = def.stages;
    const resultByName = new Map<string, PipelineStageResult>();
    run.stages.forEach((s) => resultByName.set(s.name, s));
    const defByName = new Map(stages.map((d) => [d.name, d]));

    // "checkout" is an implicit, already-succeeded dependency for everyone.
    const isTerminal = (name: string): boolean => {
      if (name === "checkout") return run.stages[0].status === "success";
      const r = resultByName.get(name);
      return !!r && ["success", "failed", "skipped"].includes(r.status);
    };
    const needsOf = (d: PipelineStageDef): string[] =>
      d.needs && d.needs.length ? d.needs : ["checkout"];

    let failed = false;

    // Loop until every stage reached a terminal state.
    // Each iteration runs one "wave" of ready stages concurrently.
    /* eslint-disable no-constant-condition */
    while (true) {
      const result = (d: PipelineStageDef) => resultByName.get(d.name)!;
      const pending = stages.filter((d) => result(d).status === "pending");
      if (pending.length === 0) break;

      const ready = pending.filter((d) => needsOf(d).every(isTerminal));
      if (ready.length === 0) {
        // Nothing can advance (cycle or all deps skipped/failed upstream) — stop.
        for (const d of pending) {
          const r = result(d);
          r.status = "skipped";
          this.appendLog(run, r, "[skipped — dependencies not satisfied]\n");
        }
        this.saveRun(run);
        break;
      }

      // Manual gates pause the run, so resolve them one at a time before the
      // parallel batch (they're naturally serialized by their deps anyway).
      const gates = ready.filter((d) => (d.when ?? "on_success") === "manual");
      const batch = ready.filter((d) => (d.when ?? "on_success") !== "manual");

      for (const d of gates) {
        const decided = await this.runOneStage(run, d, result(d), projectPath, env, branch, failed);
        if (decided === "failed") failed = true;
      }

      const outcomes = await Promise.all(
        batch.map((d) => this.runOneStage(run, d, result(d), projectPath, env, branch, failed)),
      );
      if (outcomes.includes("failed")) failed = true;
    }
  }

  /**
   * Evaluate a single stage's conditions then run it (with retries/timeout/
   * healthcheck/artifacts) or skip it. Returns the effect on the run's failure
   * state: "failed" (counts as a run failure), or "ok" (success, skipped, or a
   * continueOnError failure).
   */
  private async runOneStage(
    run: PipelineRun,
    d: PipelineStageDef,
    stage: PipelineStageResult,
    projectPath: string,
    env: Record<string, string>,
    branch: string,
    failed: boolean,
  ): Promise<"ok" | "failed"> {
    const when = d.when ?? "on_success";

    // Branch filter.
    if (d.branches && d.branches.length && !d.branches.some((p) => this.globMatch(p, branch))) {
      stage.status = "skipped";
      this.appendLog(run, stage, `[skipped — branch '${branch}' not in ${JSON.stringify(d.branches)}]\n`);
      this.saveRun(run);
      return "ok";
    }
    // Run-state condition.
    if (when === "on_success" && failed) {
      stage.status = "skipped";
      this.appendLog(run, stage, "[skipped — a previous stage failed]\n");
      this.saveRun(run);
      return "ok";
    }
    if (when === "on_failure" && !failed) {
      stage.status = "skipped";
      this.appendLog(run, stage, "[skipped — runs only on failure]\n");
      this.saveRun(run);
      return "ok";
    }

    // Manual approval gate.
    if (when === "manual") {
      const approved = await this.awaitApproval(run, stage);
      if (!approved) {
        stage.status = "failed";
        stage.exitCode = 1;
        this.saveRun(run);
        return d.continueOnError ? "ok" : "failed";
      }
    }

    const ok = await this.runStageCommands(run, stage, d, projectPath, env);
    return ok || d.continueOnError ? "ok" : "failed";
  }

  private async awaitApproval(run: PipelineRun, stage: PipelineStageResult): Promise<boolean> {
    stage.status = "awaiting_approval";
    run.status = "awaiting_approval";
    this.appendLog(run, stage, "[awaiting manual approval]\n");
    this.broadcastStatus(run, "awaiting_approval", stage.name);
    this.saveRun(run);

    const decision = await new Promise<"approve" | "reject">((resolve) => {
      this.approvals.set(`${run.id}:${stage.name}`, resolve);
    });

    run.status = "running";
    this.appendLog(run, stage, `[${decision === "approve" ? "approved" : "rejected"}]\n`);
    this.broadcastStatus(run, "running", stage.name);
    this.saveRun(run);
    return decision === "approve";
  }

  private async runStageCheckout(
    run: PipelineRun,
    stage: PipelineStageResult,
    projectPath: string,
    env: Record<string, string>,
  ): Promise<boolean> {
    const started = Date.now();
    stage.status = "running";
    this.broadcastStatus(run, "stage", stage.name);
    this.saveRun(run);
    // Non-destructive fast-forward pull. We deliberately do NOT use the project
    // service's "pull latest" here: that stops the project's containers before
    // syncing, which would take the running app down for the whole pipeline —
    // including any manual-approval wait — before the deploy stage brings it
    // back. The deploy stage is what (re)starts containers; checkout only moves
    // the code. A non-fast-forwardable history fails the stage cleanly.
    this.appendLog(run, stage, "$ git pull --ff-only\n");
    const code = await this.execCommand("git pull --ff-only", projectPath, env, 120, (c) =>
      this.appendLog(run, stage, c),
    );
    stage.exitCode = code;
    stage.durationMs = Date.now() - started;
    stage.status = code === 0 ? "success" : "failed";
    if (code !== 0) this.appendLog(run, stage, `\n[checkout failed — exit ${code}]\n`);
    this.saveRun(run);
    return code === 0;
  }

  private async runStageCommands(
    run: PipelineRun,
    stage: PipelineStageResult,
    def: PipelineStageDef,
    cwd: string,
    env: Record<string, string>,
  ): Promise<boolean> {
    const started = Date.now();
    const maxAttempts = 1 + (def.retries ?? 0);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      stage.status = "running";
      stage.attempts = attempt;
      this.broadcastStatus(run, "stage", stage.name);
      if (attempt > 1) this.appendLog(run, stage, `\n[retry ${attempt}/${maxAttempts}]\n`);
      this.saveRun(run);

      const ok = await this.runCommandsOnce(run, stage, def, cwd, env);
      if (ok) {
        // Commands passed — now gate on the health check, if any.
        const healthy = def.healthcheck ? await this.runHealthCheck(run, stage, def, cwd, env) : true;
        if (healthy) {
          if (def.artifacts?.length) await this.captureArtifacts(run, stage, def.artifacts, cwd);
          stage.status = "success";
          stage.exitCode = 0;
          stage.durationMs = Date.now() - started;
          this.saveRun(run);
          return true;
        }
      }
      if (attempt === maxAttempts) {
        stage.status = "failed";
        stage.exitCode = stage.exitCode ?? 1;
        stage.durationMs = Date.now() - started;
        this.saveRun(run);
        return false;
      }
    }
    return false;
  }

  private async runCommandsOnce(
    run: PipelineRun,
    stage: PipelineStageResult,
    def: PipelineStageDef,
    cwd: string,
    env: Record<string, string>,
  ): Promise<boolean> {
    for (const command of def.run) {
      this.appendLog(run, stage, `\n$ ${command}\n`);
      const code = await this.execCommand(command, cwd, env, def.timeoutSec, (chunk) =>
        this.appendLog(run, stage, chunk),
      );
      if (code !== 0) {
        this.appendLog(run, stage, `\n[exit ${code}]\n`);
        stage.exitCode = code;
        return false;
      }
    }
    return true;
  }

  private async runHealthCheck(
    run: PipelineRun,
    stage: PipelineStageResult,
    def: PipelineStageDef,
    cwd: string,
    env: Record<string, string>,
  ): Promise<boolean> {
    const hc = def.healthcheck!;
    const retries = hc.retries ?? 20;
    const interval = (hc.intervalSec ?? 3) * 1000;
    const expect = hc.expectStatus ?? 200;
    this.appendLog(run, stage, `\n[healthcheck] ${hc.url ?? hc.command} (≤${retries} tries)\n`);

    for (let i = 1; i <= retries; i++) {
      let ok = false;
      if (hc.url) {
        ok = await this.probeUrl(hc.url, expect);
      } else if (hc.command) {
        const code = await this.execCommand(hc.command, cwd, env, def.timeoutSec, () => {});
        ok = code === 0;
      } else {
        ok = true; // nothing to probe
      }
      if (ok) {
        this.appendLog(run, stage, `[healthcheck] passed on try ${i}\n`);
        return true;
      }
      if (i < retries) await this.sleep(interval);
    }
    this.appendLog(run, stage, `[healthcheck] failed after ${retries} tries\n`);
    return false;
  }

  private async probeUrl(url: string, expect: number): Promise<boolean> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(t);
      return res.status === expect;
    } catch {
      return false;
    }
  }

  private async captureArtifacts(
    run: PipelineRun,
    stage: PipelineStageResult,
    globs: string[],
    cwd: string,
  ): Promise<void> {
    const destDir = path.join(this.artifactsRoot, run.id, stage.name);
    const saved: string[] = [];
    for (const rel of globs) {
      const src = path.resolve(cwd, rel);
      // Stay inside the project dir — never copy from arbitrary absolute paths.
      if (!src.startsWith(path.resolve(cwd) + path.sep) && src !== path.resolve(cwd)) {
        this.appendLog(run, stage, `[artifacts] skipped '${rel}' (outside project)\n`);
        continue;
      }
      if (!fs.existsSync(src)) {
        this.appendLog(run, stage, `[artifacts] not found: ${rel}\n`);
        continue;
      }
      try {
        const dest = path.join(destDir, path.basename(src));
        fs.mkdirSync(destDir, { recursive: true });
        fs.cpSync(src, dest, { recursive: true });
        saved.push(path.basename(src));
      } catch (e) {
        this.appendLog(run, stage, `[artifacts] failed to copy ${rel}: ${e}\n`);
      }
    }
    if (saved.length) {
      stage.artifacts = saved;
      this.appendLog(run, stage, `[artifacts] captured ${saved.join(", ")}\n`);
    }
  }

  /** Resolve an artifact file to an absolute path, guarding against traversal. */
  public resolveArtifact(runId: string, stageName: string, file: string): string | null {
    const base = path.join(this.artifactsRoot, runId, stageName);
    const target = path.resolve(base, file);
    if (!target.startsWith(path.resolve(base) + path.sep)) return null;
    return fs.existsSync(target) ? target : null;
  }

  private execCommand(
    command: string,
    cwd: string,
    env: Record<string, string>,
    timeoutSec: number | undefined,
    onData: (chunk: string) => void,
  ): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn(command, { cwd, env: { ...process.env, ...env }, shell: true });
      let timer: NodeJS.Timeout | undefined;
      let timedOut = false;
      if (timeoutSec && timeoutSec > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          onData(`\n[timeout — killed after ${timeoutSec}s]\n`);
          child.kill("SIGKILL");
        }, timeoutSec * 1000);
      }
      child.stdout.on("data", (d) => onData(d.toString()));
      child.stderr.on("data", (d) => onData(d.toString()));
      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        onData(`\n[spawn error] ${err.message}\n`);
        resolve(1);
      });
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        resolve(timedOut ? 124 : (code ?? 0));
      });
    });
  }

  private gitSha(cwd: string): Promise<string | null> {
    return new Promise((resolve) => {
      let out = "";
      const child = spawn("git", ["rev-parse", "HEAD"], { cwd, shell: false });
      child.stdout.on("data", (d) => (out += d.toString()));
      child.on("error", () => resolve(null));
      child.on("close", (code) => resolve(code === 0 ? out.trim() || null : null));
    });
  }

  private currentBranch(cwd: string): Promise<string | null> {
    return new Promise((resolve) => {
      let out = "";
      const child = spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, shell: false });
      child.stdout.on("data", (d) => (out += d.toString()));
      child.on("error", () => resolve(null));
      child.on("close", (code) => resolve(code === 0 ? out.trim() || null : null));
    });
  }

  /** Minimal glob: `*` matches any run of characters (enough for branch names). */
  private globMatch(pattern: string, value: string): boolean {
    if (pattern === value) return true;
    const re = new RegExp(
      "^" + pattern.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$",
    );
    return re.test(value);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private markRemainingSkipped(run: PipelineRun, fromIndex: number): void {
    for (let i = fromIndex; i < run.stages.length; i++) {
      if (run.stages[i].status === "pending") run.stages[i].status = "skipped";
    }
  }

  private finishRun(
    run: PipelineRun,
    status: "success" | "failed",
    def: PipelineDefinition,
    env: Record<string, string>,
  ): void {
    run.status = status;
    run.finishedAt = new Date().toISOString();
    this.running.delete(run.projectName);
    // Drop any dangling approval resolvers for this run.
    for (const key of this.approvals.keys()) {
      if (key.startsWith(`${run.id}:`)) this.approvals.delete(key);
    }
    this.saveRun(run);
    this.broadcastStatus(run, status);
    this.logger.info(`Pipeline ${run.id} (${run.projectName}) finished: ${status}`);
    void this.notify(run, def, status, env);
  }

  private async notify(
    run: PipelineRun,
    def: PipelineDefinition,
    status: "success" | "failed",
    env: Record<string, string>,
  ): Promise<void> {
    // Resolve ${VAR} / $VAR in the webhook from the project env (keeps real
    // webhook URLs out of the committed pipeline file).
    const webhook = def.notify?.webhook?.replace(/\$\{?([A-Z0-9_]+)\}?/gi, (_m, name) =>
      env[name] ?? process.env[name] ?? "",
    );
    if (!webhook) return;
    if (def.notify?.onFailureOnly && status !== "failed") return;
    const icon = status === "success" ? "✅" : "❌";
    const failedStages = run.stages.filter((s) => s.status === "failed").map((s) => s.name);
    const text =
      `${icon} Pipeline *${run.projectName}* ${status}` +
      (run.branch ? ` on \`${run.branch}\`` : "") +
      (failedStages.length ? ` — failed: ${failedStages.join(", ")}` : "");
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    } catch (e) {
      this.logger.warn(`Pipeline notification failed for ${run.projectName}: ${e}`);
    }
  }

  private appendLog(run: PipelineRun, stage: PipelineStageResult, chunk: string): void {
    stage.log = (stage.log + chunk).slice(-LOG_CAP);
    this.wsHandler?.broadcastPipelineLog({
      projectName: run.projectName,
      runId: run.id,
      stage: stage.name,
      chunk,
      timestamp: new Date().toISOString(),
    });
  }

  private broadcastStatus(run: PipelineRun, status: string, stage?: string): void {
    this.wsHandler?.broadcastPipelineStatus({
      projectName: run.projectName,
      runId: run.id,
      status,
      stage,
      timestamp: new Date().toISOString(),
    });
  }
}
