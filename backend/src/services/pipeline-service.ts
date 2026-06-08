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

export interface PipelineStageDef {
  name: string;
  run: string[];
  continueOnError?: boolean;
}

export type StageStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface PipelineStageResult {
  name: string;
  status: StageStatus;
  exitCode?: number;
  durationMs?: number;
  log: string;
}

export interface PipelineRun {
  id: string;
  projectName: string;
  trigger: "manual" | "webhook" | "schedule";
  status: "running" | "success" | "failed";
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
 * pull, env vars, SQLite, WebSocket log rooms) and adds ordered, gated stages
 * with live logs, run history and triggers (manual + webhook).
 *
 * Pipeline definition: `.acm/pipeline.yml` in the repo, e.g.
 *   stages:
 *     - name: install
 *       run: ["npm ci"]
 *     - name: test
 *       run: ["npm test"]
 *     - name: deploy
 *       run: ["docker compose up -d --build"]
 *
 * Trust note: stages run arbitrary shell in the project dir. This is the same
 * trust boundary ACM already has (it builds Dockerfiles/compose from cloned
 * repos) — only add projects you trust. Webhook triggers require a secret.
 */
export class PipelineService {
  private db: any;
  private wsHandler?: WebSocketHandler;
  private running = new Set<string>(); // project names with an in-flight run

  constructor(
    private config: AppConfig,
    private logger: Logger,
    private projects: ProjectService,
  ) {
    this.db = new Database(this.config.databasePath);
    this.initDb();
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
        finished_at  TEXT
      )
    `);
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
  public loadDefinition(projectPath: string): PipelineStageDef[] {
    const candidates = [
      path.join(projectPath, ".acm", "pipeline.yml"),
      path.join(projectPath, ".acm", "pipeline.yaml"),
    ];
    const file = candidates.find((f) => fs.existsSync(f));
    if (!file) return DEFAULT_STAGES;
    try {
      const doc = yaml.load(fs.readFileSync(file, "utf8")) as any;
      const raw = Array.isArray(doc?.stages) ? doc.stages : [];
      const stages: PipelineStageDef[] = raw
        .map((s: any) => ({
          name: String(s?.name ?? "").trim(),
          run: Array.isArray(s?.run)
            ? s.run.map((c: any) => String(c))
            : s?.run
              ? [String(s.run)]
              : [],
          continueOnError: Boolean(s?.continueOnError),
        }))
        .filter((s: PipelineStageDef) => s.name && s.run.length > 0);
      return stages.length ? stages : DEFAULT_STAGES;
    } catch (error) {
      this.logger.warn(`Failed to parse pipeline definition (${file}): ${error}`);
      return DEFAULT_STAGES;
    }
  }

  // ── Webhook secrets ──────────────────────────────────────
  public getOrCreateSecret(projectName: string): string {
    const row = this.db
      .prepare("SELECT webhook_secret FROM pipeline_config WHERE project_name = ?")
      .get(projectName);
    if (row?.webhook_secret) return row.webhook_secret;
    const secret = crypto.randomBytes(24).toString("hex");
    this.db
      .prepare(
        "INSERT INTO pipeline_config (project_name, webhook_secret) VALUES (?, ?)",
      )
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
      .prepare(
        "SELECT * FROM pipeline_runs WHERE project_name = ? ORDER BY started_at DESC LIMIT ?",
      )
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
      stages: JSON.parse(r.stages),
      startedAt: r.started_at,
      finishedAt: r.finished_at ?? undefined,
    };
  }

  private saveRun(run: PipelineRun): void {
    this.db
      .prepare(
        `INSERT INTO pipeline_runs (id, project_name, trigger, status, stages, started_at, finished_at)
         VALUES (@id, @projectName, @trigger, @status, @stages, @startedAt, @finishedAt)
         ON CONFLICT(id) DO UPDATE SET status=excluded.status, stages=excluded.stages, finished_at=excluded.finished_at`,
      )
      .run({
        id: run.id,
        projectName: run.projectName,
        trigger: run.trigger,
        status: run.status,
        stages: JSON.stringify(run.stages),
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? null,
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
      const hasDefinition =
        fs.existsSync(path.join(p.path, ".acm", "pipeline.yml")) ||
        fs.existsSync(path.join(p.path, ".acm", "pipeline.yaml"));
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

    const def = this.loadDefinition(project.path);
    const stages: PipelineStageResult[] = [
      { name: "checkout", status: "pending", log: "" },
      ...def.map((d) => ({
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

  private async execute(
    run: PipelineRun,
    projectPath: string,
    env: Record<string, string>,
    def: PipelineStageDef[],
  ): Promise<void> {
    try {
      // Stage 0: checkout — pull latest so the pipeline runs on fresh code.
      const checkout = run.stages[0];
      const okCheckout = await this.runStageCheckout(run, checkout);
      if (!okCheckout) {
        this.markRemainingSkipped(run, 1);
        return this.finish(run, "failed");
      }

      for (let i = 0; i < def.length; i++) {
        const stage = run.stages[i + 1];
        if (stage.status === "skipped") continue; // not selected for this run
        const ok = await this.runStageCommands(run, stage, def[i], projectPath, env);
        if (!ok && !def[i].continueOnError) {
          this.markRemainingSkipped(run, i + 2);
          return this.finish(run, "failed");
        }
      }
      this.finish(run, "success");
    } catch (error) {
      this.logger.error(`Pipeline ${run.id} crashed: ${error}`);
      this.finish(run, "failed");
    }
  }

  private async runStageCheckout(
    run: PipelineRun,
    stage: PipelineStageResult,
  ): Promise<boolean> {
    const started = Date.now();
    stage.status = "running";
    this.broadcastStatus(run, "stage", stage.name);
    this.saveRun(run);
    try {
      const result = await this.projects.pullLatestProject(run.projectName);
      const out = (result?.output as string) || "Pulled latest.";
      this.appendLog(run, stage, out + "\n");
      stage.status = "success";
      stage.durationMs = Date.now() - started;
      stage.exitCode = 0;
      this.saveRun(run);
      return true;
    } catch (error) {
      this.appendLog(run, stage, `\n[checkout failed] ${error}\n`);
      stage.status = "failed";
      stage.exitCode = 1;
      stage.durationMs = Date.now() - started;
      this.saveRun(run);
      return false;
    }
  }

  private async runStageCommands(
    run: PipelineRun,
    stage: PipelineStageResult,
    def: PipelineStageDef,
    cwd: string,
    env: Record<string, string>,
  ): Promise<boolean> {
    const started = Date.now();
    stage.status = "running";
    this.broadcastStatus(run, "stage", stage.name);
    this.saveRun(run);

    for (const command of def.run) {
      this.appendLog(run, stage, `\n$ ${command}\n`);
      const code = await this.execCommand(command, cwd, env, (chunk) => {
        this.appendLog(run, stage, chunk);
      });
      if (code !== 0) {
        this.appendLog(run, stage, `\n[exit ${code}]\n`);
        stage.status = "failed";
        stage.exitCode = code;
        stage.durationMs = Date.now() - started;
        this.saveRun(run);
        return false;
      }
    }
    stage.status = "success";
    stage.exitCode = 0;
    stage.durationMs = Date.now() - started;
    this.saveRun(run);
    return true;
  }

  private execCommand(
    command: string,
    cwd: string,
    env: Record<string, string>,
    onData: (chunk: string) => void,
  ): Promise<number> {
    return new Promise((resolve) => {
      const child = spawn(command, {
        cwd,
        env: { ...process.env, ...env },
        shell: true,
      });
      child.stdout.on("data", (d) => onData(d.toString()));
      child.stderr.on("data", (d) => onData(d.toString()));
      child.on("error", (err) => {
        onData(`\n[spawn error] ${err.message}\n`);
        resolve(1);
      });
      child.on("close", (code) => resolve(code ?? 0));
    });
  }

  private markRemainingSkipped(run: PipelineRun, fromIndex: number): void {
    for (let i = fromIndex; i < run.stages.length; i++) {
      if (run.stages[i].status === "pending") run.stages[i].status = "skipped";
    }
  }

  private finish(run: PipelineRun, status: "success" | "failed"): void {
    run.status = status;
    run.finishedAt = new Date().toISOString();
    this.running.delete(run.projectName);
    this.saveRun(run);
    this.broadcastStatus(run, status);
    this.logger.info(`Pipeline ${run.id} (${run.projectName}) finished: ${status}`);
  }

  private appendLog(
    run: PipelineRun,
    stage: PipelineStageResult,
    chunk: string,
  ): void {
    stage.log = (stage.log + chunk).slice(-LOG_CAP);
    this.wsHandler?.broadcastPipelineLog({
      projectName: run.projectName,
      runId: run.id,
      stage: stage.name,
      chunk,
      timestamp: new Date().toISOString(),
    });
  }

  private broadcastStatus(
    run: PipelineRun,
    status: string,
    stage?: string,
  ): void {
    this.wsHandler?.broadcastPipelineStatus({
      projectName: run.projectName,
      runId: run.id,
      status,
      stage,
      timestamp: new Date().toISOString(),
    });
  }
}
