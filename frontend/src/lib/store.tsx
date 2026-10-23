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
import * as mock from "@/lib/mock";

export type ConnState = "checking" | "connected" | "offline" | "mock";
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
}

const LoomContext = createContext<LoomContextValue | null>(null);

const GEN_STAGES = ["Normalizing transcript…", "Distilling with Gemma…", "Finalizing…"] as const;

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
  const generationTimers = useRef<Set<number>>(new Set());

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
    if (settings.mockMode) {
      setConn({ state: "mock", config: mock.serverConfig });
      return;
    }
    setConn((c) => ({ ...c, state: "checking" }));
    void (async () => {
      const [health, config] = await Promise.all([api.health(settings), api.config(settings)]);
      if (health) setConn({ state: "connected", config });
      else setConn({ state: "offline", config: null });
    })();
  }, [settings]);

  useEffect(() => {
    refreshConn();
    if (settings.mockMode) return;
    const iv = window.setInterval(refreshConn, 20_000);
    return () => window.clearInterval(iv);
  }, [refreshConn, settings.mockMode]);

  /* ---- capture list ---- */
  useEffect(() => {
    const t = window.setTimeout(() => setQueryDebounced(query), 250);
    return () => window.clearTimeout(t);
  }, [query]);

  const loadCaptures = useCallback(async () => {
    setCapturesLoading(true);
    let items: CaptureListItem[] | null = null;
    if (!settings.mockMode) {
      const res = await api.captures(settings, queryDebounced, platform);
      items = res?.items ?? null;
    }
    if (!items) items = mock.listCaptures(queryDebounced, platform);
    setCaptures(items);
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

  /* ---- summary generation (real SSE or simulated) ---- */
  const startGeneration = useCallback(
    (captureId: string, opts?: { onDone?: () => void; onError?: (message: string) => void }) => {
      let alreadyRunning = false;
      setGeneration((prev) => {
        if (prev[captureId]?.status === "RUNNING") {
          alreadyRunning = true;
          return prev;
        }
        return {
          ...prev,
          [captureId]: { status: "RUNNING", stage: GEN_STAGES[0], progress: 4 },
        };
      });
      if (alreadyRunning) return;

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

      if (!settings.mockMode) {
        void (async () => {
          const res = await api.generate(settings, captureId, "SUMMARY");
          if (!res?.jobId) {
            simulate(); // server unreachable — fall back to the simulated pipeline
            return;
          }
          let lastStage: string = GEN_STAGES[0];
          let lastProgress = 10;
          const stop = api.subscribeJob(settings, res.jobId, (ev) => {
            const status = ev.status ?? ev.stage;
            lastStage = ev.stage ?? lastStage;
            if (typeof ev.progress === "number") lastProgress = ev.progress;
            if (status === "completed" || status === "COMPLETED") {
              stop();
              finish(ev.outputId ?? res.outputId);
              return;
            }
            if (status === "failed" || status === "FAILED") {
              stop();
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
                stage: lastStage,
                progress: Math.min(lastProgress, 99),
              },
            }));
          });
        })();
        return;
      }

      simulate();

      function simulate() {
        let progress = 4;
        const id = window.setInterval(() => {
          progress += 5 + Math.random() * 7;
          if (progress >= 100) {
            window.clearInterval(id);
            setGeneration((prev) => ({
              ...prev,
              [captureId]: { status: "RUNNING", stage: GEN_STAGES[2], progress: 100 },
            }));
            const t = window.setTimeout(() => {
              generationTimers.current.delete(t);
              mock.putSummary(captureId);
              finish(`out_${captureId}`);
            }, 450);
            generationTimers.current.add(t);
            return;
          }
          const stage = progress < 32 ? GEN_STAGES[0] : progress < 85 ? GEN_STAGES[1] : GEN_STAGES[2];
          setGeneration((prev) => ({
            ...prev,
            [captureId]: { status: "RUNNING", stage, progress: Math.round(progress) },
          }));
        }, 320);
        generationTimers.current.add(id);
      }
    },
    [settings],
  );

  useEffect(
    () => () => {
      generationTimers.current.forEach((t) => window.clearTimeout(t));
      generationTimers.current.clear();
    },
    [],
  );

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
    ],
  );

  return <LoomContext.Provider value={value}>{children}</LoomContext.Provider>;
}

export function useLoom(): LoomContextValue {
  const ctx = useContext(LoomContext);
  if (!ctx) throw new Error("useLoom must be used within LoomProvider");
  return ctx;
}
