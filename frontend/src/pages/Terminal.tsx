import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Terminal as TerminalIcon } from "lucide-react";
import { apiJson } from "@/utils/api";
import { ContainerConsole } from "@/components/ContainerConsole";
import { Card, EmptyState, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

interface ContainerOption {
  id: string;
  name: string;
  status: string;
  image: string;
}

export default function Terminal() {
  const { containerId } = useParams<{ containerId?: string }>();
  const navigate = useNavigate();
  const [containers, setContainers] = useState<ContainerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiJson<{ data: ContainerOption[] }>("/api/containers");
      setContainers(
        (res.data || [])
          .map((c) => ({ id: c.id, name: c.name, status: c.status, image: c.image }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load containers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const running = containers.filter((c) => c.status === "running");
  const selected = containers.find((c) => c.id === containerId || c.id.startsWith(containerId ?? "\0"));

  // With exactly one choice there's nothing to pick.
  useEffect(() => {
    if (!containerId && running.length === 1) navigate(`/terminal/${running[0].id}`, { replace: true });
  }, [containerId, running, navigate]);

  if (loading) return <LoadingState label="Loading containers…" />;

  return (
    <div className="max-w-screen-2xl mx-auto space-y-4">
      <PageHeader
        title="Terminal"
        subtitle="Run commands inside a running container"
        actions={
          <select
            aria-label="Container"
            value={selected?.id ?? ""}
            onChange={(e) => navigate(e.target.value ? `/terminal/${e.target.value}` : "/terminal")}
            className="field w-full sm:w-72"
          >
            <option value="">Choose a container…</option>
            {running.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        }
      />

      <ErrorBanner message={error} onRetry={load} />

      {selected ? (
        <ContainerConsole
          key={selected.id}
          containerId={selected.id}
          containerName={selected.name}
          autoConnect={selected.status === "running"}
          disabledReason={selected.status === "running" ? undefined : `${selected.name} is ${selected.status}. Start it to open a shell.`}
        />
      ) : (
        <Card>
          <EmptyState
            icon={<TerminalIcon className="w-6 h-6" />}
            title={running.length ? "Choose a container" : "No running containers"}
            description={
              running.length
                ? "Pick a running container above to open a shell in it."
                : "Start a container first, then come back to open a shell."
            }
            action={
              running.length ? undefined : (
                <Link to="/containers" className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
                  Go to containers
                </Link>
              )
            }
          />
        </Card>
      )}
    </div>
  );
}
