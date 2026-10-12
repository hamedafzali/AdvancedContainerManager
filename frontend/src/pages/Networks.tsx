import { useState, useCallback } from "react";
import { Search, Plus, Trash2, Wifi, Lock } from "lucide-react";
import { apiJson, apiPost } from "@/utils/api";
import {
  Button,
  IconButton,
  Modal,
  ConfirmDialog,
  ErrorBanner,
  EmptyState,
  LoadingState,
  PageHeader,
} from "@/components/ui";
import { usePolling } from "@/hooks/usePolling";

interface Network {
  id: string;
  name: string;
  driver: string;
  scope: string;
  subnet: string;
  gateway: string;
  containers: number;
  created: string;
  internal: boolean;
}

// Docker's own networks cannot be removed.
const BUILT_IN = new Set(["bridge", "host", "none"]);

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export default function Networks() {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDriver, setNewDriver] = useState("bridge");
  const [newInternal, setNewInternal] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Network | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchNetworks = useCallback(async () => {
    try {
      const result = await apiJson("/api/networks");
      setNetworks(
        (result.data || []).map((n: any) => ({
          id: n.id,
          name: n.name,
          driver: n.driver,
          scope: n.scope,
          subnet: n.IPAM?.Config?.[0]?.Subnet || "",
          gateway: n.IPAM?.Config?.[0]?.Gateway || "",
          containers: n.containers || 0,
          created: n.created ? new Date(n.created).toLocaleString() : "",
          internal: Boolean(n.internal),
        })),
      );
      setError(null);
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch networks");
    }
  }, []);

  usePolling(fetchNetworks, 10000);

  const term = searchTerm.toLowerCase();
  const filtered = networks.filter(
    (n) => n.name.toLowerCase().includes(term) || n.driver.toLowerCase().includes(term),
  );

  const openCreate = () => {
    setNewName("");
    setNewDriver("bridge");
    setNewInternal(false);
    setCreateError(null);
    setShowCreate(true);
  };

  const nameProblem =
    newName && !NAME_RE.test(newName)
      ? "Use letters, digits, dots, dashes and underscores, starting with a letter or digit."
      : newName && networks.some((n) => n.name === newName)
        ? "A network with this name already exists."
        : null;

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || nameProblem) return;
    setCreating(true);
    setCreateError(null);
    try {
      await apiPost("/api/networks", {
        name,
        options: { Driver: newDriver, Internal: newInternal },
      });
      setShowCreate(false);
      await fetchNetworks();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create network");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiJson(`/api/networks/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });
      await fetchNetworks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete network");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (!hasLoaded && !error) {
    return <LoadingState label="Fetching Docker networks…" />;
  }

  const row = (label: string, value: string | number) => (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-900 dark:text-gray-100 truncate">{value || "–"}</dd>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Networks"
        subtitle={`${networks.length} networks`}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search
                className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label="Search networks"
                placeholder="Search networks…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
              Create Network
            </Button>
          </div>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={fetchNetworks} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((network) => {
          const builtIn = BUILT_IN.has(network.name);
          return (
            <div
              key={network.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6"
            >
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${network.containers > 0 ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
                    aria-hidden="true"
                  />
                  <h3
                    className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate"
                    title={network.name}
                  >
                    {network.name}
                  </h3>
                  {builtIn && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      <Lock className="w-3 h-3" aria-hidden="true" />
                      built-in
                    </span>
                  )}
                  {network.internal && (
                    <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      internal
                    </span>
                  )}
                </div>
                {!builtIn && (
                  <IconButton
                    label={`Delete network ${network.name}`}
                    tone="danger"
                    onClick={() => setDeleteTarget(network)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </IconButton>
                )}
              </div>

              <dl className="space-y-3">
                {row("Driver", network.driver)}
                {row("Scope", network.scope)}
                {row("Subnet", network.subnet)}
                {row("Gateway", network.gateway)}
                {row(
                  "Containers",
                  network.containers === 0 ? "none attached" : `${network.containers} attached`,
                )}
                {row("Created", network.created)}
              </dl>
            </div>
          );
        })}
      </div>

      {hasLoaded && filtered.length === 0 && (
        <EmptyState
          icon={<Wifi className="w-6 h-6" />}
          title={networks.length === 0 ? "No networks yet" : "No networks match your search"}
          description={
            networks.length === 0
              ? "Create a network so containers can reach each other by name."
              : "Try a different search term."
          }
          action={
            networks.length === 0 ? (
              <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
                Create Network
              </Button>
            ) : undefined
          }
        />
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Network"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={creating}
              disabled={!newName.trim() || Boolean(nameProblem)}
              onClick={handleCreate}
            >
              Create
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
        >
          <ErrorBanner message={createError} onDismiss={() => setCreateError(null)} />
          <div>
            <label
              htmlFor="network-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Name
            </label>
            <input
              id="network-name"
              autoFocus
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              aria-invalid={Boolean(nameProblem)}
              aria-describedby={nameProblem ? "network-name-error" : undefined}
              placeholder="app-backend"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {nameProblem && (
              <p id="network-name-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {nameProblem}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="network-driver"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Driver
            </label>
            <select
              id="network-driver"
              value={newDriver}
              onChange={(e) => setNewDriver(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="bridge">bridge (single host)</option>
              <option value="overlay">overlay (Swarm, multi-host)</option>
              <option value="macvlan">macvlan</option>
            </select>
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={newInternal}
              onChange={(e) => setNewInternal(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Internal
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Containers on this network cannot reach the internet.
              </span>
            </span>
          </label>
          <button type="submit" hidden />
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete network"
        message={
          deleteTarget && deleteTarget.containers > 0 ? (
            <>
              <span className="font-mono font-semibold">{deleteTarget.name}</span> has{" "}
              {deleteTarget.containers} container(s) attached. Docker refuses to remove a
              network that is in use, so disconnect or stop them first.
            </>
          ) : (
            <>
              Delete <span className="font-mono font-semibold">{deleteTarget?.name}</span>? No
              containers are attached to it.
            </>
          )
        }
        confirmLabel="Delete network"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
