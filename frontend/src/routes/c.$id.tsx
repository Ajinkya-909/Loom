import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { LeftPane } from "@/components/LeftPane";
import { CaptureWorkspace } from "@/components/CaptureWorkspace";
import { RightPane, PaneOverlay } from "@/components/RightPane";
import { useLoom } from "@/lib/store";
import * as api from "@/lib/api";
import type { CaptureDetail, Message, Output } from "@/lib/types";

type Tab = "summary" | "context";

export const Route = createFileRoute("/c/$id")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => {
    const t = search["tab"];
    return t === "context" || t === "summary" ? { tab: t } : {};
  },
  head: () => ({
    meta: [
      { title: "Capture Workspace — Loom" },
      {
        name: "description",
        content:
          "Read the lossless transcript, distilled summary and rescued assets for a captured AI chat.",
      },
      { property: "og:title", content: "Capture Workspace — Loom" },
      {
        property: "og:description",
        content:
          "Read the lossless transcript, distilled summary and rescued assets for a captured AI chat.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CapturePage,
});

function NotFoundCard() {
  return (
    <div className="flex h-full w-full items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-6xl font-semibold">404</h1>
        <h2 className="mt-3 font-serif text-xl font-semibold">Capture not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This capture may have been deleted, or the server is unreachable.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-hover"
        >
          Back to library
        </Link>
      </div>
    </div>
  );
}

function CapturePage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const tab: Tab = search["tab"] ?? "summary";
  const navigate = Route.useNavigate();
  const { settings, generation, startGeneration, trackJob, reloadCaptures } = useLoom();

  const [detail, setDetail] = useState<CaptureDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [output, setOutput] = useState<Output | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const generationRef = useRef(generation);
  generationRef.current = generation;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setNotFound(false);
    setDetail(null);
    setOutput(null);
    void (async () => {
      const d = await api.capture(settings, id);
      if (!d) {
        if (alive) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }
      const norm: CaptureDetail = {
        ...d,
        stats: d.stats ?? {
          tokens: 0,
          messages: 0,
          codeBlocks: 0,
          tables: 0,
          assets: d.assets?.length ?? 0,
        },
        assets: (d.assets ?? []).map((a) => ({
          ...a,
          url: a.url || api.assetUrl(settings, a.id),
        })),
      };
      if (!alive) return;
      setDetail(norm);
      setVersion(norm.version);

      const msgs = (await api.messages(settings, id, norm.version))?.items ?? [];
      const out = await api.output(settings, id);
      if (!alive) return;
      setMessages(msgs);
      setOutput(out);
      setLoading(false);

      // If capture has an active background job (e.g. from extension "Get & Summarize"), track it live!
      if (d.activeJob && d.activeJob.status === "RUNNING") {
        trackJob(
          id,
          d.activeJob.id,
          {
            onDone: () => {
              reloadCaptures();
              void loadOutput();
            },
          },
          d.activeJob.stage,
          d.activeJob.progress,
        );
      }

      // Default tab per spec: summary when one exists or is actively generating, otherwise context
      const isJobRunning = d.activeJob?.status === "RUNNING" || generationRef.current[id]?.status === "RUNNING";
      if (!norm.hasSummary && !isJobRunning && search["tab"] !== "summary") {
        void navigate({
          to: "/c/$id",
          params: { id },
          search: { tab: "context" },
          replace: true,
        });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, settings]);

  const changeVersion = async (v: number) => {
    setVersion(v);
    const msgs = (await api.messages(settings, id, v))?.items ?? [];
    setMessages(msgs);
  };

  const loadOutput = async () => {
    const out = await api.output(settings, id);
    setOutput(out);
    setDetail((d) => (d ? { ...d, hasSummary: !!out } : d));
  };

  const handleGenerate = () => {
    startGeneration(id, {
      onDone: () => {
        reloadCaptures();
        void loadOutput();
        void navigate({
          to: "/c/$id",
          params: { id },
          search: { tab: "summary" },
          replace: true,
        });
      },
    });
  };

  if (notFound) return <NotFoundCard />;

  if (loading || !detail) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 loom-spin" />
      </div>
    );
  }

  return (
    <>
      <LeftPane />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <CaptureWorkspace
          detail={detail}
          messages={messages}
          output={output}
          tab={tab}
          onTabChange={(t) =>
            void navigate({ to: "/c/$id", params: { id }, search: { tab: t }, replace: true })
          }
          version={version || detail.version}
          onVersionChange={(v) => void changeVersion(v)}
          onGenerate={handleGenerate}
          onOpenInspector={() => setInspectorOpen(true)}
        />
      </main>
      <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-border xl:block">
        <RightPane detail={detail} messages={messages} output={output} />
      </aside>
      {inspectorOpen && (
        <PaneOverlay title="Session details" onClose={() => setInspectorOpen(false)}>
          <RightPane detail={detail} messages={messages} output={output} />
        </PaneOverlay>
      )}
    </>
  );
}
