import { useCallback, useEffect, useState } from "react";
import { ArrowUp, Info, Loader2, Play, RotateCw, Settings2, Square } from "lucide-react";
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
const ORDER: EnvName[] = ["prod", "test", "dev"];

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

  // Prod first: it's the one people check, and promotion reads bottom-up.
  const ordered = [...envs].sort((a, b) => ORDER.indexOf(a.env) - ORDER.indexOf(b.env));

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {ordered.map((e) => {
          const next = NEXT[e.env];
          const envBusy = busy.startsWith(`${e.env}:`);
          const canPromote = !!next && e.status === "running" && !!e.deployedAt && !busy;
          const behind = !!(head && e.commit && e.commit !== head);
          const failed = e.lastResult?.status === "failed";
          const stopped = e.status === "stopped" || e.status === "unknown";
          const statusText = failed ? "Failed" : e.status === "unknown" ? "Not deployed" : e.status;
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
                  label: `Promote to ${next}`,
                  icon: <ArrowUp className="w-4 h-4" />,
                  disabled: !canPromote,
                  onClick: () => setPromote({ from: e.env, to: next }),
                }]
              : []),
            { label: "Variables", icon: <Settings2 className="w-4 h-4" />, dividerAbove: true, onClick: () => openVars(e.env) },
            { label: "Details", icon: <Info className="w-4 h-4" />, onClick: () => setDetails(e) },
          ];
          return (
            <li
              key={e.env}
              className={`flex min-h-[44px] items-center gap-3 pl-3 pr-1 ${
                failed ? "bg-red-50/70 dark:bg-red-500/10" : "bg-gray-50/60 dark:bg-gray-900/40"
              }`}
            >
              <span className="flex shrink-0 items-center gap-2 sm:w-[8.5rem]">
                {envBusy ? (
                  <Loader2 className="w-3 h-3 shrink-0 animate-spin text-primary-500" aria-label="Working" />
                ) : (
                  <span className={`w-2 h-2 shrink-0 rounded-full ${failed ? "bg-red-500" : DOT[e.status]}`} aria-hidden />
                )}
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{e.env}</span>
                <span className="sr-only sm:hidden">{statusText}</span>
                <span
                  className={`hidden truncate text-xs capitalize sm:inline ${failed ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}`}
                  title={failed ? e.lastResult?.error : undefined}
                >
                  {statusText}
                </span>
              </span>
              <span
                className={`min-w-0 flex-1 truncate font-mono text-xs ${
                  behind ? "text-amber-600 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"
                }`}
                title={behind && head ? `Checkout is at ${short(head)}; redeploy to pick it up` : undefined}
              >
                {e.commit ? `${short(e.commit)}${e.deployedAt ? ` · ${ago(e.deployedAt)}` : ""}` : ""}
              </span>
              {next && canPromote && (
                <button
                  type="button"
                  onClick={() => setPromote({ from: e.env, to: next })}
                  title={`Promote ${e.env} (${short(e.commit)}) to ${next}`}
                  aria-label={`Promote ${e.env} to ${next}`}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-500/10"
                >
                  <ArrowUp className="w-3.5 h-3.5" aria-hidden />
                  {next}
                </button>
              )}
              <DropdownMenu
                iconTrigger
                align="right"
                triggerLabel={`${e.env} actions`}
                items={items}
                triggerClassName="!border-transparent !bg-transparent hover:!bg-gray-200/70 dark:hover:!bg-gray-800"
              />
            </li>
          );
        })}
      </ul>

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
