import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2, RefreshCw, Clock, HardDrive, Package, Download, Tag, Layers, Hash } from "lucide-react";
import { apiFetch, apiPost, apiJson } from "@/utils/api";
import { useTasks } from "@/hooks/useTasks";
import {
  Badge,
  Button,
  IconButton,
  Card,
  CardBody,
  CardHeader,
  CollectionView,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  ErrorBanner,
  IconTile,
  ListItem,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  StatTile,
  StatusBadge,
  Toolbar,
  ViewSwitcher,
  useViewMode,
  type DataTableColumn,
} from "@/components/ui";
import { usePolling } from "@/hooks/usePolling";

interface DockerImage {
  id: string;
  name: string;
  tag: string;
  sizeBytes: number;
  created: string;
  status: "ready" | "downloading" | "error";
}

const VIEWS = ["grid", "list", "table"] as const;

function splitTag(ref?: string) {
  if (!ref || ref === "<none>:<none>") return { name: "<none>", tag: "<none>" };
  const at = ref.lastIndexOf(":");
  return at > ref.lastIndexOf("/") ? { name: ref.slice(0, at), tag: ref.slice(at + 1) } : { name: ref, tag: "latest" };
}

function formatBytes(bytes: number) {
  if (!bytes) return "–";
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
  const [view, setView] = useViewMode("images", "table", VIEWS);

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
        // Split on the last colon so registry ports (host:5000/app:tag) survive.
        ...splitTag(image.tags?.[0]),
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

  usePolling(fetchImages, 15000);

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
  const query = searchTerm.toLowerCase();
  const filteredImages = allImages.filter(
    (image) => image.name.toLowerCase().includes(query) || image.tag.toLowerCase().includes(query),
  );

  const totalSizeBytes = images.reduce((sum, img) => sum + img.sizeBytes, 0);
  const untagged = images.filter((img) => img.name === "<none>").length;
  const largest = images.reduce<DockerImage | null>(
    (max, img) => (!max || img.sizeBytes > max.sizeBytes ? img : max),
    null,
  );

  if (loading && !hasLoaded) {
    return <LoadingState label="Fetching Docker images…" />;
  }

  const shortId = (id: string) => id.replace(/^sha256:/, "").slice(0, 12);
  const sizeLabel = (image: DockerImage) =>
    image.status === "downloading" ? "Downloading…" : formatBytes(image.sizeBytes);
  const statusBadge = (image: DockerImage) =>
    image.status === "downloading" ? (
      <StatusBadge tone="info" label="Pulling" busy />
    ) : image.status === "error" ? (
      <StatusBadge tone="danger" label="Error" />
    ) : null;
  const deleteButton = (image: DockerImage) => (
    <IconButton
      label={`Delete ${image.name}:${image.tag}`}
      tone="danger"
      disabled={image.status === "downloading"}
      onClick={() => setDeleteTarget(image)}
    >
      <Trash2 className="w-4 h-4" />
    </IconButton>
  );

  const columns: DataTableColumn<DockerImage>[] = [
    {
      key: "name",
      header: "Repository",
      render: (image) => (
        <div className="flex items-center gap-3 min-w-0">
          <IconTile tone="accent">
            <Package />
          </IconTile>
          <div className="min-w-0 max-w-[10rem] sm:max-w-[22rem]">
            <div className="font-medium text-gray-900 dark:text-gray-100 truncate" title={image.name}>
              {image.name}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">{shortId(image.id)}</div>
          </div>
        </div>
      ),
    },
    { key: "tag", header: "Tag", hideBelow: "sm", render: (image) => <Badge mono>{image.tag}</Badge> },
    { key: "size", header: "Size", align: "right", nowrap: true, hideBelow: "md", render: (image) => <span className="tabular">{sizeLabel(image)}</span> },
    { key: "created", header: "Created", nowrap: true, hideBelow: "lg", render: (image) => image.created },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "1%",
      render: (image) => (
        <div className="flex items-center justify-end gap-2">
          {statusBadge(image)}
          {deleteButton(image)}
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-screen-2xl mx-auto space-y-6">
      <PageHeader
        title="Images"
        subtitle={`${images.length} images, ${formatBytes(totalSizeBytes)} on disk`}
        actions={
          <>
            <IconButton label="Refresh" onClick={fetchImages}>
              <RefreshCw className="w-4 h-4" />
            </IconButton>
            <Button variant="primary" icon={<Download className="w-4 h-4" />} onClick={() => setShowPullModal(true)}>
              Pull image
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={fetchImages} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile label="Images" value={<span className="tabular">{images.length}</span>} icon={<Package />} tone="accent" />
        <StatTile label="Size on disk" value={<span className="tabular">{formatBytes(totalSizeBytes)}</span>} icon={<HardDrive />} tone="info" />
        <StatTile label="Untagged" value={<span className="tabular">{untagged}</span>} icon={<Tag />} tone={untagged > 0 ? "warning" : "neutral"} />
        <StatTile
          label="Largest"
          value={<span className="tabular">{largest ? formatBytes(largest.sizeBytes) : "–"}</span>}
          hint={largest ? <span className="truncate block" title={largest.name}>{largest.name}</span> : undefined}
          icon={<Layers />}
          tone="neutral"
        />
      </div>

      <Toolbar end={<ViewSwitcher value={view} onChange={setView} />}>
        <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search repository or tag…" label="Search images" />
      </Toolbar>

      {filteredImages.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package className="w-6 h-6" />}
            title={allImages.length === 0 ? "No images yet" : "No images match your search"}
            description={
              allImages.length === 0 ? "Pull an image from a registry to get started." : "Try a different search term."
            }
            action={
              allImages.length === 0 ? (
                <Button variant="primary" icon={<Download className="w-4 h-4" />} onClick={() => setShowPullModal(true)}>
                  Pull image
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
          rows={filteredImages}
          rowKey={(image) => image.id}
          caption="Images"
          columns={columns}
          rowClassName={(image) => (image.status === "downloading" ? "opacity-70" : undefined)}
          renderCard={(image) => (
            <Card>
              <CardHeader
                leading={
                  <IconTile tone="accent">
                    <Package />
                  </IconTile>
                }
                title={<span title={image.name}>{image.name}</span>}
                badges={
                  <>
                    <Badge mono>{image.tag}</Badge>
                    {statusBadge(image)}
                  </>
                }
                actions={deleteButton(image)}
              />
              <CardBody className="mt-4">
                <DescriptionList
                  items={[
                    { label: "Size", icon: <HardDrive className="w-3.5 h-3.5" />, value: sizeLabel(image) },
                    { label: "Created", icon: <Clock className="w-3.5 h-3.5" />, value: image.created },
                    { label: "ID", icon: <Hash className="w-3.5 h-3.5" />, value: shortId(image.id), mono: true },
                  ]}
                />
              </CardBody>
            </Card>
          )}
          renderListItem={(image) => (
            <ListItem
              leading={
                <IconTile tone="accent">
                  <Package />
                </IconTile>
              }
              title={image.name}
              subtitle={<span className="font-mono text-xs">{image.tag} · {shortId(image.id)}</span>}
              meta={
                <span className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  {statusBadge(image)}
                  <span className="tabular">{sizeLabel(image)}</span>
                  <span className="hidden lg:inline">{image.created}</span>
                </span>
              }
              actions={deleteButton(image)}
            />
          )}
        />
      )}

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
        title="Pull image"
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
              Pull image
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            The pull runs in the background. Follow its progress from the Tasks
            tray in the header.
          </p>
          <div>
            <label htmlFor="images-field-1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Image name
            </label>
            <input id="images-field-1"
              type="text"
              value={pullImage.name}
              onChange={(e) =>
                setPullImage({ ...pullImage, name: e.target.value })
              }
              className="field"
              placeholder="nginx, redis, postgres…"
            />
          </div>
          <div>
            <label htmlFor="images-field-2" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Tag
            </label>
            <input id="images-field-2"
              type="text"
              value={pullImage.tag}
              onChange={(e) =>
                setPullImage({ ...pullImage, tag: e.target.value })
              }
              className="field"
              placeholder="latest"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
