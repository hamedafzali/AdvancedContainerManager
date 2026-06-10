import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Play, RotateCw, Copy, Workflow, CircleDot, X, Check, Ban, Download } from "lucide-react";
import { apiFetch } from "@/utils/api";
import PipelineGraph, { GraphStage } from "@/components/PipelineGraph";

interface StageResult {
  name: string;
  status: GraphStage["status"];
  durationMs?: number;
  log: string;
  artifacts?: string[];
}
interface PipelineRun {
  id: string;
  projectName: string;
  trigger: string;
  status: "running" | "success" | "failed" | "awaiting_approval";
  branch?: string;
  stages: StageResult[];
  startedAt: string;
  finishedAt?: string;
}
interface Overview {
  name: string;
  stages: string[];
  hasDefinition: boolean;
  running: boolean;
  lastRun: { id: string; status: string; startedAt: string } | null;
}

const DOT: Record<string, string> = {
  success: "text-green-500",
  failed: "text-red-500",
  running: "text-amber-500 animate-pulse",
  awaiting_approval: "text-blue-500 animate-pulse",
};

export default function Pipelines() {
  const [params, setParams] = useSearchParams();
  const [overview, setOverview] = useState<Overview[]>([]);
  const [selected, setSelected] = useState<string | null>(params.get("project"));
  const [definition, setDefinition] = useState<{ name: string }[]>([]);
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [webhook, setWebhook] = useState<{ path: string; secret: string } | null>(null);
  const [activeRun, setActiveRun] = useState<PipelineRun | null>(null);
  const [stageLogs, setStageLogs] = useState<Record<string, string>>({});
  const [openStage, setOpenStage] = useState<string | null>(null); // null = logs hidden
  const [running, setRunning] = useState(false);
  const [showWebhook, setShowWebhook] = useState(false);
  const [copied, setCopied] = useState("");
  const logRef = useRef<HTMLPreElement | null>(null);

  const loadOverview = useCallback(async () => {
    const r = await apiFetch("/api/pipelines");
    const j = await r.json();
    if (j?.success) setOverview(j.data);
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const loadRun = useCallback(async (project: string, id: string) => {
    const r = await apiFetch(`/api/projects/${encodeURIComponent(project)}/pipeline/runs/${id}`);
    const j = await r.json();
    if (j?.success) {
      const run: PipelineRun = j.data;
      setActiveRun(run);
      setStageLogs(Object.fromEntries(run.stages.map((s) => [s.name, s.log])));
      setRunning(run.status === "running" || run.status === "awaiting_approval");
      return run;
    }
    return null;
  }, []);

  // Load a project's detail when selected
  useEffect(() => {
    if (!selected) return;
    setActiveRun(null);
    setStageLogs({});
    setOpenStage(null);
    (async () => {
      const [defR, runsR, hookR] = await Promise.all([
        apiFetch(`/api/projects/${encodeURIComponent(selected)}/pipeline/definition`).then((r) => r.json()),
        apiFetch(`/api/projects/${encodeURIComponent(selected)}/pipeline/runs`).then((r) => r.json()),
        apiFetch(`/api/projects/${encodeURIComponent(selected)}/pipeline/webhook`).then((r) => r.json()),
      ]);
      if (defR?.success) setDefinition(defR.data);
      if (runsR?.success) {
        setRuns(runsR.data);
        if (runsR.data[0]) void loadRun(selected, runsR.data[0].id);
      }
      if (hookR?.success) setWebhook(hookR.data);
    })();
  }, [selected, loadRun]);

  // Live stream for the selected project
  useEffect(() => {
    if (!selected) return;
    window.dispatchEvent(new CustomEvent("subscribe_project_pipeline", { detail: { projectName: selected } }));
    const onLog = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.projectName !== selected) return;
      setStageLogs((prev) => ({ ...prev, [d.stage]: (prev[d.stage] || "") + d.chunk }));
    };
    const onStatus = async (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.projectName !== selected) return;
      // If a log is open, follow the running stage; otherwise stay closed.
      if (d.status === "stage" && d.stage) setOpenStage((prev) => (prev ? d.stage : prev));
      if (d.runId) await loadRun(selected, d.runId);
      if (d.status === "success" || d.status === "failed") {
        setRunning(false);
        void loadOverview();
      }
    };
    window.addEventListener("project_pipeline_log", onLog);
    window.addEventListener("project_pipeline_status", onStatus);
    return () => {
      window.dispatchEvent(new CustomEvent("unsubscribe_project_pipeline", { detail: { projectName: selected } }));
      window.removeEventListener("project_pipeline_log", onLog);
      window.removeEventListener("project_pipeline_status", onStatus);
    };
  }, [selected, loadRun, loadOverview]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [stageLogs, openStage]);

  const run = async (stage?: string) => {
    if (!selected) return;
    setStageLogs({});
    const r = await apiFetch(`/api/projects/${encodeURIComponent(selected)}/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stage ? { stage } : {}),
    });
    const j = await r.json();
    if (r.ok && j?.success) {
      setRunning(true);
      setActiveRun(j.data);
    }
  };

  // Artifacts sit behind the authenticated API, so fetch with the bearer token
  // (apiFetch) and save the blob — a plain <a href> would 401. The server names
  // the file (a directory artifact comes down as <name>.tgz).
  const downloadArtifact = async (stage: string, file: string) => {
    if (!selected || !activeRun) return;
    const res = await apiFetch(
      `/api/projects/${encodeURIComponent(selected)}/pipeline/runs/${activeRun.id}/stages/${encodeURIComponent(stage)}/artifacts/${encodeURIComponent(file)}`,
    );
    if (!res.ok) return;
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? file;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const decide = async (stage: string, decision: "approve" | "reject") => {
    if (!selected || !activeRun) return;
    await apiFetch(
      `/api/projects/${encodeURIComponent(selected)}/pipeline/runs/${activeRun.id}/stages/${encodeURIComponent(stage)}/approve`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) },
    );
    // The run resumes server-side; the WebSocket stream refreshes our view.
  };

  const regenerate = async () => {
    if (!selected) return;
    const r = await apiFetch(`/api/projects/${encodeURIComponent(selected)}/pipeline/webhook/regenerate`, { method: "POST" });
    const j = await r.json();
    if (j?.success) setWebhook(j.data);
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };

  const pick = (name: string) => { setSelected(name); setParams({ project: name }); };

  // Graph always reflects the configured pipeline (checkout + definition);
  // a selected/live run just overlays its per-stage status onto those nodes.
  const graphStages: GraphStage[] = useMemo(() => {
    const base = ["checkout", ...definition.map((d) => d.name)];
    const byName = new Map((activeRun?.stages || []).map((s) => [s.name, s]));
    return base.map((name) => {
      const r = byName.get(name);
      return { name, status: r?.status ?? "pending", durationMs: r?.durationMs };
    });
  }, [activeRun, definition]);

  const webhookUrl = webhook ? `${window.location.origin}${webhook.path}` : "";
  // A stage paused at a manual gate, waiting for approve/reject.
  const awaiting = activeRun?.stages.find((s) => s.status === "awaiting_approval");
  const openArtifacts =
    openStage && activeRun
      ? activeRun.stages.find((s) => s.name === openStage)?.artifacts ?? []
      : [];

  return (
    <div className="h-full flex">
      {/* Sidebar: projects */}
      <aside className="w-72 shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
          <Workflow className="w-5 h-5 text-amber-600" />
          <h2 className="font-bold text-gray-900 dark:text-white">Pipelines</h2>
        </div>
        <ul className="p-2">
          {overview.length === 0 && <li className="text-sm text-gray-400 p-3">No projects yet.</li>}
          {overview.map((o) => (
            <li key={o.name}>
              <button
                onClick={() => pick(o.name)}
                className={`w-full text-left px-3 py-2.5 rounded-lg mb-1 transition-colors ${
                  selected === o.name ? "bg-amber-50 dark:bg-gray-700" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <CircleDot className={`w-3.5 h-3.5 ${DOT[o.running ? "running" : o.lastRun?.status || ""] || "text-gray-300"}`} />
                  <span className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate">{o.name}</span>
                  {o.hasDefinition && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">.acm</span>}
                </div>
                <div className="text-[11px] text-gray-400 mt-1 truncate">
                  {o.stages.length} stage{o.stages.length === 1 ? "" : "s"}
                  {o.lastRun && ` · ${new Date(o.lastRun.startedAt).toLocaleDateString()}`}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 overflow-y-auto p-6">
        {!selected ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <Workflow className="w-12 h-12 mb-3" />
            <p>Select a project to view its pipeline.</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{selected}</h1>
                <p className="text-sm text-gray-500">{graphStages.map((s) => s.name).join(" → ")}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowWebhook((v) => !v)} className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Webhook
                </button>
                <button onClick={() => run()} disabled={running} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-700 rounded-lg disabled:opacity-50">
                  <Play className="w-4 h-4" /> {running ? "Running…" : "Run all"}
                </button>
              </div>
            </div>

            {/* Webhook panel */}
            {showWebhook && webhook && (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-xs space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-50 dark:bg-gray-900 rounded px-2 py-1.5 truncate">{webhookUrl}</code>
                  <button onClick={() => copy(webhookUrl, "url")} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Copy className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-50 dark:bg-gray-900 rounded px-2 py-1.5 truncate">secret: {webhook.secret}</code>
                  <button onClick={() => copy(webhook.secret, "secret")} className="p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"><Copy className="w-3.5 h-3.5" /></button>
                  <button onClick={regenerate} className="flex items-center gap-1 text-amber-600 hover:underline px-1"><RotateCw className="w-3 h-3" /> Rotate</button>
                </div>
                {copied && <p className="text-green-600">Copied {copied}!</p>}
                <p className="text-gray-400">POST with header <code>x-acm-secret</code> to trigger on git push.</p>
              </div>
            )}

            {/* Manual approval gate — a stage is paused waiting for a decision */}
            {awaiting && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                    “{awaiting.name}” is awaiting approval
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-300/80">
                    The pipeline is paused before this stage. Approve to continue or reject to stop the run.
                  </p>
                </div>
                <button
                  onClick={() => decide(awaiting.name, "reject")}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
                >
                  <Ban className="w-4 h-4" /> Reject
                </button>
                <button
                  onClick={() => decide(awaiting.name, "approve")}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  <Check className="w-4 h-4" /> Approve
                </button>
              </div>
            )}

            {/* Graph — the default "checkpoint" view; live status updates as it runs */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-xs">
                {running ? (
                  <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /> Running…
                  </span>
                ) : (
                  <span className="text-gray-400">Tap a stage to view its log</span>
                )}
              </div>
              <PipelineGraph
                stages={graphStages}
                selected={openStage ?? undefined}
                running={running}
                onSelect={(name) => setOpenStage(name)}
                onRunStage={(name) => run(name)}
              />
            </div>

            {/* History (compact, default) */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 px-1">History</h3>
              <ul className="space-y-1 max-h-64 overflow-y-auto">
                {runs.length === 0 && <li className="text-xs text-gray-400 px-1">No runs yet.</li>}
                {runs.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => loadRun(selected, r.id)} className={`w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 ${activeRun?.id === r.id ? "bg-gray-50 dark:bg-gray-700" : ""}`}>
                      <CircleDot className={`w-3.5 h-3.5 ${DOT[r.status] || "text-gray-300"}`} />
                      <span className="text-gray-700 dark:text-gray-200">{r.trigger}</span>
                      <span className="text-[11px] text-gray-400 ml-auto">{new Date(r.startedAt).toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Logs — on demand only (tap a stage) */}
            {openStage && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpenStage(null)}>
                <div className="bg-gray-950 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                    <span className="text-sm font-mono text-gray-300">{openStage} — logs</span>
                    <button onClick={() => setOpenStage(null)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg" aria-label="Close logs">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <pre ref={logRef} className="flex-1 overflow-auto p-4 text-xs leading-relaxed text-gray-100 font-mono whitespace-pre-wrap">
                    {stageLogs[openStage] || "No output yet for this stage."}
                  </pre>
                  {openArtifacts.length > 0 && activeRun && selected && (
                    <div className="px-4 py-3 border-t border-gray-800 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] uppercase tracking-wide text-gray-500">Artifacts</span>
                      {openArtifacts.map((file) => (
                        <button
                          key={file}
                          onClick={() => downloadArtifact(openStage, file)}
                          className="flex items-center gap-1.5 text-xs text-blue-300 hover:text-blue-200 bg-gray-900 rounded-lg px-2.5 py-1.5"
                        >
                          <Download className="w-3.5 h-3.5" /> {file}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
