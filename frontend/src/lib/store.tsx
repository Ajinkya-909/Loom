import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CaptureListItem, JobState, Platform, ServerConfig } from "@/lib/types";
import {
  applyTheme,
  loadSettings,
  loadTheme,
  saveSettings,
  saveTheme,
  watchSystemTheme,
  type LoomSettings,
  type Theme,
} from "@/lib/settings";
import * as api from "@/lib/api";

export type ConnState = "checking" | "connected" | "offline";
export type PlatformFilter = "all" | Platform;

interface Connection {
  state: ConnState;
  config: ServerConfig | null;
}

interface LoomContextValue {
  settings: LoomSettings;
  updateSettings: (patch: Partial<LoomSettings>) => void;
  theme: Theme;
  displayTheme: Theme;
  setTheme: (t: Theme) => void;
  conn: Connection;
  refreshConn: () => void;
  captures: CaptureListItem[];
  capturesLoading: boolean;
  query: string;
  setQuery: (q: string) => void;
  platform: PlatformFilter;
  setPlatform: (p: PlatformFilter) => void;
  reloadCaptures: () => void;
  generation: Record<string, JobState>;
  startGeneration: (
    captureId: string,
    opts?: { onDone?: () => void; onError?: (message: string) => void },
  ) => void;
  trackJob: (
    captureId: string,
    jobId: string,
    opts?: { onDone?: (outputId?: string) => void; onError?: (message: string) => void },
    initialStage?: string,
    initialProgress?: number,
  ) => void;
}

const LoomContext = createContext<LoomContextValue | null>(null);

export function LoomProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<LoomSettings>(loadSettings);
  const [theme, setThemeState] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);
  const [conn, setConn] = useState<Connection>({ state: "checking", config: null });
  const [captures, setCaptures] = useState<CaptureListItem[]>([]);
  const [capturesLoading, setCapturesLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [queryDebounced, setQueryDebounced] = useState("");
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [generation, setGeneration] = useState<Record<string, JobState>>({});

  /* ---- theme ---- */
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    return watchSystemTheme(() => applyTheme("system"));
  }, [theme]);

  // Read the stored theme after hydration so SSR markup always matches the
  // first client render; the inline script in __root paints data-theme early.
  useEffect(() => {
    setMounted(true);
    const stored = loadTheme();
    if (stored !== "system") setThemeState(stored);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    saveTheme(t);
  }, []);

  /* ---- connection ---- */
  const refreshConn = useCallback(() => {
    setConn((c) => ({ ...c, state: "checking" }));
    void (async () => {
      const [health, config] = await Promise.all([api.health(settings), api.config(settings)]);
      if (health) setConn({ state: "connected", config });
      else setConn({ state: "offline", config: null });
    })();
  }, [settings]);

  useEffect(() => {
    refreshConn();
    const iv = window.setInterval(refreshConn, 20_000);
    return () => window.clearInterval(iv);
  }, [refreshConn]);

  /* ---- capture list ---- */
  useEffect(() => {
    const t = window.setTimeout(() => setQueryDebounced(query), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const loadCaptures = useCallback(async () => {
    setCapturesLoading(true);
    const res = await api.captures(settings, queryDebounced, platform);
    setCaptures(res?.items ?? []);
    setCapturesLoading(false);
  }, [settings, queryDebounced, platform]);

  useEffect(() => {
    void loadCaptures();
  }, [loadCaptures]);

  const updateSettings = useCallback((patch: Partial<LoomSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const activeSubs = useRef<Map<string, () => void>>(new Map());

  /* ---- summary generation (real SSE stream tracking) ---- */
  const trackJob = useCallback(
    (
      captureId: string,
      jobId: string,
      opts?: { onDone?: (outputId?: string) => void; onError?: (message: string) => void },
      initialStage?: string,
      initialProgress?: number,
    ) => {
      setGeneration((prev) => ({
        ...prev,
        [captureId]: {
          status: "RUNNING",
          stage: initialStage || "Distilling summary with Gemma…",
          progress: initialProgress || 10,
        },
      }));

      // Cancel any existing subscription for this capture to prevent duplicate listeners
      if (activeSubs.current.has(captureId)) {
        activeSubs.current.get(captureId)!();
        activeSubs.current.delete(captureId);
      }

      const finish = (outputId?: string) => {
        activeSubs.current.delete(captureId);
        setGeneration((prev) => ({
          ...prev,
          [captureId]: {
            status: "COMPLETED",
            stage: "Summary ready",
            progress: 100,
            ...(outputId ? { outputId } : {}),
          },
        }));
        opts?.onDone?.(outputId);
      };

      let lastStage = initialStage || "Distilling summary with Gemma…";
      let lastProgress = initialProgress || 10;

      const stop = api.subscribeJob(settings, jobId, (ev) => {
        const status = (ev.status ?? ev.stage ?? "").toUpperCase();
        if (ev.stage) lastStage = ev.stage;
        if (typeof ev.progress === "number") {
          lastProgress = Math.round(ev.progress <= 1 ? ev.progress * 100 : ev.progress);
        }

        if (status === "COMPLETED") {
          stop();
          finish(ev.outputId);
          return;
        }
        if (status === "FAILED") {
          stop();
          activeSubs.current.delete(captureId);
          setGeneration((prev) => ({
            ...prev,
            [captureId]: {
              status: "FAILED",
              stage: "Failed",
              progress: lastProgress,
              error: ev.error ?? "Generation failed",
            },
          }));
          opts?.onError?.(ev.error ?? "Generation failed");
          return;
        }

        setGeneration((prev) => ({
          ...prev,
          [captureId]: {
            status: "RUNNING",
            stage: lastStage === "distilling" ? "Distilling with Gemma…" : lastStage,
            progress: Math.min(Math.max(lastProgress, 5), 99),
          },
        }));
      });

      activeSubs.current.set(captureId, stop);
    },
    [settings],
  );

  const startGeneration = useCallback(
    (captureId: string, opts?: { onDone?: () => void; onError?: (message: string) => void }) => {
      setGeneration((prev) => ({
        ...prev,
        [captureId]: { status: "RUNNING", stage: "Contacting server…", progress: 5 },
      }));

      const finish = (outputId?: string) => {
        setGeneration((prev) => ({
          ...prev,
          [captureId]: {
            status: "COMPLETED",
            stage: "Summary ready",
            progress: 100,
            ...(outputId ? { outputId } : {}),
          },
        }));
        opts?.onDone?.();
      };

      void (async () => {
        const res = await api.generate(settings, captureId, "SUMMARY");
        if (res?.outputId && !res.jobId) {
          finish(res.outputId);
          return;
        }
        if (res?.jobId) {
          trackJob(captureId, res.jobId, { onDone: () => opts?.onDone?.(), onError: opts?.onError });
          return;
        }
        setGeneration((prev) => ({
          ...prev,
          [captureId]: {
            status: "FAILED",
            stage: "Failed",
            progress: 0,
            error: "Failed to connect to summarization engine.",
          },
        }));
        opts?.onError?.("Failed to connect to summarization engine.");
      })();
    },
    [settings, trackJob],
  );

  useEffect(() => {
    const subs = activeSubs.current;
    return () => {
      subs.forEach((stop) => stop());
      subs.clear();
    };
  }, []);


  const value = useMemo<LoomContextValue>(
    () => ({
      settings,
      updateSettings,
      theme,
      displayTheme: mounted ? theme : "system",
      setTheme,
      conn,
      refreshConn,
      captures,
      capturesLoading,
      query,
      setQuery,
      platform,
      setPlatform,
      reloadCaptures: () => void loadCaptures(),
      generation,
      startGeneration,
      trackJob,
    }),
    [
      settings,
      updateSettings,
      mounted,
      theme,
      setTheme,
      conn,
      refreshConn,
      captures,
      capturesLoading,
      query,
      platform,
      loadCaptures,
      generation,
      startGeneration,
      trackJob,
    ],
  );

  return <LoomContext.Provider value={value}>{children}</LoomContext.Provider>;
}

export function useLoom(): LoomContextValue {
  const ctx = useContext(LoomContext);
  if (!ctx) throw new Error("useLoom must be used within LoomProvider");
  return ctx;
}
