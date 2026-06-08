import { useCallback, useEffect, useState } from "react";
import { Play, Square, Settings2, CircleDot, Loader2 } from "lucide-react";
import { apiFetch } from "@/utils/api";

interface EnvRow {
  env: string;
  status: "running" | "stopped";
  composeProject: string;
  configured: boolean;
}

export default function ProjectEnvironments({ projectName }: { projectName: string }) {
  const [envs, setEnvs] = useState<EnvRow[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [editing, setEditing] = useState<string | null>(null);
  const [varsText, setVarsText] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/environments`);
      const j = await r.json();
      if (j?.success) setEnvs(j.data);
    } catch { /* ignore */ }
  }, [projectName]);

  useEffect(() => { void load(); }, [load]);

  // live updates: env deploy broadcasts a project_status event
  useEffect(() => {
    const onStatus = (e: Event) => {
      if ((e as CustomEvent).detail?.name === projectName) void load();
    };
    window.addEventListener("project_status", onStatus);
    return () => window.removeEventListener("project_status", onStatus);
  }, [projectName, load]);

  const act = async (env: string, action: "deploy" | "stop") => {
    setBusy(`${env}:${action}`);
    try {
      await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/environments/${env}/${action}`, { method: "POST" });
    } finally {
      setBusy("");
      void load();
    }
  };

  const openVars = async (env: string) => {
    const r = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/environments/${env}/env`);
    const j = await r.json();
    const vars = (j?.data || {}) as Record<string, string>;
    setVarsText(Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n"));
    setEditing(env);
  };

  const saveVars = async () => {
    if (!editing) return;
    const vars: Record<string, string> = {};
    for (const line of varsText.split("\n")) {
      const i = line.indexOf("=");
      if (i < 1) continue;
      vars[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/environments/${editing}/env`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vars }),
    });
    setEditing(null);
    void load();
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase text-gray-400 font-semibold tracking-wide">Envs</span>
        {envs.map((e) => {
          const isBusy = busy.startsWith(`${e.env}:`);
          return (
            <div key={e.env} className="flex items-center gap-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg pl-2 pr-1 py-1">
              <CircleDot className={`w-3 h-3 ${e.status === "running" ? "text-green-500" : "text-gray-300"}`} />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{e.env}</span>
              {isBusy ? (
                <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin mx-0.5" />
              ) : e.status === "running" ? (
                <button disabled={!!busy} onClick={() => act(e.env, "stop")} title={`Stop ${e.env}`} className="p-0.5 text-gray-400 hover:text-red-600 disabled:opacity-40">
                  <Square className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button disabled={!!busy} onClick={() => act(e.env, "deploy")} title={`Deploy ${e.env}`} className="p-0.5 text-gray-400 hover:text-green-600 disabled:opacity-40">
                  <Play className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => openVars(e.env)} title={`${e.env} variables`} className="p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditing(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 dark:text-white mb-1">{projectName} · {editing} variables</h3>
            <p className="text-xs text-gray-500 mb-3">
              One <code>KEY=VALUE</code> per line. Set per-environment ports/domains here so dev/test/prod don't collide.
            </p>
            <textarea
              value={varsText}
              onChange={(e) => setVarsText(e.target.value)}
              rows={8}
              spellCheck={false}
              className="w-full font-mono text-xs border border-gray-200 dark:border-gray-600 rounded-lg p-2 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100"
              placeholder={"WEB_PORT=4101\nDB_PASSWORD=...\nWEB_URL=https://dev.example.com"}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setEditing(null)} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300">Cancel</button>
              <button onClick={saveVars} className="px-3 py-1.5 text-sm text-white bg-gray-900 hover:bg-gray-700 rounded-lg">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
