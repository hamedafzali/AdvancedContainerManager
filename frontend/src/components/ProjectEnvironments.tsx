import { Fragment, useCallback, useEffect, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, Info, Loader2, Play, RotateCw, Settings2, Square } from "lucide-react";
import { DropdownMenu } from "pixelwizards-components";
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
    <div className="space-y-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        Environments
      </div>
      {/* One tile per stage. Each tile opens its own labelled menu, so the
          actions read as words instead of a row of tiny icons. */}
      <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-stretch gap-1">
        {envs.map((e) => {
          const next = NEXT[e.env];
          const target = next ? byName[next] : undefined;
          const envBusy = busy.startsWith(`${e.env}:`);
          const canPromote = !!next && e.status === "running" && !!e.deployedAt && !busy;
          const behind = !!(head && e.commit && e.commit !== head);
          const failed = e.lastResult?.status === "failed";
          const stopped = e.status === "stopped" || e.status === "unknown";
          const items = [
            {
              label: stopped ? `Deploy ${e.env}` : `Redeploy ${e.env}`,
              icon: stopped ? <Play className="w-4 h-4" /> : <RotateCw className="w-4 h-4" />,
              disabled: !!busy,
              onClick: () => act(e.env, "deploy"),
            },
            ...(stopped
              ? []
              : [{ label: `Stop ${e.env}`, icon: <Square className="w-4 h-4" />, disabled: !!busy, onClick: () => act(e.env, "stop") }]),
            ...(next
              ? [{
                  label: canPromote ? `Promote to ${next}` : `Promote to ${next} (deploy ${e.env} first)`,
                  icon: <ArrowRight className="w-4 h-4" />,
                  disabled: !canPromote,
                  onClick: () => setPromote({ from: e.env, to: next }),
                }]
              : []),
            { label: "Variables", icon: <Settings2 className="w-4 h-4" />, dividerAbove: true, onClick: () => openVars(e.env) },
            { label: "Details", icon: <Info className="w-4 h-4" />, onClick: () => setDetails(e) },
          ];
          const statusText = failed ? "failed" : e.status === "unknown" ? "not deployed" : e.status;
          return (
            <Fragment key={e.env}>
              <DropdownMenu
                className="flex min-w-0"
                align={e.env === "prod" ? "right" : "left"}
                triggerLabel={`${e.env} actions`}
                items={items}
                triggerClassName={`flex w-full min-w-0 flex-col items-stretch gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  failed
                    ? "border-red-200 bg-red-50/60 hover:bg-red-50 dark:border-red-500/30 dark:bg-red-500/10 dark:hover:bg-red-500/15"
                    : "border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                }`}
                label={
                  <>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-2 h-2 shrink-0 rounded-full ${failed ? "bg-red-500" : DOT[e.status]}`} aria-hidden />
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">{e.env}</span>
                      {envBusy ? (
                        <Loader2 className="ml-auto w-3.5 h-3.5 shrink-0 text-gray-400 animate-spin" aria-label="Working" />
                      ) : (
                        <ChevronDown className="ml-auto w-3.5 h-3.5 shrink-0 text-gray-400" aria-hidden />
                      )}
                    </span>
                    <span
                      className={`truncate text-[11px] capitalize ${
                        failed ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {statusText}
                    </span>
                    <code
                      className={`truncate text-[11px] ${behind ? "text-amber-600 dark:text-amber-400" : "text-gray-400 dark:text-gray-500"}`}
                      title={behind && head ? `Checkout is at ${short(head)}; redeploy to pick it up` : undefined}
                    >
                      {e.commit ? `${short(e.commit)}${e.deployedAt ? ` · ${ago(e.deployedAt)}` : ""}` : "–"}
                    </code>
                  </>
                }
              />
              {next && (
                <ChevronRight
                  className={`self-center w-3.5 h-3.5 ${target?.commit && e.commit && target.commit !== e.commit ? "text-primary-400" : "text-gray-300 dark:text-gray-600"}`}
                  aria-hidden
                />
              )}
            </Fragment>
          );
        })}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      {notice && (
        <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300 bg-primary-50 dark:bg-primary-900/20 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 mt-0.5 text-primary-500 shrink-0" />
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
