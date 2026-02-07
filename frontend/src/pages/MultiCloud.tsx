import { useState, useEffect } from "react";
import {
  Cloud,
  Server,
  Activity,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Plus,
  Trash2,
  RefreshCw,
  Eye,
  Globe,
  Cpu,
  HardDrive,
  Wifi,
} from "lucide-react";
import { apiUrl } from "@/utils/api";

interface CloudProvider {
  id: string;
  name: string;
  type: "aws" | "gcp" | "azure";
  status: "connected" | "disconnected" | "error";
  region: string;
  credentials: {
    accessKey?: string;
    secretKey?: string;
    projectId?: string;
    subscriptionId?: string;
  };
  lastSync: string;
}

interface CloudInstance {
  id: string;
  name: string;
  provider: string;
  type: string;
  status: "running" | "stopped" | "pending" | "terminated";
  region: string;
  cpu: number;
  memory: number;
  storage: number;
  cost: number;
  created: string;
  tags: Record<string, string>;
}

interface CloudMetrics {
  provider: string;
  instances: number;
  runningInstances: number;
  totalCost: number;
  cpuUsage: number;
  memoryUsage: number;
  networkUsage: number;
  timestamp: string;
}

export default function MultiCloud() {
  const [providers, setProviders] = useState<CloudProvider[]>([]);
  const [instances, setInstances] = useState<CloudInstance[]>([]);
  const [metrics, setMetrics] = useState<CloudMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [showInstanceModal, setShowInstanceModal] = useState(false);
  const [selectedInstance, setSelectedInstance] =
    useState<CloudInstance | null>(null);

  const fetchMultiCloudData = async () => {
    try {
      setLoading(true);

      const [providersResponse, instancesResponse, metricsResponse] =
        await Promise.all([
          fetch(apiUrl("/api/multi-cloud/providers")),
          fetch(apiUrl("/api/multi-cloud/instances")),
          fetch(apiUrl("/api/multi-cloud/metrics")),
        ]);

      const [providersData, instancesData, metricsData] = await Promise.all([
        providersResponse.json(),
        instancesResponse.json(),
        metricsResponse.json(),
      ]);

      setProviders(providersData.data || []);
      setInstances(instancesData.data || []);
      setMetrics(metricsData.data || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch multi-cloud data",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMultiCloudData();
    const interval = setInterval(fetchMultiCloudData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const handleAddProvider = async (
    providerData: Omit<CloudProvider, "id" | "lastSync">,
  ) => {
    try {
      const response = await fetch(apiUrl("/api/multi-cloud/providers"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(providerData),
      });

      if (!response.ok) {
        throw new Error("Failed to add provider");
      }

      await fetchMultiCloudData();
      setShowAddProviderModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add provider");
    }
  };

  const handleRemoveProvider = async (providerId: string) => {
    if (!confirm("Are you sure you want to remove this provider?")) {
      return;
    }

    try {
      const response = await fetch(
        apiUrl(`/api/multi-cloud/providers/${providerId}`),
        {
        method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to remove provider");
      }

      await fetchMultiCloudData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove provider",
      );
    }
  };

  const handleDeployInstance = async (providerName: string, config: any) => {
    try {
      const response = await fetch(apiUrl("/api/multi-cloud/deploy"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerName, config }),
      });

      if (!response.ok) {
        throw new Error("Failed to deploy instance");
      }

      await fetchMultiCloudData();
      setShowInstanceModal(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to deploy instance",
      );
    }
  };

  const handleTerminateInstance = async (
    providerName: string,
    instanceId: string,
  ) => {
    if (!confirm("Are you sure you want to terminate this instance?")) {
      return;
    }

    try {
      const response = await fetch(
        apiUrl(`/api/multi-cloud/instances/${providerName}/${instanceId}`),
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to terminate instance");
      }

      await fetchMultiCloudData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to terminate instance",
      );
    }
  };

  const getProviderIcon = (type: string) => {
    switch (type) {
      case "aws":
        return <Cloud className="w-5 h-5 text-orange-600" />;
      case "gcp":
        return <Cloud className="w-5 h-5 text-blue-600" />;
      case "azure":
        return <Cloud className="w-5 h-5 text-purple-600" />;
      default:
        return <Cloud className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "connected":
      case "running":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "disconnected":
      case "stopped":
        return <XCircle className="w-4 h-4 text-red-600" />;
      case "error":
      case "terminated":
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case "pending":
        return <RefreshCw className="w-4 h-4 text-yellow-600 animate-spin" />;
      default:
        return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
      case "running":
        return "text-green-600 bg-green-50";
      case "disconnected":
      case "stopped":
        return "text-red-600 bg-red-50";
      case "error":
      case "terminated":
        return "text-red-600 bg-red-50";
      case "pending":
        return "text-yellow-600 bg-yellow-50";
      default:
        return "text-gray-600 bg-gray-50";
    }
  };

  const filteredInstances =
    selectedProvider === "all"
      ? instances
      : instances.filter((instance) => instance.provider === selectedProvider);

  const totalCost = instances.reduce((sum, instance) => sum + instance.cost, 0);
  const runningInstances = instances.filter(
    (instance) => instance.status === "running",
  ).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Loading Multi-Cloud Resources...
          </h2>
          <p className="text-gray-500">Fetching cloud provider information</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Error Loading Multi-Cloud Data
          </h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchMultiCloudData}
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
                  Multi-Cloud Management
                </h1>
                <p className="text-gray-500 text-sm tracking-wide">
                  Manage resources across AWS, GCP, and Azure
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowInstanceModal(true)}
                  className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Deploy Instance
                </button>
                <button
                  onClick={() => setShowAddProviderModal(true)}
                  className="flex items-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Provider
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {providers.length}
                </div>
                <div className="text-sm text-gray-500">Cloud Providers</div>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <Globe className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {runningInstances}
                </div>
                <div className="text-sm text-gray-500">Running Instances</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <Server className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  ${totalCost.toFixed(2)}
                </div>
                <div className="text-sm text-gray-500">Monthly Cost</div>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-light text-gray-900">
                  {instances.length}
                </div>
                <div className="text-sm text-gray-500">Total Instances</div>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <Activity className="w-5 h-5 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Cloud Providers */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-light text-gray-900">
              Cloud Providers
            </h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      {getProviderIcon(provider.type)}
                      <div>
                        <div className="font-medium text-gray-900">
                          {provider.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {provider.region}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(provider.status)}
                      <button
                        onClick={() => handleRemoveProvider(provider.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(provider.status)}`}
                    >
                      {provider.status}
                    </span>
                    <span className="text-gray-500">
                      Last sync: {new Date(provider.lastSync).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
              {providers.length === 0 && (
                <div className="col-span-3 text-center py-8 text-gray-500">
                  <Cloud className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>No cloud providers configured</p>
                  <button
                    onClick={() => setShowAddProviderModal(true)}
                    className="mt-4 text-blue-600 hover:text-blue-700"
                  >
                    Add your first provider
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Instance Filter */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">
              Filter by Provider:
            </label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-transparent"
            >
              <option value="all">All Providers</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.name}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Instances List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-light text-gray-900">
              Cloud Instances
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Provider
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resources
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredInstances.map((instance) => (
                  <tr key={instance.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {instance.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {instance.region}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getProviderIcon(instance.provider)}
                        <span className="ml-2 text-sm text-gray-900">
                          {instance.provider}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 font-mono">
                        {instance.type}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(instance.status)}`}
                      >
                        {getStatusIcon(instance.status)}
                        <span className="ml-1">{instance.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <div className="flex items-center">
                          <Cpu className="w-3 h-3 mr-1 text-gray-400" />
                          {instance.cpu} vCPU
                        </div>
                        <div className="flex items-center">
                          <HardDrive className="w-3 h-3 mr-1 text-gray-400" />
                          {instance.memory}GB RAM
                        </div>
                        <div className="flex items-center">
                          <Wifi className="w-3 h-3 mr-1 text-gray-400" />
                          {instance.storage}GB
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        ${instance.cost.toFixed(2)}/mo
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setSelectedInstance(instance)}
                          className="p-1.5 text-gray-600 hover:bg-gray-50 rounded"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            handleTerminateInstance(
                              instance.provider,
                              instance.id,
                            )
                          }
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
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
    </div>
  );
}
