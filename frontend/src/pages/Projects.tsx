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
  status: "configured" | "building" | "running" | "stopped" | "failed";
  createdAt: string;
  lastUpdated: string;
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
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [envProject, setEnvProject] = useState<Project | null>(null);
  const [envEditor, setEnvEditor] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [newProject, setNewProject] = useState({
    name: "",
    repository: "",
    branch: "main",
    environmentVars: [] as Array<{ key: string; value: string }>,
  });

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
          environmentVars: envVarsObject,
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
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update environment vars",
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
    try {
      setDeployLogs("");
      setDeployLogsTitle(`Sync Logs: ${projectName}`);
      setShowDeployLogs(true);
      const response = await fetch(
        apiUrl(`/api/projects/${projectName}/sync`),
        {
          method: "POST",
        },
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.message || "Failed to sync project");
      }

      const output = result?.data?.output || "(no output)";
      const updated =
        typeof result?.data?.updated === "boolean"
          ? `Updated: ${result.data.updated}`
          : "";
      setDeployLogs([output, updated].filter(Boolean).join("\n"));
      await fetchProjects();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sync project";
      setActionError(message);
      setDeployLogs(message);
    }
  };

  // Deploy project
  const handleDeployProject = async (projectName: string) => {
    try {
      setDeployLogs("");
      setDeployLogsTitle(`Deploy Logs: ${projectName}`);
      setShowDeployLogs(true);
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
      setDeployLogs(`${command}\n${output}`.trim());
      await fetchProjects();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to deploy project";
      setActionError(message);
      setDeployLogs(message);
    }
  };

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
      case "running":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "stopped":
        return <Square className="w-4 h-4 text-gray-600" />;
      case "failed":
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
      case "running":
        return "text-green-600";
      case "stopped":
        return "text-gray-600";
      case "failed":
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
          <div className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-full m-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Add New Project
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Name
                  </label>
                  <input
                    type="text"
                    value={newProject.name}
                    onChange={(e) =>
                      setNewProject({ ...newProject, name: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter project name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Repository URL
                  </label>
                  <input
                    type="text"
                    value={newProject.repository}
                    onChange={(e) =>
                      setNewProject({
                        ...newProject,
                        repository: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://github.com/user/repo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Branch
                  </label>
                  <input
                    type="text"
                    value={newProject.branch}
                    onChange={(e) =>
                      setNewProject({ ...newProject, branch: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="main"
                  />
                </div>

                {/* Environment Variables */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Environment Variables
                    </label>
                    <button
                      onClick={addEnvironmentVar}
                      className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-200 flex items-center"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Variable
                    </button>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {newProject.environmentVars.map((env, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="text"
                          placeholder="KEY"
                          value={env.key}
                          onChange={(e) =>
                            updateEnvironmentVar(index, "key", e.target.value)
                          }
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                        <input
                          type="text"
                          placeholder="VALUE"
                          value={env.value}
                          onChange={(e) =>
                            updateEnvironmentVar(index, "value", e.target.value)
                          }
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                        <button
                          onClick={() => removeEnvironmentVar(index)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {newProject.environmentVars.length === 0 && (
                      <div className="text-center py-4 text-gray-500 text-sm">
                        No environment variables configured
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddProject}
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-light transition-colors duration-200"
                >
                  Add Project
                </button>
              </div>
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
                }}
                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                title="Close"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-auto">
              <div className="space-y-3">
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
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEnvVars}
                className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200"
              >
                Save
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
