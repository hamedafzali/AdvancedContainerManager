import { useEffect, useRef, useState } from "react";
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
  Menu,
} from "lucide-react";
import {
  Badge,
  DropdownMenu,
  Sidebar,
  usePersistentState,
  type SidebarSection,
} from "pixelwizards-components";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandMenu } from "@/components/CommandMenu";
import { TaskTray } from "@/hooks/useTasks";

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
}

const navSections: Array<{ label?: string; items: NavItem[] }> = [
  {
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

const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { connected, uptime } = useSystemStatus();

  const activeItem = allNavItems.find((item) => location.pathname.startsWith(item.href));
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = usePersistentState("acm.sidebar.collapsed", false, isBoolean);
  const mainRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  // After a route change: close the mobile drawer and move focus to the page
  // so keyboard and screen reader users start at the new content.
  useEffect(() => {
    setNavOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  useEffect(() => {
    if (activeItem) document.title = `${activeItem.name} · Container Manager`;
  }, [activeItem]);

  const sections: SidebarSection[] = navSections.map((section) => ({
    title: section.label,
    items: section.items.map((item) => ({
      id: item.href,
      label: item.name,
      href: item.href,
      icon: <item.icon />,
      active: location.pathname.startsWith(item.href),
    })),
  }));

  return (
    <div className="app-shell flex bg-gray-50 dark:bg-gray-950">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-gray-900 focus:text-white"
      >
        Skip to content
      </a>

      <Sidebar
        ariaLabel="Primary"
        sections={sections}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        mobileOpen={navOpen}
        onMobileClose={() => setNavOpen(false)}
        renderLink={({ item, children, ...rest }) => (
          <Link to={item.href ?? "/"} {...rest}>
            {children}
          </Link>
        )}
        header={
          <Link
            to="/dashboard"
            className="flex items-center gap-2.5 min-w-0 rounded-lg"
            aria-label="Container Manager home"
          >
            <span className="w-8 h-8 shrink-0 rounded-lg bg-primary-600 text-white flex items-center justify-center">
              <Layers className="w-[18px] h-[18px]" aria-hidden="true" />
            </span>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
                  Container Manager
                </span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  Docker, delivery and edge
                </span>
              </span>
            )}
          </Link>
        }
        footer={
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <span
                className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
                aria-hidden="true"
              />
              {connected ? "Backend connected" : "Backend offline"}
            </span>
            {uptime !== null && (
              <span className="tabular text-gray-500 dark:text-gray-400" title="Backend uptime">
                {formatUptime(uptime)}
              </span>
            )}
          </div>
        }
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-14 shrink-0 flex items-center gap-3 px-4 sm:px-6 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation"
            aria-expanded={navOpen}
            className="lg:hidden inline-flex items-center justify-center w-9 h-9 -ml-2 rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
              {activeItem?.name || "Not found"}
            </span>
            <Badge color={connected ? "success" : "neutral"} variant="subtle" size="sm" dot>
              {connected ? "Live" : "Offline"}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <CommandMenu pages={allNavItems} />

            <TaskTray />
            <ThemeToggle />

            <DropdownMenu
              triggerLabel="Create"
              triggerVariant="primary"
              label={
                <>
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden sm:inline">New</span>
                </>
              }
              items={[
                {
                  label: "New project",
                  icon: <Folder className="w-4 h-4" />,
                  onClick: () => navigate("/projects?add=1"),
                },
                {
                  label: "New container",
                  icon: <Package className="w-4 h-4" />,
                  onClick: () => navigate("/containers?create=1"),
                },
                {
                  label: "Pull image",
                  icon: <Download className="w-4 h-4" />,
                  onClick: () => navigate("/images?pull=1"),
                },
              ]}
            />
          </div>
        </header>

        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 overflow-auto outline-none"
        >
          <div className="px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
