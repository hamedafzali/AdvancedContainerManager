import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Folder, Monitor, Moon, Package, Package2, Search, Sun } from "lucide-react";
import { CommandPalette, useCommandPaletteShortcut, type CommandItem } from "pixelwizards-components";
import { apiJson } from "@/utils/api";
import { useTheme } from "@/hooks/useTheme";

interface NavLink {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface Found {
  containers: Array<{ id: string; name: string; image: string; status: string }>;
  projects: Array<{ id?: string; name: string }>;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Header search: ⌘K / Ctrl+K or "/" opens a palette that jumps to pages,
 * containers and projects, and runs common actions. Containers and projects
 * are fetched each time it opens so the list is current.
 */
export function CommandMenu({ pages }: { pages: NavLink[] }) {
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const [open, setOpenState] = useState(false);
  const [found, setFound] = useState<Found>({ containers: [], projects: [] });

  const refresh = useCallback(async () => {
    const [containers, projects] = await Promise.allSettled([
      apiJson<{ data: Found["containers"] }>("/api/containers"),
      apiJson<{ data: Found["projects"] }>("/api/projects"),
    ]);
    setFound({
      containers: containers.status === "fulfilled" ? containers.value.data || [] : [],
      projects: projects.status === "fulfilled" ? projects.value.data || [] : [],
    });
  }, []);

  const setOpen = useCallback(
    (next: boolean | ((open: boolean) => boolean)) =>
      setOpenState((prev) => {
        const value = typeof next === "function" ? next(prev) : next;
        if (value && !prev) refresh();
        return value;
      }),
    [refresh],
  );

  useCommandPaletteShortcut(setOpen);

  const items = useMemo<CommandItem[]>(
    () => [
      ...pages.map((p) => ({
        id: `page:${p.href}`,
        group: "Go to",
        label: p.name,
        icon: <p.icon />,
        onSelect: () => navigate(p.href),
      })),
      ...found.containers.map((c) => ({
        id: `container:${c.id}`,
        group: "Containers",
        label: c.name.replace(/^\//, ""),
        hint: `${c.status} · ${c.image}`,
        keywords: [c.id, c.image],
        icon: <Package2 />,
        onSelect: () => navigate(`/containers/${c.id}`),
      })),
      ...found.projects.map((p) => ({
        id: `project:${p.id ?? p.name}`,
        group: "Projects",
        label: p.name,
        icon: <Folder />,
        onSelect: () => navigate(`/projects?search=${encodeURIComponent(p.name)}`),
      })),
      { id: "act:new-project", group: "Actions", label: "New project", icon: <Folder />, onSelect: () => navigate("/projects?add=1") },
      { id: "act:new-container", group: "Actions", label: "New container", icon: <Package />, onSelect: () => navigate("/containers?create=1") },
      { id: "act:pull", group: "Actions", label: "Pull image", icon: <Download />, onSelect: () => navigate("/images?pull=1") },
      { id: "theme:dark", group: "Theme", label: "Dark theme", keywords: ["appearance", "mode"], icon: <Moon />, onSelect: () => setTheme("dark") },
      { id: "theme:light", group: "Theme", label: "Light theme", keywords: ["appearance", "mode"], icon: <Sun />, onSelect: () => setTheme("light") },
      { id: "theme:system", group: "Theme", label: "System theme", keywords: ["appearance", "mode", "auto"], icon: <Monitor />, onSelect: () => setTheme("system") },
    ],
    [pages, found, navigate, setTheme],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search and commands"
        aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-gray-500 shadow-sm hover:border-gray-300 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200 md:w-56 xl:w-72"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden flex-1 text-left md:inline">Search…</span>
        <kbd className="hidden rounded border border-gray-200 px-1.5 text-[11px] font-medium text-gray-500 dark:border-gray-700 dark:text-gray-400 md:inline">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      <CommandPalette
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        placeholder="Search containers, projects, pages…"
      />
    </>
  );
}
