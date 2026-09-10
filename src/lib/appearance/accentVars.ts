/** Accent CSS vars for `:root` by name and resolved theme. Never writes `--bg`. */

export type ResolvedPageTheme = "dark" | "light";

type AccentVarMap = Record<string, string>;

function vars(
  primary: string,
  press: string,
  fg: string,
  rgb: string,
): AccentVarMap {
  return {
    "--primary": primary,
    "--primary-press": press,
    "--primary-soft": `rgba(${rgb}, 0.16)`,
    "--primary-fg": fg,
    "--border-accent": `rgba(${rgb}, 0.35)`,
    "--success": "#5ce4c7",
  };
}

/** Every accent has a Dark and Light row. Theme System resolves to one of those. */
const ACCENTS: Record<string, Record<ResolvedPageTheme, AccentVarMap>> = {
  teal: {
    dark: vars("#5ce4c7", "#43d3b3", "#06241e", "92, 228, 199"),
    light: vars("#5ce4c7", "#43d3b3", "#06241e", "92, 228, 199"),
  },
  blue: {
    dark: vars("#7c8cff", "#6476ff", "#0a1130", "124, 140, 255"),
    light: vars("#7c8cff", "#6476ff", "#0a1130", "124, 140, 255"),
  },
  amber: {
    dark: vars("#f0a868", "#e6934f", "#2a1605", "240, 168, 104"),
    light: vars("#f0a868", "#e6934f", "#2a1605", "240, 168, 104"),
  },
  violet: {
    dark: vars("#9b8cff", "#8876ff", "#160a30", "155, 140, 255"),
    light: vars("#9b8cff", "#8876ff", "#160a30", "155, 140, 255"),
  },
  sky: {
    dark: vars("#6ec8f0", "#52b8e4", "#062432", "110, 200, 240"),
    light: vars("#2b9fd4", "#1e8cbe", "#042030", "43, 159, 212"),
  },
  pink: {
    dark: vars("#ff8fb8", "#f075a4", "#2a0a16", "255, 143, 184"),
    light: vars("#e85a8c", "#d44578", "#2a0a16", "232, 90, 140"),
  },
};

/** Unknown names fall back to teal for that theme. */
export function resolveAccentVars(
  accent: string,
  resolvedTheme: ResolvedPageTheme,
): AccentVarMap {
  return ACCENTS[accent]?.[resolvedTheme] ?? ACCENTS.teal[resolvedTheme];
}
