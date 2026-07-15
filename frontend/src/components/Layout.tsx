import { useEffect, useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Package2,
  Folder,
  Image,
  Network,
  HardDrive,
  Terminal,
  Settings,
  Layers,
  Plus,
  Shield,
  BarChart3,
  Globe,
  Workflow,
  Download,
  Package,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AdvancedSearch } from "@/components/AdvancedSearch";
import { DropdownMenu } from "@/components/ui";
import { TaskTray } from "@/hooks/useTasks";

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
}

interface NavSection {
  label: string | null;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: null,
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Docker",
    items: [
      { name: "Containers", href: "/containers", icon: Package2 },
      { name: "Images", href: "/images", icon: Image },
      { name: "Networks", href: "/networks", icon: Network },
      { name: "Volumes", href: "/volumes", icon: HardDrive },
    ],
  },
  {
    label: "Delivery",
    items: [
      { name: "Projects", href: "/projects", icon: Folder },
      { name: "Pipelines", href: "/pipelines", icon: Workflow },
    ],
  },
  {
    label: "Edge",
    items: [{ name: "Tunnels & DNS", href: "/edge", icon: Globe }],
  },
  {
    label: "System",
    items: [
      { name: "Terminal", href: "/terminal", icon: Terminal },
      { name: "Security", href: "/security", icon: Shield },
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

const allNavItems = navSections.flatMap((section) => section.items);

function useSystemStatus() {
  const [connected, setConnected] = useState(false);
  const [uptime, setUptime] = useState<number | null>(null);

  useEffect(() => {
    const onSocketStatus = (event: Event) => {
      setConnected(Boolean((event as CustomEvent).detail?.connected));
    };
    const onMetrics = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (typeof detail?.uptime === "number") setUptime(detail.uptime);
    };
    window.addEventListener("socket_status", onSocketStatus);
    window.addEventListener("system_metrics_update", onMetrics);
    return () => {
      window.removeEventListener("socket_status", onSocketStatus);
      window.removeEventListener("system_metrics_update", onMetrics);
    };
  }, []);

  return { connected, uptime };
}

function formatUptime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { connected, uptime } = useSystemStatus();

  const activeItem = allNavItems.find((item) =>
    location.pathname.startsWith(item.href),
  );

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <nav className="w-64 bg-white dark:bg-gray-800 shadow-lg flex flex-col border-r border-gray-200 dark:border-gray-700">
        <div className="flex items-center p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <Layers className="w-6 h-6 text-white" />
            </div>
            <div className="ml-3">
              <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight">
                Container Manager
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Enterprise Edition
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label ?? "main"}>
              {section.label && (
                <div className="px-4 mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {section.label}
                </div>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = location.pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`sidebar-item flex items-center px-4 py-2.5 rounded-lg text-sm text-gray-700 dark:text-gray-200 ${
                        isActive ? "active" : ""
                      }`}
                    >
                      <item.icon className="w-5 h-5 mr-3" />
                      {item.name}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* System Status — reflects the actual WebSocket connection */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Backend
            </span>
            <div className="flex items-center space-x-2">
              <div
                className={`w-2 h-2 rounded-full ${connected ? "bg-green-500 pulse-dot" : "bg-red-500"}`}
              ></div>
              <span
                className={`text-xs ${connected ? "text-green-600" : "text-red-500"}`}
              >
                {connected ? "Connected" : "Disconnected"}
              </span>
            </div>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {uptime !== null ? `Uptime: ${formatUptime(uptime)}` : " "}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-6 py-4 gap-4">
            <div className="flex items-center space-x-3 shrink-0">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {activeItem?.name || "Not found"}
              </h2>
              <span
                className={`px-2 py-1 text-xs font-medium rounded-full ${
                  connected
                    ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                {connected ? "Live" : "Offline"}
              </span>
            </div>

            <div className="flex items-center space-x-3 min-w-0">
              <AdvancedSearch
                items={[]}
                onSearch={(query, filters) => {
                  if (!query.trim()) return;
                  const type = filters?.type?.[0];
                  if (type === "project") {
                    navigate(`/projects?search=${encodeURIComponent(query)}`);
                  } else if (type === "image") {
                    navigate(`/images?search=${encodeURIComponent(query)}`);
                  } else {
                    navigate(`/containers?search=${encodeURIComponent(query)}`);
                  }
                }}
                className="w-72"
              />

              <TaskTray />
              <ThemeToggle />

              <DropdownMenu
                triggerLabel="Create"
                trigger={
                  <span className="flex items-center px-2.5 py-0.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg dark:bg-primary-700 dark:hover:bg-primary-800">
                    <Plus className="w-4 h-4 mr-1.5" />
                    New
                  </span>
                }
                items={[
                  {
                    label: "New Project",
                    icon: <Folder className="w-4 h-4" />,
                    onClick: () => navigate("/projects?add=1"),
                  },
                  {
                    label: "New Container",
                    icon: <Package className="w-4 h-4" />,
                    onClick: () => navigate("/containers?create=1"),
                  },
                  {
                    label: "Pull Image",
                    icon: <Download className="w-4 h-4" />,
                    onClick: () => navigate("/images?pull=1"),
                  },
                ]}
              />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
