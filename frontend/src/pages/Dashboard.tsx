import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Server,
  CheckCircle,
  Package,
  Cpu,
  XCircle,
  Zap,
  AlertCircle,
  MemoryStick,
  HardDrive,
  GitBranch,
  Play,
  Square,
} from "lucide-react";
import PerformanceChart from "@/components/PerformanceChart";
import ContainerChart from "@/components/ContainerChart";
import ActivityFeed from "@/components/ActivityFeed";
import { DataExport } from "@/components/DataExport";
import {
  Card,
  PageHeader,
  ErrorBanner,
  LoadingState,
  StatTile,
} from "@/components/ui";
import { apiJson } from "@/utils/api";

interface SystemMetrics {
  cpuPercent: number;
  memoryPercent: number;
  diskUsage: number;
  networkIO: {
    bytesRecv: number;
    bytesSent: number;
  };
  loadAverage: number[];
  uptime: number;
}

interface ContainerStats {
  running: number;
  total: number;
  stopped: number;
  paused: number;
}

interface ProjectStats {
  total: number;
  healthy: number;
  building: number;
  failed: number;
}

interface PerfSample {
  time: string;
  cpu: number;
  memory: number;
  network: number;
}

interface ActivityItem {
  id: string;
  type:
    | "container_start"
    | "container_stop"
    | "container_error"
    | "info"
    | "warning";
  title: string;
  description: string;
  timestamp: Date;
  status: ActivityItem["type"];
}

const MAX_PERF_SAMPLES = 60;

function toPerfSample(metrics: any): PerfSample {
  const time = metrics.timestamp
    ? new Date(metrics.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
  return {
    time,
    cpu: Math.round((metrics.cpuPercent || 0) * 10) / 10,
    memory: Math.round((metrics.memoryPercent || 0) * 10) / 10,
    network:
      Math.round(
        (((metrics.networkIO?.bytesRecv || 0) +
          (metrics.networkIO?.bytesSent || 0)) /
          1024 /
          1024) *
          10,
      ) / 10,
  };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(
    null,
  );
  const [containerStats, setContainerStats] = useState<ContainerStats>({
    running: 0,
    total: 0,
    stopped: 0,
    paused: 0,
  });
  const [projectStats, setProjectStats] = useState<ProjectStats>({
    total: 0,
    healthy: 0,
    building: 0,
    failed: 0,
  });
  const [performanceData, setPerformanceData] = useState<PerfSample[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activityCounter = useRef(0);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [systemData, containersData, projectsData] = await Promise.all([
        apiJson("/api/system/metrics"),
        apiJson("/api/containers"),
        apiJson("/api/projects"),
      ]);

      setSystemMetrics(systemData.data);

      const containers = containersData.data || [];
      setContainerStats({
        running: containers.filter((c: any) => c.status === "running").length,
        total: containers.length,
        stopped: containers.filter((c: any) => c.status === "stopped").length,
        paused: containers.filter((c: any) => c.status === "paused").length,
      });

      const projects = projectsData.data || [];
      setProjectStats({
        total: projects.length,
        healthy: projects.filter((p: any) => p.health === "healthy").length,
        building: projects.filter((p: any) => p.health === "building").length,
        failed: projects.filter((p: any) => p.health === "failed").length,
      });
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch dashboard data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + slow polling fallback; live updates come over WebSocket.
  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [fetchDashboardData]);

  // Seed the performance chart with real history from the backend.
  useEffect(() => {
    apiJson("/api/system/metrics/history?limit=60")
      .then((result) => {
        const history = Array.isArray(result.data) ? result.data : [];
        setPerformanceData(history.slice(-MAX_PERF_SAMPLES).map(toPerfSample));
      })
      .catch(() => {});
  }, []);

  // Live metric samples pushed by the backend over WebSocket.
  useEffect(() => {
    const onMetrics = (event: Event) => {
      const metrics = (event as CustomEvent).detail;
      if (!metrics) return;
      setSystemMetrics(metrics);
      setPerformanceData((prev) =>
        [...prev, toPerfSample(metrics)].slice(-MAX_PERF_SAMPLES),
      );
    };
    window.addEventListener("system_metrics_update", onMetrics);
    return () =>
      window.removeEventListener("system_metrics_update", onMetrics);
  }, []);

  // Real activity feed from live container/docker events.
  useEffect(() => {
    const pushActivity = (item: Omit<ActivityItem, "id" | "timestamp">) => {
      setActivities((prev) =>
        [
          {
            ...item,
            id: `activity-${Date.now()}-${activityCounter.current++}`,
            timestamp: new Date(),
          },
          ...prev,
        ].slice(0, 20),
      );
    };

    const onContainerEvent = (event: Event) => {
      const data = (event as CustomEvent).detail;
      if (!data?.type) return;
      const name = data.name || data.containerId || "container";
      if (data.type === "started") {
        pushActivity({
          type: "container_start",
          status: "container_start",
          title: "Container started",
          description: name,
        });
      } else if (data.type === "stopped") {
        pushActivity({
          type: "container_stop",
          status: "container_stop",
          title: "Container stopped",
          description: name,
        });
      } else if (data.type === "error") {
        pushActivity({
          type: "container_error",
          status: "container_error",
          title: "Container error",
          description: name,
        });
      }
      fetchDashboardData();
    };

    const onDockerEvent = (event: Event) => {
      const data = (event as CustomEvent).detail;
      if (!data?.action) return;
      if (!["create", "destroy", "die", "start", "stop"].includes(data.action))
        return;
      pushActivity({
        type: data.action === "die" ? "warning" : "info",
        status: data.action === "die" ? "warning" : "info",
        title: `${data.type || "resource"} ${data.action}`,
        description: data.actor?.name || data.name || data.id || "",
      });
    };

    window.addEventListener("container_event", onContainerEvent);
    window.addEventListener("docker_event", onDockerEvent);
    return () => {
      window.removeEventListener("container_event", onContainerEvent);
      window.removeEventListener("docker_event", onDockerEvent);
    };
  }, [fetchDashboardData]);

  const formatUptime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m ${seconds % 60}s`;
  };

  const formatBytes = (bytes: number) => {
    const sizes = ["B", "KB", "MB", "GB"];
    if (bytes === 0) return "0 B";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  if (loading) {
    return <LoadingState label="Fetching system metrics and data…" />;
  }

  const containerChartData = [
    { name: "Running", value: containerStats.running, color: "#10b981" },
    { name: "Stopped", value: containerStats.stopped, color: "#ef4444" },
    { name: "Paused", value: containerStats.paused, color: "#f59e0b" },
  ];

  const metricTiles = [
    {
      label: "CPU",
      icon: Cpu,
      value: `${systemMetrics?.cpuPercent?.toFixed(1) || "0"}%`,
      percent: systemMetrics?.cpuPercent || 0,
    },
    {
      label: "Memory",
      icon: MemoryStick,
      value: `${systemMetrics?.memoryPercent?.toFixed(1) || "0"}%`,
      percent: systemMetrics?.memoryPercent || 0,
    },
    {
      label: "Disk",
      icon: HardDrive,
      value: `${systemMetrics?.diskUsage?.toFixed(1) || "0"}%`,
      percent: systemMetrics?.diskUsage || 0,
    },
    {
      label: "Network in",
      icon: Zap,
      value: systemMetrics ? formatBytes(systemMetrics.networkIO.bytesRecv) : "0",
      percent: null as number | null,
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Overview"
        subtitle="Live system, container and project health"
        actions={
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
            <span className="flex items-center gap-1.5">
              <Server className="w-4 h-4" />
              {systemMetrics ? formatUptime(systemMetrics.uptime) : "…"}
            </span>
            <span className="flex items-center gap-1.5 text-green-600">
              <CheckCircle className="w-4 h-4" />
              Operational
            </span>
            <DataExport
              data={{
                systemMetrics,
                containerStats,
                projectStats,
                performanceData,
              }}
              filename="dashboard-data"
            />
          </div>
        }
      />

      <ErrorBanner
        message={error}
        onDismiss={() => setError(null)}
        onRetry={fetchDashboardData}
      />

      {/* System metric tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metricTiles.map((tile) => (
          <Card key={tile.label}>
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <tile.icon className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                {tile.label}
              </span>
            </div>
            <div className="space-y-3">
              <div className="text-2xl font-light text-gray-900 dark:text-gray-100">
                {tile.value}
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1">
                {tile.percent !== null && (
                  <div
                    className="bg-gray-900 dark:bg-gray-200 rounded-full h-1 transition-all duration-500"
                    style={{ width: `${Math.min(100, tile.percent)}%` }}
                  ></div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Containers & Projects — every tile filters the target page */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card padded={false}>
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
            <Package className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            <h2 className="text-lg font-light text-gray-900 dark:text-gray-100">
              Containers
            </h2>
            <span className="text-sm text-gray-400">
              {containerStats.total} total
            </span>
          </div>
          <div className="p-4 grid grid-cols-3 gap-3">
            <StatTile
              value={containerStats.running}
              label="Running"
              icon={<Play className="w-4 h-4 text-green-500" />}
              onClick={() => navigate("/containers?status=running")}
            />
            <StatTile
              value={containerStats.stopped}
              label="Stopped"
              icon={<Square className="w-4 h-4 text-red-400" />}
              onClick={() => navigate("/containers?status=stopped")}
            />
            <StatTile
              value={containerStats.paused}
              label="Paused"
              icon={<AlertCircle className="w-4 h-4 text-yellow-500" />}
              onClick={() => navigate("/containers?status=paused")}
            />
          </div>
        </Card>

        <Card padded={false}>
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
            <GitBranch className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            <h2 className="text-lg font-light text-gray-900 dark:text-gray-100">
              Projects
            </h2>
            <span className="text-sm text-gray-400">
              {projectStats.total} total
            </span>
          </div>
          <div className="p-4 grid grid-cols-3 gap-3">
            <StatTile
              value={projectStats.healthy}
              label="Healthy"
              icon={<CheckCircle className="w-4 h-4 text-green-500" />}
              onClick={() => navigate("/projects")}
            />
            <StatTile
              value={projectStats.building}
              label="Building"
              icon={<AlertCircle className="w-4 h-4 text-yellow-500" />}
              onClick={() => navigate("/projects")}
            />
            <StatTile
              value={projectStats.failed}
              label="Failed"
              icon={<XCircle className="w-4 h-4 text-red-400" />}
              onClick={() => navigate("/projects")}
            />
          </div>
        </Card>
      </div>

      {/* Charts and live activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <PerformanceChart data={performanceData} />
          <ContainerChart data={containerChartData} />
        </div>
        <div>
          <ActivityFeed activities={activities} maxItems={10} />
        </div>
      </div>
    </div>
  );
}
