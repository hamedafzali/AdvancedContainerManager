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
import { lazy, Suspense } from "react";
import { NotificationProvider } from "@/hooks/useNotifications";

// Lazy load page components
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Containers = lazy(() => import("@/pages/Containers"));
const Projects = lazy(() => import("@/pages/Projects"));
const Images = lazy(() => import("@/pages/Images"));
const Networks = lazy(() => import("@/pages/Networks"));
const Volumes = lazy(() => import("@/pages/Volumes"));
const Tunnels = lazy(() => import("@/pages/Tunnels"));
const Terminal = lazy(() => import("@/pages/Terminal"));
const Settings = lazy(() => import("@/pages/Settings"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const MultiCloud = lazy(() => import("@/pages/MultiCloud"));
const Security = lazy(() => import("@/pages/Security"));
const AIOptimization = lazy(() => import("@/pages/AIOptimization"));

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
          <Route path="terminal/:containerId?" element={<Terminal />} />
          <Route path="settings" element={<Settings />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="multi-cloud" element={<MultiCloud />} />
          <Route path="security" element={<Security />} />
          <Route path="ai-optimization" element={<AIOptimization />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function App() {
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
