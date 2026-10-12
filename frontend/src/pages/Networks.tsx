import { useState, useCallback } from "react";
import { Plus, Trash2, Wifi, Lock, Network as NetworkIcon, RefreshCw } from "lucide-react";
import { apiJson, apiPost } from "@/utils/api";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CollectionView,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  ErrorBanner,
  IconButton,
  IconTile,
  ListItem,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  StatusBadge,
  Toolbar,
  ViewSwitcher,
  useViewMode,
  type DataTableColumn,
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

const VIEWS = ["grid", "list", "table"] as const;

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
  const [view, setView] = useViewMode("networks", "grid", VIEWS);

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

  const tone = (n: Network) => (n.containers > 0 ? "success" : "neutral");
  const badges = (n: Network) => (
    <>
      {BUILT_IN.has(n.name) && (
        <Badge icon={<Lock className="w-3 h-3" />} title="Docker's own network, cannot be removed">
          Built-in
        </Badge>
      )}
      {n.internal && <Badge tone="warning">Internal</Badge>}
    </>
  );
  const attached = (n: Network) =>
    n.containers > 0 ? (
      <StatusBadge tone="success" label={`${n.containers} attached`} />
    ) : (
      <StatusBadge tone="neutral" label="No containers" />
    );
  const deleteButton = (n: Network) =>
    BUILT_IN.has(n.name) ? null : (
      <IconButton label={`Delete network ${n.name}`} tone="danger" onClick={() => setDeleteTarget(n)}>
        <Trash2 className="w-4 h-4" />
      </IconButton>
    );

  const columns: DataTableColumn<Network>[] = [
    {
      key: "name",
      header: "Network",
      render: (n) => (
        <div className="flex items-center gap-3 min-w-0">
          <IconTile tone={tone(n)}>
            <NetworkIcon />
          </IconTile>
          <div className="min-w-0 max-w-[12rem] sm:max-w-[20rem]">
            <div className="font-medium text-gray-900 dark:text-gray-100 truncate" title={n.name}>
              {n.name}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {n.driver} · {n.scope}
            </div>
          </div>
        </div>
      ),
    },
    { key: "subnet", header: "Subnet", hideBelow: "md", render: (n) => <span className="font-mono text-xs">{n.subnet || "–"}</span> },
    { key: "gateway", header: "Gateway", hideBelow: "xl", render: (n) => <span className="font-mono text-xs">{n.gateway || "–"}</span> },
    { key: "attached", header: "Containers", nowrap: true, hideBelow: "sm", render: attached },
    { key: "flags", header: <span className="sr-only">Flags</span>, hideBelow: "lg", render: (n) => <span className="flex gap-1">{badges(n)}</span> },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", width: "1%", render: deleteButton },
  ];

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      <PageHeader
        title="Networks"
        subtitle={`${networks.length} networks, ${networks.filter((n) => n.containers > 0).length} in use`}
        actions={
          <>
            <IconButton label="Refresh" onClick={fetchNetworks}>
              <RefreshCw className="w-4 h-4" />
            </IconButton>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
              New network
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={fetchNetworks} />

      <Toolbar end={<ViewSwitcher value={view} onChange={setView} />}>
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search name or driver…" label="Search networks" />
      </Toolbar>

      {hasLoaded && filtered.length === 0 ? (
        <Card>
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
                  New network
                </Button>
              ) : (
                <Button onClick={() => setSearchTerm("")}>Clear search</Button>
              )
            }
          />
        </Card>
      ) : (
        <CollectionView
          view={view}
          rows={filtered}
          rowKey={(n) => n.id}
          caption="Networks"
          columns={columns}
          renderCard={(n) => (
            <Card>
              <CardHeader
                leading={
                  <IconTile tone={tone(n)}>
                    <NetworkIcon />
                  </IconTile>
                }
                title={<span title={n.name}>{n.name}</span>}
                subtitle={`${n.driver} · ${n.scope}`}
                badges={
                  <>
                    {attached(n)}
                    {badges(n)}
                  </>
                }
                actions={deleteButton(n)}
              />
              <CardBody className="mt-4">
                <DescriptionList
                  items={[
                    { label: "Subnet", value: n.subnet, mono: true },
                    { label: "Gateway", value: n.gateway, mono: true },
                    { label: "Created", value: n.created },
                  ]}
                />
              </CardBody>
            </Card>
          )}
          renderListItem={(n) => (
            <ListItem
              leading={
                <IconTile tone={tone(n)}>
                  <NetworkIcon />
                </IconTile>
              }
              title={n.name}
              subtitle={
                <span>
                  {n.driver} · <span className="font-mono">{n.subnet || "no subnet"}</span>
                </span>
              }
              meta={
                <span className="flex items-center gap-1.5">
                  {badges(n)}
                  {attached(n)}
                </span>
              }
              actions={deleteButton(n)}
            />
          )}
        />
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New network"
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
              className="field"
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
              className="field"
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
              className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
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
