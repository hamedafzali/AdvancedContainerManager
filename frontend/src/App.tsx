import { Routes, Route, Navigate } from "react-router-dom";
import { useSocket } from "@/hooks/useSocket";
import { ThemeProvider } from "@/hooks/useTheme";
import { QueryProvider } from "@/hooks/useQuery";
import {
  useKeyboardShortcuts,
  DEFAULT_SHORTCUTS,
  KeyboardShortcutsHelp,
} from "@/hooks/useKeyboardShortcuts";
import Layout from "@/components/Layout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { lazy, Suspense, useState, useEffect } from "react";
import { NotificationProvider } from "@/hooks/useNotifications";
import Login from "@/pages/Login";
import { apiUrl, apiFetch } from "@/utils/api";

// Lazy load page components
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Containers = lazy(() => import("@/pages/Containers"));
const Projects = lazy(() => import("@/pages/Projects"));
const Images = lazy(() => import("@/pages/Images"));
const Networks = lazy(() => import("@/pages/Networks"));
const Volumes = lazy(() => import("@/pages/Volumes"));
const Tunnels = lazy(() => import("@/pages/Tunnels"));
const Cloudflare = lazy(() => import("@/pages/Cloudflare"));
const Terminal = lazy(() => import("@/pages/Terminal"));
const Settings = lazy(() => import("@/pages/Settings"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Security = lazy(() => import("@/pages/Security"));

function AppWithSocket() {
  useSocket();

  // Initialize keyboard shortcuts
  useKeyboardShortcuts({
    shortcuts: DEFAULT_SHORTCUTS,
    enabled: true,
  });

  const LoadingSpinner = () => (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-500"></div>
    </div>
  );

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <KeyboardShortcutsHelp />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="containers" element={<Containers />} />
          <Route path="projects" element={<Projects />} />
          <Route path="images" element={<Images />} />
          <Route path="networks" element={<Networks />} />
          <Route path="volumes" element={<Volumes />} />
          <Route path="tunnels" element={<Tunnels />} />
          <Route path="cloudflare" element={<Cloudflare />} />
          <Route path="terminal/:containerId?" element={<Terminal />} />
          <Route path="settings" element={<Settings />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="security" element={<Security />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [requireAuth, setRequireAuth] = useState(false);
  const [token, setToken] = useState<string | null>(localStorage.getItem("acm_token"));

  useEffect(() => {
    apiFetch("/api/settings")
      .then((r) => r.json())
      .then((result) => {
        setRequireAuth(result.data?.security?.requireAuth === true);
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!token || !requireAuth) return;
    apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (!r.ok) { localStorage.removeItem("acm_token"); setToken(null); } })
      .catch(() => {});
  }, [token, requireAuth]);

  if (!authChecked) return null;

  if (requireAuth && !token) {
    return (
      <ErrorBoundary>
        <Login onLogin={(t) => setToken(t)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <QueryProvider>
        <ThemeProvider>
          <NotificationProvider>
            <AppWithSocket />
          </NotificationProvider>
        </ThemeProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}

export default App;
