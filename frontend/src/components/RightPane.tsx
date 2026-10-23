import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  Code2,
  FileText,
  Images,
  Loader2,
  MessagesSquare,
  Package,
  Sparkles,
  Table2,
} from "lucide-react";
import { useLoom } from "@/lib/store";
import * as api from "@/lib/api";
import {
  buildContextMarkdown,
  buildSummaryMarkdown,
  buildZipBundle,
  mockFilenames,
} from "@/lib/mock";
import { formatBytes, formatTokens } from "@/lib/format";
import type { CaptureDetail, Message, Output } from "@/lib/types";
import { Lightbox } from "./Lightbox";

interface RightPaneProps {
  detail: CaptureDetail;
  messages: Message[];
  output: Output | null;
}

function StatRow({ icon: Icon, label, value }: { icon: typeof Code2; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function RightPane({ detail, messages, output }: RightPaneProps) {
  const { settings } = useLoom();
  const [busy, setBusy] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<CaptureDetail["assets"][number] | null>(null);

  const downloadContext = async () => {
    setBusy("context");
    try {
      if (!settings.mockMode) {
        const ok = await api.downloadExport(settings, detail.captureId, "context", mockFilenames.context(detail));
        if (ok) return;
      }
      api.triggerDownload(
        new Blob([buildContextMarkdown(detail, messages)], { type: "text/markdown" }),
        mockFilenames.context(detail),
      );
    } finally {
      setBusy(null);
    }
  };

  const downloadSummary = async () => {
    if (!output) return;
    setBusy("summary");
    try {
      if (!settings.mockMode) {
        const ok = await api.downloadExport(settings, detail.captureId, "summary", mockFilenames.summary(detail));
        if (ok) return;
      }
      api.triggerDownload(
        new Blob([buildSummaryMarkdown(output)], { type: "text/markdown" }),
        mockFilenames.summary(detail),
      );
    } finally {
      setBusy(null);
    }
  };

  const downloadZip = async () => {
    setBusy("zip");
    try {
      if (!settings.mockMode) {
        const ok = await api.downloadExport(settings, detail.captureId, "zip", mockFilenames.zip(detail));
        if (ok) return;
      }
      const blob = await buildZipBundle(detail, messages, output);
      api.triggerDownload(blob, mockFilenames.zip(detail));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Fidelity & stats */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-serif text-[15px] font-semibold">Session fidelity</h2>
        <div className="mt-3 space-y-2 text-sm">
          <StatRow icon={FileText} label="Tokens" value={formatTokens(detail.stats.tokens)} />
          <StatRow icon={MessagesSquare} label="Messages" value={String(detail.stats.messages)} />
          <StatRow icon={Code2} label="Code blocks" value={String(detail.stats.codeBlocks)} />
          <StatRow icon={Table2} label="Tables preserved" value={String(detail.stats.tables)} />
          <StatRow icon={Images} label="Rescued assets" value={String(detail.stats.assets)} />
        </div>
      </section>

      {/* Exports */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-serif text-[15px] font-semibold">Exports</h2>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={downloadContext}
            disabled={busy !== null}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:border-primary disabled:opacity-50"
          >
            {busy === "context" ? <Loader2 className="h-3.5 w-3.5 loom-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Download context.md
          </button>
          <button
            type="button"
            onClick={downloadSummary}
            disabled={!output || busy !== null}
            title={output ? undefined : "Generate the distilled summary first"}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-45"
          >
            {busy === "summary" ? <Loader2 className="h-3.5 w-3.5 loom-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Download summary.md
          </button>
          <button
            type="button"
            onClick={downloadZip}
            disabled={busy !== null}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {busy === "zip" ? <Loader2 className="h-3.5 w-3.5 loom-spin" /> : <Package className="h-3.5 w-3.5" />}
            Download full bundle (.zip)
          </button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The bundle includes context.md, summary.md, metadata.json, the raw snapshot and rescued assets.
          </p>
        </div>
      </section>

      {/* Rescued media */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-serif text-[15px] font-semibold">Rescued media</h2>
        {detail.assets.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            No media rescued for this chat.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {detail.assets.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setLightbox(a)}
                className="group text-left"
                title={`${a.name} · ${formatBytes(a.size)}`}
              >
                <img
                  src={a.url}
                  alt={a.name}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg border border-border object-cover transition-opacity group-hover:opacity-85"
                />
                <span className="mt-1 block truncate text-[11px] text-muted-foreground">{a.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {lightbox && <Lightbox asset={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/** Slide-over used below the xl breakpoint to reach the inspector pane. */
export function PaneOverlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-foreground/50 xl:hidden"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="h-full w-[320px] max-w-[85vw] overflow-y-auto border-l border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-serif text-[15px] font-semibold">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="inline-grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
