import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Play,
  Square,
  RefreshCw,
  Trash2,
  Terminal,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  PauseCircle,
  Copy,
  Download,
  Layers,
  Package2,
  Boxes,
  Cpu,
  MemoryStick,
  Network,
  ScrollText,
} from "lucide-react";
import { apiFetch, apiJson, apiPost } from "@/utils/api";
import {
  Button,
  IconButton,
  Card,
  CardBody,
  CardFooter,
  CardGrid,
  CardHeader,
  ConfirmDialog,
  DataTable,
  DescriptionList,
  DropdownMenu,
  EmptyState,
  ErrorBanner,
  IconTile,
  List,
  ListItem,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  StatTile,
  StatusBadge,
  ToggleChip,
  Toolbar,
  ViewSwitcher,
  useViewMode,
  type DataTableColumn,
  type Tone,
} from "@/components/ui";
import { usePolling } from "@/hooks/usePolling";

interface ContainerPort {
  label: string;
  publicPort?: number;
}

interface Container {
  id: string;
  name: string;
  image: string;
  status: "running" | "stopped" | "paused" | "restarting";
  ports: ContainerPort[];
  cpu: number | null;
  memory: number | null;
  uptime: string;
  created: string;
  projectName?: string;
}

function transformPorts(raw: any): ContainerPort[] {
  // Docker returns Ports as [{IP, PrivatePort, PublicPort, Type}]
  const entries: ContainerPort[] = Array.isArray(raw)
    ? raw.map((p: any) => ({
        label: p.PublicPort
          ? `${p.PublicPort}→${p.PrivatePort}/${p.Type}`
          : `${p.PrivatePort}/${p.Type}`,
        publicPort: p.PublicPort,
      }))
    : Object.keys(raw || {}).map((key) => ({ label: key }));
  // Docker duplicates entries per bound IP (IPv4 + IPv6) — dedupe by label
  const seen = new Set<string>();
  return entries.filter((p) => {
    if (seen.has(p.label)) return false;
    seen.add(p.label);
    return true;
  });
}

type ContainerAction = "start" | "stop" | "restart" | "delete";

const cx = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");

const STATS_FETCH_LIMIT = 10;
const VIEWS = ["grid", "list", "table"] as const;

const STATUS_TONE: Record<Container["status"], Tone> = {
  running: "success",
  stopped: "danger",
  paused: "warning",
  restarting: "info",
};

const PENDING_LABEL: Record<ContainerAction, string> = {
  start: "Starting",
  stop: "Stopping",
  restart: "Restarting",
  delete: "Deleting",
};

interface RowProps {
  container: Container;
  pendingAction: ContainerAction | null;
  onAction: (container: Container, action: ContainerAction) => void;
  onViewLogs: (container: Container) => void;
  onOpenTerminal: (container: Container) => void;
}

function ContainerStatus({
  container,
  pendingAction,
}: Pick<RowProps, "container" | "pendingAction">) {
  return (
    <StatusBadge
      tone={pendingAction ? "info" : STATUS_TONE[container.status] ?? "neutral"}
      label={pendingAction ? `${PENDING_LABEL[pendingAction]}…` : container.status}
      busy={pendingAction !== null}
    />
  );
}

/** Port chips; published ports link to the host. */
function PortList({ ports, limit }: { ports: ContainerPort[]; limit?: number }) {
  if (ports.length === 0) {
    return <span className="text-gray-400 dark:text-gray-500">None</span>;
  }
  const shown = limit ? ports.slice(0, limit) : ports;
  const hidden = ports.length - shown.length;
  return (
    <span className="inline-flex flex-wrap justify-end gap-1 min-w-0">
      {shown.map((port) =>
        port.publicPort ? (
          <a
            key={port.label}
            href={`http://${window.location.hostname}:${port.publicPort}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open http://${window.location.hostname}:${port.publicPort}`}
            className="font-mono text-xs px-1.5 py-0.5 rounded-md bg-primary-50 text-primary-700 hover:underline dark:bg-primary-500/10 dark:text-primary-300"
          >
            {port.label}
          </a>
        ) : (
          <span
            key={port.label}
            className="font-mono text-xs px-1.5 py-0.5 rounded-md bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          >
            {port.label}
          </span>
        ),
      )}
      {hidden > 0 && (
        <span
          className="text-xs px-1.5 py-0.5 text-gray-500 dark:text-gray-400"
          title={ports.slice(shown.length).map((p) => p.label).join(", ")}
        >
          +{hidden}
        </span>
      )}
    </span>
  );
}

const formatCpu = (c: Container) => (c.cpu === null ? null : `${c.cpu.toFixed(1)}%`);
const formatMemory = (c: Container) =>
  c.memory === null ? null : c.memory >= 1024 ? `${(c.memory / 1024).toFixed(2)} GB` : `${c.memory.toFixed(0)} MB`;

/**
 * Logs, start/stop, restart, terminal and delete, in that order everywhere.
 * `collapseBelow` swaps the row of icons for start/stop plus a menu on
 * narrow screens so tables and lists don't scroll sideways.
 */
function ContainerActions({
  container,
  pendingAction,
  onAction,
  onViewLogs,
  onOpenTerminal,
  collapseBelow,
}: RowProps & { collapseBelow?: "md" | "xl" }) {
  const busy = pendingAction !== null;
  const running = container.status === "running";
  const full = (
    <div
      className={cx(
        "items-center gap-0.5",
        collapseBelow === "md" ? "hidden md:flex" : collapseBelow === "xl" ? "hidden xl:flex" : "flex",
      )}
    >
      <IconButton label="View logs" onClick={() => onViewLogs(container)} disabled={busy}>
        <ScrollText className="w-4 h-4" />
      </IconButton>
      <IconButton
        label={running ? "Stop" : "Start"}
        tone={running ? "danger" : "success"}
        loading={pendingAction === "start" || pendingAction === "stop"}
        disabled={busy}
        onClick={() => onAction(container, running ? "stop" : "start")}
      >
        {running ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </IconButton>
      <IconButton
        label="Restart"
        tone="info"
        loading={pendingAction === "restart"}
        disabled={busy || !running}
        onClick={() => onAction(container, "restart")}
      >
        <RefreshCw className="w-4 h-4" />
      </IconButton>
      <IconButton
        label="Open terminal"
        disabled={busy || !running}
        onClick={() => onOpenTerminal(container)}
      >
        <Terminal className="w-4 h-4" />
      </IconButton>
      <IconButton
        label="Delete"
        tone="danger"
        loading={pendingAction === "delete"}
        disabled={busy}
        onClick={() => onAction(container, "delete")}
      >
        <Trash2 className="w-4 h-4" />
      </IconButton>
    </div>
  );
  if (!collapseBelow) return full;
  return (
    <>
      {full}
      <div className={cx("items-center gap-0.5", collapseBelow === "md" ? "flex md:hidden" : "flex xl:hidden")}>
        <IconButton
          label={running ? "Stop" : "Start"}
          tone={running ? "danger" : "success"}
          loading={pendingAction === "start" || pendingAction === "stop"}
          disabled={busy}
          onClick={() => onAction(container, running ? "stop" : "start")}
        >
          {running ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </IconButton>
        <DropdownMenu
          iconTrigger
          triggerLabel={`More actions for ${container.name}`}
          items={[
            { label: "View logs", icon: <ScrollText className="w-4 h-4" />, onClick: () => onViewLogs(container), disabled: busy },
            { label: "Restart", icon: <RefreshCw className="w-4 h-4" />, onClick: () => onAction(container, "restart"), disabled: busy || !running },
            { label: "Open terminal", icon: <Terminal className="w-4 h-4" />, onClick: () => onOpenTerminal(container), disabled: busy || !running },
            { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => onAction(container, "delete"), disabled: busy, danger: true, dividerAbove: true },
          ]}
        />
      </div>
    </>
  );
}

function ContainerCard(props: RowProps) {
  const { container } = props;
  return (
    <Card className={props.pendingAction ? "opacity-70" : undefined}>
      <CardHeader
        leading={
          <IconTile tone={STATUS_TONE[container.status] ?? "neutral"}>
            <Package2 />
          </IconTile>
        }
        title={<span title={container.name}>{container.name}</span>}
        subtitle={<span className="font-mono text-xs" title={container.image}>{container.image}</span>}
        actions={<ContainerStatus container={container} pendingAction={props.pendingAction} />}
      />
      <CardBody className="mt-4">
        <DescriptionList
          items={[
            { label: "Ports", icon: <Network className="w-3.5 h-3.5" />, value: <PortList ports={container.ports} limit={3} />, title: "" },
            { label: "CPU", icon: <Cpu className="w-3.5 h-3.5" />, value: formatCpu(container), mono: true },
            { label: "Memory", icon: <MemoryStick className="w-3.5 h-3.5" />, value: formatMemory(container), mono: true },
            { label: "Project", icon: <Layers className="w-3.5 h-3.5" />, value: container.projectName, hidden: !container.projectName },
            { label: "Created", icon: <Clock className="w-3.5 h-3.5" />, value: container.created },
          ]}
        />
      </CardBody>
      <CardFooter>
        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{container.id.slice(0, 12)}</span>
        <ContainerActions {...props} />
      </CardFooter>
    </Card>
  );
}

export default function Containers() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");
  const [filterStatus, setFilterStatus] = useState<string>(
    searchParams.get("status") || "all",
  );
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(
    null,
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [groupByProject, setGroupByProject] = useState(false);
  const [view, setView] = useViewMode("containers", "table", VIEWS);
  const [showCreateModal, setShowCreateModal] = useState(
    searchParams.get("create") === "1",
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingActions, setPendingActions] = useState<
    Record<string, ContainerAction>
  >({});
  const [deleteTarget, setDeleteTarget] = useState<Container | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    image: "alpine:latest",
    containerPort: "",
    hostPort: "",
    envText: "",
    packagesText: "",
    command: "",
  });

  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  // Clear one-shot URL params (create=1) after applying them
  useEffect(() => {
    if (searchParams.get("create") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchContainers = useCallback(async () => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    fetchTimeoutRef.current = setTimeout(async () => {
      try {
        if (!hasLoadedRef.current) setLoading(true);
        const result = await apiJson("/api/containers");
        const data = result.data || [];

        const transformed: Container[] = data.map(
          (container: any): Container => ({
            id: container.id,
            name: container.name,
            image: container.image,
            status: container.status.toLowerCase(),
            ports: transformPorts(container.ports),
            cpu: null,
            memory: null,
            uptime:
              container.status === "running"
                ? "Running"
                : container.startedAt
                  ? new Date(container.startedAt).toLocaleString()
                  : "Never started",
            created: new Date(container.created * 1000).toLocaleString(),
            projectName:
              (container.labels || {})["com.docker.compose.project"] ||
              undefined,
          }),
        );

        setContainers(transformed);
        setError(null);
        hasLoadedRef.current = true;

        const runningContainers = transformed
          .filter((c) => c.status === "running")
          .slice(0, STATS_FETCH_LIMIT);

        const statsResults = await Promise.allSettled(
          runningContainers.map(async (container) => {
            const statsResult = await apiJson(
              `/api/containers/${container.id}/stats`,
            );
            const stats = statsResult.data || statsResult;
            return {
              id: container.id,
              cpu: stats.cpuPercent || 0,
              memory:
                Math.round((stats.memoryUsage / 1024 / 1024) * 100) / 100,
            };
          }),
        );

        const statsMap = new Map<string, { cpu: number; memory: number }>();
        statsResults.forEach((result) => {
          if (result.status === "fulfilled") {
            statsMap.set(result.value.id, {
              cpu: result.value.cpu,
              memory: result.value.memory,
            });
          }
        });

        if (statsMap.size > 0) {
          setContainers((prev) =>
            prev.map((container) =>
              statsMap.has(container.id)
                ? { ...container, ...statsMap.get(container.id)! }
                : container,
            ),
          );
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch containers",
        );
      } finally {
        setLoading(false);
      }
    }, 200);
  }, []);

  usePolling(fetchContainers, 15000, autoRefresh);
  useEffect(
    () => () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    },
    [],
  );

  // Refresh live when the backend reports container changes
  useEffect(() => {
    const onEvent = () => fetchContainers();
    window.addEventListener("container_event", onEvent);
    return () => window.removeEventListener("container_event", onEvent);
  }, [fetchContainers]);

  const fetchLogs = async (containerId: string) => {
    try {
      setLogsLoading(true);
      setLogsError(null);
      const response = await apiFetch(`/api/containers/${containerId}/logs`);
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || "Failed to fetch logs");
      }
      const logLines = text.split("\n").filter((line) => line.trim());
      setLogs(logLines.length > 0 ? logLines : ["No logs available"]);
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : "Failed to fetch logs");
    } finally {
      setLogsLoading(false);
    }
  };

  const handleViewLogs = (container: Container) => {
    setSelectedContainer(container);
    setShowLogsModal(true);
    fetchLogs(container.id);
  };

  const copyLogs = () => {
    navigator.clipboard.writeText(logs.join("\n"));
  };

  const downloadLogs = () => {
    const blob = new Blob([logs.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedContainer?.name}-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runContainerAction = useCallback(
    async (container: Container, action: ContainerAction) => {
      setPendingActions((prev) => ({ ...prev, [container.id]: action }));
      try {
        if (action === "delete") {
          const response = await apiFetch(`/api/containers/${container.id}`, {
            method: "DELETE",
          });
          if (!response.ok) throw new Error("Failed to delete container");
        } else {
          await apiPost(`/api/containers/${container.id}/${action}`);
        }
        await fetchContainers();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `Failed to ${action} ${container.name}`,
        );
      } finally {
        setPendingActions((prev) => {
          const next = { ...prev };
          delete next[container.id];
          return next;
        });
      }
    },
    [fetchContainers],
  );

  const handleAction = (container: Container, action: ContainerAction) => {
    if (action === "delete") {
      setDeleteTarget(container);
      return;
    }
    runContainerAction(container, action);
  };

  const createContainer = async () => {
    setCreateError(null);

    if (!createForm.image.trim()) {
      setCreateError("Image is required");
      return;
    }

    const env: Record<string, string> = {};
    createForm.envText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const [key, ...rest] = line.split("=");
        if (key) {
          env[key.trim()] = rest.join("=").trim();
        }
      });

    const packages = createForm.packagesText
      .split(/[,\s]+/)
      .map((pkg) => pkg.trim())
      .filter(Boolean);

    const ports =
      createForm.containerPort.trim() !== ""
        ? [
            {
              containerPort: parseInt(createForm.containerPort, 10),
              hostPort:
                createForm.hostPort.trim() !== ""
                  ? parseInt(createForm.hostPort, 10)
                  : undefined,
              protocol: "tcp",
            },
          ]
        : [];

    try {
      setCreating(true);
      await apiPost("/api/containers/create", {
        name: createForm.name.trim() || undefined,
        image: createForm.image.trim(),
        ports,
        env,
        packages,
        command: createForm.command.trim() || undefined,
      });

      setShowCreateModal(false);
      setCreateForm({
        name: "",
        image: "alpine:latest",
        containerPort: "",
        hostPort: "",
        envText: "",
        packagesText: "",
        command: "",
      });
      await fetchContainers();
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : "Failed to create container",
      );
    } finally {
      setCreating(false);
    }
  };

  const applyStatusFilter = (status: string) => {
    const next = filterStatus === status ? "all" : status;
    setFilterStatus(next);
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("status");
    else params.set("status", next);
    setSearchParams(params, { replace: true });
  };

  const filteredContainers = containers.filter((container) => {
    const matchesSearch =
      container.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      container.image.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterStatus === "all" || container.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const groupedContainers = groupByProject
    ? filteredContainers.reduce<Record<string, Container[]>>((acc, c) => {
        const key = c.projectName || "(no project)";
        (acc[key] = acc[key] || []).push(c);
        return acc;
      }, {})
    : null;

  const runningCount = containers.filter((c) => c.status === "running").length;
  const stoppedCount = containers.filter((c) => c.status === "stopped").length;
  const pausedCount = containers.filter((c) => c.status === "paused").length;

  if (loading && !hasLoadedRef.current) {
    return <LoadingState label="Fetching container information from Docker…" />;
  }

  const rowProps = (container: Container): RowProps => ({
    container,
    pendingAction: pendingActions[container.id] || null,
    onAction: handleAction,
    onViewLogs: handleViewLogs,
    onOpenTerminal: (c) => navigate(`/terminal/${c.id}`),
  });

  const groups = groupedContainers
    ? Object.entries(groupedContainers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([projectName, rows]) => ({ key: projectName, label: projectName, rows }))
    : [{ key: "all", label: null as string | null, rows: filteredContainers }];

  const columns: DataTableColumn<Container>[] = [
    {
      key: "name",
      header: "Container",
      render: (c) => (
        <div className="min-w-0 max-w-[12rem] sm:max-w-[18rem]">
          <div className="font-medium text-gray-900 dark:text-gray-100 truncate" title={c.name}>
            {c.name}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate" title={c.image}>
            {c.image}
          </div>
          <div className="mt-1.5 sm:hidden">
            <ContainerStatus container={c} pendingAction={pendingActions[c.id] || null} />
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      hideBelow: "sm",
      nowrap: true,
      render: (c) => <ContainerStatus container={c} pendingAction={pendingActions[c.id] || null} />,
    },
    { key: "ports", header: "Ports", hideBelow: "xl", nowrap: true, render: (c) => <PortList ports={c.ports} limit={1} /> },
    {
      key: "usage",
      header: "CPU / Memory",
      align: "right",
      hideBelow: "lg",
      nowrap: true,
      render: (c) =>
        c.cpu === null ? (
          <span className="text-gray-400">–</span>
        ) : (
          <div className="tabular text-xs leading-5">
            <div className="text-gray-900 dark:text-gray-100">{formatCpu(c)}</div>
            <div className="text-gray-500 dark:text-gray-400">{formatMemory(c)}</div>
          </div>
        ),
    },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", width: "1%", render: (c) => <ContainerActions {...rowProps(c)} collapseBelow="xl" /> },
  ];

  const groupHeading = (label: string, count: number) => (
    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
      <Layers className="w-3.5 h-3.5" aria-hidden="true" />
      {label}
      <span className="font-normal tabular">({count})</span>
    </h2>
  );

  const statusFilters = [
    { value: "all", label: "Total", count: containers.length, icon: <Boxes />, tone: "accent" as Tone },
    { value: "running", label: "Running", count: runningCount, icon: <CheckCircle />, tone: "success" as Tone },
    { value: "stopped", label: "Stopped", count: stoppedCount, icon: <XCircle />, tone: "danger" as Tone },
    { value: "paused", label: "Paused", count: pausedCount, icon: <PauseCircle />, tone: "warning" as Tone },
  ];

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      <PageHeader
        title="Containers"
        subtitle={`${containers.length} containers, ${runningCount} running`}
        actions={
          <>
            <ToggleChip label="Auto refresh" checked={autoRefresh} onChange={setAutoRefresh} />
            <IconButton label="Refresh" onClick={fetchContainers}>
              <RefreshCw className="w-4 h-4" />
            </IconButton>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
              New container
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={fetchContainers} />

      {/* Stat cards double as the status filter. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statusFilters.map((f) => (
          <StatTile
            key={f.value}
            label={f.label}
            value={<span className="tabular">{f.count}</span>}
            icon={f.icon}
            tone={f.tone}
            active={filterStatus === f.value}
            onClick={() => applyStatusFilter(f.value)}
          />
        ))}
      </div>

      <Toolbar
        end={
          <ViewSwitcher value={view} onChange={setView} />
        }
      >
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search name or image…" label="Search containers" />
        <ToggleChip
          label="Group by project"
          icon={<Layers className="w-3.5 h-3.5" />}
          checked={groupByProject}
          onChange={setGroupByProject}
        />
      </Toolbar>

      {filteredContainers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package2 className="w-6 h-6" />}
            title={containers.length === 0 ? "No containers yet" : "No containers match your filters"}
            description={
              containers.length === 0
                ? "Create your first container or deploy a project to get started."
                : "Try a different search or status."
            }
            action={
              containers.length === 0 ? (
                <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                  New container
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setSearchTerm("");
                    applyStatusFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        </Card>
      ) : view === "table" ? (
        <Card padded={false} className="overflow-hidden">
          <DataTable
            caption="Containers"
            columns={columns}
            rowKey={(c) => c.id}
            rows={groupedContainers ? undefined : filteredContainers}
            groups={
              groupedContainers
                ? groups.map((g) => ({ key: g.key, label: `${g.label} (${g.rows.length})`, rows: g.rows }))
                : undefined
            }
            rowClassName={(c) => (pendingActions[c.id] ? "opacity-60" : undefined)}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} className="space-y-3">
              {group.label !== null && groupHeading(group.label, group.rows.length)}
              {view === "grid" ? (
                <CardGrid dense>
                  {group.rows.map((c) => (
                    <ContainerCard key={c.id} {...rowProps(c)} />
                  ))}
                </CardGrid>
              ) : (
                <List>
                  {group.rows.map((c) => (
                    <ListItem
                      key={c.id}
                      leading={
                        <IconTile tone={STATUS_TONE[c.status] ?? "neutral"}>
                          <Package2 />
                        </IconTile>
                      }
                      title={c.name}
                      subtitle={<span className="font-mono text-xs">{c.image}</span>}
                      meta={
                        <span className="flex items-center gap-2">
                          {c.ports.length > 0 && <PortList ports={c.ports} limit={1} />}
                          <ContainerStatus container={c} pendingAction={pendingActions[c.id] || null} />
                        </span>
                      }
                      actions={<ContainerActions {...rowProps(c)} collapseBelow="md" />}
                    />
                  ))}
                </List>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Logs modal */}
      <Modal
        open={showLogsModal && selectedContainer !== null}
        onClose={() => setShowLogsModal(false)}
        title={
          <span className="flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-gray-500" aria-hidden="true" />
            {selectedContainer?.name} logs
          </span>
        }
        wide
        footer={
          <>
            <Button
              variant="secondary"
              icon={<Copy className="w-4 h-4" />}
              onClick={copyLogs}
            >
              Copy
            </Button>
            <Button
              variant="secondary"
              icon={<Download className="w-4 h-4" />}
              onClick={downloadLogs}
            >
              Download
            </Button>
          </>
        }
      >
        {logsLoading ? (
          <LoadingState label="Loading logs…" />
        ) : logsError ? (
          <ErrorBanner
            message={logsError}
            onRetry={() =>
              selectedContainer && fetchLogs(selectedContainer.id)
            }
          />
        ) : (
          <pre className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-300 whitespace-pre-wrap max-h-[55vh] overflow-y-auto">
            {logs.join("\n")}
          </pre>
        )}
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete container"
        message={
          <>
            This will permanently remove{" "}
            <span className="font-mono font-semibold">
              {deleteTarget?.name}
            </span>
            {deleteTarget?.status === "running" && (
              <>
                {" "}
                — it is currently <strong>running</strong> and will be stopped
                first
              </>
            )}
            .
          </>
        }
        confirmLabel="Delete"
        requireText={
          deleteTarget?.status === "running" ? deleteTarget.name : undefined
        }
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            runContainerAction(deleteTarget, "delete");
            setDeleteTarget(null);
          }
        }}
      />

      {/* Create modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="New container"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" loading={creating} onClick={createContainer}>
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {createError && <ErrorBanner message={createError} />}
          <div>
            <label htmlFor="containers-field-1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Image
            </label>
            <select id="containers-field-1"
              value={createForm.image}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, image: e.target.value }))
              }
              className="field"
            >
              <option value="alpine:latest">alpine:latest</option>
              <option value="ubuntu:latest">ubuntu:latest</option>
              <option value="debian:latest">debian:latest</option>
              <option value="node:20-alpine">node:20-alpine</option>
              <option value="node:20-bookworm">node:20-bookworm</option>
            </select>
            <input
              type="text"
              value={createForm.image}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, image: e.target.value }))
              }
              className="field mt-2"
              aria-label="Custom image"
              placeholder="custom-image:tag"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="containers-field-2" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Container Port
              </label>
              <input id="containers-field-2"
                type="number"
                value={createForm.containerPort}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    containerPort: e.target.value,
                  }))
                }
                className="field"
                placeholder="8080"
              />
            </div>
            <div>
              <label htmlFor="containers-field-3" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Host Port (optional)
              </label>
              <input id="containers-field-3"
                type="number"
                value={createForm.hostPort}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    hostPort: e.target.value,
                  }))
                }
                className="field"
                placeholder="3001"
              />
            </div>
          </div>
          <div>
            <label htmlFor="containers-field-4" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Packages (optional)
            </label>
            <input id="containers-field-4"
              type="text"
              value={createForm.packagesText}
              onChange={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  packagesText: e.target.value,
                }))
              }
              className="field"
              placeholder="nodejs npm curl"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Space or comma separated. Supports alpine/ubuntu/debian package
              managers.
            </p>
          </div>
          <div>
            <label htmlFor="containers-field-5" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Environment Variables (optional)
            </label>
            <textarea id="containers-field-5"
              value={createForm.envText}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, envText: e.target.value }))
              }
              className="field h-auto py-2 min-h-[90px] font-mono"
              placeholder="KEY=value"
            />
          </div>
          <div>
            <label htmlFor="containers-field-6" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Command (optional)
            </label>
            <input id="containers-field-6"
              type="text"
              value={createForm.command}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, command: e.target.value }))
              }
              className="field"
              placeholder="bash -lc 'echo hello'"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              If empty, container will run `sleep infinity`.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
