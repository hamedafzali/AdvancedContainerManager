import { useState, useCallback } from "react";
import { Plus, Trash2, HardDrive, RefreshCw } from "lucide-react";
import { apiJson, apiFetch, apiPost } from "@/utils/api";
import {
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

const VIEWS = ["grid", "list", "table"] as const;

function formatBytes(bytes?: number) {
  if (!bytes || bytes < 0) return "–";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i >= 3 ? 2 : 1)} ${units[i]}`;
}

interface Volume {
  id: string;
  name: string;
  driver: string;
  mountPoint: string;
  created: string;
  size: string;
  containers: number;
  labels: Record<string, string>;
  status: "active" | "inactive";
}

export default function Volumes() {
  const [volumes, setVolumes] = useState<Volume[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newVolumeName, setNewVolumeName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Volume | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useViewMode("volumes", "grid", VIEWS);

  const fetchVolumes = useCallback(async () => {
    try {
      const result = await apiJson("/api/volumes");
      const data = result.data || [];

      const transformedVolumes = data.map((volume: any) => ({
        id: volume.name,
        name: volume.name,
        driver: volume.driver,
        mountPoint: volume.mountpoint,
        created: new Date(volume.created).toLocaleString(),
        size: formatBytes(volume.usage?.Size),
        containers: volume.usage?.RefCount || 0,
        labels: volume.labels || {},
        status: "active" as const,
      }));

      setVolumes(transformedVolumes);
      setError(null);
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch volumes");
    } finally {
      setLoading(false);
    }
  }, []);

  usePolling(fetchVolumes, 15000);

  const filteredVolumes = volumes.filter(
    (volume) =>
      volume.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      volume.driver.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleCreateVolume = async () => {
    const name = newVolumeName.trim();
    if (!name) return;
    try {
      setCreating(true);
      await apiPost("/api/volumes", { name });
      setShowCreateModal(false);
      setNewVolumeName("");
      await fetchVolumes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create volume");
      setShowCreateModal(false);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const response = await apiFetch(`/api/volumes/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete volume");
      }
      await fetchVolumes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete volume");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading && !hasLoaded) {
    return <LoadingState label="Fetching Docker volumes…" />;
  }

  const inUse = volumes.filter((v) => v.containers > 0).length;
  const project = (v: Volume) => v.labels["com.docker.compose.project"];
  const tone = (v: Volume) => (v.containers > 0 ? "success" : "neutral");
  const usage = (v: Volume) =>
    v.containers > 0 ? (
      <StatusBadge tone="success" label={`${v.containers} in use`} />
    ) : (
      <StatusBadge tone="neutral" label="Unused" />
    );
  const deleteButton = (v: Volume) => (
    <IconButton label={`Delete ${v.name}`} tone="danger" onClick={() => setDeleteTarget(v)}>
      <Trash2 className="w-4 h-4" />
    </IconButton>
  );

  const columns: DataTableColumn<Volume>[] = [
    {
      key: "name",
      header: "Volume",
      render: (v) => (
        <div className="flex items-center gap-3 min-w-0">
          <IconTile tone={tone(v)}>
            <HardDrive />
          </IconTile>
          <div className="min-w-0 max-w-[12rem] sm:max-w-[22rem]">
            <div className="font-medium text-gray-900 dark:text-gray-100 truncate" title={v.name}>
              {v.name}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{project(v) ?? v.driver}</div>
          </div>
        </div>
      ),
    },
    { key: "usage", header: "Usage", nowrap: true, hideBelow: "sm", render: usage },
    { key: "size", header: "Size", align: "right", nowrap: true, hideBelow: "md", render: (v) => <span className="tabular">{v.size}</span> },
    {
      key: "mount",
      header: "Mount point",
      hideBelow: "xl",
      render: (v) => (
        <span className="font-mono text-xs text-gray-600 dark:text-gray-300 truncate block max-w-[16rem]" title={v.mountPoint}>
          {v.mountPoint}
        </span>
      ),
    },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", width: "1%", render: deleteButton },
  ];

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      <PageHeader
        title="Volumes"
        subtitle={`${volumes.length} volumes, ${inUse} in use`}
        actions={
          <>
            <IconButton label="Refresh" onClick={fetchVolumes}>
              <RefreshCw className="w-4 h-4" />
            </IconButton>
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
              New volume
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={fetchVolumes} />

      <Toolbar end={<ViewSwitcher value={view} onChange={setView} />}>
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search name or driver…" label="Search volumes" />
      </Toolbar>

      {filteredVolumes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HardDrive className="w-6 h-6" />}
            title={volumes.length === 0 ? "No volumes yet" : "No volumes match your search"}
            description={
              volumes.length === 0 ? "Create a Docker volume to persist container data." : "Try a different search term."
            }
            action={
              volumes.length === 0 ? (
                <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreateModal(true)}>
                  New volume
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
          rows={filteredVolumes}
          rowKey={(v) => v.id}
          caption="Volumes"
          columns={columns}
          renderCard={(v) => (
            <Card>
              <CardHeader
                leading={
                  <IconTile tone={tone(v)}>
                    <HardDrive />
                  </IconTile>
                }
                title={<span title={v.name}>{v.name}</span>}
                subtitle={project(v) ? `Project ${project(v)}` : undefined}
                badges={usage(v)}
                actions={deleteButton(v)}
              />
              <CardBody className="mt-4">
                <DescriptionList
                  items={[
                    { label: "Driver", value: v.driver },
                    { label: "Size", value: v.size },
                    { label: "Mount point", value: v.mountPoint, mono: true },
                    { label: "Created", value: v.created },
                  ]}
                />
              </CardBody>
            </Card>
          )}
          renderListItem={(v) => (
            <ListItem
              leading={
                <IconTile tone={tone(v)}>
                  <HardDrive />
                </IconTile>
              }
              title={v.name}
              subtitle={project(v) ? `${project(v)} · ${v.driver}` : v.driver}
              meta={
                <span className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="tabular">{v.size}</span>
                  {usage(v)}
                </span>
              }
              actions={deleteButton(v)}
            />
          )}
        />
      )}

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="New volume"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={creating}
              disabled={!newVolumeName.trim()}
              onClick={handleCreateVolume}
            >
              Create
            </Button>
          </>
        }
      >
        <div>
          <label htmlFor="volumes-field-1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Volume name
          </label>
          <input id="volumes-field-1"
            autoFocus
            type="text"
            value={newVolumeName}
            onChange={(e) => setNewVolumeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateVolume();
            }}
            className="field"
            placeholder="my-data-volume"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete volume"
        message={
          <>
            This permanently deletes{" "}
            <span className="font-mono font-semibold">{deleteTarget?.name}</span>{" "}
            and <strong>all data stored in it</strong>. This cannot be undone.
            {deleteTarget && deleteTarget.containers > 0 && (
              <>
                {" "}
                It is currently referenced by {deleteTarget.containers}{" "}
                container(s).
              </>
            )}
          </>
        }
        confirmLabel="Delete volume"
        requireText={deleteTarget?.name}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
