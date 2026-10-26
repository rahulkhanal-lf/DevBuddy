import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const systemQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function initialTheme(): Theme {
  // index.html already resolved the theme before React loaded
  const applied = document.documentElement.dataset.theme;
  if (applied === "light" || applied === "dark") return applied;
  return storedTheme() ?? (systemQuery().matches ? "dark" : "light");
}

export function useThemeState() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Follow the OS setting until the user picks a theme explicitly
  useEffect(() => {
    const query = systemQuery();
    const onChange = (e: MediaQueryListEvent) => {
      if (!storedTheme()) setTheme(e.matches ? "dark" : "light");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Storage unavailable (private mode); the choice lasts for this session only
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}

export const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: "light",
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}
