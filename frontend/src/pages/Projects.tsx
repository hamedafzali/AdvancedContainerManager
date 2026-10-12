import { Fragment, useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Play,
  Square,
  RefreshCw,
  Trash2,
  Settings,
  ExternalLink,
  Terminal,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  GitBranch,
  Code2,
  Activity,
  Zap,
  Shield,
  Globe,
  Copy,
  Link2Off,
  Github,
  BookOpen,
  Workflow,
  Loader2,
  Folder,
  Network,
  Package2,
  Cpu,
  ScrollText,
} from "lucide-react";
import { apiFetch, apiJson, apiPost } from "@/utils/api";
import ProjectEnvironments from "@/components/ProjectEnvironments";
import { useTasks } from "@/hooks/useTasks";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardGrid,
  CardHeader,
  CollectionView,
  ConfirmDialog,
  DescriptionList,
  DropdownMenu,
  EmptyState,
  ErrorBanner,
  IconButton,
  IconTile,
  ListItem,
  LoadingState,
  Modal,
  PageHeader,
  SearchInput,
  Segmented,
  StatTile,
  StatusBadge,
  Toolbar,
  ViewSwitcher,
  useViewMode,
  type DataTableColumn,
  type Tone,
} from "@/components/ui";

interface Project {
  name: string;
  repoUrl: string;
  branch: string;
  path: string;
  dockerfile: string;
  composeFile: string;
  environmentVars: Record<string, string>;
  containers: string[];
  status: "configured" | "building" | "built" | "running" | "degraded" | "stopped" | "error";
  createdAt: string;
  lastUpdated: string;
  ports: Array<{
    service: string;
    containerPort: number;
    hostPort?: number;
    protocol: string;
  }>;
  buildHistory: Array<{
    timestamp: string;
    status: string;
    duration: number;
  }>;
  deployHistory: Array<{
    timestamp: string;
    status: string;
    containers: number;
  }>;
  healthChecks: Array<{
    name: string;
    status: "healthy" | "unhealthy" | "unknown";
    lastCheck: string;
  }>;
  autoRestart: boolean;
  resourceLimits: {
    memory: string;
    cpu: string;
  };
  tunnelId?: string;
  tunnelUrl?: string;
}

const cx = (...parts: Array<string | false | null | undefined>) =>
  parts.filter(Boolean).join(" ");

const VIEWS = ["grid", "list", "table"] as const;

const STATUS_TONE: Record<Project["status"], Tone> = {
  configured: "info",
  building: "warning",
  built: "accent",
  running: "success",
  degraded: "warning",
  stopped: "neutral",
  error: "danger",
};

/** github.com/owner/repo from an https or ssh remote. */
const repoLabel = (url: string) =>
  url
    .replace(/^https?:\/\//, "")
    .replace(/^git@([^:]+):/, "$1/")
    .replace(/\.git$/, "");

export default function Projects() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(
    searchParams.get("search") || "",
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [logsEnv, setLogsEnv] = useState<"dev" | "test" | "prod">("prod");
  const [logsLoading, setLogsLoading] = useState(false);
  const [projectLogs, setProjectLogs] = useState<
    Array<{ containerId: string; logs: string }>
  >([]);
  const [pendingProjects, setPendingProjects] = useState<
    Record<string, string>
  >({});
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "running" | "attention" | "stopped">("all");
  const [view, setView] = useViewMode("projects", "grid", VIEWS);
  const { startTask, appendTaskLog, finishTask, openTask } = useTasks();
  // Active streaming deploy/build; websocket chunks append to this task
  const deployTaskRef = useRef<{ project: string; taskId: string } | null>(
    null,
  );

  const setPending = (name: string, action: string | null) => {
    setPendingProjects((prev) => {
      const next = { ...prev };
      if (action === null) delete next[name];
      else next[name] = action;
      return next;
    });
  };
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [envProject, setEnvProject] = useState<Project | null>(null);
  const [envEditor, setEnvEditor] = useState<
    Array<{ key: string; value: string }>
  >([]);
  // Keys the backend says aren't referenced anywhere in this project's
  // resolved compose file — editing them here cannot take effect on the next
  // deploy (see getUnmanagedEnvVarKeys). Populated when the env modal opens
  // and refreshed after each save so a stale warning never lingers.
  const [unmanagedEnvVars, setUnmanagedEnvVars] = useState<string[]>([]);
  const [repoUrlEditor, setRepoUrlEditor] = useState("");
  const [branchEditor, setBranchEditor] = useState("");
  const [composeFileEditor, setComposeFileEditor] = useState("");
  const [portEditor, setPortEditor] = useState<
    Array<{
      service: string;
      containerPort: number;
      protocol: string;
      hostPort: string;
    }>
  >([]);
  const [newProject, setNewProject] = useState({
    name: "",
    repository: "",
    branch: "main",
    composeFile: "",
    environmentVars: [] as Array<{ key: string; value: string }>,
  });
  const [detectedComposeFiles, setDetectedComposeFiles] = useState<string[]>([]);
  const [tunnelLoading, setTunnelLoading] = useState<string | null>(null);
  const [showTunnelModal, setShowTunnelModal] = useState(false);
  const [tunnelModalProject, setTunnelModalProject] = useState<Project | null>(null);
  const [tunnelSelectedPort, setTunnelSelectedPort] = useState<number | null>(null);
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [domainModalProject, setDomainModalProject] = useState<Project | null>(null);
  const [cfZones, setCfZones] = useState<Array<{ id: string; name: string }>>([]);
  const [cfZonesLoading, setCfZonesLoading] = useState(false);
  const [cfZoneId, setCfZoneId] = useState("");
  const [cfSubdomain, setCfSubdomain] = useState("");
  const [cfDomainLoading, setCfDomainLoading] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  // Per-environment variable overrides (settings modal tabs)
  const [envTab, setEnvTab] = useState<"common" | "dev" | "test" | "prod">(
    "common",
  );
  const [overrideEditor, setOverrideEditor] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [overridesLoading, setOverridesLoading] = useState(false);
  const [overridesSaving, setOverridesSaving] = useState(false);
  const [portConflicts, setPortConflicts] = useState<Record<string, string[]>>({});
  const [conflictChecking, setConflictChecking] = useState<string | null>(null);

  // Git accounts state
  interface GitAccount { id: string; provider: "github" | "gitlab"; username: string; addedAt: string; }
  interface GitRepo { id: number; name: string; fullName: string; cloneUrl: string; private: boolean; description: string | null; defaultBranch: string; }
  const [gitAccounts, setGitAccounts] = useState<GitAccount[]>([]);
  const [showGitAccountModal, setShowGitAccountModal] = useState(false);
  const [gitProvider, setGitProvider] = useState<"github" | "gitlab">("github");
  const [gitToken, setGitToken] = useState("");
  const [gitAccountLoading, setGitAccountLoading] = useState(false);
  const [gitAccountError, setGitAccountError] = useState<string | null>(null);
  // Errors from the Add Project modal render inside it; the page banner sits
  // behind the modal where nobody sees it.
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addMode, setAddMode] = useState<"manual" | "browse">("manual");
  const [selectedAccount, setSelectedAccount] = useState<GitAccount | null>(null);
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitRepo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  const openTunnelModal = (project: Project) => {
    const portsWithHost = (project.ports || []).filter((p) => p.hostPort);
    if (portsWithHost.length === 0) {
      setActionError("Project has no mapped host ports — set host:container port mappings first.");
      return;
    }
    if (portsWithHost.length === 1) {
      // Single port — create immediately without modal
      handleCreateTunnel(project.name, portsWithHost[0].hostPort!);
      return;
    }
    setTunnelModalProject(project);
    setTunnelSelectedPort(portsWithHost[0].hostPort ?? null);
    setShowTunnelModal(true);
  };

  const handleCreateTunnel = async (projectName: string, port?: number) => {
    try {
      setTunnelLoading(projectName);
      setShowTunnelModal(false);
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/tunnel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(port ? { port } : {}),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed to create tunnel");
      await fetchProjects();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to create tunnel");
    } finally {
      setTunnelLoading(null);
    }
  };

  const openDomainModal = async (project: Project) => {
    setDomainModalProject(project);
    setCfSubdomain(project.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
    setCfZoneId("");
    setShowDomainModal(true);
    setCfZonesLoading(true);
    try {
      const res = await apiFetch("/api/cloudflare/zones");
      const result = await res.json();
      if (result.success) setCfZones(result.data || []);
      else setActionError("Cloudflare not configured — go to Settings → Cloudflare to add your API token.");
    } catch {
      setActionError("Failed to load Cloudflare zones.");
    } finally {
      setCfZonesLoading(false);
    }
  };

  const handleAttachDomain = async () => {
    if (!domainModalProject || !cfZoneId || !cfSubdomain) return;
    setCfDomainLoading(true);
    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(domainModalProject.name)}/tunnel/domain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoneId: cfZoneId, subdomain: cfSubdomain }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.message);
      await fetchProjects();
      setShowDomainModal(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to attach domain");
    } finally {
      setCfDomainLoading(false);
    }
  };

  const handleDetachDomain = async (projectName: string) => {
    try {
      await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/tunnel/domain`, { method: "DELETE" });
      await fetchProjects();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to detach domain");
    }
  };

  const handleStopTunnel = async (projectName: string) => {
    try {
      setTunnelLoading(projectName);
      const response = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/tunnel`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Failed to stop tunnel");
      await fetchProjects();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to stop tunnel");
    } finally {
      setTunnelLoading(null);
    }
  };

  const fetchGitAccounts = async () => {
    try {
      const res = await apiFetch("/api/git-accounts");
      const result = await res.json();
      if (result.success) setGitAccounts(result.data);
    } catch {}
  };

  const handleAddGitAccount = async () => {
    if (!gitToken.trim()) return;
    setGitAccountLoading(true);
    setGitAccountError(null);
    try {
      const res = await apiFetch("/api/git-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: gitProvider, token: gitToken }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.message);
      await fetchGitAccounts();
      setGitToken("");
      setShowGitAccountModal(false);
    } catch (err) {
      setGitAccountError(err instanceof Error ? err.message : "Failed to add account");
    } finally {
      setGitAccountLoading(false);
    }
  };

  const handleRemoveGitAccount = async (id: string) => {
    await apiFetch(`/api/git-accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
    await fetchGitAccounts();
    if (selectedAccount?.id === id) {
      setSelectedAccount(null);
      setRepos([]);
      setSelectedRepo(null);
      setBranches([]);
    }
  };

  const handleSelectAccount = async (account: GitAccount) => {
    setSelectedAccount(account);
    setSelectedRepo(null);
    setBranches([]);
    setRepoSearch("");
    setReposLoading(true);
    try {
      const result = await apiJson(`/api/git-accounts/${encodeURIComponent(account.id)}/repos`);
      setRepos(result.data);
    } catch (err) {
      setRepos([]);
      setAddError(`Could not list ${account.username}'s repositories: ${err instanceof Error ? err.message : "request failed"}`);
    }
    setReposLoading(false);
  };

  const handleSelectRepo = async (repo: GitRepo) => {
    setSelectedRepo(repo);
    setNewProject((p) => ({
      ...p,
      repository: repo.cloneUrl,
      branch: repo.defaultBranch,
      name: p.name || repo.name,
    }));
    setBranchesLoading(true);
    try {
      const [owner, repoName] = repo.fullName.split("/");
      const result = await apiJson(`/api/git-accounts/${encodeURIComponent(selectedAccount!.id)}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/branches`);
      setBranches(result.data);
    } catch (err) {
      setBranches([]);
      setAddError(`Could not list branches, using ${repo.defaultBranch}: ${err instanceof Error ? err.message : "request failed"}`);
    }
    setBranchesLoading(false);
  };

  const formatSyncLog = (
    projectName: string,
    requestedAt: string,
    status: number,
    payload: {
      success?: boolean;
      message?: string;
      data?: { output?: string; updated?: boolean };
    } | null,
  ) => {
    const lines = [
      `Project: ${projectName}`,
      `Requested: ${requestedAt}`,
      `HTTP Status: ${status}`,
    ];

    if (payload?.data?.output) {
      lines.push(`Result: ${payload.data.output}`);
    }

    if (typeof payload?.data?.updated === "boolean") {
      lines.push(`Updated: ${payload.data.updated}`);
    }

    if (payload?.message) {
      lines.push(`Message: ${payload.message}`);
    }

    return lines.join("\n");
  };

  // Fetch projects from backend
  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await apiFetch("/api/projects");
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to fetch projects");
      }
      setProjects(result.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch projects");
    } finally {
      setLoading(false);
    }
  };

  // Add new project
  const handleAddProject = async () => {
    if (!newProject.name || !newProject.repository) {
      setAddError(
        !newProject.repository ? "Enter a repository URL or pick a repository." : "Give the project a name.",
      );
      return;
    }
    if (adding) return;
    setAddError(null);
    setAdding(true);

    try {
      // Convert environment vars array to object
      const envVarsObject = newProject.environmentVars.reduce(
        (acc, env) => {
          // An empty value is a legitimate setting; only skip rows with no key.
          if (env.key.trim()) {
            acc[env.key.trim()] = env.value;
          }
          return acc;
        },
        {} as Record<string, string>,
      );

      const response = await apiFetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newProject.name,
          repoUrl: newProject.repository,
          branch: newProject.branch || "main",
          composeFile: newProject.composeFile || undefined,
          environmentVars: envVarsObject,
          accountId: selectedAccount?.id,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to add project");
      }

      await fetchProjects();

      // Auto-detect compose files if none was specified
      if (!newProject.composeFile) {
        try {
          const scanRes = await apiFetch(`/api/projects/${encodeURIComponent(newProject.name)}/compose-files`);
          const scanResult = await scanRes.json();
          if (scanResult.success && scanResult.data.length > 1) {
            setDetectedComposeFiles(scanResult.data);
            return; // keep modal open to let user pick
          }
        } catch {}
      }

      setNewProject({ name: "", repository: "", branch: "main", composeFile: "", environmentVars: [] });
      setDetectedComposeFiles([]);
      setSelectedRepo(null);
      setBranches([]);
      setShowAddModal(false);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add project");
    } finally {
      setAdding(false);
    }
  };

  // Add environment variable
  const addEnvironmentVar = () => {
    setNewProject({
      ...newProject,
      environmentVars: [...newProject.environmentVars, { key: "", value: "" }],
    });
  };

  // Remove environment variable
  const removeEnvironmentVar = (index: number) => {
    setNewProject({
      ...newProject,
      environmentVars: newProject.environmentVars.filter((_, i) => i !== index),
    });
  };

  // Update environment variable
  const updateEnvironmentVar = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    setNewProject({
      ...newProject,
      environmentVars: newProject.environmentVars.map((env, i) =>
        i === index ? { ...env, [field]: value } : env,
      ),
    });
  };

  const handleGenerateWebhook = async (projectName: string) => {
    setWebhookLoading(true);
    try {
      const result = await apiPost(`/api/projects/${encodeURIComponent(projectName)}/webhook/generate`);
      setWebhookSecret(result.data.secret);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to generate webhook secret");
    }
    setWebhookLoading(false);
  };

  const openEnvModal = (project: Project) => {
    setEnvProject(project);
    setWebhookSecret(null);
    setEnvTab("common");
    setOverrideEditor([]);
    setUnmanagedEnvVars([]);
    const entries = Object.entries(project.environmentVars || {}).map(
      ([key, value]) => ({ key, value }),
    );
    setEnvEditor(entries.length > 0 ? entries : [{ key: "", value: "" }]);
    setRepoUrlEditor(project.repoUrl || "");
    setBranchEditor(project.branch || "main");
    setComposeFileEditor(project.composeFile || "docker-compose.yml");
    setPortEditor(
      (project.ports || []).map((port) => ({
        service: port.service,
        containerPort: port.containerPort,
        protocol: port.protocol || "tcp",
        hostPort:
          port.hostPort !== undefined && port.hostPort !== null
            ? String(port.hostPort)
            : "",
      })),
    );
    setShowEnvModal(true);
    apiFetch(`/api/projects/${encodeURIComponent(project.name)}`)
      .then((r) => r.json())
      .then((result) => setUnmanagedEnvVars(result?.unmanagedEnvVars || []))
      .catch(() => setUnmanagedEnvVars([]));
  };

  const switchEnvTab = async (
    tab: "common" | "dev" | "test" | "prod",
    projectName: string,
  ) => {
    setEnvTab(tab);
    if (tab === "common") return;
    setOverridesLoading(true);
    try {
      const result = await apiFetch(
        `/api/projects/${encodeURIComponent(projectName)}/environments/${tab}/env`,
      ).then((r) => r.json());
      const vars = (result?.data || {}) as Record<string, string>;
      const rows = Object.entries(vars).map(([key, value]) => ({ key, value }));
      setOverrideEditor(rows.length > 0 ? rows : []);
    } catch {
      setOverrideEditor([]);
    } finally {
      setOverridesLoading(false);
    }
  };

  const saveOverrides = async (projectName: string, env: string) => {
    setOverridesSaving(true);
    try {
      const vars: Record<string, string> = {};
      overrideEditor.forEach((row) => {
        if (row.key) vars[row.key] = row.value ?? "";
      });
      const response = await apiFetch(
        `/api/projects/${encodeURIComponent(projectName)}/environments/${env}/env`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vars }),
        },
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result?.message || "Failed to save overrides");
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to save overrides",
      );
    } finally {
      setOverridesSaving(false);
    }
  };

  const addEnvEditorRow = () => {
    setEnvEditor((prev) => [...prev, { key: "", value: "" }]);
  };

  const removeEnvEditorRow = (index: number) => {
    setEnvEditor((prev) => prev.filter((_, i) => i !== index));
  };

  const updateEnvEditorRow = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    setEnvEditor((prev) =>
      prev.map((env, i) => (i === index ? { ...env, [field]: value } : env)),
    );
  };

  // Several compose files were found; save the one the user picked.
  const handleUseSelectedCompose = async () => {
    if (!newProject.composeFile) return;
    try {
      await apiJson(`/api/projects/${encodeURIComponent(newProject.name)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ composeFile: newProject.composeFile }),
      });
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not save the compose file choice");
      return;
    }
    await fetchProjects();
    setNewProject({ name: "", repository: "", branch: "main", composeFile: "", environmentVars: [] });
    setDetectedComposeFiles([]);
    setSelectedRepo(null);
    setBranches([]);
    setShowAddModal(false);
  };

  const closeEnvModal = () => {
    setShowEnvModal(false);
    setEnvProject(null);
    setEnvEditor([]);
    setRepoUrlEditor("");
    setBranchEditor("");
    setComposeFileEditor("");
    setPortEditor([]);
  };

  const handleSaveEnvVars = async () => {
    if (!envProject) {
      return;
    }

    try {
      const envVarsObject = envEditor.reduce(
        (acc, env) => {
          if (env.key) {
            acc[env.key] = env.value ?? "";
          }
          return acc;
        },
        {} as Record<string, string>,
      );

      const response = await apiFetch(`/api/projects/${envProject.name}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repoUrl: repoUrlEditor.trim(),
          branch: branchEditor.trim() || "main",
          environmentVars: envVarsObject,
          composeFile: composeFileEditor,
          portUpdates: portEditor
            .filter((port) => port.hostPort.trim() !== "")
            .map((port) => ({
              service: port.service,
              containerPort: port.containerPort,
              protocol: port.protocol || "tcp",
              hostPort: parseInt(port.hostPort, 10),
            }))
            .filter(
              (port) =>
                Number.isInteger(port.hostPort) &&
                port.hostPort >= 1 &&
                port.hostPort <= 65535,
            ),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to update environment vars");
      }

      await fetchProjects();
      setUnmanagedEnvVars(result?.unmanagedEnvVars || []);
      setShowEnvModal(false);
      setEnvProject(null);
      setEnvEditor([]);
      setRepoUrlEditor("");
      setBranchEditor("");
      setComposeFileEditor("");
      setPortEditor([]);
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Failed to update environment vars",
      );
    }
  };

  const checkPortConflicts = async (projectName: string): Promise<string[]> => {
    setConflictChecking(projectName);
    try {
      const res = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/port-conflicts`);
      const result = await res.json();
      const conflicts: string[] = result.success ? result.data : [];
      setPortConflicts((prev) => ({ ...prev, [projectName]: conflicts }));
      return conflicts;
    } catch {
      return [];
    } finally {
      setConflictChecking(null);
    }
  };

  // Stream deploy/build logs from the backend into the active task.
  useEffect(() => {
    const onDeployLog = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        projectName?: string;
        chunk?: string;
      };
      const current = deployTaskRef.current;
      if (!current || detail?.projectName !== current.project) return;
      if (detail.chunk) appendTaskLog(current.taskId, detail.chunk);
    };

    const onDeployStatus = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        projectName?: string;
        status?: "started" | "completed" | "failed";
        error?: string;
      };
      const current = deployTaskRef.current;
      if (!current || detail?.projectName !== current.project) return;
      if (detail.status === "failed" && detail.error) {
        appendTaskLog(current.taskId, `\n${detail.error}\n`);
      }
    };

    window.addEventListener("project_deploy_log", onDeployLog);
    window.addEventListener("project_deploy_status", onDeployStatus);
    return () => {
      window.removeEventListener("project_deploy_log", onDeployLog);
      window.removeEventListener("project_deploy_status", onDeployStatus);
    };
  }, [appendTaskLog]);

  const beginStreamingTask = (projectName: string, title: string) => {
    const taskId = startTask(title, projectName);
    deployTaskRef.current = { project: projectName, taskId };
    window.dispatchEvent(
      new CustomEvent("subscribe_project_deploy", { detail: { projectName } }),
    );
    openTask(taskId);
    return taskId;
  };

  const endStreamingTask = (projectName: string) => {
    window.dispatchEvent(
      new CustomEvent("unsubscribe_project_deploy", {
        detail: { projectName },
      }),
    );
    if (deployTaskRef.current?.project === projectName) {
      deployTaskRef.current = null;
    }
  };

  const handleSyncDeploy = async (projectName: string) => {
    setPending(projectName, "deploying");
    const conflicts = await checkPortConflicts(projectName);
    if (conflicts.length > 0) {
      setActionError(`Port conflicts: ${conflicts.join(" · ")}`);
      setPending(projectName, null);
      return;
    }
    const taskId = beginStreamingTask(projectName, `Sync & Deploy ${projectName}`);
    appendTaskLog(taskId, `Syncing repository…\n`);
    try {
      const result = await apiPost(
        `/api/projects/${encodeURIComponent(projectName)}/sync-deploy`,
      );
      const syncOut = result?.data?.sync?.output || "";
      if (syncOut) appendTaskLog(taskId, `\n[sync]\n${syncOut}\n`);
      appendTaskLog(taskId, `\n✔ Sync & deploy completed\n`);
      finishTask(taskId, "success");
      await fetchProjects();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sync & deploy";
      appendTaskLog(taskId, `\n${message}\n`);
      finishTask(taskId, "failed", message);
      setActionError(message);
    } finally {
      endStreamingTask(projectName);
      setPending(projectName, null);
    }
  };

  // Build project — logs stream live over the deploy channel
  const handleBuildProject = async (projectName: string) => {
    setPending(projectName, "building");
    const taskId = beginStreamingTask(projectName, `Build ${projectName}`);
    appendTaskLog(taskId, `Starting build…\n`);
    try {
      await apiPost(`/api/projects/${encodeURIComponent(projectName)}/build`);
      appendTaskLog(taskId, `\n✔ Build completed\n`);
      finishTask(taskId, "success");
      await fetchProjects();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to build project";
      appendTaskLog(taskId, `\n${message}\n`);
      finishTask(taskId, "failed", message);
      setActionError(message);
    } finally {
      endStreamingTask(projectName);
      setPending(projectName, null);
    }
  };

  const handleSyncProject = async (projectName: string) => {
    const requestedAt = new Date().toLocaleString();
    setPending(projectName, "syncing");
    const taskId = startTask(`Sync repo ${projectName}`, "git pull");
    openTask(taskId);
    try {
      setActionError(null);
      const response = await apiFetch(
        `/api/projects/${encodeURIComponent(projectName)}/sync`,
        {
          method: "POST",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
        },
      );
      const result = await response.json().catch(() => null);
      appendTaskLog(
        taskId,
        formatSyncLog(projectName, requestedAt, response.status, result),
      );
      if (!response.ok) {
        throw new Error(
          result?.message || `Failed to sync project (${response.status})`,
        );
      }
      finishTask(taskId, "success");
      await fetchProjects();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sync project";
      finishTask(taskId, "failed", message);
      setActionError(message);
    } finally {
      setPending(projectName, null);
    }
  };

  // Deploy without syncing the repo first
  const handleDeployProject = async (projectName: string) => {
    setPending(projectName, "deploying");
    const conflicts = await checkPortConflicts(projectName);
    if (conflicts.length > 0) {
      setActionError(`Port conflicts: ${conflicts.join(" · ")}`);
      setPending(projectName, null);
      return;
    }
    const taskId = beginStreamingTask(projectName, `Deploy ${projectName}`);
    try {
      const result = await apiPost(
        `/api/projects/${encodeURIComponent(projectName)}/deploy`,
      );
      const command = result?.data?.command
        ? ` (${result.data.command})`
        : "";
      appendTaskLog(taskId, `\n✔ Deploy completed${command}\n`);
      finishTask(taskId, "success");
      await fetchProjects();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to deploy project";
      appendTaskLog(taskId, `\n${message}\n`);
      finishTask(taskId, "failed", message);
      setActionError(message);
    } finally {
      endStreamingTask(projectName);
      setPending(projectName, null);
    }
  };

  // Stop project (production) — streams compose output into the task viewer
  const handleStopProject = async (projectName: string) => {
    setPending(projectName, "stopping prod");
    const taskId = beginStreamingTask(projectName, `Stop production ${projectName}`);
    appendTaskLog(taskId, "Stopping containers…\n");
    try {
      await apiPost(`/api/projects/${encodeURIComponent(projectName)}/stop`);
      appendTaskLog(taskId, "\n✔ Production stopped\n");
      finishTask(taskId, "success");
      await fetchProjects();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to stop project";
      appendTaskLog(taskId, `\n${message}\n`);
      finishTask(taskId, "failed", message);
      setActionError(message);
    } finally {
      endStreamingTask(projectName);
      setPending(projectName, null);
    }
  };

  // Dev environment controls — the everyday workflow lives on the card.
  const handleStartDev = async (projectName: string) => {
    setPending(projectName, "starting dev");
    const taskId = beginStreamingTask(projectName, `Start dev ${projectName}`);
    try {
      await apiPost(
        `/api/projects/${encodeURIComponent(projectName)}/environments/dev/deploy`,
      );
      appendTaskLog(taskId, `\n✔ dev environment started\n`);
      finishTask(taskId, "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start dev environment";
      appendTaskLog(taskId, `\n${message}\n`);
      finishTask(taskId, "failed", message);
      setActionError(message);
    } finally {
      endStreamingTask(projectName);
      setPending(projectName, null);
    }
  };

  const handleStopDev = async (projectName: string) => {
    setPending(projectName, "stopping dev");
    const taskId = beginStreamingTask(projectName, `Stop dev ${projectName}`);
    appendTaskLog(taskId, "Stopping dev containers…\n");
    try {
      await apiPost(
        `/api/projects/${encodeURIComponent(projectName)}/environments/dev/stop`,
      );
      appendTaskLog(taskId, "\n✔ dev environment stopped\n");
      finishTask(taskId, "success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to stop dev environment";
      appendTaskLog(taskId, `\n${message}\n`);
      finishTask(taskId, "failed", message);
      setActionError(message);
    } finally {
      endStreamingTask(projectName);
      setPending(projectName, null);
    }
  };

  const handleRestartEnv = async (projectName: string, env: "dev" | "prod") => {
    setPending(projectName, `restarting ${env}`);
    const taskId = beginStreamingTask(projectName, `Restart ${env} ${projectName}`);
    appendTaskLog(taskId, `Restarting ${env} containers…\n`);
    try {
      await apiPost(
        `/api/projects/${encodeURIComponent(projectName)}/environments/${env}/restart`,
      );
      appendTaskLog(taskId, `\n✔ ${env} restarted\n`);
      finishTask(taskId, "success");
      await fetchProjects();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `Failed to restart ${env}`;
      appendTaskLog(taskId, `\n${message}\n`);
      finishTask(taskId, "failed", message);
      setActionError(message);
    } finally {
      endStreamingTask(projectName);
      setPending(projectName, null);
    }
  };

  const fetchProjectLogs = async (projectName: string, env: "dev" | "test" | "prod") => {
    try {
      setLogsLoading(true);
      const response = await apiFetch(`/api/projects/${projectName}/logs?env=${env}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to fetch project logs");
      }
      setProjectLogs(result.data || []);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to fetch logs",
      );
    } finally {
      setLogsLoading(false);
    }
  };

  const handleViewLogs = (project: Project) => {
    setSelectedProject(project);
    setLogsEnv("prod");
    setShowLogsModal(true);
    fetchProjectLogs(project.name, "prod");
  };

  // Delete project (invoked from the ConfirmDialog)
  const handleDeleteProject = async (projectName: string) => {
    try {
      setDeleting(true);
      const response = await apiFetch(`/api/projects/${projectName}`, {
        method: "DELETE",
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to delete project");
      }

      setDeleteTarget(null);
      await fetchProjects();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete project",
      );
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchGitAccounts();
  }, []);

  // Check port conflicts for running projects after fetch
  useEffect(() => {
    const runningProjects = projects.filter((p) => p.status === "running");
    runningProjects.forEach((p) => {
      apiFetch(`/api/projects/${encodeURIComponent(p.name)}/port-conflicts`)
        .then((r) => r.json())
        .then((result) => {
          if (result.success) {
            setPortConflicts((prev) => ({ ...prev, [p.name]: result.data }));
          }
        })
        .catch(() => {});
    });
  }, [projects.length]);

  useEffect(() => {
    const onHealth = (e: Event) => {
      const { projectName, health } = (e as CustomEvent).detail as { projectName: string; health: any };
      setProjects((prev) =>
        prev.map((p) => {
          if (p.name !== projectName) return p;
          if (health.overall === "unhealthy" || health.overall === "error") {
            // Some containers still up — degraded, not fully down.
            const anyRunning = (health.containers || []).some((c: any) => c.status === "running");
            return { ...p, status: anyRunning ? "degraded" : "error" };
          }
          // Recovered — clear a previously-set error/degraded rather than
          // leaving the card stuck until a manual page reload.
          if (p.status === "error" || p.status === "degraded") return { ...p, status: "running" };
          return p;
        }),
      );
    };
    // Status reconciled from real containers (server poll) — update the card live.
    const onStatus = (e: Event) => {
      const { name, status } = (e as CustomEvent).detail as { name: string; status: Project["status"] };
      setProjects((prev) => prev.map((p) => (p.name === name ? { ...p, status } : p)));
    };
    window.addEventListener("project_health", onHealth);
    window.addEventListener("project_status", onStatus);
    return () => {
      window.removeEventListener("project_health", onHealth);
      window.removeEventListener("project_status", onStatus);
    };
  }, []);

  useEffect(() => {
    if (searchParams.get("add") === "1") {
      setShowAddModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete("add");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const statusCounts = {
    all: projects.length,
    running: projects.filter((p) => p.status === "running").length,
    attention: projects.filter((p) => p.status === "degraded" || p.status === "error").length,
    stopped: projects.filter((p) => p.status === "stopped").length,
  };

  const filteredProjects = projects.filter((project) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      project.name.toLowerCase().includes(term) ||
      project.repoUrl.toLowerCase().includes(term) ||
      project.branch.toLowerCase().includes(term);
    if (!matchesSearch) return false;
    if (statusFilter === "running") return project.status === "running";
    if (statusFilter === "attention") return project.status === "degraded" || project.status === "error";
    if (statusFilter === "stopped") return project.status === "stopped";
    return true;
  });

  const renderStatus = (project: Project) => {
    const pending = pendingProjects[project.name];
    return pending ? (
      <StatusBadge tone="info" label={`${pending}…`} busy />
    ) : (
      <StatusBadge
        tone={STATUS_TONE[project.status] ?? "neutral"}
        label={project.status}
        busy={project.status === "building"}
      />
    );
  };

  const renderPorts = (project: Project, limit?: number) => {
    const ports = project.ports ?? [];
    if (ports.length === 0) {
      return <span className="text-gray-400 dark:text-gray-500">None</span>;
    }
    const conflicts = portConflicts[project.name] || [];
    const shown = limit ? ports.slice(0, limit) : ports;
    const hidden = ports.length - shown.length;
    return (
      <span className="inline-flex flex-wrap justify-end gap-1 min-w-0">
        {shown.map((port) => {
          const conflict = port.hostPort
            ? conflicts.find((c) => c.includes(`port ${port.hostPort}`))
            : undefined;
          const key = `${port.service}-${port.hostPort ?? ""}-${port.containerPort}`;
          const label = `${port.hostPort ? `${port.hostPort}→` : ""}${port.containerPort}`;
          const chip = cx(
            "inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.5 rounded-md",
            conflict
              ? "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/30"
              : port.hostPort
                ? "bg-primary-50 text-primary-700 hover:underline dark:bg-primary-500/10 dark:text-primary-300"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
          );
          const body = (
            <>
              {label}
              {conflict && <AlertTriangle className="w-3 h-3" aria-label="Port conflict" />}
            </>
          );
          return port.hostPort ? (
            <a
              key={key}
              href={`http://${window.location.hostname}:${port.hostPort}`}
              target="_blank"
              rel="noopener noreferrer"
              title={conflict ?? `${port.service}: open http://${window.location.hostname}:${port.hostPort}`}
              className={chip}
            >
              {body}
            </a>
          ) : (
            <span key={key} title={port.service} className={chip}>
              {body}
            </span>
          );
        })}
        {hidden > 0 && (
          <span
            className="text-xs px-1.5 py-0.5 text-gray-500 dark:text-gray-400"
            title={ports
              .slice(shown.length)
              .map((p) => `${p.service} ${p.hostPort ? `${p.hostPort}→` : ""}${p.containerPort}`)
              .join(", ")}
          >
            +{hidden}
          </span>
        )}
        {conflictChecking === project.name && (
          <span className="text-xs text-gray-400">checking…</span>
        )}
      </span>
    );
  };

  const renderPublicUrl = (project: Project) => {
    const domain = (project as any).tunnelDomain as string | undefined;
    const url = domain || project.tunnelUrl;
    if (!url) return null;
    return (
      <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
        <a
          href={`https://${url}`}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate text-primary-600 hover:underline dark:text-primary-400"
          title={`https://${url}`}
        >
          {url}
        </a>
        <IconButton
          size="sm"
          label="Copy public URL"
          onClick={() => navigator.clipboard.writeText(`https://${url}`)}
        >
          <Copy className="w-3.5 h-3.5" />
        </IconButton>
      </span>
    );
  };

  const menuItems = (project: Project) => {
    const busy = Boolean(pendingProjects[project.name]);
    const domain = (project as any).tunnelDomain as string | undefined;
    return [
      { label: "Container logs", icon: <ScrollText className="w-4 h-4" />, onClick: () => handleViewLogs(project) },
      { label: "Pipeline", icon: <Workflow className="w-4 h-4" />, onClick: () => navigate(`/pipelines?project=${encodeURIComponent(project.name)}`) },
      { label: "Deploy without sync", icon: <Zap className="w-4 h-4" />, disabled: busy, dividerAbove: true, onClick: () => handleDeployProject(project.name) },
      { label: "Restart production", icon: <RefreshCw className="w-4 h-4" />, disabled: busy, onClick: () => handleRestartEnv(project.name, "prod") },
      { label: "Stop production", icon: <Square className="w-4 h-4" />, disabled: busy, onClick: () => handleStopProject(project.name) },
      { label: "Start dev", icon: <Play className="w-4 h-4" />, disabled: busy, dividerAbove: true, onClick: () => handleStartDev(project.name) },
      { label: "Restart dev", icon: <RefreshCw className="w-4 h-4" />, disabled: busy, onClick: () => handleRestartEnv(project.name, "dev") },
      { label: "Stop dev", icon: <Square className="w-4 h-4" />, disabled: busy, onClick: () => handleStopDev(project.name) },
      { label: "Sync repository", icon: <GitBranch className="w-4 h-4" />, disabled: busy, dividerAbove: true, onClick: () => handleSyncProject(project.name) },
      { label: "Build images", icon: <Code2 className="w-4 h-4" />, disabled: busy, onClick: () => handleBuildProject(project.name) },
      project.tunnelId
        ? { label: "Stop tunnel", icon: <Link2Off className="w-4 h-4" />, disabled: tunnelLoading === project.name, dividerAbove: true, onClick: () => handleStopTunnel(project.name) }
        : { label: "Create tunnel", icon: <Globe className="w-4 h-4" />, disabled: tunnelLoading === project.name, dividerAbove: true, onClick: () => openTunnelModal(project) },
      ...(project.tunnelUrl
        ? [
            domain
              ? { label: "Remove domain", icon: <Link2Off className="w-4 h-4" />, onClick: () => handleDetachDomain(project.name) }
              : { label: "Attach domain", icon: <Globe className="w-4 h-4" />, onClick: () => openDomainModal(project) },
          ]
        : []),
      { label: "Settings", icon: <Settings className="w-4 h-4" />, onClick: () => openEnvModal(project) },
      { label: "Delete project", icon: <Trash2 className="w-4 h-4" />, danger: true, dividerAbove: true, onClick: () => setDeleteTarget(project) },
    ];
  };

  const renderActions = (project: Project, compact = false) => {
    const pending = pendingProjects[project.name];
    return (
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          icon={<Zap className="w-3.5 h-3.5" />}
          loading={pending === "deploying"}
          disabled={Boolean(pending)}
          onClick={() => handleSyncDeploy(project.name)}
          title="Pull the latest commit, then deploy to production"
          aria-label={`Deploy ${project.name}`}
        >
          <span className={compact ? "hidden xl:inline" : undefined}>Deploy</span>
        </Button>
        <DropdownMenu
          iconTrigger
          triggerLabel={`More actions for ${project.name}`}
          items={menuItems(project)}
        />
      </div>
    );
  };

  const projectTitle = (project: Project) => (
    <span title={project.name}>{project.name}</span>
  );

  const repoSubtitle = (project: Project) => (
    <span className="font-mono text-xs" title={project.repoUrl}>
      {repoLabel(project.repoUrl)}
    </span>
  );

  const renderCard = (project: Project) => (
    <Card className={cx("flex flex-col", pendingProjects[project.name] && "opacity-80")}>
      <CardHeader
        leading={
          <IconTile tone={STATUS_TONE[project.status] ?? "neutral"}>
            <Folder />
          </IconTile>
        }
        title={projectTitle(project)}
        subtitle={repoSubtitle(project)}
        actions={renderStatus(project)}
      />
      <CardBody className="mt-4 flex-1">
        <DescriptionList
          items={[
            { label: "Branch", icon: <GitBranch className="w-3.5 h-3.5" />, value: project.branch, mono: true },
            { label: "Ports", icon: <Network className="w-3.5 h-3.5" />, value: renderPorts(project, 3), title: "" },
            { label: "Public URL", icon: <Globe className="w-3.5 h-3.5" />, value: renderPublicUrl(project), hidden: !project.tunnelUrl, title: "" },
            {
              label: "Containers",
              icon: <Package2 className="w-3.5 h-3.5" />,
              value: project.containers.length || "None",
            },
            {
              label: "Limits",
              icon: <Cpu className="w-3.5 h-3.5" />,
              value: `${project.resourceLimits.memory} · ${project.resourceLimits.cpu} CPU`,
            },
          ]}
        />
        <ProjectEnvironments projectName={project.name} />
      </CardBody>
      <CardFooter>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Created {new Date(project.createdAt).toLocaleDateString()}
        </span>
        {renderActions(project)}
      </CardFooter>
    </Card>
  );

  const renderListItem = (project: Project) => (
    <ListItem
      leading={
        <IconTile tone={STATUS_TONE[project.status] ?? "neutral"}>
          <Folder />
        </IconTile>
      }
      title={projectTitle(project)}
      subtitle={
        <span className="font-mono text-xs" title={project.repoUrl}>
          {repoLabel(project.repoUrl)} · {project.branch}
        </span>
      }
      meta={
        <span className="flex items-center gap-3">
          {project.ports?.length > 0 && renderPorts(project, 1)}
          {renderStatus(project)}
        </span>
      }
      actions={renderActions(project)}
    />
  );

  const columns: DataTableColumn<Project>[] = [
    {
      key: "name",
      header: "Project",
      render: (project) => (
        <div className="flex items-center gap-3 min-w-0">
          <span className="hidden sm:block">
            <IconTile tone={STATUS_TONE[project.status] ?? "neutral"}>
              <Folder />
            </IconTile>
          </span>
          <div className="min-w-0 max-w-[10rem] sm:max-w-[14rem] xl:max-w-[18rem]">
            <div className="font-medium text-gray-900 dark:text-gray-50 truncate" title={project.name}>
              {project.name}
            </div>
            <div className="font-mono text-xs text-gray-500 dark:text-gray-400 truncate" title={project.repoUrl}>
              {repoLabel(project.repoUrl)}
            </div>
            <div className="sm:hidden mt-1">{renderStatus(project)}</div>
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", hideBelow: "sm", render: renderStatus },
    {
      key: "branch",
      header: "Branch",
      hideBelow: "xl",
      render: (project) => <Badge mono>{project.branch}</Badge>,
    },
    {
      key: "ports",
      header: "Ports",
      hideBelow: "xl",
      nowrap: true,
      render: (project) => <span className="inline-flex justify-start">{renderPorts(project, 2)}</span>,
    },
    { key: "actions", header: <span className="sr-only">Actions</span>, align: "right", render: (project) => renderActions(project, true) },
  ];

  if (loading && projects.length === 0 && !error) {
    return <LoadingState label="Fetching project data…" />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Projects"
        subtitle="Git repositories deployed with docker compose, with dev, test and prod side by side."
        actions={
          <>
            <IconButton label="Refresh projects" onClick={fetchProjects} loading={loading}>
              <RefreshCw className="w-4 h-4" />
            </IconButton>
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowAddModal(true)}
            >
              New project
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} onDismiss={() => setError(null)} onRetry={fetchProjects} />
      <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          label="Total"
          value={statusCounts.all}
          icon={<Folder />}
          tone="accent"
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <StatTile
          label="Running"
          value={statusCounts.running}
          icon={<Activity />}
          tone="success"
          active={statusFilter === "running"}
          onClick={() => setStatusFilter(statusFilter === "running" ? "all" : "running")}
        />
        <StatTile
          label="Needs attention"
          value={statusCounts.attention}
          icon={<AlertTriangle />}
          tone={statusCounts.attention > 0 ? "danger" : "neutral"}
          active={statusFilter === "attention"}
          onClick={() => setStatusFilter(statusFilter === "attention" ? "all" : "attention")}
        />
        <StatTile
          label="Stopped"
          value={statusCounts.stopped}
          icon={<Square />}
          tone="neutral"
          active={statusFilter === "stopped"}
          onClick={() => setStatusFilter(statusFilter === "stopped" ? "all" : "stopped")}
        />
      </div>

      <Toolbar end={<ViewSwitcher value={view} onChange={setView} />}>
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search projects…"
          label="Search projects"
        />
      </Toolbar>

      {filteredProjects.length === 0 ? (
        <EmptyState
          icon={<Code2 className="w-6 h-6" />}
          title={projects.length === 0 ? "No projects yet" : "No projects match"}
          description={
            projects.length === 0
              ? "Connect a Git repository and deploy it with docker compose in a couple of clicks."
              : "Try a different search term or status filter."
          }
          action={
            projects.length === 0 ? (
              <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddModal(true)}>
                Add your first project
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </Button>
            )
          }
        />
      ) : view === "grid" ? (
        // Project cards carry the dev → test → prod strip, so they get the
        // roomier two/three-column grid rather than the dense one.
        <CardGrid>
          {filteredProjects.map((project) => (
            <Fragment key={project.name}>{renderCard(project)}</Fragment>
          ))}
        </CardGrid>
      ) : (
        <CollectionView
          view={view}
          rows={filteredProjects}
          rowKey={(project) => project.name}
          columns={columns}
          caption="Projects"
          renderCard={renderCard}
          renderListItem={renderListItem}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete project"
        message={
          <>
            This will remove{" "}
            <span className="font-mono font-semibold">
              {deleteTarget?.name}
            </span>{" "}
            and stop its containers. The Git repository itself is not affected.
          </>
        }
        confirmLabel="Delete"
        requireText={deleteTarget?.name}
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDeleteProject(deleteTarget.name)}
      />

      {/* Add Project Modal */}
      <Modal
        open={showAddModal}
        onClose={() => { setShowAddModal(false); setAddError(null); setAddMode("manual"); setSelectedRepo(null); setBranches([]); setDetectedComposeFiles([]); }}
        title="New project"
        wide
        footer={
          <>
            <Button
              onClick={() => {
                setShowAddModal(false);
                setAddError(null);
                setAddMode("manual");
                setSelectedRepo(null);
                setBranches([]);
                setDetectedComposeFiles([]);
              }}
            >
              Cancel
            </Button>
            {detectedComposeFiles.length > 1 ? (
              <Button variant="primary" onClick={handleUseSelectedCompose} disabled={!newProject.composeFile}>
                Use selected file
              </Button>
            ) : (
              <Button variant="primary" onClick={handleAddProject} loading={adding}>
                {adding ? "Cloning…" : "Add project"}
              </Button>
            )}
          </>
        }
      >
        <div className="mb-5">
          <Segmented
            label="Repository source"
            value={addMode}
            onChange={(mode) => {
              setAddMode(mode);
              if (mode === "browse" && gitAccounts.length > 0 && !selectedAccount) {
                handleSelectAccount(gitAccounts[0]);
              }
            }}
            options={[
              { value: "manual", label: "Repository URL" },
              { value: "browse", label: "Browse repositories" },
            ]}
          />
        </div>

        <div>
          {addMode === "browse" && (
            <div className="mb-6">
              {/* Account selector */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Git Account:</span>
                <div className="flex gap-2 flex-wrap">
                  {gitAccounts.map((acc) => (
                    <button
                      key={acc.id}
                      onClick={() => handleSelectAccount(acc)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-colors ${selectedAccount?.id === acc.id ? "bg-primary-50 text-primary-700 border-primary-300 dark:bg-primary-500/10 dark:text-primary-300 dark:border-primary-500/40" : "border-gray-300 dark:border-gray-600 hover:border-gray-400"}`}
                    >
                      <Github className="w-3 h-3" />
                      {acc.username}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowGitAccountModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-400 text-gray-500 dark:text-gray-400 hover:text-primary-600 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Connect Account
                  </button>
                </div>
              </div>

              {selectedAccount && (
                <>
                  <div className="relative mb-2">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search repositories..."
                      value={repoSearch}
                      onChange={(e) => setRepoSearch(e.target.value)}
                      className="field pl-9"
                    />
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-y-auto max-h-48">
                    {reposLoading ? (
                      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">Loading repositories...</div>
                    ) : repos.filter(r => r.name.toLowerCase().includes(repoSearch.toLowerCase())).length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">No repositories found</div>
                    ) : (
                      repos.filter(r => r.name.toLowerCase().includes(repoSearch.toLowerCase())).map((repo) => (
                        <button
                          key={repo.id}
                          onClick={() => handleSelectRepo(repo)}
                          className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${selectedRepo?.id === repo.id ? "bg-primary-50 dark:bg-primary-900/20" : ""}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <BookOpen className="w-4 h-4 text-gray-400" />
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{repo.name}</span>
                              {repo.private && <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded">private</span>}
                            </div>
                            <span className="text-xs text-gray-400">{repo.defaultBranch}</span>
                          </div>
                          {repo.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate pl-6">{repo.description}</p>}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}

              {!selectedAccount && gitAccounts.length === 0 && (
                <div className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                  No git accounts connected.{" "}
                  <button onClick={() => setShowGitAccountModal(true)} className="text-primary-600 hover:underline">Connect one</button> to browse repositories.
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="projects-field-1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Name</label>
              <input id="projects-field-1"
                type="text"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                className="field"
                placeholder="Enter project name"
              />
            </div>
            <div>
              <label htmlFor="projects-field-2" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Repository URL</label>
              <input id="projects-field-2"
                type="text"
                value={newProject.repository}
                onChange={(e) => setNewProject({ ...newProject, repository: e.target.value })}
                className="field"
                placeholder="https://github.com/user/repo"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch</label>
              {branches.length > 0 ? (
                <select
                  value={newProject.branch}
                  onChange={(e) => setNewProject({ ...newProject, branch: e.target.value })}
                  className="field"
                >
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={newProject.branch}
                  onChange={(e) => setNewProject({ ...newProject, branch: e.target.value })}
                  className="field"
                  placeholder={branchesLoading ? "Loading branches..." : "main"}
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Compose File Path</label>
              {detectedComposeFiles.length > 1 ? (
                <div className="space-y-1">
                  <p className="text-xs text-amber-600 mb-2">Multiple compose files found — pick one to use:</p>
                  {detectedComposeFiles.map((f) => (
                    <button
                      key={f}
                      onClick={() => setNewProject((p) => ({ ...p, composeFile: f }))}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${newProject.composeFile === f ? "bg-primary-50 dark:bg-primary-900/20 border-primary-400 text-primary-700 dark:text-primary-300" : "border-gray-200 dark:border-gray-700 hover:border-gray-400"}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={newProject.composeFile}
                    onChange={(e) => setNewProject({ ...newProject, composeFile: e.target.value })}
                    className="field"
                    placeholder="docker-compose.yml (default)"
                  />
                  <p className="text-xs text-gray-400 mt-1">Relative path from repo root, e.g. <code>infra/docker-compose.yml</code></p>
                </>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Environment Variables</label>
                <button onClick={addEnvironmentVar} className="px-3 py-1 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-md flex items-center">
                  <Plus className="w-3 h-3 mr-1" />Add Variable
                </button>
              </div>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {newProject.environmentVars.map((env, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input type="text" placeholder="KEY" value={env.key} onChange={(e) => updateEnvironmentVar(index, "key", e.target.value)} className="flex-1 field text-sm" />
                    <input type="text" placeholder="VALUE" value={env.value} onChange={(e) => updateEnvironmentVar(index, "value", e.target.value)} className="flex-1 field text-sm" />
                    <button onClick={() => removeEnvironmentVar(index)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
                {newProject.environmentVars.length === 0 && <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">No environment variables configured</div>}
              </div>
            </div>
          </div>
        </div>

        {addError && (
          <div role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
            {addError}
          </div>
        )}
      </Modal>

      {/* Connect Git Account Modal */}
      <Modal
        open={showGitAccountModal}
        onClose={() => { setShowGitAccountModal(false); setGitToken(""); setGitAccountError(null); }}
        title="Connect Git account"
        footer={
          <>
            <Button onClick={() => { setShowGitAccountModal(false); setGitToken(""); setGitAccountError(null); }}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={handleAddGitAccount}
              loading={gitAccountLoading}
              disabled={!gitToken.trim()}
            >
              Connect
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</div>
            <Segmented
              label="Git provider"
              value={gitProvider}
              onChange={setGitProvider}
              options={[
                { value: "github", label: "GitHub" },
                { value: "gitlab", label: "GitLab" },
              ]}
            />
          </div>
          <div>
            <label htmlFor="projects-field-3" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Personal Access Token</label>
            <input id="projects-field-3"
              type="password"
              value={gitToken}
              onChange={(e) => setGitToken(e.target.value)}
              className="field"
              placeholder={gitProvider === "github" ? "ghp_..." : "glpat-..."}
            />
            <p className="text-xs text-gray-400 mt-1">
              {gitProvider === "github" ? "Needs repo scope. Create at GitHub → Settings → Developer settings → PATs." : "Needs read_api scope. Create at GitLab → User Settings → Access Tokens."}
            </p>
          </div>
          {gitAccountError && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{gitAccountError}</div>}

          {gitAccounts.length > 0 && (
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Connected Accounts</div>
              {gitAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <div className="flex items-center gap-2 text-sm">
                    <Github className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    <span className="font-medium">{acc.username}</span>
                    <span className="text-gray-400 capitalize">({acc.provider})</span>
                  </div>
                  <button onClick={() => handleRemoveGitAccount(acc.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {showLogsModal && selectedProject && (
      <Modal
        open
        onClose={() => setShowLogsModal(false)}
        title={`${selectedProject.name} logs`}
        wide
        footer={
          <>
            <Button
              icon={<RefreshCw className="w-4 h-4" />}
              onClick={() => fetchProjectLogs(selectedProject.name, logsEnv)}
              loading={logsLoading}
            >
              Refresh
            </Button>
          </>
        }
      >
        <div className="-mt-1 mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
          {(["dev", "test", "prod"] as const).map((env) => (
            <button
              key={env}
              onClick={() => {
                setLogsEnv(env);
                fetchProjectLogs(selectedProject.name, env);
              }}
              className={`px-3 py-1.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                logsEnv === env
                  ? "border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {env}
            </button>
          ))}
        </div>
        <div>
          {logsLoading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading logs...</div>
          ) : projectLogs.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              No logs found for the {logsEnv} environment.
            </div>
          ) : (
            <div className="space-y-4">
              {projectLogs.map((entry) => (
                <div key={entry.containerId}>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Container: {entry.containerId}
                  </div>
                  <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-auto whitespace-pre-wrap">
                    {entry.logs || "(no output)"}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
      )}

      {showEnvModal && envProject && (
      <Modal
        open
        onClose={closeEnvModal}
        title={`${envProject.name} settings`}
        wide
        footer={
          <>
            <Button onClick={closeEnvModal}>Cancel</Button>
            <Button variant="primary" onClick={handleSaveEnvVars}>
              Save settings
            </Button>
          </>
        }
      >
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label htmlFor="projects-field-4" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Repository URL
              </label>
              <input id="projects-field-4"
                type="text"
                value={repoUrlEditor}
                onChange={(e) => setRepoUrlEditor(e.target.value)}
                className="field"
                placeholder="https://github.com/user/repo"
              />
            </div>
            <div>
              <label htmlFor="projects-field-5" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Branch
              </label>
              <input id="projects-field-5"
                type="text"
                value={branchEditor}
                onChange={(e) => setBranchEditor(e.target.value)}
                className="field"
                placeholder="main"
              />
            </div>
          </div>

          <div className="mb-6">
            <label htmlFor="projects-field-6" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Compose File
            </label>
            <input id="projects-field-6"
              type="text"
              value={composeFileEditor}
              onChange={(e) => setComposeFileEditor(e.target.value)}
              className="field"
              placeholder="docker-compose.yml"
            />
          </div>

          <div className="mb-6">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Webhook (Auto-Deploy)</div>
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">Generate a secret and point your GitHub/GitLab webhook to trigger automatic sync & deploy on push.</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 flex-1 truncate">
                  {window.location.protocol}//{window.location.hostname}:5003/api/webhook/{envProject?.name}
                </code>
                <button onClick={() => navigator.clipboard.writeText(`${window.location.protocol}//${window.location.hostname}:5003/api/webhook/${envProject?.name}`)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800">Copy</button>
              </div>
              {webhookSecret && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Secret:</span>
                  <code className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 flex-1 font-mono truncate">{webhookSecret}</code>
                  <button onClick={() => navigator.clipboard.writeText(webhookSecret)} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800">Copy</button>
                </div>
              )}
              <Button size="sm" onClick={() => handleGenerateWebhook(envProject!.name)} loading={webhookLoading}>
                {webhookSecret ? "Regenerate secret" : "Generate secret"}
              </Button>
            </div>
          </div>

          <div className="mb-6">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Port Mappings
            </div>
            {portEditor.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                No ports detected in compose file.
              </div>
            ) : (
              <div className="space-y-2">
                {portEditor.map((port, index) => (
                  <div
                    key={`${port.service}-${port.containerPort}-${port.protocol}-${index}`}
                    className="grid grid-cols-4 gap-2 items-center"
                  >
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-700 dark:text-gray-300 truncate">
                      {port.service}
                    </div>
                    <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                      {port.containerPort}/{port.protocol}
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={port.hostPort}
                      onChange={(e) =>
                        setPortEditor((prev) =>
                          prev.map((p, i) =>
                            i === index
                              ? { ...p, hostPort: e.target.value }
                              : p,
                          ),
                        )
                      }
                      className="field text-sm"
                      placeholder="Host port"
                    />
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Leave blank to keep unchanged
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Environment Variables
            </div>
            {/* Env tabs: Common is shared; dev/test/prod override Common per environment */}
            <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 w-fit">
              {(["common", "dev", "test", "prod"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => switchEnvTab(tab, envProject.name)}
                  className={`px-3 py-1 text-xs rounded-md capitalize transition-colors ${
                    envTab === tab
                      ? "bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-gray-100 font-medium"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {envTab === "common"
                ? "Shared by every environment. Per-environment tabs override these values."
                : `Overrides for ${envTab} — keys set here replace the Common value; keys left out inherit Common. Use this for ports, URLs and secrets that differ per environment.`}
            </p>

            {envTab === "common" ? (
              <>
                {envEditor.map((env, index) => {
                  const isUnmanaged =
                    env.key && unmanagedEnvVars.includes(env.key);
                  return (
                    <div key={index}>
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          placeholder="KEY"
                          value={env.key}
                          onChange={(e) =>
                            updateEnvEditorRow(index, "key", e.target.value)
                          }
                          className={`flex-1 field ${
                            isUnmanaged
                              ? "border-amber-400 dark:border-amber-600"
                              : "border-gray-300 dark:border-gray-600"
                          }`}
                        />
                        <input
                          type="text"
                          placeholder="VALUE"
                          value={env.value}
                          onChange={(e) =>
                            updateEnvEditorRow(index, "value", e.target.value)
                          }
                          className={`flex-1 field ${
                            isUnmanaged
                              ? "border-amber-400 dark:border-amber-600"
                              : "border-gray-300 dark:border-gray-600"
                          }`}
                        />
                        <button
                          onClick={() => removeEnvEditorRow(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                          title="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {isUnmanaged && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                          Not read anywhere in {composeFileEditor || "the compose file"} — saving this has no effect until it's wired into a service's environment or build args.
                        </p>
                      )}
                    </div>
                  );
                })}
                <button
                  onClick={addEnvEditorRow}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Add Variable
                </button>
                <p className="text-xs text-gray-400">
                  Common variables are saved with “Save Settings” below.
                </p>
              </>
            ) : overridesLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 py-2">
                Loading {envTab} overrides…
              </div>
            ) : (
              <>
                {/* Inherited common keys not overridden yet */}
                {envEditor
                  .filter(
                    (row) =>
                      row.key &&
                      !overrideEditor.some((o) => o.key === row.key),
                  )
                  .map((row) => (
                    <div
                      key={`inherited-${row.key}`}
                      className="flex items-center space-x-2 opacity-60"
                    >
                      <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-mono truncate">
                        {row.key}
                      </div>
                      <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-mono truncate">
                        {row.value}
                      </div>
                      <button
                        onClick={() =>
                          setOverrideEditor((prev) => [
                            ...prev,
                            { key: row.key, value: row.value },
                          ])
                        }
                        className="px-2 py-2 text-xs text-primary-600 dark:text-primary-400 hover:underline shrink-0"
                        title={`Override ${row.key} for ${envTab}`}
                      >
                        override
                      </button>
                    </div>
                  ))}
                {overrideEditor.map((row, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="KEY"
                      value={row.key}
                      onChange={(e) =>
                        setOverrideEditor((prev) =>
                          prev.map((r, i) =>
                            i === index ? { ...r, key: e.target.value } : r,
                          ),
                        )
                      }
                      className="field flex-1"
                    />
                    <input
                      type="text"
                      placeholder="VALUE"
                      value={row.value}
                      onChange={(e) =>
                        setOverrideEditor((prev) =>
                          prev.map((r, i) =>
                            i === index
                              ? { ...r, value: e.target.value }
                              : r,
                          ),
                        )
                      }
                      className="field flex-1"
                    />
                    <button
                      onClick={() =>
                        setOverrideEditor((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                      title="Remove override (inherits Common again)"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      setOverrideEditor((prev) => [
                        ...prev,
                        { key: "", value: "" },
                      ])
                    }
                    className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Add Override
                  </button>
                  <Button
                    size="sm"
                    onClick={() => saveOverrides(envProject.name, envTab)}
                    loading={overridesSaving}
                  >
                    Save {envTab} overrides
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </Modal>
      )}

      {/* Port picker modal for multi-port tunnel creation */}
      {showTunnelModal && tunnelModalProject && (
      <Modal
        open
        onClose={() => setShowTunnelModal(false)}
        title="Choose a port to expose"
        footer={
          <>
            <Button onClick={() => setShowTunnelModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => handleCreateTunnel(tunnelModalProject.name, tunnelSelectedPort!)}
              loading={tunnelLoading === tunnelModalProject.name}
              disabled={!tunnelSelectedPort}
            >
              Create tunnel
            </Button>
          </>
        }
      >
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            <span className="font-medium">{tunnelModalProject.name}</span> has multiple ports. Pick the one to make public.
          </p>
        <div className="space-y-2">
          {tunnelModalProject.ports.filter((p) => p.hostPort).map((port, i) => (
            <label key={i} className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${tunnelSelectedPort === port.hostPort ? "border-teal-500 bg-teal-50 dark:bg-teal-900/20" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"}`}>
              <input
                type="radio"
                name="tunnelPort"
                value={port.hostPort}
                checked={tunnelSelectedPort === port.hostPort}
                onChange={() => setTunnelSelectedPort(port.hostPort!)}
                className="text-teal-600"
              />
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{port.service}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">host:{port.hostPort} → container:{port.containerPort}/{port.protocol}</div>
              </div>
            </label>
          ))}
        </div>
      </Modal>
      )}

      {/* Cloudflare domain attachment modal */}
      {showDomainModal && domainModalProject && (
      <Modal
        open
        onClose={() => setShowDomainModal(false)}
        title="Attach Cloudflare domain"
        footer={
          <>
            <Button onClick={() => setShowDomainModal(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleAttachDomain}
              loading={cfDomainLoading}
              disabled={!cfZoneId || !cfSubdomain}
            >
              Attach domain
            </Button>
          </>
        }
      >
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Creates a CNAME record on your Cloudflare zone pointing to <span className="font-mono text-xs">{domainModalProject.tunnelUrl}</span>
          </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cloudflare Zone (domain)</label>
            {cfZonesLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading zones…</div>
            ) : cfZones.length === 0 ? (
              <div className="text-sm text-red-500">No zones found. Configure Cloudflare in Settings → Cloudflare first.</div>
            ) : (
              <select value={cfZoneId} onChange={(e) => setCfZoneId(e.target.value)} className="field text-sm">
                <option value="">— select a zone —</option>
                {cfZones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Subdomain</label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={cfSubdomain}
                onChange={(e) => setCfSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                className="flex-1 field text-sm font-mono"
                placeholder="myapp"
              />
              {cfZoneId && <span className="text-sm text-gray-500 dark:text-gray-400">.{cfZones.find((z) => z.id === cfZoneId)?.name}</span>}
            </div>
            {cfZoneId && cfSubdomain && (
              <p className="text-xs text-gray-400 mt-1">
                Will create: <span className="font-mono">{cfSubdomain}.{cfZones.find((z) => z.id === cfZoneId)?.name}</span> → <span className="font-mono">{domainModalProject.tunnelUrl}</span>
              </p>
            )}
          </div>
        </div>
      </Modal>
      )}
    </div>
  );
}
