import { useCallback, useEffect, useState } from "react";
import { Play, Square, RotateCw, Settings2, Loader2, ChevronRight, Info } from "lucide-react";
import { apiFetch, apiJson, apiPost } from "@/utils/api";
import { ConfirmDialog, ErrorBanner, Modal, Button } from "@/components/ui";

type EnvName = "dev" | "test" | "prod";

interface EnvRow {
  env: EnvName;
  status: "running" | "partial" | "stopped" | "unknown";
  composeProject: string;
  configured: boolean;
  commit: string | null;
  deployedAt: string | null;
  source: "build" | "promote" | null;
  promotedFrom: string | null;
  lastResult: { status: string; timestamp: string; kind: string; error?: string } | null;
  ports: Array<{ service: string; host: string; container: string }>;
  isolation: string[];
  warnings: string[];
  error?: string;
}

const NEXT: Partial<Record<EnvName, EnvName>> = { dev: "test", test: "prod" };

const DOT: Record<EnvRow["status"], string> = {
  running: "bg-green-500",
  partial: "bg-amber-500",
  stopped: "bg-gray-300 dark:bg-gray-500",
  unknown: "bg-gray-300 dark:bg-gray-500",
};

function ago(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const short = (sha: string | null) => (sha ? sha.slice(0, 7) : "");

/**
 * dev → test → prod strip on a project card. Each env runs side by side
 * (ACM isolates names, ports and data dirs); the arrow between two envs
 * promotes the exact images from the left one to the right one.
 */
export default function ProjectEnvironments({ projectName }: { projectName: string }) {
  const base = `/api/projects/${encodeURIComponent(projectName)}/environments`;
  const [envs, setEnvs] = useState<EnvRow[]>([]);
  const [head, setHead] = useState<string | null>(null);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState<EnvRow | null>(null);
  const [promote, setPromote] = useState<{ from: EnvName; to: EnvName } | null>(null);
  const [editing, setEditing] = useState<EnvName | null>(null);
  const [varsText, setVarsText] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await apiJson(base);
      // Older backends returned a bare array.
      const data = Array.isArray(j.data) ? { environments: j.data, headCommit: null } : j.data;
      setEnvs(data.environments);
      setHead(data.headCommit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load environments");
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onStatus = (e: Event) => {
      if ((e as CustomEvent).detail?.name === projectName) void load();
    };
    window.addEventListener("project_status", onStatus);
    return () => window.removeEventListener("project_status", onStatus);
  }, [projectName, load]);

  const run = async (key: string, fn: () => Promise<any>, done?: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const r = await fn();
      const warnings: string[] = r?.data?.warnings || [];
      setNotice([done, ...warnings].filter(Boolean).join(" ") || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy("");
      void load();
    }
  };

  const act = (env: EnvName, action: "deploy" | "stop" | "restart") =>
    run(`${env}:${action}`, () => apiPost(`${base}/${env}/${action}`), action === "deploy" ? `${env} deployed and healthy.` : undefined);

  const doPromote = () => {
    if (!promote) return;
    const { from, to } = promote;
    setPromote(null);
    void run(`${to}:promote`, () => apiPost(`${base}/${from}/promote`, { to }), `${from} promoted to ${to}.`);
  };

  const openVars = async (env: EnvName) => {
    try {
      const j = await apiJson(`${base}/${env}/env`);
      const vars = (j?.data || {}) as Record<string, string>;
      setVarsText(Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n"));
      setEditing(env);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load variables");
    }
  };

  const saveVars = async () => {
    if (!editing) return;
    const vars: Record<string, string> = {};
    for (const line of varsText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i < 1) continue;
      vars[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
    }
    try {
      await apiJson(`${base}/${editing}/env`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vars }),
      });
      setEditing(null);
      setNotice(`${editing} variables saved. Redeploy ${editing} to apply them.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save variables");
    }
  };

  const byName = Object.fromEntries(envs.map((e) => [e.env, e])) as Partial<Record<EnvName, EnvRow>>;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
      <div className="flex items-center gap-1 flex-wrap">
        {envs.map((e) => {
          const next = NEXT[e.env];
          const target = next ? byName[next] : undefined;
          const envBusy = busy.startsWith(`${e.env}:`);
          const canPromote = !!next && e.status === "running" && !!e.deployedAt && !busy;
          const behind = !!(head && e.commit && e.commit !== head);
          const failed = e.lastResult?.status === "failed";
          return (
            <div key={e.env} className="flex items-center gap-1">
              <div
                className={`flex items-center gap-1.5 rounded-lg pl-2 pr-1 py-1 border ${
                  failed ? "border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10" : "border-transparent bg-gray-50 dark:bg-gray-700/50"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${DOT[e.status]}`} aria-hidden />
                <button
                  onClick={() => setDetails(e)}
                  className="flex items-baseline gap-1.5 text-left"
                  title={`${e.env}: ${e.status}${e.commit ? ` at ${short(e.commit)}` : ""}. Click for details.`}
                >
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{e.env}</span>
                  {e.commit && (
                    <code className={`text-[10px] ${behind ? "text-amber-600 dark:text-amber-400" : "text-gray-400"}`}>
                      {short(e.commit)}
                    </code>
                  )}
                </button>
                <span className="sr-only">{e.status}</span>
                {envBusy ? (
                  <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin mx-0.5" aria-label="Working" />
                ) : (
                  <>
                    <button
                      disabled={!!busy}
                      onClick={() => act(e.env, "deploy")}
                      title={e.status === "stopped" ? `Build and start ${e.env} from the checkout` : `Rebuild ${e.env} from the checkout`}
                      aria-label={`${e.status === "stopped" ? "Deploy" : "Redeploy"} ${e.env}`}
                      className="p-0.5 text-gray-400 hover:text-green-600 disabled:opacity-40"
                    >
                      {e.status === "stopped" ? <Play className="w-3.5 h-3.5" /> : <RotateCw className="w-3.5 h-3.5" />}
                    </button>
                    {e.status !== "stopped" && e.status !== "unknown" && (
                      <button
                        disabled={!!busy}
                        onClick={() => act(e.env, "stop")}
                        title={`Stop ${e.env}`}
                        aria-label={`Stop ${e.env}`}
                        className="p-0.5 text-gray-400 hover:text-red-600 disabled:opacity-40"
                      >
                        <Square className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => openVars(e.env)}
                      title={`${e.env} variables`}
                      aria-label={`${e.env} variables`}
                      className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      <Settings2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
              {next && (
                <button
                  disabled={!canPromote}
                  onClick={() => setPromote({ from: e.env, to: next })}
                  title={
                    canPromote
                      ? `Promote ${e.env} (${short(e.commit)}) to ${next}${target?.commit ? `, replacing ${short(target.commit)}` : ""}`
                      : `Deploy ${e.env} and let it come up healthy to promote it to ${next}`
                  }
                  aria-label={`Promote ${e.env} to ${next}`}
                  className="p-0.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {notice && (
        <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 mt-0.5 text-blue-500 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} className="text-gray-400 hover:text-gray-600" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!promote}
        title={promote ? `Promote ${promote.from} to ${promote.to}?` : ""}
        danger={promote?.to === "prod"}
        confirmLabel="Promote"
        requireText={promote?.to === "prod" ? projectName : undefined}
        message={
          promote && (
            <div className="space-y-2 text-sm">
              <p>
                {promote.to} will run the exact images {promote.from} is running now
                {byName[promote.from]?.commit ? ` (commit ${short(byName[promote.from]!.commit)})` : ""}, without a rebuild.
              </p>
              <p>
                If {promote.to} does not come up healthy, ACM puts its previous images back
                {byName[promote.to]?.commit ? ` (${short(byName[promote.to]!.commit)})` : ""}.
              </p>
              <p className="text-gray-500">{promote.to}'s own variables, ports and data stay as they are.</p>
            </div>
          )
        }
        onConfirm={doPromote}
        onCancel={() => setPromote(null)}
      />

      <Modal open={!!details} onClose={() => setDetails(null)} title={details ? `${projectName} · ${details.env}` : ""}>
        {details && (
          <dl className="text-sm space-y-3">
            <div className="grid grid-cols-[110px_1fr] gap-y-1.5">
              <dt className="text-gray-500">Status</dt>
              <dd className="capitalize">{details.status}</dd>
              <dt className="text-gray-500">Compose project</dt>
              <dd><code className="text-xs">{details.composeProject}</code></dd>
              <dt className="text-gray-500">Running</dt>
              <dd>
                {details.commit ? <code className="text-xs">{short(details.commit)}</code> : "not deployed by ACM yet"}
                {details.deployedAt && (
                  <span className="text-gray-500">
                    {" "}· {details.source === "promote" ? `promoted from ${details.promotedFrom}` : "built"} {ago(details.deployedAt)}
                  </span>
                )}
                {head && details.commit && head !== details.commit && (
                  <span className="block text-xs text-amber-600 dark:text-amber-400">Checkout is at {short(head)}; redeploy to pick it up.</span>
                )}
              </dd>
              {details.lastResult && (
                <>
                  <dt className="text-gray-500">Last action</dt>
                  <dd>
                    <span className={details.lastResult.status === "failed" ? "text-red-600 dark:text-red-400" : ""}>
                      {details.lastResult.kind} {details.lastResult.status}
                    </span>{" "}
                    <span className="text-gray-500">{ago(details.lastResult.timestamp)}</span>
                    {details.lastResult.error && (
                      <span className="block text-xs text-red-600 dark:text-red-400 break-words">{details.lastResult.error}</span>
                    )}
                  </dd>
                </>
              )}
            </div>

            {details.ports.length > 0 && (
              <div>
                <dt className="text-gray-500 mb-1">Host ports</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {details.ports.map((p) => (
                    <span key={`${p.service}-${p.host}-${p.container}`} className="text-xs bg-gray-100 dark:bg-gray-700 rounded px-2 py-0.5">
                      {p.service} <code>{p.host}</code> → {p.container}
                    </span>
                  ))}
                </dd>
              </div>
            )}

            {details.isolation.length > 0 && (
              <div>
                <dt className="text-gray-500 mb-1">Isolated from prod</dt>
                <dd>
                  <ul className="text-xs space-y-0.5 list-disc pl-4">
                    {details.isolation.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </dd>
              </div>
            )}

            {(details.warnings.length > 0 || details.error) && (
              <div>
                <dt className="text-amber-600 dark:text-amber-400 mb-1">Shared with other envs</dt>
                <dd>
                  <ul className="text-xs space-y-0.5 list-disc pl-4">
                    {details.warnings.map((w) => <li key={w}>{w}</li>)}
                    {details.error && <li className="text-red-600">{details.error}</li>}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
        )}
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `${projectName} · ${editing} variables` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveVars}>Save</Button>
          </>
        }
      >
        <p className="text-xs text-gray-500 mb-3">
          One <code>KEY=VALUE</code> per line, layered over the project's common variables. Values are encrypted at rest.
          {editing !== "prod" && (
            <> Host ports are shifted automatically ({editing === "dev" ? "+10000" : "+20000"}); set <code>ACM_PORT_OFFSET</code> to change that.</>
          )}
        </p>
        <textarea
          value={varsText}
          onChange={(e) => setVarsText(e.target.value)}
          rows={10}
          spellCheck={false}
          aria-label={`${editing} variables`}
          className="w-full font-mono text-xs border border-gray-200 dark:border-gray-600 rounded-lg p-2 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100"
          placeholder={"PUBLIC_URL=https://dev.example.com\nLOG_LEVEL=debug"}
        />
      </Modal>
    </div>
  );
}
