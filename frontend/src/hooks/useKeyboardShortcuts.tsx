import React, { useEffect, useCallback } from "react";

interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  action: () => void;
  description: string;
  category: string;
}

interface KeyboardShortcutsProps {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
}: KeyboardShortcutsProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Find matching shortcut
      const shortcut = shortcuts.find(
        (s) =>
          event.key.toLowerCase() === s.key.toLowerCase() &&
          !!event.ctrlKey === !!s.ctrlKey &&
          !!event.shiftKey === !!s.shiftKey &&
          !!event.altKey === !!s.altKey &&
          !!event.metaKey === !!s.metaKey,
      );

      if (shortcut) {
        event.preventDefault();
        event.stopPropagation();
        shortcut.action();
      }
    },
    [shortcuts, enabled],
  );

  useEffect(() => {
    if (enabled) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [handleKeyDown, enabled]);

  return {
    shortcuts,
  };
}

// Predefined shortcuts for the application
export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  // Navigation shortcuts
  {
    key: "d",
    ctrlKey: true,
    action: () => {
      const dashboardLink = document.querySelector('a[href="/dashboard"]');
      if (dashboardLink instanceof HTMLAnchorElement) {
        dashboardLink.click();
      }
    },
    description: "Go to Dashboard",
    category: "Navigation",
  },
  {
    key: "c",
    ctrlKey: true,
    action: () => {
      const containersLink = document.querySelector('a[href="/containers"]');
      if (containersLink instanceof HTMLAnchorElement) {
        containersLink.click();
      }
    },
    description: "Go to Containers",
    category: "Navigation",
  },
  {
    key: "i",
    ctrlKey: true,
    action: () => {
      const imagesLink = document.querySelector('a[href="/images"]');
      if (imagesLink instanceof HTMLAnchorElement) {
        imagesLink.click();
      }
    },
    description: "Go to Images",
    category: "Navigation",
  },
  {
    key: "t",
    ctrlKey: true,
    action: () => {
      const terminalLink = document.querySelector('a[href="/terminal"]');
      if (terminalLink instanceof HTMLAnchorElement) {
        terminalLink.click();
      }
    },
    description: "Go to Terminal",
    category: "Navigation",
  },

  // Action shortcuts
  {
    key: "/",
    action: () => {
      const searchInput = document.querySelector(
        'input[placeholder*="search" i]',
      ) as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    },
    description: "Focus search input",
    category: "Actions",
  },
  {
    key: "r",
    ctrlKey: true,
    action: () => {
      window.location.reload();
    },
    description: "Refresh page",
    category: "Actions",
  },
  {
    key: "Escape",
    action: () => {
      // Close modals, clear focus, reset search
      const focusedElement = document.activeElement;
      if (focusedElement && focusedElement !== document.body) {
        (focusedElement as HTMLElement).blur();
      }

      // Clear search if focused
      const searchInput = document.querySelector(
        'input[placeholder*="search" i]',
      ) as HTMLInputElement;
      if (searchInput && document.activeElement === searchInput) {
        searchInput.value = "";
        searchInput.blur();
      }
    },
    description: "Clear focus / Close modals",
    category: "Actions",
  },

  // Theme shortcuts
  {
    key: "m",
    ctrlKey: true,
    shiftKey: true,
    action: () => {
      // Toggle theme - this would need to be connected to the theme context
      const themeToggle = document.querySelector(
        '[aria-label*="theme" i], [title*="theme" i]',
      ) as HTMLButtonElement;
      if (themeToggle) {
        themeToggle.click();
      }
    },
    description: "Toggle theme",
    category: "Appearance",
  },

  // Development shortcuts (only in development)
  ...(process.env.NODE_ENV === "development"
    ? [
        {
          key: "l",
          ctrlKey: true,
          shiftKey: true,
          action: () => {
            console.clear();
            console.log("🔧 Advanced Container Manager - Development Mode");
            console.log("Available keyboard shortcuts:");
            console.table(
              DEFAULT_SHORTCUTS.map((s) => ({
                Shortcut: `${s.ctrlKey ? "Ctrl+" : ""}${s.shiftKey ? "Shift+" : ""}${s.altKey ? "Alt+" : ""}${s.metaKey ? "Cmd+" : ""}${s.key.toUpperCase()}`,
                Description: s.description,
                Category: s.category,
              })),
            );
          },
          description: "Show keyboard shortcuts (Dev mode)",
          category: "Development",
        },
      ]
    : []),
];

export function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = React.useState(false);

  // Use the default shortcuts
  useKeyboardShortcuts({
    shortcuts: [
      {
        key: "?",
        shiftKey: true,
        action: () => setIsOpen(!isOpen),
        description: "Toggle keyboard shortcuts help",
        category: "Help",
      },
    ],
  });

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-40 p-3 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg transition-colors"
        title="Keyboard shortcuts (Shift+?)"
      >
        <kbd className="text-xs font-mono">?</kbd>
      </button>
    );
  }

  const categories = Array.from(
    new Set(DEFAULT_SHORTCUTS.map((s) => s.category)),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Keyboard Shortcuts
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <kbd className="text-sm">Esc</kbd>
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-96">
          {categories.map((category) => (
            <div key={category} className="mb-6 last:mb-0">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">
                {category}
              </h3>
              <div className="space-y-2">
                {DEFAULT_SHORTCUTS.filter((s) => s.category === category).map(
                  (shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2"
                    >
                      <span className="text-gray-700 dark:text-gray-300">
                        {shortcut.description}
                      </span>
                      <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-sm font-mono">
                        {shortcut.ctrlKey && "Ctrl+"}
                        {shortcut.shiftKey && "Shift+"}
                        {shortcut.altKey && "Alt+"}
                        {shortcut.metaKey && "Cmd+"}
                        {shortcut.key.toUpperCase()}
                      </kbd>
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Press{" "}
            <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs">
              Shift+?
            </kbd>{" "}
            to toggle this help
          </p>
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-md transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
