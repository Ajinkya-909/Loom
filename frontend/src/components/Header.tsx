import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Monitor, Moon, Search, Settings, Sun } from "lucide-react";
import { useLoom, type ConnState } from "@/lib/store";
import type { Theme } from "@/lib/settings";
import { SettingsModal } from "./SettingsModal";

function pillTone(state: ConnState, authorized: boolean | undefined): string {
  if (state === "connected" && authorized === false) return "bg-warn-soft text-warn";
  switch (state) {
    case "connected":
      return "bg-success-soft text-success";
    case "offline":
      return "bg-error-soft text-error";
    default:
      return "bg-secondary text-muted-foreground";
  }
}

function pillLabel(state: ConnState, authorized: boolean | undefined): string {
  if (state === "connected" && authorized === false) return "Unauthorized";
  switch (state) {
    case "connected":
      return "Connected";
    case "offline":
      return "Offline";
    default:
      return "Checking";
  }
}

const THEME_OPTIONS: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

export function Header() {
  const { conn, displayTheme, setTheme, settings } = useLoom();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        void navigate({ to: "/" });
        window.dispatchEvent(new CustomEvent("loom:focus-search"));
      }
    };
    const onOpenSettings = () => setSettingsOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("loom:open-settings", onOpenSettings);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("loom:open-settings", onOpenSettings);
    };
  }, [navigate]);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/60 px-4">
      {/* Brand */}
      <div className="flex min-w-0 items-center gap-2.5">
        <img
          src="/icon48.png"
          alt="Loom logo"
          className="h-7 w-7 rounded-lg shrink-0 object-contain shadow-xs"
        />
        <span className="font-serif text-lg font-semibold leading-none tracking-tight">Loom</span>
        <span className="hidden text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:inline">
          AI Workspace
        </span>
      </div>

      {/* Connectivity pill */}
      <div className="flex flex-1 justify-center">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pillTone(conn.state, conn.config?.authorized)}`}
          title={settings.apiUrl}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full bg-current ${conn.state === "connected" || conn.state === "checking" ? "loom-pulse" : ""}`}
          />
          {pillLabel(conn.state, conn.config?.authorized)}
          {conn.state === "connected" && conn.config?.authorized !== false && conn.config && (
            <span className="hidden font-normal opacity-70 md:inline">
              · {conn.config.llm?.model ?? "model n/a"}
            </span>
          )}
        </span>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            void navigate({ to: "/" });
            window.dispatchEvent(new CustomEvent("loom:focus-search"));
          }}
          title="Search library (⌘K)"
          className="inline-flex h-8 items-center gap-2 rounded-lg border border-border px-2.5 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          <kbd className="hidden font-mono text-[10px] sm:inline">⌘K</kbd>
        </button>

        <div className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5" role="group" aria-label="Theme">
          {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
            <button
              key={value}
              type="button"
              title={label}
              aria-label={`${label} theme`}
              aria-pressed={displayTheme === value}
              onClick={() => setTheme(value)}
              className={`inline-grid h-7 w-7 place-items-center rounded-md transition-colors ${
                displayTheme === value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title="Connection settings"
          className="inline-grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
