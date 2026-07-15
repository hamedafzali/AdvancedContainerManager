import React, { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Plus,
  Trash2,
  ExternalLink,
  Globe,
  CheckCircle,
  Cloud,
} from "lucide-react";
import { apiJson, apiPost, apiFetch } from "@/utils/api";
import {
  Button,
  IconButton,
  Card,
  ConfirmDialog,
  ErrorBanner,
  EmptyState,
  PageHeader,
} from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Tunnels tab                                                         */
/* ------------------------------------------------------------------ */

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

function TunnelsTab() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [status, setStatus] = useState<TunnelStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tunnel | null>(null);
  const [newTunnel, setNewTunnel] = useState({ name: "", port: "", domain: "" });

  const fetchTunnels = useCallback(async () => {
    try {
      const data = await apiJson("/api/tunnels");
      setTunnels(data.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tunnels");
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiJson("/api/tunnels/status");
      setStatus(data.data);
    } catch {
      /* status card simply stays empty */
    }
  }, []);

  useEffect(() => {
    fetchTunnels();
    fetchStatus();
    const interval = setInterval(fetchTunnels, 10000);
    return () => clearInterval(interval);
  }, [fetchTunnels, fetchStatus]);

  const createTunnel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTunnel.name || !newTunnel.port) {
      setError("Name and port are required");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await apiPost("/api/tunnels/create", {
        name: newTunnel.name,
        port: parseInt(newTunnel.port),
        domain: newTunnel.domain || undefined,
      });
      setTunnels((prev) => [
        ...prev,
        { ...data.data, status: "active", createdAt: new Date().toISOString() },
      ]);
      setNewTunnel({ name: "", port: "", domain: "" });
      setShowCreateForm(false);
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tunnel");
    } finally {
      setLoading(false);
    }
  };

  const deleteTunnel = async (name: string) => {
    try {
      const response = await apiFetch(`/api/tunnels/${name}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message);
      setTunnels((prev) => prev.filter((t) => t.name !== name));
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete tunnel");
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <Card>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Cloudflare Agent (cloudflared)
          </span>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              status?.cloudflaredInstalled
                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
            }`}
          >
            {status?.cloudflaredInstalled ? "Installed" : "Not Installed"}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          {status?.cloudflaredInstalled
            ? "You can create quick tunnels directly from this page."
            : "Install cloudflared on the server running Container Manager, then refresh this page."}
        </p>
        {!status?.cloudflaredInstalled && (
          <pre className="bg-gray-900 text-gray-100 rounded p-2 text-xs overflow-auto">
            brew install cloudflared
          </pre>
        )}
      </Card>

      {!showCreateForm && (
        <Button
          variant="primary"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => setShowCreateForm(true)}
        >
          Create Tunnel
        </Button>
      )}

      {showCreateForm && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Create New Tunnel
          </h2>
          <form onSubmit={createTunnel} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tunnel Name
              </label>
              <input
                type="text"
                value={newTunnel.name}
                onChange={(e) =>
                  setNewTunnel((prev) => ({ ...prev, name: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="my-container-tunnel"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Running App Port
              </label>
              <input
                type="number"
                value={newTunnel.port}
                onChange={(e) =>
                  setNewTunnel((prev) => ({ ...prev, port: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="3000"
                required
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Use the host port of your running container (example: 3001).
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Custom Domain (optional)
              </label>
              <input
                type="text"
                value={newTunnel.domain}
                onChange={(e) =>
                  setNewTunnel((prev) => ({ ...prev, domain: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="yourdomain.com"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Leave empty for a quick temporary URL (trycloudflare.com).
              </p>
            </div>
            <div className="flex gap-3">
              <Button type="submit" variant="primary" loading={loading}>
                Create Tunnel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowCreateForm(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card padded={false}>
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Active Tunnels
          </h2>
        </div>
        {tunnels.length === 0 ? (
          <EmptyState
            icon={<Globe className="w-6 h-6" />}
            title="No tunnels created yet"
            description="Create a tunnel to expose a container to the internet, or start one directly from a project card."
          />
        ) : (
          <div className="p-6 space-y-4">
            {tunnels.map((tunnel) => (
              <div
                key={tunnel.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">
                        {tunnel.name}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          tunnel.status === "active"
                            ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
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
                      <p className="text-blue-600 dark:text-blue-400 font-medium truncate">
                        https://{tunnel.url}
                      </p>
                      <p className="text-gray-600 dark:text-gray-300">
                        Local: localhost:{tunnel.port} · Mode:{" "}
                        {tunnel.mode || "quick"}
                        {tunnel.domain ? ` · Domain: ${tunnel.domain}` : ""}
                      </p>
                      <p className="text-gray-500 dark:text-gray-400 text-xs">
                        Created: {new Date(tunnel.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-1 shrink-0">
                    <IconButton
                      label="Open in new tab"
                      tone="success"
                      onClick={() =>
                        window.open(`https://${tunnel.url}`, "_blank")
                      }
                    >
                      <ExternalLink className="w-4 h-4" />
                    </IconButton>
                    <IconButton
                      label="Stop tunnel"
                      tone="danger"
                      onClick={() => setDeleteTarget(tunnel)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Stop tunnel"
        message={
          <>
            This will stop the tunnel{" "}
            <span className="font-mono font-semibold">
              {deleteTarget?.name}
            </span>{" "}
            — its public URL immediately stops working.
          </>
        }
        confirmLabel="Stop tunnel"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteTunnel(deleteTarget.name)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cloudflare DNS tab                                                  */
/* ------------------------------------------------------------------ */

interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  paused: boolean;
  type: string;
}

function CloudflareTab() {
  const [apiToken, setApiToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [zones, setZones] = useState<CloudflareZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [showAddDomain, setShowAddDomain] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const response = await apiFetch("/api/cloudflare/zones");
      if (response.ok) {
        setIsAuthenticated(true);
        const data = await response.json();
        setZones(data.data || []);
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const fetchZones = async () => {
    try {
      const data = await apiJson("/api/cloudflare/zones");
      setZones(data.data || []);
    } catch {
      setError("Failed to fetch zones");
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await apiPost("/api/cloudflare/auth", { apiToken, accountId });
      setIsAuthenticated(true);
      setSuccess("Cloudflare authentication successful!");
      setApiToken("");
      setAccountId("");
      await fetchZones();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to authenticate with Cloudflare",
      );
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await apiPost("/api/cloudflare/zones", {
        domain: newDomain,
      });
      setSuccess(data.message || "Domain added successfully!");
      setNewDomain("");
      setShowAddDomain(false);
      await fetchZones();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add domain to Cloudflare",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <ErrorBanner message={error || null} onDismiss={() => setError("")} />
      {success && (
        <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-green-800 dark:text-green-200 text-sm">{success}</p>
        </div>
      )}

      {!isAuthenticated ? (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Authenticate with Cloudflare
          </h2>
          <form onSubmit={handleAuth} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                API Token
              </label>
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Enter your Cloudflare API token"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Create an API token in the Cloudflare dashboard with Zone:Zone
                and Zone:DNS permissions
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Account ID (Optional)
              </label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="Enter your Cloudflare account ID"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Found in the Cloudflare dashboard under Workers &amp; Pages
              </p>
            </div>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              className="w-full"
            >
              Authenticate
            </Button>
          </form>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Your Cloudflare Zones
              </h2>
              <Button
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setShowAddDomain(!showAddDomain)}
              >
                {showAddDomain ? "Cancel" : "Add Domain"}
              </Button>
            </div>

            {showAddDomain && (
              <form
                onSubmit={handleCreateZone}
                className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
              >
                <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Add New Domain
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Domain Name
                    </label>
                    <input
                      type="text"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      placeholder="example.com"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={loading}
                    className="w-full"
                  >
                    Add Domain
                  </Button>
                </div>
              </form>
            )}

            {zones.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                No zones found. Add a domain to Cloudflare to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {zones.map((zone) => (
                  <div
                    key={zone.id}
                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-gray-100">
                          {zone.name}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Status: {zone.status}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          zone.paused
                            ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                            : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        }`}
                      >
                        {zone.paused ? "Paused" : "Active"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
            <h3 className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
              How to use custom domains
            </h3>
            <ol className="list-decimal list-inside space-y-2 text-blue-800 dark:text-blue-300 text-sm">
              <li>Add your domain to Cloudflare (if not already added)</li>
              <li>Authenticate here with your Cloudflare API token</li>
              <li>Create a tunnel with your custom domain in the Tunnels tab</li>
              <li>
                The tunnel will use your custom domain instead of
                trycloudflare.com
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Edge page — tunnels and DNS in one place                            */
/* ------------------------------------------------------------------ */

export default function Edge() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "cloudflare" ? "cloudflare" : "tunnels";

  const setTab = (next: "tunnels" | "cloudflare") => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Tunnels & DNS"
        subtitle="Expose containers to the internet through Cloudflare"
      />

      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("tunnels")}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-colors ${
            tab === "tunnels"
              ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <Globe className="w-4 h-4" />
          Tunnels
        </button>
        <button
          onClick={() => setTab("cloudflare")}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-md transition-colors ${
            tab === "cloudflare"
              ? "bg-white dark:bg-gray-700 shadow text-gray-900 dark:text-gray-100"
              : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <Cloud className="w-4 h-4" />
          Cloudflare DNS
        </button>
      </div>

      {tab === "tunnels" ? <TunnelsTab /> : <CloudflareTab />}
    </div>
  );
}
