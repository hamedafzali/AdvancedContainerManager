import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  ExternalLink,
  Play,
  Square,
  Globe,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

interface Tunnel {
  id: string;
  name: string;
  url: string;
  port: number;
  domain?: string;
  status: "active" | "inactive";
  createdAt: string;
  mode?: "quick" | "hostname";
}

interface TunnelStatus {
  cloudflaredInstalled: boolean;
  activeTunnels: number;
}

export default function Tunnels() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTunnel, setNewTunnel] = useState({
    name: "",
    port: "",
    domain: "",
  });

  const fetchTunnels = async () => {
    try {
      const response = await fetch("/api/tunnels");
      const data = await response.json();
      if (data.success) {
        setTunnels(data.data);
        setError(null); // Clear any previous errors
      } else {
        setError(data.message);
      }
    } catch (error) {
      console.error("Failed to fetch tunnels:", error);
      // Only show error if it's a real network error, not empty state
      if (
        error instanceof TypeError &&
        error.message.includes("Failed to fetch")
      ) {
        setError("Network connection error");
      } else {
        setError(null); // Clear error for other cases
      }
    }
  };

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/tunnels/status");
      const data = await response.json();
      if (data.success) {
        setStatus(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch tunnel status:", error);
    }
  };

  useEffect(() => {
    fetchTunnels();
    fetchStatus();
    const interval = setInterval(fetchTunnels, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const createTunnel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTunnel.name || !newTunnel.port) {
      setError("Name and port are required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/tunnels/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTunnel.name,
          port: parseInt(newTunnel.port),
          domain: newTunnel.domain || undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setTunnels((prev) => [
          ...prev,
          {
            ...data.data,
            status: "active",
            createdAt: new Date().toISOString(),
          },
        ]);
        setNewTunnel({ name: "", port: "", domain: "" });
        setShowCreateForm(false);
        fetchStatus();
      } else {
        setError(data.message);
      }
    } catch (error) {
      console.error("Failed to create tunnel:", error);
      setError("Failed to create tunnel");
    } finally {
      setLoading(false);
    }
  };

  const deleteTunnel = async (name: string) => {
    try {
      const response = await fetch(`/api/tunnels/${name}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (data.success) {
        setTunnels((prev) => prev.filter((t) => t.name !== name));
        fetchStatus();
      } else {
        setError(data.message);
      }
    } catch (error) {
      console.error("Failed to delete tunnel:", error);
      setError("Failed to delete tunnel");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Cloudflare Tunnels
          </h1>
          <p className="text-gray-600 mb-6">
            Expose your containers to the internet securely through Cloudflare
            tunnels
          </p>

          <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Cloudflare Agent
              </span>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  status?.cloudflaredInstalled
                    ? "bg-green-100 text-green-700"
                    : "bg-yellow-100 text-yellow-700"
                }`}
              >
                {status?.cloudflaredInstalled ? "Installed" : "Not Installed"}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              {status?.cloudflaredInstalled
                ? "You can create quick tunnels directly from this menu."
                : "Install cloudflared on the server running Container Manager, then refresh this page."}
            </p>
            {!status?.cloudflaredInstalled && (
              <pre className="bg-gray-900 text-gray-100 rounded p-2 text-xs overflow-auto">
                brew install cloudflared
              </pre>
            )}
          </div>

          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Tunnel
          </button>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Create Tunnel Form */}
        {showCreateForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Create New Tunnel (Menu)
            </h2>
            <form onSubmit={createTunnel} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tunnel Name
                </label>
                <input
                  type="text"
                  value={newTunnel.name}
                  onChange={(e) =>
                    setNewTunnel((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="my-container-tunnel"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Running App Port
                </label>
                <input
                  type="number"
                  value={newTunnel.port}
                  onChange={(e) =>
                    setNewTunnel((prev) => ({ ...prev, port: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="3000"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use the host port of your running container (example: 3001).
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Domain (optional)
                </label>
                <input
                  type="text"
                  value={newTunnel.domain}
                  onChange={(e) =>
                    setNewTunnel((prev) => ({
                      ...prev,
                      domain: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="yourdomain.com"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave empty for quick temporary URL (`trycloudflare.com`).
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Create Tunnel
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Active Tunnels */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Active Tunnels
          </h2>
          {tunnels.length === 0 ? (
            <div className="text-center py-12">
              <Globe className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg mb-2">
                No tunnels created yet
              </p>
              <p className="text-gray-400">
                Create your first tunnel to expose a container to the internet
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {tunnels.map((tunnel) => (
                <div
                  key={tunnel.id}
                  className="border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-medium text-gray-900">
                          {tunnel.name}
                        </h3>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            tunnel.status === "active"
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {tunnel.status === "active" ? (
                            <>
                              <CheckCircle className="w-3 h-3 inline mr-1" />
                              Active
                            </>
                          ) : (
                            "Inactive"
                          )}
                        </span>
                      </div>
                      <div className="space-y-1 text-sm">
                        <p className="text-blue-600 font-medium">
                          https://{tunnel.url}
                        </p>
                        <p className="text-gray-600">
                          Local: localhost:{tunnel.port}
                        </p>
                        <p className="text-gray-600 text-xs">
                          Mode: {tunnel.mode || "quick"}
                        </p>
                        {tunnel.domain && (
                          <p className="text-gray-600">
                            Domain: {tunnel.domain}
                          </p>
                        )}
                        <p className="text-gray-500 text-xs">
                          Created: {new Date(tunnel.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() =>
                          window.open(`https://${tunnel.url}`, "_blank")
                        }
                        className="p-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                        title="Open in new tab"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteTunnel(tunnel.name)}
                        className="p-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                        title="Stop tunnel"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
