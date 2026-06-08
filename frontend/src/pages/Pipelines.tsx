import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Play, RotateCw, Copy, Workflow, CircleDot } from "lucide-react";
import { apiFetch } from "@/utils/api";
import PipelineGraph, { GraphStage } from "@/components/PipelineGraph";

interface StageResult {
  name: string;
  status: GraphStage["status"];
  durationMs?: number;
  log: string;
}
interface PipelineRun {
  id: string;
  projectName: string;
  trigger: string;
  status: "running" | "success" | "failed";
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
  const [selectedStage, setSelectedStage] = useState<string>("checkout");
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
      setRunning(run.status === "running");
      return run;
    }
    return null;
  }, []);

  // Load a project's detail when selected
  useEffect(() => {
    if (!selected) return;
    setActiveRun(null);
    setStageLogs({});
    setSelectedStage("checkout");
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
      if (d.status === "stage" && d.stage) setSelectedStage(d.stage);
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
  }, [stageLogs, selectedStage]);

  const run = async (stage?: string) => {
    if (!selected) return;
    setStageLogs({});
    setSelectedStage(stage || "checkout");
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

  // Stages for the graph: live run if present, else the definition as pending.
  const graphStages: GraphStage[] = useMemo(() => {
    if (activeRun) return activeRun.stages.map((s) => ({ name: s.name, status: s.status, durationMs: s.durationMs }));
    return [{ name: "checkout", status: "pending" as const }, ...definition.map((d) => ({ name: d.name, status: "pending" as const }))];
  }, [activeRun, definition]);

  const webhookUrl = webhook ? `${window.location.origin}${webhook.path}` : "";

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

            {/* Graph */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
              <PipelineGraph
                stages={graphStages}
                selected={selectedStage}
                running={running}
                onSelect={setSelectedStage}
                onRunStage={(name) => run(name)}
              />
            </div>

            {/* Logs + history */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 bg-gray-950 rounded-xl overflow-hidden flex flex-col" style={{ minHeight: 320 }}>
                <div className="px-4 py-2 border-b border-gray-800 text-xs text-gray-400 font-mono">{selectedStage} — logs</div>
                <pre ref={logRef} className="flex-1 overflow-auto p-4 text-xs leading-relaxed text-gray-100 font-mono whitespace-pre-wrap">
                  {stageLogs[selectedStage] || "No output yet. Run the pipeline or a single stage."}
                </pre>
              </div>
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 overflow-y-auto" style={{ maxHeight: 360 }}>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 px-1">History</h3>
                <ul className="space-y-1">
                  {runs.length === 0 && <li className="text-xs text-gray-400 px-1">No runs yet.</li>}
                  {runs.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => loadRun(selected, r.id)} className={`w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 ${activeRun?.id === r.id ? "bg-gray-50 dark:bg-gray-700" : ""}`}>
                        <CircleDot className={`w-3.5 h-3.5 ${DOT[r.status] || "text-gray-300"}`} />
                        <span className="text-gray-700 dark:text-gray-200">{r.trigger}</span>
                        <span className="text-[11px] text-gray-400 ml-auto">{new Date(r.startedAt).toLocaleTimeString()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
