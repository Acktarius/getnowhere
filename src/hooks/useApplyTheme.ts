import { useEffect } from "react";
import { resolveAccentVars } from "@/lib/appearance/accentVars";
import { useSettingsStore } from "@/state/settingsStore";
import type { AccentName, AppTheme } from "@/types/models";

function resolvePageTheme(theme: AppTheme): "dark" | "light" {
  if (theme !== "system") return theme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyThemeAndAccent(theme: AppTheme, accent: AccentName | string) {
  const root = document.documentElement;
  const resolved = resolvePageTheme(theme);
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
  const vars = resolveAccentVars(accent, resolved);
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}

export function useApplyTheme() {
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);

  useEffect(() => {
    applyThemeAndAccent(theme, accent);
  }, [theme, accent]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const { theme: t, accent: a } = useSettingsStore.getState();
      if (t === "system") {
        applyThemeAndAccent(t, a);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
}
