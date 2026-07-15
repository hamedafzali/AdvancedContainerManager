import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  HardDrive,
  Package,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { apiFetch, apiPost, apiJson } from "@/utils/api";
import { useTasks } from "@/hooks/useTasks";
import {
  Button,
  IconButton,
  Card,
  Modal,
  ConfirmDialog,
  StatTile,
  ErrorBanner,
  EmptyState,
  LoadingState,
  PageHeader,
} from "@/components/ui";

interface DockerImage {
  id: string;
  name: string;
  tag: string;
  sizeBytes: number;
  created: string;
  status: "ready" | "downloading" | "error";
}

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function Images() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { startTask, appendTaskLog, finishTask } = useTasks();
  const [images, setImages] = useState<DockerImage[]>([]);
  const [pullingImages, setPullingImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(searchParams.get("search") || "");
  const [showPullModal, setShowPullModal] = useState(
    searchParams.get("pull") === "1",
  );
  const [pullImage, setPullImage] = useState({ name: "", tag: "latest" });
  const [deleteTarget, setDeleteTarget] = useState<DockerImage | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Clear one-shot URL param after applying it
  useEffect(() => {
    if (searchParams.get("pull") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("pull");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchImages = useCallback(async () => {
    try {
      const result = await apiJson("/api/images");
      const data = result.data || [];

      const transformed: DockerImage[] = data.map((image: any) => ({
        id: image.id,
        name: image.tags?.[0]?.split(":")[0] || "<none>",
        tag: image.tags?.[0]?.split(":")[1] || "latest",
        sizeBytes: image.size || 0,
        created: new Date(image.created * 1000).toLocaleString(),
        status: "ready" as const,
      }));

      setImages(transformed);
      setError(null);
      setHasLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch images");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchImages();
    const interval = setInterval(fetchImages, 15000);
    return () => clearInterval(interval);
  }, [fetchImages]);

  const handlePullImage = async () => {
    if (!pullImage.name) return;

    const name = pullImage.name.trim();
    const tag = pullImage.tag.trim() || "latest";
    const placeholderId = `pulling-${Date.now()}`;

    const placeholder: DockerImage = {
      id: placeholderId,
      name,
      tag,
      sizeBytes: 0,
      created: "Just now",
      status: "downloading",
    };

    // Close the modal immediately; the task tray owns the waiting state.
    setPullingImages((prev) => [placeholder, ...prev]);
    setPullImage({ name: "", tag: "latest" });
    setShowPullModal(false);

    const taskId = startTask(`Pull image ${name}:${tag}`, "docker pull");
    appendTaskLog(taskId, `Pulling ${name}:${tag}…\n`);

    try {
      await apiPost("/api/images/pull", { name, tag });
      appendTaskLog(taskId, "Pull completed.\n");
      finishTask(taskId, "success");
      await fetchImages();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to pull image";
      appendTaskLog(taskId, `${message}\n`);
      finishTask(taskId, "failed", message);
      setError(message);
    } finally {
      setPullingImages((prev) => prev.filter((img) => img.id !== placeholderId));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const response = await apiFetch(`/api/images/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete image");
      }
      setDeleteTarget(null);
      await fetchImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete image");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const allImages = [...pullingImages, ...images];
  const filteredImages = allImages.filter(
    (image) =>
      image.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      image.tag.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalSizeBytes = images.reduce((sum, img) => sum + img.sizeBytes, 0);

  if (loading && !hasLoaded) {
    return <LoadingState label="Fetching Docker images…" />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Images"
        subtitle="Manage Docker images and repositories"
        actions={
          <Button
            variant="primary"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowPullModal(true)}
          >
            Pull Image
          </Button>
        }
      />

      <ErrorBanner
        message={error}
        onDismiss={() => setError(null)}
        onRetry={fetchImages}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StatTile
          value={images.length}
          label="Total images"
          icon={
            <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <Package className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </div>
          }
        />
        <StatTile
          value={formatBytes(totalSizeBytes)}
          label="Total size on disk"
          icon={
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <HardDrive className="w-5 h-5 text-blue-600" />
            </div>
          }
        />
      </div>

      <Card>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search images…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-transparent"
          />
        </div>
      </Card>

      <Card padded={false}>
        {filteredImages.length === 0 ? (
          <EmptyState
            icon={<Package className="w-6 h-6" />}
            title={
              allImages.length === 0
                ? "No images yet"
                : "No images match your search"
            }
            description={
              allImages.length === 0
                ? "Pull an image from a registry to get started."
                : "Try a different search term."
            }
            action={
              allImages.length === 0 ? (
                <Button
                  variant="primary"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setShowPullModal(true)}
                >
                  Pull Image
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  {["Image", "Size", "Created", "Status", "Actions"].map(
                    (header) => (
                      <th
                        key={header}
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                      >
                        {header}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredImages.map((image) => (
                  <tr
                    key={image.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-150"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg mr-3">
                          <Package className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {image.name}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {image.tag}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {image.status === "downloading"
                          ? "Downloading…"
                          : formatBytes(image.sizeBytes)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center text-sm text-gray-900 dark:text-gray-100">
                        <Clock className="w-4 h-4 text-gray-400 mr-2" />
                        {image.created}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          image.status === "ready"
                            ? "text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400"
                            : image.status === "downloading"
                              ? "text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400"
                              : "text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        {image.status === "ready" ? (
                          <CheckCircle className="w-4 h-4" />
                        ) : image.status === "downloading" ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <AlertCircle className="w-4 h-4" />
                        )}
                        <span className="ml-1">{image.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <IconButton
                        label="Delete image"
                        tone="danger"
                        disabled={image.status === "downloading"}
                        onClick={() => setDeleteTarget(image)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete image"
        message={
          <>
            This will remove{" "}
            <span className="font-mono font-semibold">
              {deleteTarget?.name}:{deleteTarget?.tag}
            </span>{" "}
            from the local Docker host. Containers using it will keep running
            but the image can't be reused until pulled again.
          </>
        }
        confirmLabel="Delete"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />

      {/* Pull modal */}
      <Modal
        open={showPullModal}
        onClose={() => setShowPullModal(false)}
        title="Pull Image"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPullModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!pullImage.name.trim()}
              onClick={handlePullImage}
            >
              Pull Image
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            The pull runs in the background — watch its progress from the Tasks
            tray in the header.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Image Name
            </label>
            <input
              type="text"
              value={pullImage.name}
              onChange={(e) =>
                setPullImage({ ...pullImage, name: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-transparent"
              placeholder="nginx, redis, postgres…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tag
            </label>
            <input
              type="text"
              value={pullImage.tag}
              onChange={(e) =>
                setPullImage({ ...pullImage, tag: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 focus:border-transparent"
              placeholder="latest"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
