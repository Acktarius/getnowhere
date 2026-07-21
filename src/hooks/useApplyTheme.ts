import { useEffect } from "react";
import { useSettingsStore } from "@/state/settingsStore";

const ACCENT_VARS: Record<string, Record<string, string>> = {
  teal: {
    "--primary": "#5ce4c7",
    "--primary-press": "#43d3b3",
    "--primary-soft": "rgba(92, 228, 199, 0.14)",
    "--primary-fg": "#06241e",
    "--border-accent": "rgba(92, 228, 199, 0.35)",
    "--success": "#5ce4c7",
  },
  blue: {
    "--primary": "#7c8cff",
    "--primary-press": "#6476ff",
    "--primary-soft": "rgba(124, 140, 255, 0.16)",
    "--primary-fg": "#0a1130",
    "--border-accent": "rgba(124, 140, 255, 0.35)",
    "--success": "#5ce4c7",
  },
  amber: {
    "--primary": "#f0a868",
    "--primary-press": "#e6934f",
    "--primary-soft": "rgba(240, 168, 104, 0.16)",
    "--primary-fg": "#2a1605",
    "--border-accent": "rgba(240, 168, 104, 0.35)",
    "--success": "#5ce4c7",
  },
  violet: {
    "--primary": "#9b8cff",
    "--primary-press": "#8876ff",
    "--primary-soft": "rgba(155, 140, 255, 0.16)",
    "--primary-fg": "#160a30",
    "--border-accent": "rgba(155, 140, 255, 0.35)",
    "--success": "#5ce4c7",
  },
};

export function useApplyTheme() {
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);

  useEffect(() => {
    const root = document.documentElement;
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    const resolved =
      theme === "system" ? (prefersDark ? "dark" : "light") : theme;
    root.setAttribute("data-theme", resolved);
    root.style.colorScheme = resolved;
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const vars = ACCENT_VARS[accent] ?? ACCENT_VARS.teal;
    for (const [k, v] of Object.entries(vars)) {
      root.style.setProperty(k, v);
    }
  }, [accent]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (useSettingsStore.getState().theme === "system") {
        const root = document.documentElement;
        const resolved = mq.matches ? "dark" : "light";
        root.setAttribute("data-theme", resolved);
        root.style.colorScheme = resolved;
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
}
