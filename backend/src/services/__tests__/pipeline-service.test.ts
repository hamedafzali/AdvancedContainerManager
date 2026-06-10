import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Replace the native better-sqlite3 with a tiny in-memory store so the engine's
// logic can be tested on any Node version (no native ABI dependency). Only the
// handful of statements the service issues are interpreted.
jest.mock("better-sqlite3", () => {
  const store = new Map<string, any>();
  class FakeDatabase {
    exec() {}
    prepare(sql: string) {
      return {
        run: (arg: any) => {
          if (sql.includes("INSERT INTO pipeline_runs")) {
            store.set(arg.id, {
              id: arg.id,
              project_name: arg.projectName,
              trigger: arg.trigger,
              status: arg.status,
              stages: arg.stages,
              started_at: arg.startedAt,
              finished_at: arg.finishedAt,
              branch: arg.branch,
            });
          }
          return {};
        },
        get: (a: any) => {
          if (sql.includes("FROM pipeline_runs WHERE id")) return store.get(a);
          if (sql.includes("ORDER BY started_at DESC LIMIT 1")) {
            return [...store.values()]
              .filter((r) => r.project_name === a)
              .sort((x, y) => y.started_at.localeCompare(x.started_at))[0];
          }
          return undefined;
        },
        all: (...args: any[]) => {
          if (sql.includes("PRAGMA table_info")) return [{ name: "id" }, { name: "branch" }];
          if (sql.includes("status IN ('running','awaiting_approval')")) {
            return [...store.values()].filter((r) =>
              ["running", "awaiting_approval"].includes(r.status),
            );
          }
          if (sql.includes("FROM pipeline_runs WHERE project_name")) {
            return [...store.values()].filter((r) => r.project_name === args[0]);
          }
          return [];
        },
      };
    }
  }
  return FakeDatabase;
});

import { PipelineService, PipelineRun } from "../pipeline-service";

/**
 * Engine tests. External effects are stubbed so the DAG/condition logic is
 * exercised without spawning processes or touching the network:
 *   • execCommand   → simulated exit code (1 if the command contains "FAIL")
 *   • currentBranch → fixed branch name
 *   • pullLatestProject (checkout) → resolves
 *   • global.fetch  → no-op (notifications)
 */

const noopLogger = { info() {}, warn() {}, error() {}, debug() {} } as any;

function makeProjectService(projectPath: string, branch = "main") {
  const info = { name: "demo", path: projectPath, branch, environmentVars: {} };
  return {
    getProject: () => info,
    getProjects: () => new Map([["demo", info]]),
    pullLatestProject: async () => ({ output: "pulled", updated: true }),
  } as any;
}

function writePipeline(yml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acm-pipe-"));
  fs.mkdirSync(path.join(dir, ".acm"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".acm", "pipeline.yml"), yml);
  return dir;
}

function makeService(projectPath: string, branch = "main") {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "acm-db-")), "acm.db");
  const svc = new PipelineService(
    { databasePath: dbPath } as any,
    noopLogger,
    makeProjectService(projectPath, branch),
  );
  // Stub the I/O boundaries.
  jest.spyOn(svc as any, "currentBranch").mockResolvedValue(branch);
  jest
    .spyOn(svc as any, "execCommand")
    .mockImplementation(async (...args: any[]) => (String(args[0]).includes("FAIL") ? 1 : 0));
  return svc;
}

/** Run to completion and return the final record. */
async function runToEnd(svc: PipelineService, name = "demo"): Promise<PipelineRun> {
  const started = svc.startRun(name, "manual");
  return waitFor(svc, started.id);
}

async function waitFor(
  svc: PipelineService,
  id: string,
  predicate: (r: PipelineRun) => boolean = (r) => !!r.finishedAt,
): Promise<PipelineRun> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const r = svc.getRun(id)!;
    if (predicate(r)) return r;
    await new Promise((res) => setTimeout(res, 10));
  }
  return svc.getRun(id)!;
}

function statusOf(run: PipelineRun, stage: string): string | undefined {
  return run.stages.find((s) => s.name === stage)?.status;
}

beforeEach(() => {
  (global as any).fetch = jest.fn().mockResolvedValue({ status: 200 });
});

describe("PipelineService — definition parsing", () => {
  it("parses stages, conditions, healthcheck and notify; drops unknown needs", () => {
    const dir = writePipeline(`
notify:
  webhook: "https://hooks.example/abc"
  onFailureOnly: true
stages:
  - name: quality
    run: ["echo q"]
  - name: deploy
    run: ["echo d"]
    needs: [quality, ghost]   # ghost doesn't exist → dropped
    branches: [main, "release/*"]
    when: manual
    timeoutSec: 30
    retries: 2
    healthcheck: { url: "http://x/health", expectStatus: 204, retries: 5, intervalSec: 1 }
`);
    const svc = makeService(dir);
    const def = svc.loadFullDefinition(dir);

    expect(def.stages.map((s) => s.name)).toEqual(["quality", "deploy"]);
    const deploy = def.stages[1];
    expect(deploy.needs).toEqual(["quality"]); // ghost filtered out
    expect(deploy.branches).toEqual(["main", "release/*"]);
    expect(deploy.when).toBe("manual");
    expect(deploy.timeoutSec).toBe(30);
    expect(deploy.retries).toBe(2);
    expect(deploy.healthcheck).toMatchObject({ expectStatus: 204, retries: 5, intervalSec: 1 });
    expect(def.notify).toMatchObject({ webhook: "https://hooks.example/abc", onFailureOnly: true });
  });

  it("falls back to the default deploy-only flow with no pipeline file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acm-empty-"));
    const svc = makeService(dir);
    expect(svc.loadDefinition(dir).map((s) => s.name)).toEqual(["deploy"]);
  });

  it("matches branch globs", () => {
    const svc = makeService(writePipeline("stages: []"));
    const glob = (svc as any).globMatch.bind(svc);
    expect(glob("main", "main")).toBe(true);
    expect(glob("release/*", "release/1.2")).toBe(true);
    expect(glob("release/*", "main")).toBe(false);
  });
});

describe("PipelineService — DAG execution", () => {
  const pipeline = `
stages:
  - name: quality
    run: ["echo q"]
  - name: e2e
    run: ["echo e"]
  - name: deploy
    needs: [quality, e2e]
    branches: [main]
    run: ["echo d"]
  - name: rollback
    needs: [deploy]
    when: on_failure
    run: ["echo r"]
`;

  it("runs parallel stages, then deploy; rollback is skipped on success", async () => {
    const svc = makeService(writePipeline(pipeline), "main");
    const run = await runToEnd(svc);
    expect(run.status).toBe("success");
    expect(statusOf(run, "quality")).toBe("success");
    expect(statusOf(run, "e2e")).toBe("success");
    expect(statusOf(run, "deploy")).toBe("success");
    expect(statusOf(run, "rollback")).toBe("skipped"); // on_failure, nothing failed
  });

  it("runs the on_failure rollback hook when a stage fails", async () => {
    const failing = pipeline.replace('["echo d"]', '["FAIL deploy"]');
    const svc = makeService(writePipeline(failing), "main");
    const run = await runToEnd(svc);
    expect(run.status).toBe("failed");
    expect(statusOf(run, "deploy")).toBe("failed");
    expect(statusOf(run, "rollback")).toBe("success"); // rollback ran
  });

  it("skips branch-gated stages off the matching branch", async () => {
    const svc = makeService(writePipeline(pipeline), "feature/x");
    const run = await runToEnd(svc);
    expect(run.status).toBe("success");
    expect(statusOf(run, "deploy")).toBe("skipped"); // branches: [main]
    expect(statusOf(run, "rollback")).toBe("skipped");
  });
});

describe("PipelineService — manual approval gate", () => {
  const pipeline = `
stages:
  - name: build
    run: ["echo b"]
  - name: gate
    needs: [build]
    when: manual
    run: ["echo approved"]
  - name: deploy
    needs: [gate]
    run: ["echo d"]
`;

  it("pauses at the gate and resumes on approval", async () => {
    const svc = makeService(writePipeline(pipeline), "main");
    const started = svc.startRun("demo", "manual");

    // It should pause awaiting approval, with deploy not yet run.
    const paused = await waitFor(svc, started.id, (r) => r.status === "awaiting_approval");
    expect(paused.status).toBe("awaiting_approval");
    expect(statusOf(paused, "gate")).toBe("awaiting_approval");
    expect(statusOf(paused, "deploy")).toBe("pending");

    expect(svc.resolveApproval(started.id, "gate", "approve")).toBe(true);

    const done = await waitFor(svc, started.id);
    expect(done.status).toBe("success");
    expect(statusOf(done, "deploy")).toBe("success");
  });

  it("fails the run when the gate is rejected", async () => {
    const svc = makeService(writePipeline(pipeline), "main");
    const started = svc.startRun("demo", "manual");
    await waitFor(svc, started.id, (r) => r.status === "awaiting_approval");

    svc.resolveApproval(started.id, "gate", "reject");

    const done = await waitFor(svc, started.id);
    expect(done.status).toBe("failed");
    expect(statusOf(done, "gate")).toBe("failed");
    expect(statusOf(done, "deploy")).toBe("skipped");
  });
});

describe("PipelineService — health-gated stage", () => {
  it("fails the stage when the health check command never passes", async () => {
    const dir = writePipeline(`
stages:
  - name: deploy
    run: ["echo up"]
    healthcheck: { command: "FAIL probe", retries: 2, intervalSec: 0 }
`);
    const svc = makeService(dir, "main");
    const run = await runToEnd(svc);
    expect(statusOf(run, "deploy")).toBe("failed");
    expect(run.status).toBe("failed");
  });
});
