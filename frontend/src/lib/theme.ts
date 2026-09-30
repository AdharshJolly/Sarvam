/**
 * Theme handling: the user picks system, light or dark; the resolved value is written to
 * `<html data-theme>` (and `color-scheme`, `theme-color`). `index.html` runs a tiny inline copy of
 * this logic before first paint so there is no flash; `theme.test.ts` keeps the two in sync.
 */

export type Theme = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEMES: readonly Theme[] = ["system", "light", "dark"];
export const STORAGE_KEY = "theme";

/** Browser chrome colour per resolved theme; must equal the page background token. */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#F8FAFC",
  dark: "#0B1120",
};

/** Anything other than an explicit light or dark (missing, corrupted, hand-edited) means system. */
export function parseTheme(raw: string | null | undefined): Theme {
  return raw === "light" || raw === "dark" ? raw : "system";
}

export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

function prefersDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function getTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "system"; // storage blocked (private mode, site data cleared)
  }
}

export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme, prefersDark());
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", THEME_COLOR[resolved]);
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable: the choice still applies for this page view.
  }
  applyTheme(theme);
}

/** While the choice is "system", follow the OS when it switches. Returns an unsubscribe function. */
export function watchSystemTheme(): () => void {
  const query = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!query) return () => {};
  const onChange = () => {
    if (getTheme() === "system") applyTheme("system");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
