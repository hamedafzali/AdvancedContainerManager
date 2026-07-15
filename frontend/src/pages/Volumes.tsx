import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Trash2, HardDrive } from "lucide-react";
import { apiJson, apiFetch, apiPost } from "@/utils/api";
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
        size: volume.usage?.Size
          ? `${(volume.usage.Size / 1024 / 1024).toFixed(1)}MB`
          : "Unknown",
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

  useEffect(() => {
    fetchVolumes();
    const interval = setInterval(fetchVolumes, 15000);
    return () => clearInterval(interval);
  }, [fetchVolumes]);

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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Volumes"
        subtitle={`${volumes.length} volumes`}
        actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search volumes…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreateModal(true)}
            >
              Create Volume
            </Button>
          </div>
        }
      />

      <ErrorBanner
        message={error}
        onDismiss={() => setError(null)}
        onRetry={fetchVolumes}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredVolumes.map((volume) => (
          <div
            key={volume.id}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow duration-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center min-w-0">
                <div
                  className={`w-3 h-3 rounded-full mr-2 shrink-0 ${volume.status === "active" ? "bg-green-500" : "bg-gray-400"}`}
                ></div>
                <h3
                  className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate"
                  title={volume.name}
                >
                  {volume.name}
                </h3>
              </div>
              <IconButton
                label="Delete volume"
                tone="danger"
                onClick={() => setDeleteTarget(volume)}
              >
                <Trash2 className="w-4 h-4" />
              </IconButton>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Driver:</span>
                <span className="font-medium">{volume.driver}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Mount Point:</span>
                <span
                  className="font-medium text-xs truncate max-w-[150px]"
                  title={volume.mountPoint}
                >
                  {volume.mountPoint}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Size:</span>
                <span className="font-medium">{volume.size}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Containers:</span>
                <span className="font-medium">{volume.containers}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Created:</span>
                <span className="font-medium">{volume.created}</span>
              </div>
              {Object.keys(volume.labels).length > 0 && (
                <div className="flex items-start justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Labels:</span>
                  <div className="flex flex-wrap gap-1 max-w-[150px]">
                    {Object.entries(volume.labels)
                      .slice(0, 2)
                      .map(([key, value]) => (
                        <span
                          key={key}
                          className="text-xs bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded"
                          title={`${key}: ${value}`}
                        >
                          {key}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredVolumes.length === 0 && (
        <EmptyState
          icon={<HardDrive className="w-6 h-6" />}
          title={
            volumes.length === 0 ? "No volumes yet" : "No volumes match your search"
          }
          description={
            volumes.length === 0
              ? "Create a Docker volume to persist container data."
              : "Try a different search term."
          }
          action={
            volumes.length === 0 ? (
              <Button
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setShowCreateModal(true)}
              >
                Create Volume
              </Button>
            ) : undefined
          }
        />
      )}

      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Volume"
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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Volume Name
          </label>
          <input
            autoFocus
            type="text"
            value={newVolumeName}
            onChange={(e) => setNewVolumeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreateVolume();
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
