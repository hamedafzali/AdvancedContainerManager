import { useState, useEffect, useRef } from "react";
import {
  User,
  Server,
  Shield,
  Bell,
  Database,
  Globe,
  Moon,
  Sun,
  Monitor,
  Save,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Download,
  Upload,
  Github,
  Plus,
  Trash2,
} from "lucide-react";
import { apiUrl, apiFetch } from "@/utils/api";
import { Alert, Button, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";

interface Settings {
  general: {
    theme: "light" | "dark" | "auto";
    language: string;
    autoRefresh: boolean;
    refreshInterval: number;
  };
  notifications: {
    enabled: boolean;
    containerEvents: boolean;
    systemAlerts: boolean;
    emailNotifications: boolean;
  };
  docker: {
    defaultRegistry: string;
    autoPrune: boolean;
    pruneInterval: number;
    maxContainers: number;
  };
  security: {
    requireAuth: boolean;
    sessionTimeout: number;
    maxLoginAttempts: number;
  };
  api: {
    rateLimit: boolean;
    maxRequests: number;
    windowMs: number;
  };
}

function ChangePasswordForm({ onSuccess, onError }: { onSuccess: () => void; onError: (e: string) => void }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const token = localStorage.getItem("acm_token") || "";
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.message);
      localStorage.removeItem("acm_token");
      onSuccess();
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setLoading(false);
      setOldPw(""); setNewPw("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
      <input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="Current password" className="field" />
      <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password" className="field" />
      <button type="submit" disabled={loading || !oldPw || !newPw} className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary-700">
        {loading ? "Changing..." : "Change Password"}
      </button>
    </form>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<Settings>({
    general: {
      theme: "light",
      language: "en",
      autoRefresh: true,
      refreshInterval: 5000,
    },
    notifications: {
      enabled: true,
      containerEvents: true,
      systemAlerts: true,
      emailNotifications: false,
    },
    docker: {
      defaultRegistry: "docker.io",
      autoPrune: false,
      pruneInterval: 86400000,
      maxContainers: 50,
    },
    security: {
      requireAuth: false,
      sessionTimeout: 3600000,
      maxLoginAttempts: 5,
    },
    api: {
      rateLimit: true,
      maxRequests: 100,
      windowMs: 900000,
    },
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [activeSection, setActiveSection] = useState("general");

  // Git accounts
  interface GitAccount { id: string; provider: "github" | "gitlab"; username: string; addedAt: string; }
  const [gitAccounts, setGitAccounts] = useState<GitAccount[]>([]);
  const [gitProvider, setGitProvider] = useState<"github" | "gitlab">("github");
  const [gitToken, setGitToken] = useState("");
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);

  const fetchGitAccounts = async () => {
    try {
      const res = await apiFetch("/api/git-accounts");
      const result = await res.json();
      if (result.success) setGitAccounts(result.data);
    } catch {}
  };

  const handleAddGitAccount = async () => {
    if (!gitToken.trim()) return;
    setGitLoading(true);
    setGitError(null);
    try {
      const res = await apiFetch("/api/git-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: gitProvider, token: gitToken }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.message);
      setGitToken("");
      setSuccess("Git account connected successfully");
      await fetchGitAccounts();
    } catch (err) {
      setGitError(err instanceof Error ? err.message : "Failed to connect account");
    } finally {
      setGitLoading(false);
    }
  };

  const handleRemoveGitAccount = async (id: string) => {
    await apiFetch(`/api/git-accounts/${encodeURIComponent(id)}`, { method: "DELETE" });
    await fetchGitAccounts();
  };

  // Fetch settings from backend
  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await apiFetch("/api/settings");
      if (!response.ok) {
        throw new Error("Failed to fetch settings");
      }
      const result = await response.json();
      // Layer what the backend has over the defaults section by section, so a
      // settings file written by an older version can't leave a section undefined.
      setSettings((prev) => {
        const next = { ...prev, ...result.data } as Settings;
        for (const key of Object.keys(prev) as Array<keyof Settings>) {
          next[key] = { ...prev[key], ...(result.data?.[key] || {}) } as any;
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  };

  // Save settings to backend
  const saveSettings = async (section: keyof Settings) => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await apiFetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          section,
          settings: settings[section],
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      setSuccess(`${section.charAt(0).toUpperCase() + section.slice(1)} settings saved successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  // Export settings
  const exportSettings = async () => {
    try {
      const response = await apiFetch("/api/settings/backup");
      if (!response.ok) {
        throw new Error("Failed to export settings");
      }
      const result = await response.json();
      
      const blob = new Blob([JSON.stringify(result.data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `settings-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export settings");
    }
  };

  // Import settings
  const importSettings = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      
      const response = await apiFetch("/api/settings/restore", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ backup }),
      });

      if (!response.ok) {
        throw new Error("Failed to import settings");
      }

      setSuccess("Settings imported successfully");
      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import settings");
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchGitAccounts();
  }, []);

  const updateSetting = (section: keyof Settings, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  const sections = [
    { id: "general", title: "General", icon: <User className="w-4 h-4" /> },
    { id: "notifications", title: "Notifications", icon: <Bell className="w-4 h-4" /> },
    { id: "docker", title: "Docker", icon: <Database className="w-4 h-4" /> },
    { id: "security", title: "Security", icon: <Shield className="w-4 h-4" /> },
    { id: "api", title: "API", icon: <Server className="w-4 h-4" /> },
    { id: "git", title: "Git Accounts", icon: <Github className="w-4 h-4" /> },
  ];

  if (loading) return <LoadingState label="Loading settings…" />;

  return (
    <div className="max-w-screen-2xl mx-auto">
      <div className="space-y-6">
        <PageHeader
          title="Settings"
          subtitle="Server preferences, integrations and access"
          actions={
            <>
              <Button icon={<Download className="w-4 h-4" />} onClick={exportSettings}>
                Export
              </Button>
              <Button icon={<Upload className="w-4 h-4" />} onClick={() => importInputRef.current?.click()}>
                Import
              </Button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                onChange={importSettings}
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
              />
            </>
          }
        />

        <ErrorBanner message={error} onDismiss={() => setError(null)} />
        {success && <Alert status="success" description={success} closable onClose={() => setSuccess(null)} />}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-card border border-gray-200 dark:border-gray-800 p-2 lg:sticky lg:top-4">
              <nav aria-label="Settings sections" className="flex lg:flex-col gap-1 overflow-x-auto scrollbar-thin">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    aria-current={activeSection === section.id ? "page" : undefined}
                    className={`shrink-0 lg:w-full flex items-center px-3 py-2 rounded-lg text-left text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
                      activeSection === section.id
                        ? "bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300"
                        : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100"
                    }`}
                  >
                    {section.icon}
                    <span className="ml-3">{section.title}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-card border border-gray-200 dark:border-gray-800 p-6">
              {/* General Settings */}
              {activeSection === "general" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">General Settings</h2>
                    <button
                      onClick={() => saveSettings("general")}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="settings-field-1" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Theme
                      </label>
                      <select id="settings-field-1"
                        value={settings.general.theme}
                        onChange={(e) => updateSetting("general", "theme", e.target.value)}
                        className="field"
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                        <option value="auto">Auto</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="settings-field-2" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Language
                      </label>
                      <select id="settings-field-2"
                        value={settings.general.language}
                        onChange={(e) => updateSetting("general", "language", e.target.value)}
                        className="field"
                      >
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="de">German</option>
                      </select>
                    </div>

                    <div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={settings.general.autoRefresh}
                          onChange={(e) => updateSetting("general", "autoRefresh", e.target.checked)}
                          className="mr-2"
                        />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto Refresh</span>
                      </label>
                    </div>

                    <div>
                      <label htmlFor="settings-field-3" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Refresh Interval (ms)
                      </label>
                      <input id="settings-field-3"
                        type="number"
                        value={settings.general.refreshInterval}
                        onChange={(e) => updateSetting("general", "refreshInterval", parseInt(e.target.value))}
                        className="field"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Notifications Settings */}
              {activeSection === "notifications" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Notifications</h2>
                    <button
                      onClick={() => saveSettings("notifications")}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>

                  <div className="space-y-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.notifications.enabled}
                        onChange={(e) => updateSetting("notifications", "enabled", e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Notifications</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.notifications.containerEvents}
                        onChange={(e) => updateSetting("notifications", "containerEvents", e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Container Events</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.notifications.systemAlerts}
                        onChange={(e) => updateSetting("notifications", "systemAlerts", e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">System Alerts</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.notifications.emailNotifications}
                        onChange={(e) => updateSetting("notifications", "emailNotifications", e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Email Notifications</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Docker Settings */}
              {activeSection === "docker" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Docker Configuration</h2>
                    <button
                      onClick={() => saveSettings("docker")}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="settings-field-4" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Default Registry
                      </label>
                      <input id="settings-field-4"
                        type="text"
                        value={settings.docker.defaultRegistry}
                        onChange={(e) => updateSetting("docker", "defaultRegistry", e.target.value)}
                        className="field"
                      />
                    </div>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.docker.autoPrune}
                        onChange={(e) => updateSetting("docker", "autoPrune", e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto Prune</span>
                    </label>

                    <div>
                      <label htmlFor="settings-field-5" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Prune Interval (ms)
                      </label>
                      <input id="settings-field-5"
                        type="number"
                        value={settings.docker.pruneInterval}
                        onChange={(e) => updateSetting("docker", "pruneInterval", parseInt(e.target.value))}
                        className="field"
                      />
                    </div>

                    <div>
                      <label htmlFor="settings-field-6" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Max Containers
                      </label>
                      <input id="settings-field-6"
                        type="number"
                        value={settings.docker.maxContainers}
                        onChange={(e) => updateSetting("docker", "maxContainers", parseInt(e.target.value))}
                        className="field"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Security Settings */}
              {activeSection === "security" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Security</h2>
                    <button
                      onClick={() => saveSettings("security")}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>

                  <div className="space-y-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.security.requireAuth}
                        onChange={(e) => updateSetting("security", "requireAuth", e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Require Authentication</span>
                    </label>

                    <div>
                      <label htmlFor="settings-field-7" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Session Timeout (ms)
                      </label>
                      <input id="settings-field-7"
                        type="number"
                        value={settings.security.sessionTimeout}
                        onChange={(e) => updateSetting("security", "sessionTimeout", parseInt(e.target.value))}
                        className="field"
                      />
                    </div>

                    <div>
                      <label htmlFor="settings-field-8" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Max Login Attempts
                      </label>
                      <input id="settings-field-8"
                        type="number"
                        value={settings.security.maxLoginAttempts}
                        onChange={(e) => updateSetting("security", "maxLoginAttempts", parseInt(e.target.value))}
                        className="field"
                      />
                    </div>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Change Password</h3>
                    <ChangePasswordForm onSuccess={() => setSuccess("Password changed successfully")} onError={(e) => setError(e)} />
                  </div>
                </div>
              )}

              {/* API Settings */}
              {activeSection === "api" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">API Configuration</h2>
                    <button
                      onClick={() => saveSettings("api")}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      {saving ? "Saving..." : "Save"}
                    </button>
                  </div>

                  <div className="space-y-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.api.rateLimit}
                        onChange={(e) => updateSetting("api", "rateLimit", e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Rate Limiting</span>
                    </label>

                    <div>
                      <label htmlFor="settings-field-9" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Max Requests
                      </label>
                      <input id="settings-field-9"
                        type="number"
                        value={settings.api.maxRequests}
                        onChange={(e) => updateSetting("api", "maxRequests", parseInt(e.target.value))}
                        className="field"
                      />
                    </div>

                    <div>
                      <label htmlFor="settings-field-10" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Window (ms)
                      </label>
                      <input id="settings-field-10"
                        type="number"
                        value={settings.api.windowMs}
                        onChange={(e) => updateSetting("api", "windowMs", parseInt(e.target.value))}
                        className="field"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeSection === "git" && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Git Accounts</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Connect GitHub or GitLab accounts to browse and clone private repositories when creating projects.</p>

                  {/* Add account form */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Connect New Account</h3>
                    <div className="flex gap-2">
                      {(["github", "gitlab"] as const).map((p) => (
                        <button key={p} onClick={() => setGitProvider(p)} className={`flex-1 py-2 rounded-lg border text-sm capitalize transition-colors ${gitProvider === p ? "bg-primary-600 text-white border-primary-600" : "border-gray-300 dark:border-gray-600 hover:border-gray-500"}`}>{p}</button>
                      ))}
                    </div>
                    <div>
                      <label htmlFor="settings-field-11" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Personal Access Token</label>
                      <input id="settings-field-11"
                        type="password"
                        value={gitToken}
                        onChange={(e) => setGitToken(e.target.value)}
                        className="field"
                        placeholder={gitProvider === "github" ? "ghp_..." : "glpat-..."}
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        {gitProvider === "github"
                          ? "Requires repo scope. Create at GitHub → Settings → Developer settings → Personal access tokens."
                          : "Requires read_api scope. Create at GitLab → User Settings → Access Tokens."}
                      </p>
                    </div>
                    {gitError && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{gitError}</div>}
                    <button
                      onClick={handleAddGitAccount}
                      disabled={gitLoading || !gitToken.trim()}
                      className="flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50 text-sm"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      {gitLoading ? "Connecting..." : "Connect Account"}
                    </button>
                  </div>

                  {/* Connected accounts */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Connected Accounts</h3>
                    {gitAccounts.length === 0 ? (
                      <div className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">No accounts connected yet</div>
                    ) : (
                      <div className="space-y-2">
                        {gitAccounts.map((acc) => (
                          <div key={acc.id} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Github className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{acc.username}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{acc.provider} · Connected {new Date(acc.addedAt).toLocaleDateString()}</div>
                              </div>
                            </div>
                            <button onClick={() => handleRemoveGitAccount(acc.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
