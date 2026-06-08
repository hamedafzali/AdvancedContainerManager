import { useEffect, useRef, useState, useCallback } from "react";
import { Play, RotateCw, Copy, X, CheckCircle, XCircle, Clock, Circle, MinusCircle } from "lucide-react";
import { apiFetch } from "@/utils/api";

interface StageResult {
  name: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  exitCode?: number;
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

const STATUS_ICON: Record<string, JSX.Element> = {
  success: <CheckCircle className="w-4 h-4 text-green-600" />,
  failed: <XCircle className="w-4 h-4 text-red-600" />,
  running: <Clock className="w-4 h-4 text-amber-500 animate-pulse" />,
  pending: <Circle className="w-4 h-4 text-gray-300" />,
  skipped: <MinusCircle className="w-4 h-4 text-gray-400" />,
};

export default function PipelinePanel({
  projectName,
  onClose,
}: {
  projectName: string;
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [definition, setDefinition] = useState<{ name: string }[]>([]);
  const [webhook, setWebhook] = useState<{ path: string; secret: string } | null>(null);
  const [activeRun, setActiveRun] = useState<PipelineRun | null>(null);
  const [liveLog, setLiveLog] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const logRef = useRef<HTMLPreElement | null>(null);

  const loadRuns = useCallback(async () => {
    const res = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/pipeline/runs`);
    const json = await res.json();
    if (json?.success) setRuns(json.data);
  }, [projectName]);

  const loadRun = useCallback(async (id: string) => {
    const res = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/pipeline/runs/${id}`);
    const json = await res.json();
    if (json?.success) {
      setActiveRun(json.data);
      setLiveLog((json.data.stages as StageResult[]).map((s) => `── ${s.name} ──\n${s.log}`).join("\n\n"));
    }
  }, [projectName]);

  // initial load
  useEffect(() => {
    void loadRuns();
    apiFetch(`/api/projects/${encodeURIComponent(projectName)}/pipeline/definition`)
      .then((r) => r.json()).then((j) => j?.success && setDefinition(j.data)).catch(() => {});
    apiFetch(`/api/projects/${encodeURIComponent(projectName)}/pipeline/webhook`)
      .then((r) => r.json()).then((j) => j?.success && setWebhook(j.data)).catch(() => {});
  }, [projectName, loadRuns]);

  // live stream
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("subscribe_project_pipeline", { detail: { projectName } }));

    const onLog = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.projectName !== projectName) return;
      setLiveLog((prev) => prev + d.chunk);
    };
    const onStatus = async (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.projectName !== projectName) return;
      if (d.runId) await loadRun(d.runId);          // refresh stage badges from source of truth
      if (d.status === "success" || d.status === "failed") {
        setRunning(false);
        void loadRuns();
      }
    };
    window.addEventListener("project_pipeline_log", onLog);
    window.addEventListener("project_pipeline_status", onStatus);
    return () => {
      window.dispatchEvent(new CustomEvent("unsubscribe_project_pipeline", { detail: { projectName } }));
      window.removeEventListener("project_pipeline_log", onLog);
      window.removeEventListener("project_pipeline_status", onStatus);
    };
  }, [projectName, loadRun, loadRuns]);

  // auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [liveLog]);

  const runNow = async () => {
    setError("");
    setLiveLog("");
    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/pipeline/run`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.message || "Failed to start pipeline");
      setRunning(true);
      setActiveRun(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start pipeline");
    }
  };

  const regenerate = async () => {
    const res = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/pipeline/webhook/regenerate`, { method: "POST" });
    const json = await res.json();
    if (json?.success) setWebhook(json.data);
  };

  const copy = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };

  const webhookUrl = webhook ? `${window.location.origin}${webhook.path}` : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Pipeline — {projectName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Stages: {definition.map((s) => s.name).join(" → ") || "checkout → deploy"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={runNow}
              disabled={running}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-700 rounded-lg disabled:opacity-50"
            >
              <Play className="w-4 h-4" /> {running ? "Running…" : "Run pipeline"}
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && <div className="mx-5 mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}

        <div className="flex-1 grid grid-cols-3 min-h-0">
          {/* Left: runs + stages + webhook */}
          <div className="col-span-1 border-r border-gray-100 overflow-y-auto p-4 space-y-5">
            {/* Active run stages */}
            {activeRun && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Stages</h3>
                <ul className="space-y-1.5">
                  {activeRun.stages.map((s) => (
                    <li key={s.name} className="flex items-center gap-2 text-sm">
                      {STATUS_ICON[s.status]}
                      <span className={s.status === "failed" ? "text-red-600" : "text-gray-700"}>{s.name}</span>
                      {typeof s.durationMs === "number" && (
                        <span className="text-xs text-gray-400 ml-auto">{Math.round(s.durationMs / 100) / 10}s</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Webhook */}
            {webhook && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Webhook (push → run)</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-1">
                    <code className="flex-1 bg-gray-50 rounded px-2 py-1 truncate" title={webhookUrl}>{webhookUrl}</code>
                    <button onClick={() => copy(webhookUrl, "url")} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><Copy className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="flex items-center gap-1">
                    <code className="flex-1 bg-gray-50 rounded px-2 py-1 truncate">secret: {webhook.secret}</code>
                    <button onClick={() => copy(webhook.secret, "secret")} className="p-1 text-gray-500 hover:bg-gray-100 rounded"><Copy className="w-3.5 h-3.5" /></button>
                  </div>
                  {copied && <p className="text-green-600">Copied {copied}!</p>}
                  <p className="text-gray-400">Send header <code>x-acm-secret</code> on POST.</p>
                  <button onClick={regenerate} className="flex items-center gap-1 text-amber-600 hover:underline">
                    <RotateCw className="w-3 h-3" /> Regenerate secret
                  </button>
                </div>
              </div>
            )}

            {/* History */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">History</h3>
              <ul className="space-y-1">
                {runs.length === 0 && <li className="text-xs text-gray-400">No runs yet.</li>}
                {runs.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => loadRun(r.id)}
                      className={`w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-lg hover:bg-gray-50 ${activeRun?.id === r.id ? "bg-gray-50" : ""}`}
                    >
                      {STATUS_ICON[r.status === "running" ? "running" : r.status]}
                      <span className="text-gray-700">{r.trigger}</span>
                      <span className="text-xs text-gray-400 ml-auto">{new Date(r.startedAt).toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Right: live/selected logs */}
          <div className="col-span-2 min-h-0 flex flex-col bg-gray-950">
            <pre
              ref={logRef}
              className="flex-1 overflow-auto p-4 text-xs leading-relaxed text-gray-100 font-mono whitespace-pre-wrap"
            >
              {liveLog || "Run the pipeline or pick a past run to see logs."}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
