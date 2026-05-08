"use client";
import * as React from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: "light" | "dark";
}
const ThemeContext = React.createContext<ThemeContextValue | null>(null);

interface Props {
  children: React.ReactNode;
  attribute?: "class" | "data-theme";
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
  storageKey?: string;
}

export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = true,
  storageKey = "spanish-theme",
}: Props) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [resolved, setResolved] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    const stored = localStorage.getItem(storageKey) as Theme | null;
    if (stored) setThemeState(stored);
  }, [storageKey]);

  React.useEffect(() => {
    const apply = () => {
      const sysDark = enableSystem && window.matchMedia("(prefers-color-scheme: dark)").matches;
      const next = theme === "system" ? (sysDark ? "dark" : "light") : theme;
      const root = document.documentElement;
      if (disableTransitionOnChange) {
        const css = document.createElement("style");
        css.appendChild(document.createTextNode("*{transition:none!important}"));
        document.head.appendChild(css);
        requestAnimationFrame(() => requestAnimationFrame(() => document.head.removeChild(css)));
      }
      if (attribute === "class") {
        root.classList.remove("light", "dark");
        root.classList.add(next);
      } else root.setAttribute("data-theme", next);
      setResolved(next);
    };
    apply();
    if (theme === "system" && enableSystem) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme, attribute, enableSystem, disableTransitionOnChange]);

  const setTheme = React.useCallback(
    (t: Theme) => {
      localStorage.setItem(storageKey, t);
      setThemeState(t);
    },
    [storageKey],
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme: resolved }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
