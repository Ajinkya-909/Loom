export type Theme = "light" | "dark" | "system";

export interface LoomSettings {
  apiUrl: string;
  token: string;
}

export const DEFAULT_API_URL = "http://localhost:4000";
const SETTINGS_KEY = "loom.settings";
const THEME_KEY = "loom.theme";

const envApiUrl = (import.meta.env["VITE_API_URL"] as string | undefined) ?? DEFAULT_API_URL;

export function defaultSettings(): LoomSettings {
  return { apiUrl: envApiUrl, token: "" };
}

export function loadSettings(): LoomSettings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<LoomSettings>;
    return {
      apiUrl: typeof parsed.apiUrl === "string" && parsed.apiUrl ? parsed.apiUrl : base.apiUrl,
      token: typeof parsed.token === "string" ? parsed.token : "",
    };
  } catch {
    return base;
  }
}

export function saveSettings(settings: LoomSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — settings stay in memory */
  }
}

export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark" || t === "system") return t;
  } catch {
    /* ignore */
  }
  return "system";
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme !== "system") return theme;
  return media?.matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset["theme"] = resolved;
}

/** Listen for OS scheme changes while in system mode. Returns a cleanup fn. */
export function watchSystemTheme(onChange: () => void): () => void {
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}
