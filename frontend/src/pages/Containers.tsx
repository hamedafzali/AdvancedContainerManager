import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Play,
  Square,
  RefreshCw,
  Trash2,
  Terminal,
  Search,
  Plus,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  Activity,
  HardDrive,
  Copy,
  Download,
  Layers,
  Package2,
} from "lucide-react";
import { apiFetch, apiJson, apiPost } from "@/utils/api";
import {
  Button,
  IconButton,
  Card,
  Modal,
  ConfirmDialog,
  StatTile,
  ErrorBanner,
  EmptyState,
  LoadingState,
  PageHeader,
  ToggleChip,
} from "@/components/ui";

interface Container {
  id: string;
  name: string;
  image: string;
  status: "running" | "stopped" | "paused" | "restarting";
  ports: string[];
  cpu: number | null;
  memory: number | null;
  uptime: string;
  created: string;
  projectName?: string;
}

type ContainerAction = "start" | "stop" | "restart" | "delete";

const STATS_FETCH_LIMIT = 10;

function getStatusIcon(status: Container["status"]) {
  switch (status) {
    case "running":
      return <CheckCircle className="w-4 h-4 text-green-600" />;
    case "stopped":
      return <XCircle className="w-4 h-4 text-red-600" />;
    case "paused":
      return <AlertCircle className="w-4 h-4 text-yellow-600" />;
    case "restarting":
      return <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />;
    default:
      return null;
  }
}

function getStatusClasses(status: Container["status"]) {
  switch (status) {
    case "running":
      return "text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400";
    case "stopped":
      return "text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400";
    case "paused":
      return "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "restarting":
      return "text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400";
    default:
      return "text-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-gray-300";
  }
}

function ContainerRow({
  container,
  pendingAction,
  onAction,
  onViewLogs,
  onOpenTerminal,
}: {
  container: Container;
  pendingAction: ContainerAction | null;
  onAction: (container: Container, action: ContainerAction) => void;
  onViewLogs: (container: Container) => void;
  onOpenTerminal: (container: Container) => void;
}) {
  const busy = pendingAction !== null;
  const running = container.status === "running";

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {container.name}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          ID: {container.id.slice(0, 12)}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 dark:text-gray-100 font-mono">
          {container.image}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClasses(container.status)}`}
        >
          {pendingAction ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            getStatusIcon(container.status)
          )}
          <span className="ml-1">
            {pendingAction ? `${pendingAction}ing…` : container.status}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900 dark:text-gray-100 font-mono">
          {container.ports.join(", ") || "—"}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <Activity className="w-4 h-4 text-gray-400 mr-2" />
          <span className="text-sm text-gray-900 dark:text-gray-100">
            {container.cpu === null ? "—" : `${container.cpu.toFixed(1)}%`}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <HardDrive className="w-4 h-4 text-gray-400 mr-2" />
          <span className="text-sm text-gray-900 dark:text-gray-100">
            {container.memory === null ? "—" : `${container.memory}MB`}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <Clock className="w-4 h-4 text-gray-400 mr-2" />
          <span className="text-sm text-gray-900 dark:text-gray-100">
            {container.uptime}
          </span>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center space-x-1">
          <IconButton
            label="View logs"
            onClick={() => onViewLogs(container)}
            disabled={busy}
          >
            <Eye className="w-4 h-4" />
          </IconButton>
          <IconButton
            label={running ? "Stop" : "Start"}
            tone={running ? "danger" : "success"}
            loading={pendingAction === "start" || pendingAction === "stop"}
            disabled={busy}
            onClick={() => onAction(container, running ? "stop" : "start")}
          >
            {running ? (
              <Square className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
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
      </td>
    </tr>
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
            ports: Object.keys(container.ports || {}),
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

  useEffect(() => {
    fetchContainers();
    const interval = autoRefresh
      ? setInterval(fetchContainers, 15000)
      : undefined;
    return () => {
      if (interval) clearInterval(interval);
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
    };
  }, [autoRefresh, fetchContainers]);

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

  const renderRow = (container: Container) => (
    <ContainerRow
      key={container.id}
      container={container}
      pendingAction={pendingActions[container.id] || null}
      onAction={handleAction}
      onViewLogs={handleViewLogs}
      onOpenTerminal={(c) => navigate(`/terminal/${c.id}`)}
    />
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Containers"
        subtitle={`${containers.length} containers · ${runningCount} running`}
        actions={
          <Button
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            New Container
          </Button>
        }
      />

      <ErrorBanner
        message={error}
        onDismiss={() => setError(null)}
        onRetry={fetchContainers}
      />

      {/* Clickable stat tiles double as status filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatTile
          value={runningCount}
          label="Running"
          active={filterStatus === "running"}
          icon={
            <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          }
          onClick={() => applyStatusFilter("running")}
        />
        <StatTile
          value={stoppedCount}
          label="Stopped"
          active={filterStatus === "stopped"}
          icon={
            <div className="p-3 bg-red-50 dark:bg-red-900/30 rounded-lg">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
          }
          onClick={() => applyStatusFilter("stopped")}
        />
        <StatTile
          value={pausedCount}
          label="Paused"
          active={filterStatus === "paused"}
          icon={
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            </div>
          }
          onClick={() => applyStatusFilter("paused")}
        />
      </div>

      {/* Toolbar */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px] relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search containers…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-transparent"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => applyStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300"
          >
            <option value="all">All Status</option>
            <option value="running">Running</option>
            <option value="stopped">Stopped</option>
            <option value="paused">Paused</option>
            <option value="restarting">Restarting</option>
          </select>
          <IconButton label="Refresh" onClick={fetchContainers}>
            <RefreshCw className="w-4 h-4" />
          </IconButton>
          <ToggleChip
            label="Auto refresh"
            checked={autoRefresh}
            onChange={setAutoRefresh}
          />
          <ToggleChip
            label="Group by project"
            icon={<Layers className="w-3.5 h-3.5" />}
            checked={groupByProject}
            onChange={setGroupByProject}
          />
        </div>
      </Card>

      {/* Containers table */}
      <Card padded={false}>
        {filteredContainers.length === 0 ? (
          <EmptyState
            icon={<Package2 className="w-6 h-6" />}
            title={
              containers.length === 0
                ? "No containers yet"
                : "No containers match your filters"
            }
            description={
              containers.length === 0
                ? "Create your first container or deploy a project to get started."
                : "Try adjusting the search or status filter."
            }
            action={
              containers.length === 0 ? (
                <Button
                  variant="primary"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setShowCreateModal(true)}
                >
                  New Container
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {[
                    "Name",
                    "Image",
                    "Status",
                    "Ports",
                    "CPU",
                    "Memory",
                    "Uptime",
                    "Actions",
                  ].map((header) => (
                    <th
                      key={header}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {groupedContainers
                  ? Object.entries(groupedContainers).map(
                      ([projectName, group]) => (
                        <>
                          <tr
                            key={`group-${projectName}`}
                            className="bg-gray-100 dark:bg-gray-900/60"
                          >
                            <td colSpan={8} className="px-6 py-2">
                              <div className="flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                <Layers className="w-3.5 h-3.5" />
                                {projectName}
                                <span className="font-normal text-gray-400">
                                  ({group.length})
                                </span>
                              </div>
                            </td>
                          </tr>
                          {group.map(renderRow)}
                        </>
                      ),
                    )
                  : filteredContainers.map(renderRow)}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Logs modal */}
      <Modal
        open={showLogsModal && selectedContainer !== null}
        onClose={() => setShowLogsModal(false)}
        title={
          <span className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-gray-500" />
            {selectedContainer?.name} — Logs
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
        title="Create Container"
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Image
            </label>
            <select
              value={createForm.image}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, image: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="w-full mt-2 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="custom-image:tag"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Container Port
              </label>
              <input
                type="number"
                value={createForm.containerPort}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    containerPort: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="8080"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Host Port (optional)
              </label>
              <input
                type="number"
                value={createForm.hostPort}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    hostPort: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="3001"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Packages (optional)
            </label>
            <input
              type="text"
              value={createForm.packagesText}
              onChange={(e) =>
                setCreateForm((prev) => ({
                  ...prev,
                  packagesText: e.target.value,
                }))
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="nodejs npm curl"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Space or comma separated. Supports alpine/ubuntu/debian package
              managers.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Environment Variables (optional)
            </label>
            <textarea
              value={createForm.envText}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, envText: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[90px]"
              placeholder="KEY=value"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Command (optional)
            </label>
            <input
              type="text"
              value={createForm.command}
              onChange={(e) =>
                setCreateForm((prev) => ({ ...prev, command: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
