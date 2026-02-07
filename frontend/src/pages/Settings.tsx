import { useState, useEffect } from "react";
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
} from "lucide-react";
import { apiUrl } from "@/utils/api";

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
  const [activeSection, setActiveSection] = useState("general");

  // Fetch settings from backend
  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch(apiUrl("/api/settings"));
      if (!response.ok) {
        throw new Error("Failed to fetch settings");
      }
      const result = await response.json();
      setSettings(result.data);
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

      const response = await fetch(apiUrl("/api/settings"), {
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
      const response = await fetch(apiUrl("/api/settings/backup"));
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
      
      const response = await fetch(apiUrl("/api/settings/restore"), {
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
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-xl font-light text-gray-900 mb-2">Loading Settings...</h2>
          <p className="text-gray-500">Fetching configuration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-light text-gray-900 tracking-tight">Settings</h1>
          <div className="flex items-center space-x-4">
            <button
              onClick={exportSettings}
              className="flex items-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
            <label className="flex items-center px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors duration-200 cursor-pointer">
              <Upload className="w-4 h-4 mr-2" />
              Import
              <input
                type="file"
                accept=".json"
                onChange={importSettings}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-3" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center">
            <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
            <span className="text-green-800">{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <nav className="space-y-1">
                {sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center px-3 py-2 rounded-lg text-left transition-colors duration-200 ${
                      activeSection === section.id
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
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
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              {/* General Settings */}
              {activeSection === "general" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-gray-900">General Settings</h2>
                    <button
                      onClick={() => saveSettings("general")}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
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
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Theme
                      </label>
                      <select
                        value={settings.general.theme}
                        onChange={(e) => updateSetting("general", "theme", e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                        <option value="auto">Auto</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Language
                      </label>
                      <select
                        value={settings.general.language}
                        onChange={(e) => updateSetting("general", "language", e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                        <span className="text-sm font-medium text-gray-700">Auto Refresh</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Refresh Interval (ms)
                      </label>
                      <input
                        type="number"
                        value={settings.general.refreshInterval}
                        onChange={(e) => updateSetting("general", "refreshInterval", parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Notifications Settings */}
              {activeSection === "notifications" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-gray-900">Notifications</h2>
                    <button
                      onClick={() => saveSettings("notifications")}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
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
                      <span className="text-sm font-medium text-gray-700">Enable Notifications</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.notifications.containerEvents}
                        onChange={(e) => updateSetting("notifications", "containerEvents", e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">Container Events</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.notifications.systemAlerts}
                        onChange={(e) => updateSetting("notifications", "systemAlerts", e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">System Alerts</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.notifications.emailNotifications}
                        onChange={(e) => updateSetting("notifications", "emailNotifications", e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">Email Notifications</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Docker Settings */}
              {activeSection === "docker" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-gray-900">Docker Configuration</h2>
                    <button
                      onClick={() => saveSettings("docker")}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
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
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Default Registry
                      </label>
                      <input
                        type="text"
                        value={settings.docker.defaultRegistry}
                        onChange={(e) => updateSetting("docker", "defaultRegistry", e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.docker.autoPrune}
                        onChange={(e) => updateSetting("docker", "autoPrune", e.target.checked)}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">Auto Prune</span>
                    </label>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Prune Interval (ms)
                      </label>
                      <input
                        type="number"
                        value={settings.docker.pruneInterval}
                        onChange={(e) => updateSetting("docker", "pruneInterval", parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Max Containers
                      </label>
                      <input
                        type="number"
                        value={settings.docker.maxContainers}
                        onChange={(e) => updateSetting("docker", "maxContainers", parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Security Settings */}
              {activeSection === "security" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-gray-900">Security</h2>
                    <button
                      onClick={() => saveSettings("security")}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
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
                      <span className="text-sm font-medium text-gray-700">Require Authentication</span>
                    </label>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Session Timeout (ms)
                      </label>
                      <input
                        type="number"
                        value={settings.security.sessionTimeout}
                        onChange={(e) => updateSetting("security", "sessionTimeout", parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Max Login Attempts
                      </label>
                      <input
                        type="number"
                        value={settings.security.maxLoginAttempts}
                        onChange={(e) => updateSetting("security", "maxLoginAttempts", parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* API Settings */}
              {activeSection === "api" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold text-gray-900">API Configuration</h2>
                    <button
                      onClick={() => saveSettings("api")}
                      disabled={saving}
                      className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 disabled:opacity-50"
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
                      <span className="text-sm font-medium text-gray-700">Enable Rate Limiting</span>
                    </label>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Max Requests
                      </label>
                      <input
                        type="number"
                        value={settings.api.maxRequests}
                        onChange={(e) => updateSetting("api", "maxRequests", parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Window (ms)
                      </label>
                      <input
                        type="number"
                        value={settings.api.windowMs}
                        onChange={(e) => updateSetting("api", "windowMs", parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
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
