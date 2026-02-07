import { useState, useEffect } from "react";
import {
  Server,
  CheckCircle,
  Package,
  Cpu,
  RefreshCw,
  XCircle,
  Zap,
  AlertCircle,
  MemoryStick,
  HardDrive,
  GitBranch,
} from "lucide-react";
import PerformanceChart from "@/components/PerformanceChart";
import ContainerChart from "@/components/ContainerChart";
import ActivityFeed from "@/components/ActivityFeed";
import { AISuggestions } from "@/components/AISuggestions";
import { DataExport } from "@/components/DataExport";
import { apiUrl } from "@/utils/api";

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

export default function Dashboard() {
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

  // Chart data
  const [performanceData] = useState([
    { time: "00:00", cpu: 20, memory: 40, network: 15 },
    { time: "00:05", cpu: 25, memory: 45, network: 20 },
    { time: "00:10", cpu: 30, memory: 50, network: 18 },
    { time: "00:15", cpu: 22, memory: 42, network: 25 },
    { time: "00:20", cpu: 28, memory: 48, network: 22 },
  ]);

  const [containerChartData] = useState([
    { name: "Running", value: 0, color: "#10b981" },
    { name: "Stopped", value: 0, color: "#ef4444" },
    { name: "Paused", value: 0, color: "#f59e0b" },
  ]);

  // Advanced features
  const [realTimeMode, setRealTimeMode] = useState(true);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [anomalies] = useState<string[]>([]);
  const [activities] = useState([
    {
      id: "1",
      type: "container_start" as const,
      title: "Container Started",
      description: "Web server container started successfully",
      timestamp: new Date(Date.now() - 5 * 60000),
      status: "success" as const,
    },
    {
      id: "2",
      type: "build_complete" as const,
      title: "Build Completed",
      description: "Application build process completed successfully",
      timestamp: new Date(Date.now() - 15 * 60000),
      status: "success" as const,
    },
    {
      id: "3",
      type: "container_stop" as const,
      title: "Container Stopped",
      description: "Database container stopped by user",
      timestamp: new Date(Date.now() - 30 * 60000),
      status: "error" as const,
    },
  ]);
  const [performanceMode, setPerformanceMode] = useState(true);

  // Advanced dashboard features
  const toggleRealTimeMode = () => {
    setRealTimeMode(!realTimeMode);
  };

  const togglePerformanceMode = async () => {
    const newMode = !performanceMode;
    setPerformanceMode(newMode);
    // Call backend API to toggle performance mode
    try {
      await fetch(apiUrl("/api/system/performance-mode"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newMode }),
      });
    } catch (error) {
      console.error("Failed to toggle performance mode:", error);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const setPerformanceBaseline = async () => {
    try {
      await fetch(apiUrl("/api/system/performance-baseline"), {
        method: "POST",
      });
      // Show success notification
      setAlerts(["Performance baseline established successfully"]);
      setTimeout(() => setAlerts([]), 3000);
    } catch (error) {
      console.error("Failed to set performance baseline:", error);
    }
  };

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch real data from backend
  const fetchDashboardData = async () => {
    try {
      const systemResponse = await fetch(apiUrl("/api/system/metrics"));
      const containersResponse = await fetch(apiUrl("/api/containers"));
      const projectsResponse = await fetch(apiUrl("/api/projects"));

      if (
        !systemResponse.ok ||
        !containersResponse.ok ||
        !projectsResponse.ok
      ) {
        throw new Error("Failed to fetch dashboard data");
      }

      const systemData = await systemResponse.json();
      const containersData = await containersResponse.json();
      const projectsData = await projectsResponse.json();

      setSystemMetrics(systemData.data);

      // Calculate container stats
      const containerStats = {
        running: containersData.data.filter((c: any) => c.status === "running")
          .length,
        total: containersData.data.length,
        stopped: containersData.data.filter((c: any) => c.status === "stopped")
          .length,
        paused: containersData.data.filter((c: any) => c.status === "paused")
          .length,
      };
      setContainerStats(containerStats);

      // Calculate project stats
      const projectStats = {
        total: projectsData.data.length,
        healthy: projectsData.data.filter((p: any) => p.health === "healthy")
          .length,
        building: projectsData.data.filter((p: any) => p.health === "building")
          .length,
        failed: projectsData.data.filter((p: any) => p.health === "failed")
          .length,
      };
      setProjectStats(projectStats);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch dashboard data",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Set up real-time updates
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, []);

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
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Loading Dashboard...
          </h2>
          <p className="text-gray-500">Fetching system metrics and data</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Error Loading Dashboard
          </h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Advanced Controls */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-8">
            <h2 className="text-xl font-light text-gray-900 mb-6">
              Advanced Controls
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Real-time Mode Toggle */}
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">
                      Real-time Mode
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Live data updates
                    </p>
                  </div>
                  <button
                    onClick={toggleRealTimeMode}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      realTimeMode ? "bg-blue-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        realTimeMode ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Performance Mode Toggle */}
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">
                      Performance Mode
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Optimized caching
                    </p>
                  </div>
                  <button
                    onClick={togglePerformanceMode}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      performanceMode ? "bg-green-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        performanceMode ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Performance Baseline */}
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">
                      Export Data
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Download dashboard metrics
                    </p>
                  </div>
                  <DataExport
                    data={{
                      systemMetrics,
                      containerStats,
                      projectStats,
                      performanceData,
                      containerChartData,
                      activities,
                    }}
                    filename="dashboard-data"
                  />
                </div>
              </div>
            </div>

            {/* Alerts Section */}
            {alerts.length > 0 && (
              <div className="mt-6 space-y-2">
                {alerts.map((alert, index) => (
                  <div
                    key={index}
                    className="bg-yellow-50 border border-yellow-200 rounded-lg p-4"
                  >
                    <div className="flex items-center">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mr-3" />
                      <span className="text-sm text-yellow-800">{alert}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Anomalies Section */}
            {anomalies.length > 0 && (
              <div className="mt-6 space-y-2">
                {anomalies.map((anomaly, index) => (
                  <div
                    key={index}
                    className="bg-red-50 border border-red-200 rounded-lg p-4"
                  >
                    <div className="flex items-center">
                      <XCircle className="w-5 h-5 text-red-600 mr-3" />
                      <span className="text-sm text-red-800">{anomaly}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Minimal Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-8">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-light text-gray-900 tracking-tight">
                  Container Manager
                </h1>
                <p className="text-gray-500 text-sm tracking-wide">
                  Professional Docker orchestration platform
                </p>
              </div>
              <div className="flex items-center space-x-8 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <Server className="w-4 h-4" />
                  <span>
                    Uptime:{" "}
                    {systemMetrics
                      ? formatUptime(systemMetrics.uptime)
                      : "Loading..."}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">Operational</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Minimal Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Cpu className="w-5 h-5 text-gray-700" />
              </div>
              <span className="text-xs text-gray-500 font-medium">CPU</span>
            </div>
            <div className="space-y-3">
              <div className="text-2xl font-light text-gray-900">
                {systemMetrics?.cpuPercent?.toFixed(1) || "0"}%
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1">
                <div
                  className="bg-gray-900 rounded-full h-1 transition-all duration-500"
                  style={{ width: `${systemMetrics?.cpuPercent || 0}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-gray-100 rounded-lg">
                <MemoryStick className="w-5 h-5 text-gray-700" />
              </div>
              <span className="text-xs text-gray-500 font-medium">Memory</span>
            </div>
            <div className="space-y-3">
              <div className="text-2xl font-light text-gray-900">
                {systemMetrics?.memoryPercent?.toFixed(1) || "0"}%
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1">
                <div
                  className="bg-gray-900 rounded-full h-1 transition-all duration-500"
                  style={{ width: `${systemMetrics?.memoryPercent || 0}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-gray-100 rounded-lg">
                <HardDrive className="w-5 h-5 text-gray-700" />
              </div>
              <span className="text-xs text-gray-500 font-medium">Disk</span>
            </div>
            <div className="space-y-3">
              <div className="text-2xl font-light text-gray-900">
                {systemMetrics?.diskUsage?.toFixed(1) || "0"}%
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1">
                <div
                  className="bg-gray-900 rounded-full h-1 transition-all duration-500"
                  style={{ width: `${systemMetrics?.diskUsage || 0}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Zap className="w-5 h-5 text-gray-700" />
              </div>
              <span className="text-xs text-gray-500 font-medium">Network</span>
            </div>
            <div className="space-y-3">
              <div className="text-2xl font-light text-gray-900">
                {systemMetrics
                  ? formatBytes(systemMetrics.networkIO.bytesRecv)
                  : "0"}
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1">
                <div className="bg-gray-900 rounded-full h-1 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Clean Container and Project Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Container Status */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Package className="w-5 h-5 text-gray-700" />
                  <h2 className="text-lg font-light text-gray-900">
                    Containers
                  </h2>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date().toLocaleTimeString()}
                </span>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4">
                  <div className="text-3xl font-light text-gray-900">
                    {containerStats.running}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Running</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-3xl font-light text-gray-900">
                    {containerStats.stopped}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Stopped</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-3xl font-light text-gray-900">
                    {containerStats.paused}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Paused</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-3xl font-light text-gray-900">
                    {containerStats.total}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Total</div>
                </div>
              </div>
            </div>
          </div>

          {/* Project Status */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <GitBranch className="w-5 h-5 text-gray-700" />
                  <h2 className="text-lg font-light text-gray-900">Projects</h2>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date().toLocaleTimeString()}
                </span>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4">
                  <div className="text-3xl font-light text-gray-900">
                    {projectStats.healthy}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Healthy</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-3xl font-light text-gray-900">
                    {projectStats.building}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Building</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-3xl font-light text-gray-900">
                    {projectStats.failed}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Failed</div>
                </div>
                <div className="text-center p-4">
                  <div className="text-3xl font-light text-gray-900">
                    {projectStats.total}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">Total</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Charts and Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <PerformanceChart data={performanceData} />
            <ContainerChart data={containerChartData} />
          </div>
          <div className="space-y-8">
            <AISuggestions
              context={{
                currentPage: "dashboard",
                systemState: {
                  cpuUsage: systemMetrics?.cpuPercent,
                  memoryUsage: systemMetrics?.memoryPercent,
                  diskUsage: systemMetrics?.diskUsage,
                  containers: containerStats,
                  networkTraffic:
                    (systemMetrics?.networkIO?.bytesRecv || 0) +
                    (systemMetrics?.networkIO?.bytesSent || 0),
                },
              }}
            />
            <ActivityFeed activities={activities} />
          </div>
        </div>
      </div>
    </div>
  );
}
