import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  actualTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const STORAGE_KEY = "theme";

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* storage blocked */
  }
  return "system";
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  // Start from what index.html's pre-paint script already applied, so the
  // first render never flashes the wrong theme.
  const [actualTheme, setActualTheme] = useState<"light" | "dark">(() =>
    resolveTheme(readStoredTheme()),
  );

  useEffect(() => {
    const updateTheme = () => {
      const root = window.document.documentElement;
      const newTheme = resolveTheme(theme);

      setActualTheme(newTheme);

      // Update DOM
      root.classList.remove("light", "dark");
      root.classList.add(newTheme);
      // pixelwizards-components keys a few overrides off data-theme.
      root.dataset.theme = newTheme;

      // Update meta theme-color
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute(
          "content",
          newTheme === "dark" ? "#020617" : "#f8fafc",
        );
      }
    };

    updateTheme();

    // Listen for system theme changes
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", updateTheme);
      return () => mediaQuery.removeEventListener("change", updateTheme);
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      /* private mode: the choice just won't persist */
    }
    setThemeState(newTheme);
  };

  const toggleTheme = () => setTheme(actualTheme === "dark" ? "light" : "dark");

  return React.createElement(
    ThemeContext.Provider,
    { value: { theme, actualTheme, setTheme, toggleTheme } },
    children,
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
