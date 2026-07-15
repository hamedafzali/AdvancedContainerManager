import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { apiFetch, apiPost } from "@/utils/api";
import ProjectEnvironments from "@/components/ProjectEnvironments";
import { useTasks } from "@/hooks/useTasks";
import {
  Button,
  IconButton,
  ConfirmDialog,
  DropdownMenu,
  ErrorBanner,
  EmptyState,
  LoadingState,
  PageHeader,
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
  status: "configured" | "building" | "built" | "running" | "stopped" | "error";
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
  const [logsLoading, setLogsLoading] = useState(false);
  const [projectLogs, setProjectLogs] = useState<
    Array<{ containerId: string; logs: string }>
  >([]);
  const [pendingProjects, setPendingProjects] = useState<
    Record<string, string>
  >({});
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
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
      const res = await apiFetch(`/api/git-accounts/${encodeURIComponent(account.id)}/repos`);
      const result = await res.json();
      if (result.success) setRepos(result.data);
    } catch {}
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
      const res = await apiFetch(`/api/git-accounts/${encodeURIComponent(selectedAccount!.id)}/repos/${owner}/${repoName}/branches`);
      const result = await res.json();
      if (result.success) setBranches(result.data);
    } catch {}
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
      return;
    }

    try {
      // Convert environment vars array to object
      const envVarsObject = newProject.environmentVars.reduce(
        (acc, env) => {
          if (env.key && env.value) {
            acc[env.key] = env.value;
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
      setActionError(
        err instanceof Error ? err.message : "Failed to add project",
      );
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
      const res = await apiFetch(`/api/projects/${encodeURIComponent(projectName)}/webhook/generate`, { method: "POST" });
      const result = await res.json();
      if (result.success) setWebhookSecret(result.data.secret);
    } catch {}
    setWebhookLoading(false);
  };

  const openEnvModal = (project: Project) => {
    setEnvProject(project);
    setWebhookSecret(null);
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
    const conflicts = await checkPortConflicts(projectName);
    if (conflicts.length > 0) {
      setActionError(`Port conflicts: ${conflicts.join(" · ")}`);
      return;
    }
    setPending(projectName, "deploying");
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
    const conflicts = await checkPortConflicts(projectName);
    if (conflicts.length > 0) {
      setActionError(`Port conflicts: ${conflicts.join(" · ")}`);
      return;
    }
    setPending(projectName, "deploying");
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

  // Stop project (production)
  const handleStopProject = async (projectName: string) => {
    setPending(projectName, "stopping prod");
    try {
      await apiPost(`/api/projects/${encodeURIComponent(projectName)}/stop`);
      await fetchProjects();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to stop project",
      );
    } finally {
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
    try {
      await apiPost(
        `/api/projects/${encodeURIComponent(projectName)}/environments/dev/stop`,
      );
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to stop dev environment",
      );
    } finally {
      setPending(projectName, null);
    }
  };

  const handleRestartEnv = async (projectName: string, env: "dev" | "prod") => {
    setPending(projectName, `restarting ${env}`);
    try {
      await apiPost(
        `/api/projects/${encodeURIComponent(projectName)}/environments/${env}/restart`,
      );
      await fetchProjects();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : `Failed to restart ${env}`,
      );
    } finally {
      setPending(projectName, null);
    }
  };

  const fetchProjectLogs = async (projectName: string) => {
    try {
      setLogsLoading(true);
      const response = await apiFetch(`/api/projects/${projectName}/logs`);
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
    setShowLogsModal(true);
    fetchProjectLogs(project.name);
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
        prev.map((p) =>
          p.name === projectName
            ? { ...p, status: health.overall === "unhealthy" ? "error" : p.status }
            : p,
        ),
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

  const getStatusIcon = (status: Project["status"]) => {
    switch (status) {
      case "configured":
        return <CheckCircle className="w-4 h-4 text-blue-600" />;
      case "building":
        return <Clock className="w-4 h-4 text-yellow-600 animate-pulse" />;
      case "built":
        return <CheckCircle className="w-4 h-4 text-indigo-600" />;
      case "running":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "stopped":
        return <Square className="w-4 h-4 text-gray-600 dark:text-gray-300" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: Project["status"]) => {
    switch (status) {
      case "configured":
        return "text-blue-600";
      case "building":
        return "text-yellow-600";
      case "built":
        return "text-indigo-600";
      case "running":
        return "text-green-600";
      case "stopped":
        return "text-gray-600 dark:text-gray-300";
      case "error":
        return "text-red-600";
      default:
        return "text-gray-600 dark:text-gray-300";
    }
  };

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.repoUrl.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (loading && projects.length === 0 && !error) {
    return <LoadingState label="Fetching project data…" />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} projects`}
        actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search projects…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowAddModal(true)}
            >
              Add Project
            </Button>
          </div>
        }
      />

      <ErrorBanner
        message={error}
        onDismiss={() => setError(null)}
        onRetry={fetchProjects}
      />
      <ErrorBanner
        message={actionError}
        onDismiss={() => setActionError(null)}
      />

      <div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((project, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col hover:shadow-md hover:border-gray-300 transition-all duration-200"
            >
              {/* Card header — status stripe */}
              <div className={`h-1 rounded-t-2xl ${
                project.status === "running" ? "bg-green-400" :
                project.status === "error" ? "bg-red-400" :
                project.status === "building" ? "bg-yellow-400" :
                project.status === "built" ? "bg-indigo-400" :
                project.status === "stopped" ? "bg-gray-300" :
                "bg-blue-300"
              }`} />

              <div className="p-5 flex flex-col flex-1">
                {/* Title row — full width, status badge beside name */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    {getStatusIcon(project.status)}
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 break-all leading-snug" title={project.name}>
                      {project.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      project.status === "running" ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" :
                      project.status === "error" ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" :
                      project.status === "building" ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300" :
                      project.status === "built" ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300" :
                      project.status === "stopped" ? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" :
                      "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                    }`}>
                      {project.status}
                    </span>
                    {project.containers.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                        <Activity className="w-3 h-3" />
                        {project.containers.length} container{project.containers.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Info rows */}
                <div className="space-y-2.5 flex-1">
                  {/* Repo */}
                  <div className="flex items-center gap-2 text-sm">
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <a
                      href={project.repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 truncate min-w-0"
                      title={project.repoUrl}
                    >
                      {project.repoUrl.replace(/^https?:\/\//, "").replace(/\.git$/, "")}
                    </a>
                  </div>

                  {/* Branch */}
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                    <GitBranch className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{project.branch}</span>
                  </div>

                  {/* Ports + conflict warnings */}
                  {project.ports && project.ports.length > 0 && (
                    <div className="flex items-start gap-2 text-sm">
                      <Shield className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${portConflicts[project.name]?.length ? "text-red-400" : "text-gray-400"}`} />
                      <div className="flex flex-wrap gap-1">
                        {project.ports.map((port, pi) => {
                          const hasConflict = (portConflicts[project.name] || []).some((c) =>
                            c.includes(`port ${port.hostPort}`)
                          );
                          return (
                            <span
                              key={pi}
                              title={hasConflict ? portConflicts[project.name].find((c) => c.includes(`port ${port.hostPort}`)) : undefined}
                              className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                                hasConflict
                                  ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 ring-1 ring-red-300"
                                  : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                              }`}
                            >
                              {port.hostPort ? `${port.hostPort}→` : ""}{port.containerPort}
                              <span className={`ml-1 ${hasConflict ? "text-red-400" : "text-blue-400"}`}>{port.service}</span>
                              {hasConflict && <span className="ml-1">⚠</span>}
                            </span>
                          );
                        })}
                        {conflictChecking === project.name && (
                          <span className="text-xs text-gray-400 italic">checking…</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tunnel */}
                  {project.tunnelUrl && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Globe className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                        <a href={`https://${project.tunnelUrl}`} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-800 text-xs truncate min-w-0">
                          {project.tunnelUrl}
                        </a>
                        <button onClick={() => navigator.clipboard.writeText(`https://${project.tunnelUrl}`)} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0" title="Copy tunnel URL">
                          <Copy className="w-3 h-3" />
                        </button>
                        {(project as any).tunnelService && (
                          <span className="text-xs text-teal-400 shrink-0">({(project as any).tunnelService}:{(project as any).tunnelPort})</span>
                        )}
                      </div>
                      {(project as any).tunnelDomain ? (
                        <div className="flex items-center gap-2 pl-5">
                          <a href={`https://${(project as any).tunnelDomain}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-xs truncate font-medium">
                            {(project as any).tunnelDomain}
                          </a>
                          <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 px-1 rounded">CF</span>
                          <button onClick={() => navigator.clipboard.writeText(`https://${(project as any).tunnelDomain}`)} className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0" title="Copy domain">
                            <Copy className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDetachDomain(project.name)} className="text-xs text-red-400 hover:text-red-600 shrink-0">remove</button>
                        </div>
                      ) : (
                        <button onClick={() => openDomainModal(project)} className="pl-5 text-xs text-blue-500 hover:text-blue-700 text-left">
                          + Attach Cloudflare domain
                        </button>
                      )}
                    </div>
                  )}

                  {/* Resources */}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Zap className="w-3.5 h-3.5 shrink-0" />
                    <span>{project.resourceLimits.memory} · {project.resourceLimits.cpu} CPU</span>
                    <span className="ml-auto">{new Date(project.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Action toolbar — dev workflow first, prod deploy last */}
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-0.5">
                    <IconButton
                      label="Start dev environment"
                      tone="success"
                      loading={pendingProjects[project.name] === "starting dev"}
                      disabled={Boolean(pendingProjects[project.name])}
                      onClick={() => handleStartDev(project.name)}
                    >
                      <Play className="w-4 h-4" />
                    </IconButton>
                    <IconButton
                      label="Stop dev environment"
                      loading={pendingProjects[project.name] === "stopping dev"}
                      disabled={Boolean(pendingProjects[project.name])}
                      onClick={() => handleStopDev(project.name)}
                    >
                      <Square className="w-4 h-4" />
                    </IconButton>
                    <IconButton
                      label="Restart dev environment"
                      tone="info"
                      loading={
                        pendingProjects[project.name] === "restarting dev"
                      }
                      disabled={Boolean(pendingProjects[project.name])}
                      onClick={() => handleRestartEnv(project.name, "dev")}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </IconButton>
                    <IconButton
                      label="Container logs"
                      onClick={() => handleViewLogs(project)}
                    >
                      <Terminal className="w-4 h-4" />
                    </IconButton>
                    {pendingProjects[project.name] && (
                      <span className="inline-flex items-center gap-1.5 ml-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        {pendingProjects[project.name]}…
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      className="!px-2.5 !py-1 !text-xs"
                      icon={<Zap className="w-3.5 h-3.5" />}
                      loading={pendingProjects[project.name] === "deploying"}
                      disabled={Boolean(pendingProjects[project.name])}
                      onClick={() => handleSyncDeploy(project.name)}
                      title="Sync repository, then deploy to production"
                    >
                      Deploy
                    </Button>
                    <DropdownMenu
                      items={[
                        {
                          label: "Deploy prod (no sync)",
                          icon: <Zap className="w-4 h-4" />,
                          disabled: Boolean(pendingProjects[project.name]),
                          onClick: () => handleDeployProject(project.name),
                        },
                        {
                          label: "Restart production",
                          icon: <RefreshCw className="w-4 h-4" />,
                          disabled: Boolean(pendingProjects[project.name]),
                          onClick: () => handleRestartEnv(project.name, "prod"),
                        },
                        {
                          label: "Stop production",
                          icon: <Square className="w-4 h-4" />,
                          disabled: Boolean(pendingProjects[project.name]),
                          onClick: () => handleStopProject(project.name),
                        },
                        {
                          label: "Sync repo (git pull)",
                          icon: <GitBranch className="w-4 h-4" />,
                          disabled: Boolean(pendingProjects[project.name]),
                          dividerAbove: true,
                          onClick: () => handleSyncProject(project.name),
                        },
                        {
                          label: "Build images",
                          icon: <Code2 className="w-4 h-4" />,
                          disabled: Boolean(pendingProjects[project.name]),
                          onClick: () => handleBuildProject(project.name),
                        },
                        {
                          label: "Pipeline",
                          icon: <Workflow className="w-4 h-4" />,
                          onClick: () =>
                            navigate(
                              `/pipelines?project=${encodeURIComponent(project.name)}`,
                            ),
                        },
                        project.tunnelId
                          ? {
                              label: "Stop tunnel",
                              icon: <Link2Off className="w-4 h-4" />,
                              disabled: tunnelLoading === project.name,
                              onClick: () => handleStopTunnel(project.name),
                            }
                          : {
                              label: "Create tunnel",
                              icon: <Globe className="w-4 h-4" />,
                              disabled: tunnelLoading === project.name,
                              onClick: () => openTunnelModal(project),
                            },
                        {
                          label: "Settings",
                          icon: <Settings className="w-4 h-4" />,
                          onClick: () => openEnvModal(project),
                        },
                        {
                          label: "Delete project",
                          icon: <Trash2 className="w-4 h-4" />,
                          danger: true,
                          dividerAbove: true,
                          onClick: () => setDeleteTarget(project),
                        },
                      ]}
                    />
                  </div>
                </div>
                <ProjectEnvironments projectName={project.name} />
              </div>
            </div>
          ))}
        </div>

        {filteredProjects.length === 0 && (
          <EmptyState
            icon={<Code2 className="w-6 h-6" />}
            title={
              projects.length === 0
                ? "No projects yet"
                : "No projects match your search"
            }
            description={
              projects.length === 0
                ? "Connect a Git repository and deploy it with docker-compose in a couple of clicks."
                : "Try a different search term."
            }
            action={
              projects.length === 0 ? (
                <Button
                  variant="primary"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setShowAddModal(true)}
                >
                  Add your first project
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

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
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-2xl w-full m-4 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add New Project</h3>
              {/* Mode tabs */}
              <div className="flex mt-3 space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1 w-fit">
                <button
                  onClick={() => setAddMode("manual")}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${addMode === "manual" ? "bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
                >
                  Manual URL
                </button>
                <button
                  onClick={() => { setAddMode("browse"); if (gitAccounts.length > 0 && !selectedAccount) handleSelectAccount(gitAccounts[0]); }}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${addMode === "browse" ? "bg-white dark:bg-gray-800 shadow text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
                >
                  Browse Repositories
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
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
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-colors ${selectedAccount?.id === acc.id ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 dark:border-gray-600 hover:border-gray-500"}`}
                        >
                          <Github className="w-3 h-3" />
                          {acc.username}
                        </button>
                      ))}
                      <button
                        onClick={() => setShowGitAccountModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 text-gray-500 dark:text-gray-400 hover:text-blue-600 transition-colors"
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
                          className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                              className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${selectedRepo?.id === repo.id ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
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
                      <button onClick={() => setShowGitAccountModal(true)} className="text-blue-600 hover:underline">Connect one</button> to browse repositories.
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Name</label>
                  <input
                    type="text"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter project name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Repository URL</label>
                  <input
                    type="text"
                    value={newProject.repository}
                    onChange={(e) => setNewProject({ ...newProject, repository: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://github.com/user/repo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Branch</label>
                  {branches.length > 0 ? (
                    <select
                      value={newProject.branch}
                      onChange={(e) => setNewProject({ ...newProject, branch: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={newProject.branch}
                      onChange={(e) => setNewProject({ ...newProject, branch: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                          className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${newProject.composeFile === f ? "bg-blue-50 dark:bg-blue-900/20 border-blue-400 text-blue-700 dark:text-blue-300" : "border-gray-200 dark:border-gray-700 hover:border-gray-400"}`}
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
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="docker-compose.yml (default)"
                      />
                      <p className="text-xs text-gray-400 mt-1">Relative path from repo root, e.g. <code>infra/docker-compose.yml</code></p>
                    </>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Environment Variables</label>
                    <button onClick={addEnvironmentVar} className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center">
                      <Plus className="w-3 h-3 mr-1" />Add Variable
                    </button>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {newProject.environmentVars.map((env, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input type="text" placeholder="KEY" value={env.key} onChange={(e) => updateEnvironmentVar(index, "key", e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                        <input type="text" placeholder="VALUE" value={env.value} onChange={(e) => updateEnvironmentVar(index, "value", e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                        <button onClick={() => removeEnvironmentVar(index)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                    {newProject.environmentVars.length === 0 && <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">No environment variables configured</div>}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button onClick={() => { setShowAddModal(false); setAddMode("manual"); setSelectedRepo(null); setBranches([]); setDetectedComposeFiles([]); }} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">Cancel</button>
              {detectedComposeFiles.length > 1 ? (
                <button
                  onClick={async () => {
                    if (!newProject.composeFile) return;
                    await apiFetch(`/api/projects/${encodeURIComponent(newProject.name)}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ composeFile: newProject.composeFile }),
                    });
                    await fetchProjects();
                    setNewProject({ name: "", repository: "", branch: "main", composeFile: "", environmentVars: [] });
                    setDetectedComposeFiles([]);
                    setSelectedRepo(null);
                    setBranches([]);
                    setShowAddModal(false);
                  }}
                  disabled={!newProject.composeFile}
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg disabled:opacity-50"
                >
                  Use Selected
                </button>
              ) : (
                <button onClick={handleAddProject} className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg">Add Project</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Connect Git Account Modal */}
      {showGitAccountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-md w-full m-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Connect Git Account</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                <div className="flex gap-2">
                  {(["github", "gitlab"] as const).map((p) => (
                    <button key={p} onClick={() => setGitProvider(p)} className={`flex-1 py-2 rounded-lg border text-sm capitalize transition-colors ${gitProvider === p ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 dark:border-gray-600 hover:border-gray-500"}`}>{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Personal Access Token</label>
                <input
                  type="password"
                  value={gitToken}
                  onChange={(e) => setGitToken(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button onClick={() => { setShowGitAccountModal(false); setGitToken(""); setGitAccountError(null); }} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg">Close</button>
              <button onClick={handleAddGitAccount} disabled={gitAccountLoading || !gitToken.trim()} className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg disabled:opacity-50">
                {gitAccountLoading ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLogsModal && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-3xl w-full m-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Terminal className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Logs: {selectedProject.name}
                </h3>
              </div>
              <button
                onClick={() => setShowLogsModal(false)}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Close"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-auto">
              {logsLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">Loading logs...</div>
              ) : projectLogs.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  No logs found for this project.
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
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
              <button
                onClick={() => fetchProjectLogs(selectedProject.name)}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200"
              >
                Refresh Logs
              </button>
            </div>
          </div>
        </div>
      )}

      {showEnvModal && envProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-2xl w-full m-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Environment Vars: {envProject.name}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowEnvModal(false);
                  setEnvProject(null);
                  setEnvEditor([]);
                  setRepoUrlEditor("");
                  setBranchEditor("");
                  setComposeFileEditor("");
                  setPortEditor([]);
                }}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                title="Close"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Repository URL
                  </label>
                  <input
                    type="text"
                    value={repoUrlEditor}
                    onChange={(e) => setRepoUrlEditor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://github.com/user/repo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Branch
                  </label>
                  <input
                    type="text"
                    value={branchEditor}
                    onChange={(e) => setBranchEditor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="main"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Compose File
                </label>
                <input
                  type="text"
                  value={composeFileEditor}
                  onChange={(e) => setComposeFileEditor(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  <button onClick={() => handleGenerateWebhook(envProject!.name)} disabled={webhookLoading} className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-800 disabled:opacity-50">
                    {webhookLoading ? "Generating..." : webhookSecret ? "Regenerate Secret" : "Generate Secret"}
                  </button>
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
                          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
                {envEditor.map((env, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="KEY"
                      value={env.key}
                      onChange={(e) =>
                        updateEnvEditorRow(index, "key", e.target.value)
                      }
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="VALUE"
                      value={env.value}
                      onChange={(e) =>
                        updateEnvEditorRow(index, "value", e.target.value)
                      }
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => removeEnvEditorRow(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <button
                  onClick={addEnvEditorRow}
                  className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Add Variable
                </button>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowEnvModal(false);
                  setEnvProject(null);
                  setEnvEditor([]);
                  setRepoUrlEditor("");
                  setBranchEditor("");
                }}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEnvVars}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Port picker modal for multi-port tunnel creation */}
      {showTunnelModal && tunnelModalProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-sm w-full m-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Choose port to expose</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                <span className="font-medium">{tunnelModalProject.name}</span> has multiple ports. Pick the one to make public.
              </p>
            </div>
            <div className="p-6 space-y-2">
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
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowTunnelModal(false)} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm">Cancel</button>
              <button
                onClick={() => handleCreateTunnel(tunnelModalProject.name, tunnelSelectedPort!)}
                disabled={!tunnelSelectedPort || tunnelLoading === tunnelModalProject.name}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {tunnelLoading === tunnelModalProject.name ? "Creating..." : "Create Tunnel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cloudflare domain attachment modal */}
      {showDomainModal && domainModalProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-md w-full m-4">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Attach Cloudflare Domain</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Creates a CNAME record on your Cloudflare zone pointing to <span className="font-mono text-xs">{domainModalProject.tunnelUrl}</span>
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cloudflare Zone (domain)</label>
                {cfZonesLoading ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400">Loading zones…</div>
                ) : cfZones.length === 0 ? (
                  <div className="text-sm text-red-500">No zones found. Configure Cloudflare in Settings → Cloudflare first.</div>
                ) : (
                  <select value={cfZoneId} onChange={(e) => setCfZoneId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
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
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
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
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button onClick={() => setShowDomainModal(false)} className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm">Cancel</button>
              <button
                onClick={handleAttachDomain}
                disabled={cfDomainLoading || !cfZoneId || !cfSubdomain}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50"
              >
                {cfDomainLoading ? "Creating CNAME…" : "Attach Domain"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
