import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
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
} from "lucide-react";
import { apiUrl } from "@/utils/api";

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [projectLogs, setProjectLogs] = useState<
    Array<{ containerId: string; logs: string }>
  >([]);
  const [showDeployLogs, setShowDeployLogs] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string>("");
  const [deployLogsTitle, setDeployLogsTitle] = useState<string>("");
  const [activeDeployProject, setActiveDeployProject] = useState<string | null>(
    null,
  );
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
  const [tunnelLoading, setTunnelLoading] = useState<string | null>(null);

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

  const handleCreateTunnel = async (projectName: string) => {
    try {
      setTunnelLoading(projectName);
      const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(projectName)}/tunnel`), {
        method: "POST",
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

  const handleStopTunnel = async (projectName: string) => {
    try {
      setTunnelLoading(projectName);
      const response = await fetch(apiUrl(`/api/projects/${encodeURIComponent(projectName)}/tunnel`), {
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
      const res = await fetch(apiUrl("/api/git-accounts"));
      const result = await res.json();
      if (result.success) setGitAccounts(result.data);
    } catch {}
  };

  const handleAddGitAccount = async () => {
    if (!gitToken.trim()) return;
    setGitAccountLoading(true);
    setGitAccountError(null);
    try {
      const res = await fetch(apiUrl("/api/git-accounts"), {
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
    await fetch(apiUrl(`/api/git-accounts/${encodeURIComponent(id)}`), { method: "DELETE" });
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
      const res = await fetch(apiUrl(`/api/git-accounts/${encodeURIComponent(account.id)}/repos`));
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
      const res = await fetch(apiUrl(`/api/git-accounts/${encodeURIComponent(selectedAccount!.id)}/repos/${owner}/${repoName}/branches`));
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
      const response = await fetch(apiUrl("/api/projects"));
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

      const response = await fetch(apiUrl("/api/projects"), {
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
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to add project");
      }

      await fetchProjects();
      setNewProject({
        name: "",
        repository: "",
        branch: "main",
        composeFile: "",
        environmentVars: [],
      });
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

  const openEnvModal = (project: Project) => {
    setEnvProject(project);
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

      const response = await fetch(apiUrl(`/api/projects/${envProject.name}`), {
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

  // Build project
  const handleBuildProject = async (projectName: string) => {
    try {
      const response = await fetch(
        apiUrl(`/api/projects/${projectName}/build`),
        {
          method: "POST",
        },
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to build project");
      }

      await fetchProjects();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to build project",
      );
    }
  };

  const handleSyncProject = async (projectName: string) => {
    const requestedAt = new Date().toLocaleString();
    try {
      setActionError(null);
      setDeployLogs("");
      setDeployLogsTitle(`Sync Logs: ${projectName} (${requestedAt})`);
      setShowDeployLogs(true);
      const response = await fetch(
        apiUrl(`/api/projects/${projectName}/sync`),
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
        },
      );

      const result = await response.json().catch(() => null);
      const logOutput = formatSyncLog(
        projectName,
        requestedAt,
        response.status,
        result,
      );

      if (!response.ok) {
        setDeployLogs(logOutput);
        throw new Error(
          result?.message || `Failed to sync project (${response.status})`,
        );
      }

      setDeployLogs(logOutput);
      await fetchProjects();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sync project";
      setActionError(message);
      setDeployLogs(
        (prev) =>
          prev ||
          `Project: ${projectName}\nRequested: ${requestedAt}\nResult: ${message}`,
      );
    }
  };

  // Deploy project
  const handleDeployProject = async (projectName: string) => {
    try {
      setDeployLogs("");
      setDeployLogsTitle(`Deploy Logs: ${projectName}`);
      setShowDeployLogs(true);
      setActiveDeployProject(projectName);

      window.dispatchEvent(
        new CustomEvent("subscribe_project_deploy", {
          detail: { projectName },
        }),
      );

      const response = await fetch(
        apiUrl(`/api/projects/${projectName}/deploy`),
        {
          method: "POST",
        },
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to deploy project");
      }

      const output = result?.data?.output || "(no output)";
      const command = result?.data?.command
        ? `Command: ${result.data.command}`
        : "";
      setDeployLogs((prev) => {
        if (prev) {
          return `${prev}\n\n${command}\n${output}`.trim();
        }
        return `${command}\n${output}`.trim();
      });
      await fetchProjects();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to deploy project";
      setActionError(message);
      setDeployLogs(message);
    }
  };

  useEffect(() => {
    if (!showDeployLogs || !activeDeployProject) {
      return;
    }

    const onDeployLog = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        projectName?: string;
        stream?: "stdout" | "stderr";
        chunk?: string;
        timestamp?: string;
      };

      if (!detail?.projectName || detail.projectName !== activeDeployProject) {
        return;
      }

      const chunk = detail.chunk || "";
      if (!chunk) {
        return;
      }

      setDeployLogs((prev) => `${prev}${chunk}`);
    };

    const onDeployStatus = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        projectName?: string;
        status?: "started" | "completed" | "failed";
        timestamp?: string;
        error?: string;
      };

      if (!detail?.projectName || detail.projectName !== activeDeployProject) {
        return;
      }

      if (detail.status === "failed" && detail.error) {
        setDeployLogs((prev) => `${prev}\n${detail.error}\n`);
      }
    };

    window.addEventListener("project_deploy_log", onDeployLog);
    window.addEventListener("project_deploy_status", onDeployStatus);

    return () => {
      window.removeEventListener("project_deploy_log", onDeployLog);
      window.removeEventListener("project_deploy_status", onDeployStatus);

      window.dispatchEvent(
        new CustomEvent("unsubscribe_project_deploy", {
          detail: { projectName: activeDeployProject },
        }),
      );
    };
  }, [showDeployLogs, activeDeployProject]);

  // Stop project
  const handleStopProject = async (projectName: string) => {
    try {
      const response = await fetch(
        apiUrl(`/api/projects/${projectName}/stop`),
        {
          method: "POST",
        },
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to stop project");
      }

      await fetchProjects();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to stop project",
      );
    }
  };

  const fetchProjectLogs = async (projectName: string) => {
    try {
      setLogsLoading(true);
      const response = await fetch(apiUrl(`/api/projects/${projectName}/logs`));
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

  // Delete project
  const handleDeleteProject = async (projectName: string) => {
    if (!confirm(`Are you sure you want to delete project "${projectName}"?`)) {
      return;
    }

    try {
      const response = await fetch(apiUrl(`/api/projects/${projectName}`), {
        method: "DELETE",
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to delete project");
      }

      await fetchProjects();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete project",
      );
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchGitAccounts();
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
        return <Square className="w-4 h-4 text-gray-600" />;
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
        return "text-gray-600";
      case "error":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const filteredProjects = projects.filter(
    (project) =>
      project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      project.repoUrl.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Loading Projects...
          </h2>
          <p className="text-gray-500">Fetching project data</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-light text-gray-900 mb-2">
            Error Loading Projects
          </h2>
          <p className="text-gray-500 mb-4">{error}</p>
          <button
            onClick={fetchProjects}
            className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {actionError && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 flex items-center justify-between">
            <div className="text-sm">{actionError}</div>
            <button
              onClick={() => setActionError(null)}
              className="text-red-600 hover:text-red-800 text-sm"
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-light text-gray-900 tracking-tight">
            Projects
          </h1>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Project
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project, index) => (
            <div
              key={index}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center min-w-0">
                  {getStatusIcon(project.status)}
                  <h3
                    className="ml-2 text-lg font-semibold text-gray-900 truncate max-w-[12rem] sm:max-w-[16rem] lg:max-w-[14rem]"
                    title={project.name}
                  >
                    {project.name}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    onClick={() => handleBuildProject(project.name)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors duration-200"
                    title="Build"
                  >
                    <Code2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleSyncProject(project.name)}
                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors duration-200"
                    title="Sync Repo"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeployProject(project.name)}
                    className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors duration-200"
                    title="Deploy"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleStopProject(project.name)}
                    className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition-colors duration-200"
                    title="Stop"
                  >
                    <Square className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleViewLogs(project)}
                    className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors duration-200"
                    title="Logs"
                  >
                    <Terminal className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEnvModal(project)}
                    className="p-1.5 text-gray-600 hover:bg-gray-50 rounded transition-colors duration-200"
                    title="Environment Vars"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  {project.tunnelId ? (
                    <button
                      onClick={() => handleStopTunnel(project.name)}
                      disabled={tunnelLoading === project.name}
                      className="p-1.5 text-orange-600 hover:bg-orange-50 rounded transition-colors duration-200 disabled:opacity-50"
                      title="Stop Tunnel"
                    >
                      <Link2Off className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleCreateTunnel(project.name)}
                      disabled={tunnelLoading === project.name}
                      className="p-1.5 text-teal-600 hover:bg-teal-50 rounded transition-colors duration-200 disabled:opacity-50"
                      title="Create Tunnel"
                    >
                      <Globe className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteProject(project.name)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors duration-200"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Repository:</span>
                  <a
                    href={project.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 flex items-center max-w-[10rem] sm:max-w-[14rem] truncate"
                    title={project.repoUrl}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    <span className="truncate">
                      {project.repoUrl.split("/").pop()}
                    </span>
                  </a>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Branch:</span>
                  <span className="font-medium flex items-center">
                    <GitBranch className="w-3 h-3 mr-1" />
                    {project.branch}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Status:</span>
                  <span
                    className={`font-medium ${getStatusColor(project.status)}`}
                  >
                    {project.status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Containers:</span>
                  <span className="font-medium">
                    {project.containers.length}
                  </span>
                </div>

                {project.ports && project.ports.length > 0 && (
                  <div className="flex items-start justify-between text-sm">
                    <span className="text-gray-500">Ports:</span>
                    <div className="text-right space-y-1">
                      {project.ports.map((port, portIndex) => (
                        <div key={portIndex} className="font-medium text-xs">
                          <span className="text-blue-600">
                            {port.hostPort ? `${port.hostPort}:` : ""}
                            {port.containerPort}
                          </span>
                          <span className="text-gray-400 ml-1">
                            {port.service}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Tunnel:</span>
                  {project.tunnelUrl ? (
                    <div className="flex items-center gap-1 max-w-[12rem]">
                      <a
                        href={`https://${project.tunnelUrl}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 hover:text-teal-800 text-xs truncate"
                        title={`https://${project.tunnelUrl}`}
                      >
                        {project.tunnelUrl}
                      </a>
                      <button
                        onClick={() => navigator.clipboard.writeText(`https://${project.tunnelUrl}`)}
                        className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
                        title="Copy URL"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">
                      {tunnelLoading === project.name ? "Creating..." : "None"}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Resources:</span>
                  <span className="font-medium text-xs">
                    {project.resourceLimits.memory} /{" "}
                    {project.resourceLimits.cpu} CPU
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Created:</span>
                  <span className="font-medium">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {project.healthChecks.length > 0 && (
                  <div className="pt-4 border-t border-gray-200">
                    <div className="text-sm text-gray-500 mb-2">
                      Health Checks:
                    </div>
                    <div className="space-y-1">
                      {project.healthChecks.slice(0, 2).map((check, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-gray-600">{check.name}</span>
                          <span
                            className={`${
                              check.status === "healthy"
                                ? "text-green-600"
                                : check.status === "unhealthy"
                                  ? "text-red-600"
                                  : "text-gray-500"
                            }`}
                          >
                            {check.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {filteredProjects.length === 0 && (
          <div className="text-center py-12">
            <Code2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No projects found
            </h3>
            <p className="text-gray-500">
              Get started by adding your first project
            </p>
          </div>
        )}
      </div>

      {/* Add Project Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-2xl w-full m-4 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Add New Project</h3>
              {/* Mode tabs */}
              <div className="flex mt-3 space-x-1 bg-gray-100 rounded-lg p-1 w-fit">
                <button
                  onClick={() => setAddMode("manual")}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${addMode === "manual" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Manual URL
                </button>
                <button
                  onClick={() => { setAddMode("browse"); if (gitAccounts.length > 0 && !selectedAccount) handleSelectAccount(gitAccounts[0]); }}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${addMode === "browse" ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
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
                    <span className="text-sm font-medium text-gray-700">Git Account:</span>
                    <div className="flex gap-2 flex-wrap">
                      {gitAccounts.map((acc) => (
                        <button
                          key={acc.id}
                          onClick={() => handleSelectAccount(acc)}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border transition-colors ${selectedAccount?.id === acc.id ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 hover:border-gray-500"}`}
                        >
                          <Github className="w-3 h-3" />
                          {acc.username}
                        </button>
                      ))}
                      <button
                        onClick={() => setShowGitAccountModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm border border-dashed border-gray-300 hover:border-blue-400 text-gray-500 hover:text-blue-600 transition-colors"
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
                          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="border border-gray-200 rounded-lg overflow-y-auto max-h-48">
                        {reposLoading ? (
                          <div className="p-4 text-center text-sm text-gray-500">Loading repositories...</div>
                        ) : repos.filter(r => r.name.toLowerCase().includes(repoSearch.toLowerCase())).length === 0 ? (
                          <div className="p-4 text-center text-sm text-gray-500">No repositories found</div>
                        ) : (
                          repos.filter(r => r.name.toLowerCase().includes(repoSearch.toLowerCase())).map((repo) => (
                            <button
                              key={repo.id}
                              onClick={() => handleSelectRepo(repo)}
                              className={`w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors ${selectedRepo?.id === repo.id ? "bg-blue-50" : ""}`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <BookOpen className="w-4 h-4 text-gray-400" />
                                  <span className="text-sm font-medium text-gray-900">{repo.name}</span>
                                  {repo.private && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">private</span>}
                                </div>
                                <span className="text-xs text-gray-400">{repo.defaultBranch}</span>
                              </div>
                              {repo.description && <p className="text-xs text-gray-500 mt-0.5 truncate pl-6">{repo.description}</p>}
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}

                  {!selectedAccount && gitAccounts.length === 0 && (
                    <div className="text-center py-6 text-sm text-gray-500">
                      No git accounts connected.{" "}
                      <button onClick={() => setShowGitAccountModal(true)} className="text-blue-600 hover:underline">Connect one</button> to browse repositories.
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
                  <input
                    type="text"
                    value={newProject.name}
                    onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter project name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Repository URL</label>
                  <input
                    type="text"
                    value={newProject.repository}
                    onChange={(e) => setNewProject({ ...newProject, repository: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://github.com/user/repo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                  {branches.length > 0 ? (
                    <select
                      value={newProject.branch}
                      onChange={(e) => setNewProject({ ...newProject, branch: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={newProject.branch}
                      onChange={(e) => setNewProject({ ...newProject, branch: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={branchesLoading ? "Loading branches..." : "main"}
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Compose File Path</label>
                  <input
                    type="text"
                    value={newProject.composeFile}
                    onChange={(e) => setNewProject({ ...newProject, composeFile: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="docker-compose.yml (default)"
                  />
                  <p className="text-xs text-gray-400 mt-1">Relative path from repo root, e.g. <code>infra/docker-compose.yml</code></p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Environment Variables</label>
                    <button onClick={addEnvironmentVar} className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md flex items-center">
                      <Plus className="w-3 h-3 mr-1" />Add Variable
                    </button>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {newProject.environmentVars.map((env, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input type="text" placeholder="KEY" value={env.key} onChange={(e) => updateEnvironmentVar(index, "key", e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                        <input type="text" placeholder="VALUE" value={env.value} onChange={(e) => updateEnvironmentVar(index, "value", e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                        <button onClick={() => removeEnvironmentVar(index)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                    {newProject.environmentVars.length === 0 && <div className="text-center py-4 text-gray-500 text-sm">No environment variables configured</div>}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end space-x-3">
              <button onClick={() => { setShowAddModal(false); setAddMode("manual"); setSelectedRepo(null); setBranches([]); }} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Cancel</button>
              <button onClick={handleAddProject} className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg">Add Project</button>
            </div>
          </div>
        </div>
      )}

      {/* Connect Git Account Modal */}
      {showGitAccountModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full m-4">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Connect Git Account</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <div className="flex gap-2">
                  {(["github", "gitlab"] as const).map((p) => (
                    <button key={p} onClick={() => setGitProvider(p)} className={`flex-1 py-2 rounded-lg border text-sm capitalize transition-colors ${gitProvider === p ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 hover:border-gray-500"}`}>{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Personal Access Token</label>
                <input
                  type="password"
                  value={gitToken}
                  onChange={(e) => setGitToken(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={gitProvider === "github" ? "ghp_..." : "glpat-..."}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {gitProvider === "github" ? "Needs repo scope. Create at GitHub → Settings → Developer settings → PATs." : "Needs read_api scope. Create at GitLab → User Settings → Access Tokens."}
                </p>
              </div>
              {gitAccountError && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{gitAccountError}</div>}

              {gitAccounts.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Connected Accounts</div>
                  {gitAccounts.map((acc) => (
                    <div key={acc.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2 text-sm">
                        <Github className="w-4 h-4 text-gray-500" />
                        <span className="font-medium">{acc.username}</span>
                        <span className="text-gray-400 capitalize">({acc.provider})</span>
                      </div>
                      <button onClick={() => handleRemoveGitAccount(acc.id)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end space-x-3">
              <button onClick={() => { setShowGitAccountModal(false); setGitToken(""); setGitAccountError(null); }} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">Close</button>
              <button onClick={handleAddGitAccount} disabled={gitAccountLoading || !gitToken.trim()} className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg disabled:opacity-50">
                {gitAccountLoading ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showLogsModal && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-3xl w-full m-4">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Terminal className="w-5 h-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  Logs: {selectedProject.name}
                </h3>
              </div>
              <button
                onClick={() => setShowLogsModal(false)}
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                title="Close"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-auto">
              {logsLoading ? (
                <div className="text-sm text-gray-500">Loading logs...</div>
              ) : projectLogs.length === 0 ? (
                <div className="text-sm text-gray-500">
                  No logs found for this project.
                </div>
              ) : (
                <div className="space-y-4">
                  {projectLogs.map((entry) => (
                    <div key={entry.containerId}>
                      <div className="text-xs text-gray-500 mb-1">
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
            <div className="p-4 border-t border-gray-200 flex justify-end">
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
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-2xl w-full m-4">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Settings className="w-5 h-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">
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
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                title="Close"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Repository URL
                  </label>
                  <input
                    type="text"
                    value={repoUrlEditor}
                    onChange={(e) => setRepoUrlEditor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://github.com/user/repo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Branch
                  </label>
                  <input
                    type="text"
                    value={branchEditor}
                    onChange={(e) => setBranchEditor(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="main"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Compose File
                </label>
                <input
                  type="text"
                  value={composeFileEditor}
                  onChange={(e) => setComposeFileEditor(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="docker-compose.yml"
                />
              </div>

              <div className="mb-6">
                <div className="text-sm font-medium text-gray-700 mb-2">
                  Port Mappings
                </div>
                {portEditor.length === 0 ? (
                  <div className="text-sm text-gray-500">
                    No ports detected in compose file.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {portEditor.map((port, index) => (
                      <div
                        key={`${port.service}-${port.containerPort}-${port.protocol}-${index}`}
                        className="grid grid-cols-4 gap-2 items-center"
                      >
                        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 truncate">
                          {port.service}
                        </div>
                        <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700">
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
                          className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="Host port"
                        />
                        <div className="text-xs text-gray-500">
                          Leave blank to keep unchanged
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium text-gray-700">
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
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="VALUE"
                      value={env.value}
                      onChange={(e) =>
                        updateEnvEditorRow(index, "value", e.target.value)
                      }
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Add Variable
                </button>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowEnvModal(false);
                  setEnvProject(null);
                  setEnvEditor([]);
                  setRepoUrlEditor("");
                  setBranchEditor("");
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors duration-200"
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

      {showDeployLogs && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-3xl w-full m-4">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Terminal className="w-5 h-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">
                  {deployLogsTitle}
                </h3>
              </div>
              <button
                onClick={() => setShowDeployLogs(false)}
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                title="Close"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-auto">
              {deployLogs ? (
                <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-auto whitespace-pre-wrap">
                  {deployLogs}
                </pre>
              ) : (
                <div className="text-sm text-gray-500">
                  Deploying... please wait.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
