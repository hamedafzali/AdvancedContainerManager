import { useState, useEffect } from "react";
import { Search, Plus, Trash2, Globe, Wifi, Shield } from "lucide-react";
import { apiUrl } from "@/utils/api";

interface Network {
  id: string;
  name: string;
  driver: string;
  scope: string;
  subnet: string;
  gateway: string;
  containers: number;
  created: string;
  status: "active" | "inactive";
  internal: boolean;
}

export default function Networks() {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchNetworks = async () => {
    try {
      setLoading(true);
      const response = await fetch(apiUrl("/api/networks"));
      if (!response.ok) {
        throw new Error("Failed to fetch networks");
      }
      const result = await response.json();
      const data = result.data;

      const transformedNetworks = data.map((network: any) => ({
        id: network.id,
        name: network.name,
        driver: network.driver,
        scope: network.scope,
        subnet: network.IPAM?.Config?.[0]?.Subnet || "N/A",
        gateway: network.IPAM?.Config?.[0]?.Gateway || "N/A",
        containers: network.containers,
        created: new Date(network.created).toLocaleString(),
        status: "active" as const,
        internal: network.internal || false,
      }));

      setNetworks(transformedNetworks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch networks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworks();
    const interval = setInterval(fetchNetworks, 10000);
    return () => clearInterval(interval);
  }, []);

  const filteredNetworks = networks.filter(
    (network) =>
      network.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      network.driver.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Loading Networks...
          </h2>
          <p className="text-gray-500">Fetching Docker networks</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Error Loading Networks
          </h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchNetworks}
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
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-light text-gray-900 tracking-tight">
            Networks
          </h1>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search networks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button className="flex items-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200">
              <Plus className="w-4 h-4 mr-2" />
              Create Network
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredNetworks.map((network) => (
            <div
              key={network.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div
                    className={`w-3 h-3 rounded-full mr-2 ${network.status === "active" ? "bg-green-500" : "bg-gray-400"}`}
                  ></div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {network.name}
                  </h3>
                </div>
                <div className="flex items-center space-x-2">
                  <button className="p-1 hover:bg-gray-100 rounded">
                    <Trash2 className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Driver:</span>
                  <span className="font-medium">{network.driver}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Scope:</span>
                  <span className="font-medium">{network.scope}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Subnet:</span>
                  <span className="font-medium">{network.subnet}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Gateway:</span>
                  <span className="font-medium">{network.gateway}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Containers:</span>
                  <span className="font-medium">{network.containers}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Created:</span>
                  <span className="font-medium">{network.created}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredNetworks.length === 0 && (
          <div className="text-center py-12">
            <Wifi className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No networks found
            </h3>
            <p className="text-gray-500">
              Get started by creating your first Docker network
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
