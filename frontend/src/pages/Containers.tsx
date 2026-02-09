import { useState, useEffect, useCallback, useRef } from "react";
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
  Settings,
  Download,
  Copy,
  X,
} from "lucide-react";
import { apiUrl } from "@/utils/api";

interface Container {
  id: string;
  name: string;
  image: string;
  status: "running" | "stopped" | "paused" | "restarting";
  ports: string[];
  cpu: number;
  memory: number;
  uptime: string;
  created: string;
}

export default function Containers() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(
    null,
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Debouncing ref to prevent excessive API calls
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch container logs
  const fetchLogs = async (containerId: string) => {
    try {
      setLogsLoading(true);
      setLogsError(null);
      const response = await fetch(
        apiUrl(`/api/containers/${containerId}/logs`),
      );
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || "Failed to fetch logs");
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }

      if (parsed && parsed.data) {
        setLogs(parsed.data);
      } else {
        setLogs(text.split("\n"));
      }
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : "Failed to fetch logs");
    } finally {
      setLogsLoading(false);
    }
  };

  // Handle view logs
  const handleViewLogs = (container: Container) => {
    setSelectedContainer(container);
    setShowLogsModal(true);
    fetchLogs(container.id);
  };

  // Copy logs to clipboard
  const copyLogs = () => {
    const logsText = logs.join("\n");
    navigator.clipboard.writeText(logsText);
  };

  // Download logs
  const downloadLogs = () => {
    const logsText = logs.join("\n");
    const blob = new Blob([logsText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedContainer?.name}-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const fetchContainers = async () => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }

    const shouldShowLoading = containers.length === 0;

    fetchTimeoutRef.current = setTimeout(async () => {
      try {
        if (shouldShowLoading) {
          setLoading(true);
        }
        const response = await fetch(apiUrl("/api/containers"));
        const text = await response.text();
        if (!response.ok) {
          throw new Error(text || "Failed to fetch containers");
        }

        let result: any = null;
        try {
          result = JSON.parse(text);
        } catch (parseError) {
          throw new Error(
            `Invalid JSON from /api/containers. First 200 chars: ${text.slice(0, 200)}`,
          );
        }
        const data = result.data;

        const transformedContainers = data.map(
          (container: any): Container => ({
            id: container.id,
            name: container.name,
            image: container.image,
            status: container.status.toLowerCase(),
            ports: Object.keys(container.ports || {}).map((key) => key),
            cpu: 0,
            memory: 0,
            uptime: container.startedAt
              ? new Date(container.startedAt).toLocaleString()
              : "Never started",
            created: new Date(container.created * 1000).toLocaleString(),
          }),
        );

        setContainers(transformedContainers);

        const runningContainers = transformedContainers
          .filter((c: Container) => c.status === "running")
          .slice(0, 5);

        type ContainerStats = { id: string; cpu: number; memory: number };
        const statsResults: PromiseSettledResult<ContainerStats>[] =
          await Promise.allSettled(
          runningContainers.map(async (container) => {
            const statsResponse = await fetch(
              apiUrl(`/api/containers/${container.id}/stats`),
            );
            if (!statsResponse.ok) {
              throw new Error(`Stats request failed for ${container.id}`);
            }
            const statsText = await statsResponse.text();
            const statsResult = JSON.parse(statsText);
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
        statsResults.forEach((result: PromiseSettledResult<ContainerStats>) => {
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
        if (shouldShowLoading) {
          setLoading(false);
        }
      }
    }, 200);
  };

  useEffect(() => {
    fetchContainers();

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Set up auto-refresh only if enabled
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchContainers, 15000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh]);

  const getStatusIcon = (status: Container["status"]) => {
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
  };

  const getStatusText = (status: Container["status"]) => {
    switch (status) {
      case "running":
        return "text-green-600 bg-green-50";
      case "stopped":
        return "text-red-600 bg-red-50";
      case "paused":
        return "text-yellow-600 bg-yellow-50";
      case "restarting":
        return "text-blue-600 bg-blue-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const handleContainerAction = useCallback(
    async (
      containerId: string,
      action: "start" | "stop" | "restart" | "delete",
    ) => {
      try {
        const container = containers.find(
          (c: Container) => c.id === containerId,
        );
        if (!container) return;

        switch (action) {
          case "start":
            const startResponse = await fetch(
              apiUrl(`/api/containers/${containerId}/start`),
              {
                method: "POST",
              },
            );
            if (!startResponse.ok) {
              throw new Error("Failed to start container");
            }
            break;
          case "stop":
            const stopResponse = await fetch(
              apiUrl(`/api/containers/${containerId}/stop`),
              {
                method: "POST",
              },
            );
            if (!stopResponse.ok) {
              throw new Error("Failed to stop container");
            }
            break;
          case "restart":
            const restartResponse = await fetch(
              apiUrl(`/api/containers/${containerId}/restart`),
              {
                method: "POST",
              },
            );
            if (!restartResponse.ok) {
              throw new Error("Failed to restart container");
            }
            break;
          case "delete":
            if (!confirm("Are you sure you want to delete this container?")) {
              return;
            }
            const deleteResponse = await fetch(
              apiUrl(`/api/containers/${containerId}`),
              {
                method: "DELETE",
              },
            );
            if (!deleteResponse.ok) {
              throw new Error("Failed to delete container");
            }
            break;
          default:
            throw new Error("Invalid action");
        }

        // Refresh containers after action
        await fetchContainers();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `Failed to ${containerId ? "perform action" : "perform action"}`,
        );
        setTimeout(() => setError(null), 3000);
      }
    },
    [containers, fetchContainers],
  );

  const filteredContainers = containers.filter((container: Container) => {
    const matchesSearch =
      container.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      container.image.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter =
      filterStatus === "all" || container.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const runningCount = containers.filter(
    (c: Container) => c.status === "running",
  ).length;
  const stoppedCount = containers.filter(
    (c: Container) => c.status === "stopped",
  ).length;
  const pausedCount = containers.filter(
    (c: Container) => c.status === "paused",
  ).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Loading Containers...
          </h2>
          <p className="text-gray-500">
            Fetching container information from Docker
          </p>
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
            Error Loading Containers
          </h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchContainers}
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
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-8">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-light text-gray-900 tracking-tight">
                  Containers
                </h1>
                <p className="text-gray-500 text-sm tracking-wide">
                  Manage and monitor Docker containers
                </p>
              </div>
              <button className="flex items-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white font-light rounded-lg transition-colors duration-200">
                <Plus className="w-4 h-4 mr-2" />
                New Container
              </button>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {runningCount}
                </div>
                <div className="text-sm text-gray-500">Running</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {stoppedCount}
                </div>
                <div className="text-sm text-gray-500">Stopped</div>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {pausedCount}
                </div>
                <div className="text-sm text-gray-500">Paused</div>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search containers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="running">Running</option>
              <option value="stopped">Stopped</option>
              <option value="paused">Paused</option>
              <option value="restarting">Restarting</option>
            </select>
            <button
              onClick={fetchContainers}
              disabled={loading}
              className="flex items-center px-4 py-2 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-400 text-white rounded-lg transition-colors duration-200"
              title="Refresh containers"
            >
              <RefreshCw
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="auto-refresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900 focus:ring-2"
              />
              <label
                htmlFor="auto-refresh"
                className="text-sm text-gray-700 cursor-pointer select-none"
              >
                Auto Refresh
              </label>
            </div>
          </div>
        </div>

        {/* Containers List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Image
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ports
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CPU
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Memory
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uptime
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredContainers.map((container) => (
                  <tr
                    key={container.id}
                    className="hover:bg-gray-50 transition-colors duration-150"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {container.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        ID: {container.id}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 font-mono">
                        {container.image}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusText(container.status)}`}
                      >
                        {getStatusIcon(container.status)}
                        <span className="ml-1">{container.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 font-mono">
                        {container.ports.join(", ")}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Activity className="w-4 h-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">
                          {container.cpu.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <HardDrive className="w-4 h-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">
                          {container.memory}MB
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 text-gray-400 mr-2" />
                        <span className="text-sm text-gray-900">
                          {container.uptime}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleViewLogs(container)}
                          className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition-colors duration-200"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (container.status === "running") {
                              handleContainerAction(container.id, "stop");
                            } else {
                              handleContainerAction(container.id, "start");
                            }
                          }}
                          className={`p-1.5 rounded transition-colors duration-200 ${
                            container.status === "running"
                              ? "text-red-600 hover:bg-red-50"
                              : "text-green-600 hover:bg-green-50"
                          }`}
                        >
                          {container.status === "running" ? (
                            <Square className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() =>
                            handleContainerAction(container.id, "restart")
                          }
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors duration-200"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition-colors duration-200">
                          <Terminal className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition-colors duration-200">
                          <Settings className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            handleContainerAction(container.id, "delete")
                          }
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors duration-200"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Logs Modal */}
      {showLogsModal && selectedContainer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-4xl w-full max-h-[80vh] m-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <Terminal className="w-5 h-5 text-gray-600" />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedContainer.name} - Logs
                  </h3>
                  <p className="text-sm text-gray-500">
                    {selectedContainer.image}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={copyLogs}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                  title="Copy logs"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={downloadLogs}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                  title="Download logs"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowLogsModal(false)}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div
              className="p-6 overflow-auto"
              style={{ maxHeight: "calc(80vh - 120px)" }}
            >
              {logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-3"></div>
                  <span className="text-gray-600">Loading logs...</span>
                </div>
              ) : logsError ? (
                <div className="flex items-center justify-center py-12 text-red-600">
                  <Terminal className="w-8 h-8 mr-3" />
                  <span>{logsError}</span>
                </div>
              ) : logs.length > 0 ? (
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-300">
                  {logs.map((log, index) => (
                    <div key={index} className="mb-1">
                      <span className="text-gray-500 mr-2">
                        {new Date().toLocaleTimeString()}
                      </span>
                      <span className="whitespace-pre-wrap">{log}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-12 text-gray-500">
                  <Terminal className="w-8 h-8 mr-3" />
                  <span>No logs available</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
