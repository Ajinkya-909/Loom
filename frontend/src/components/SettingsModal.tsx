import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useLoom } from "@/lib/store";
import * as api from "@/lib/api";
import type { LoomSettings } from "@/lib/settings";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { settings, updateSettings, refreshConn, reloadCaptures } = useLoom();
  const [draft, setDraft] = useState<LoomSettings>(settings);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setNotice(null);
    }
  }, [open, settings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const testConnection = async () => {
    setTesting(true);
    setNotice(null);
    const health = await api.health(draft);
    setNotice(
      health
        ? { ok: true, text: `Server responded: ${health.status} · database ${health.database?.connected ? "connected" : "unavailable"}` }
        : { ok: false, text: `Could not reach ${draft.apiUrl || "(empty URL)"} — is the Loom server running?` },
    );
    setTesting(false);
  };

  const save = () => {
    updateSettings({ ...draft, apiUrl: draft.apiUrl.replace(/\/+$/, "") });
    refreshConn();
    reloadCaptures();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[440px] rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Connection settings"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold">Connection settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="inline-grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Point Loom at your companion server. Data stays on your machine.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold">Server URL</span>
            <input
              value={draft.apiUrl}
              onChange={(e) => setDraft((d) => ({ ...d, apiUrl: e.target.value }))}
              placeholder="http://localhost:4000"
              spellCheck={false}
              className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold">API token (optional)</span>
            <input
              type="password"
              value={draft.token}
              onChange={(e) => setDraft((d) => ({ ...d, token: e.target.value }))}
              placeholder="Bearer token for /api/* endpoints"
              spellCheck={false}
              className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none transition-colors focus:border-primary"
            />
          </label>


          {notice && (
            <p
              className={`rounded-lg px-3 py-2 text-xs ${notice.ok ? "bg-success-soft text-success" : "bg-error-soft text-error"}`}
            >
              {notice.text}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={testConnection}
              disabled={testing}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:border-primary disabled:opacity-50"
            >
              {testing && <Loader2 className="h-3.5 w-3.5 loom-spin" />}
              Test connection
            </button>
            <button
              type="button"
              onClick={save}
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-hover"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
