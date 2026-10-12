import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Download,
  ExternalLink,
  Play,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import { LineChart, Tabs } from "pixelwizards-components";
import { apiFetch, apiJson, apiPost } from "@/utils/api";
import { ContainerConsole } from "@/components/ContainerConsole";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  ErrorBanner,
  LoadingState,
  SearchInput,
  StatTile,
  StatusBadge,
  ToggleChip,
  Toolbar,
  type DescriptionItem,
  type Tone,
} from "@/components/ui";

interface ContainerInfo {
  id: string;
  name: string;
  status: string;
  image: string;
  created: string | number;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  ports: Record<string, Array<{ HostPort: string; HostIp: string }> | null> | Array<any>;
  mountPoints: Array<{ Type?: string; Name?: string; Source: string; Destination: string; RW: boolean }>;
  networks: Record<string, { IPAddress?: string; Gateway?: string }>;
  labels: Record<string, string>;
  env: string[];
  cmd: string[] | null;
  entrypoint: string[] | string | null;
  workingDir: string;
  restartPolicy: { Name?: string; MaximumRetryCount?: number };
  resources: { memoryLimit: number; cpuQuota: number; cpuPeriod: number };
  health: { Status?: string };
}

interface StatPoint {
  t: number;
  cpu: number;
  mem: number;
  memUsage: number;
  memLimit: number;
  rx: number;
  tx: number;
}

type Action = "start" | "stop" | "restart" | "delete";

const TABS = ["overview", "logs", "stats", "terminal", "inspect"] as const;
type TabId = (typeof TABS)[number];

const STATUS_TONE: Record<string, Tone> = {
  running: "success",
  exited: "danger",
  dead: "danger",
  paused: "warning",
  restarting: "info",
  created: "neutral",
};

const formatBytes = (bytes: number) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
};

const toDate = (value: string | number | undefined) => {
  if (!value) return null;
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(d.getTime()) || d.getFullYear() < 2000 ? null : d;
};

const relative = (d: Date | null) => {
  if (!d) return "—";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

/** Normalise list-style and inspect-style port data to "host → container". */
function portRows(ports: ContainerInfo["ports"]) {
  const rows = new Map<string, { label: string; host?: string }>();
  if (Array.isArray(ports)) {
    for (const p of ports) {
      const label = p.PublicPort ? `${p.PublicPort} → ${p.PrivatePort}/${p.Type}` : `${p.PrivatePort}/${p.Type}`;
      rows.set(label, { label, host: p.PublicPort ? String(p.PublicPort) : undefined });
    }
  } else {
    for (const [containerPort, bindings] of Object.entries(ports || {})) {
      if (!bindings?.length) rows.set(containerPort, { label: containerPort });
      for (const b of bindings || []) {
        const label = `${b.HostPort} → ${containerPort}`;
        rows.set(label, { label, host: b.HostPort });
      }
    }
  }
  return Array.from(rows.values());
}

function Section({ title, children, count }: { title: string; children: React.ReactNode; count?: number }) {
  return (
    <Card>
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
        {title}
        {count !== undefined && <Badge>{count}</Badge>}
      </h2>
      {children}
    </Card>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="break-all font-mono text-[13px] text-gray-800 dark:text-gray-200">{children}</code>;
}

/* ------------------------------------------------------------------ */

function OverviewTab({ c }: { c: ContainerInfo }) {
  const ports = portRows(c.ports);
  const networks = Object.entries(c.networks || {});
  const command = [
    ...(Array.isArray(c.entrypoint) ? c.entrypoint : c.entrypoint ? [c.entrypoint] : []),
    ...(c.cmd || []),
  ].join(" ");
  const project = c.labels?.["com.docker.compose.project"];
  const service = c.labels?.["com.docker.compose.service"];
  const memLimit = c.resources?.memoryLimit;
  const cpuLimit = c.resources?.cpuQuota && c.resources?.cpuPeriod ? c.resources.cpuQuota / c.resources.cpuPeriod : 0;

  const details: DescriptionItem[] = [
    { label: "Image", value: <Mono>{c.image}</Mono> },
    { label: "Container ID", value: <Mono>{c.id}</Mono> },
    { label: "Created", value: toDate(c.created)?.toLocaleString() ?? "—" },
    {
      label: c.status === "running" ? "Started" : "Finished",
      value: relative(toDate(c.status === "running" ? c.startedAt : c.finishedAt)),
    },
    ...(c.status !== "running" ? [{ label: "Exit code", value: <Mono>{c.exitCode ?? 0}</Mono> }] : []),
    { label: "Restart policy", value: c.restartPolicy?.Name || "no" },
    ...(project ? [{ label: "Compose", value: <Mono>{service ? `${project} / ${service}` : project}</Mono> }] : []),
    { label: "Command", value: command ? <Mono>{command}</Mono> : "—" },
    { label: "Working dir", value: c.workingDir ? <Mono>{c.workingDir}</Mono> : "—" },
    { label: "Limits", value: `${memLimit ? formatBytes(memLimit) : "No memory limit"} · ${cpuLimit ? `${cpuLimit} CPU` : "No CPU limit"}` },
  ];

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <Section title="Details">
          <DescriptionList layout="stacked" columns={2} items={details} />
        </Section>
        <Section title="Mounts" count={c.mountPoints?.length || 0}>
          {c.mountPoints?.length ? (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {c.mountPoints.map((m) => (
                <li key={m.Destination} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-3">
                  <Mono>{m.Destination}</Mono>
                  <span className="hidden text-gray-400 sm:inline">←</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-gray-400" title={m.Source}>
                    {m.Name && m.Type === "volume" ? `volume ${m.Name}` : m.Source}
                  </span>
                  <Badge tone={m.RW ? "neutral" : "warning"}>{m.RW ? "rw" : "ro"}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No volumes or bind mounts.</p>
          )}
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Ports" count={ports.length}>
          {ports.length ? (
            <ul className="space-y-2">
              {ports.map((p) => (
                <li key={p.label} className="flex items-center justify-between gap-2">
                  <Mono>{p.label}</Mono>
                  {p.host && c.status === "running" && (
                    <a
                      href={`${window.location.protocol}//${window.location.hostname}:${p.host}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                    >
                      Open <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No exposed ports.</p>
          )}
        </Section>
        <Section title="Networks" count={networks.length}>
          {networks.length ? (
            <ul className="space-y-2">
              {networks.map(([name, n]) => (
                <li key={name} className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-gray-800 dark:text-gray-200">{name}</span>
                  <Mono>{n.IPAddress || "—"}</Mono>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">Not attached to a network.</p>
          )}
        </Section>
        <Section title="Environment" count={c.env?.length || 0}>
          {c.env?.length ? (
            <ul className="max-h-72 space-y-1.5 overflow-auto">
              {c.env.map((e) => {
                const [k, ...rest] = e.split("=");
                const secret = /pass|secret|token|key/i.test(k);
                return (
                  <li key={k} className="font-mono text-xs">
                    <span className="text-gray-500 dark:text-gray-400">{k}=</span>
                    <span className="break-all text-gray-800 dark:text-gray-200">{secret ? "••••••" : rest.join("=")}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No variables.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const TAIL_OPTIONS = [100, 500, 2000];

function LogsTab({ id, name }: { id: string; name: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [tail, setTail] = useState(500);
  const [query, setQuery] = useState("");
  const [follow, setFollow] = useState(true);
  const [timestamps, setTimestamps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/containers/${id}/logs?tail=${tail}&timestamps=${timestamps}`);
      const text = await res.text();
      if (!res.ok) throw new Error(text.slice(0, 200) || "Failed to load logs");
      // Strip Docker's 8-byte stream headers if they leaked through.
      setLines(text.replace(/[\u0000-\u0008]/g, "").split("\n").filter((l) => l.trim()));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [id, tail, timestamps]);

  useEffect(() => {
    load();
    if (!follow) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load, follow]);

  const shown = useMemo(() => {
    if (!query) return lines;
    const q = query.toLowerCase();
    return lines.filter((l) => l.toLowerCase().includes(q));
  }, [lines, query]);

  useEffect(() => {
    if (follow) boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [shown, follow]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const levelClass = (l: string) =>
    /\b(error|err|fatal|panic|exception)\b/i.test(l)
      ? "text-red-400"
      : /\b(warn|warning)\b/i.test(l)
        ? "text-amber-300"
        : "text-gray-300";

  return (
    <div className="space-y-3">
      <Toolbar
        end={
          <>
            <select aria-label="Lines" value={tail} onChange={(e) => setTail(Number(e.target.value))} className="field w-auto">
              {TAIL_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  Last {n}
                </option>
              ))}
            </select>
            <Button size="sm" icon={<Copy className="h-4 w-4" />} onClick={() => navigator.clipboard?.writeText(lines.join("\n"))}>
              Copy
            </Button>
            <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={download}>
              Download
            </Button>
          </>
        }
      >
        <SearchInput value={query} onChange={setQuery} placeholder="Filter lines…" />
        <ToggleChip label="Follow" checked={follow} onChange={setFollow} />
        <ToggleChip label="Timestamps" checked={timestamps} onChange={setTimestamps} />
      </Toolbar>
      <ErrorBanner message={error} onRetry={load} />
      <div
        ref={boxRef}
        className="h-[60vh] min-h-[320px] overflow-auto rounded-xl border border-gray-800 bg-gray-950 p-4 font-mono text-[12.5px] leading-relaxed"
        aria-live="off"
      >
        {loading ? (
          <p className="text-gray-500">Loading logs…</p>
        ) : shown.length ? (
          shown.map((l, i) => (
            <div key={i} className={`whitespace-pre-wrap break-words ${levelClass(l)}`}>
              {l}
            </div>
          ))
        ) : (
          <p className="text-gray-500">{query ? "No lines match the filter." : "This container hasn't logged anything yet."}</p>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {shown.length} of {lines.length} lines{follow ? " · refreshing every 3s" : ""}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const MAX_POINTS = 60;

function StatsTab({ id, running }: { id: string; running: boolean }) {
  const [points, setPoints] = useState<StatPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await apiJson<{ data: any }>(`/api/containers/${id}/stats`);
        const s = res.data || {};
        if (!alive) return;
        setPoints((prev) =>
          [
            ...prev,
            {
              t: Date.now(),
              cpu: s.cpuPercent || 0,
              mem: s.memoryPercent || 0,
              memUsage: s.memoryUsage || 0,
              memLimit: s.memoryLimit || 0,
              rx: s.networkRx || 0,
              tx: s.networkTx || 0,
            },
          ].slice(-MAX_POINTS),
        );
        setError(null);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Failed to load stats");
      }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [id, running]);

  if (!running) {
    return (
      <Card>
        <EmptyState title="Container is not running" description="Start it to see live CPU, memory and network usage." />
      </Card>
    );
  }

  const last = points[points.length - 1];
  const label = (t: number) => new Date(t).toLocaleTimeString([], { minute: "2-digit", second: "2-digit" });

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="CPU" value={last ? `${last.cpu.toFixed(1)}%` : "—"} tone="accent" />
        <StatTile
          label="Memory"
          value={last ? formatBytes(last.memUsage) : "—"}
          hint={last?.memLimit ? `of ${formatBytes(last.memLimit)} (${last.mem.toFixed(1)}%)` : undefined}
          tone="info"
        />
        <StatTile label="Network in" value={last ? formatBytes(last.rx) : "—"} hint="since start" />
        <StatTile label="Network out" value={last ? formatBytes(last.tx) : "—"} hint="since start" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(
          [
            ["CPU %", (p: StatPoint) => p.cpu],
            ["Memory %", (p: StatPoint) => p.mem],
          ] as const
        ).map(([title, pick]) => (
          <Card key={title}>
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            {points.length > 1 ? (
              <LineChart
                data={points.map((p) => ({ x: label(p.t), y: Math.round(pick(p) * 10) / 10 }))}
                height={200}
                showArea
                smooth
              />
            ) : (
              <p className="flex h-[200px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                Collecting samples…
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function InspectTab({ c }: { c: ContainerInfo }) {
  const json = useMemo(() => JSON.stringify(c, null, 2), [c]);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" icon={<Copy className="h-4 w-4" />} onClick={() => navigator.clipboard?.writeText(json)}>
          Copy JSON
        </Button>
      </div>
      <pre className="max-h-[70vh] overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-4 font-mono text-xs text-gray-800 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300">
        {json}
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function ContainerDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [container, setContainer] = useState<ContainerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const tabParam = params.get("tab") as TabId | null;
  const tab: TabId = tabParam && TABS.includes(tabParam) ? tabParam : "overview";

  const load = useCallback(async () => {
    try {
      const res = await apiJson<{ data: ContainerInfo }>(`/api/containers/${id}`);
      setContainer({ ...res.data, name: res.data.name.replace(/^\//, "") });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Container not found");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (action: Action) => {
    setPending(action);
    try {
      if (action === "delete") {
        const res = await apiFetch(`/api/containers/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete container");
        navigate("/containers");
        return;
      }
      await apiPost(`/api/containers/${id}/${action}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action}`);
    } finally {
      setPending(null);
    }
  };

  if (loading) return <LoadingState label="Loading container…" />;

  if (!container) {
    return (
      <div className="mx-auto max-w-screen-2xl space-y-4">
        <BackLink />
        <Card>
          <EmptyState
            title="Container not found"
            description={error ?? "It may have been removed."}
            action={<Button onClick={() => navigate("/containers")}>Back to containers</Button>}
          />
        </Card>
      </div>
    );
  }

  const running = container.status === "running";
  const health = container.health?.Status;

  return (
    <div className="mx-auto max-w-screen-2xl space-y-5">
      <div className="space-y-3">
        <BackLink />
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold text-gray-900 dark:text-gray-50">{container.name}</h1>
              <StatusBadge
                tone={STATUS_TONE[container.status] ?? "neutral"}
                label={pending && pending !== "delete" ? `${pending}ing` : container.status}
                busy={Boolean(pending)}
              />
              {health && <Badge tone={health === "healthy" ? "success" : health === "unhealthy" ? "danger" : "warning"}>{health}</Badge>}
            </div>
            <p className="mt-1 truncate font-mono text-xs text-gray-500 dark:text-gray-400" title={container.image}>
              {container.image} · {container.id}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {running ? (
              <Button icon={<Square className="h-4 w-4" />} onClick={() => act("stop")} disabled={!!pending}>
                Stop
              </Button>
            ) : (
              <Button variant="primary" icon={<Play className="h-4 w-4" />} onClick={() => act("start")} disabled={!!pending}>
                Start
              </Button>
            )}
            <Button icon={<RefreshCw className="h-4 w-4" />} onClick={() => act("restart")} disabled={!!pending}>
              Restart
            </Button>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirmDelete(true)} disabled={!!pending}>
              Delete
            </Button>
          </div>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <Tabs
        value={tab}
        onChange={(next) => setParams(next === "overview" ? {} : { tab: next }, { replace: true })}
        tabs={[
          { id: "overview", label: "Overview", content: <OverviewTab c={container} /> },
          { id: "logs", label: "Logs", content: <LogsTab id={container.id} name={container.name} /> },
          { id: "stats", label: "Stats", content: <StatsTab id={container.id} running={running} /> },
          {
            id: "terminal",
            label: "Terminal",
            content: (
              <ContainerConsole
                containerId={container.id}
                containerName={container.name}
                autoConnect={running}
                disabledReason={running ? undefined : `${container.name} is ${container.status}. Start it to open a shell.`}
              />
            ),
          },
          { id: "inspect", label: "Inspect", content: <InspectTab c={container} /> },
        ]}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${container.name}?`}
        message="The container is removed. Named volumes are kept."
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          act("delete");
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/containers"
      className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Containers
    </Link>
  );
}
