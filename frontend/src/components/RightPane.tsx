import { useEffect, useState, type ReactNode } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Layers,
  Loader2,
  MessagesSquare,
  Package,
  Sparkles,
  X,
} from "lucide-react";
import { useLoom } from "@/lib/store";
import * as api from "@/lib/api";
import { formatBytes, formatDateTime, formatTokens, timeAgo, exportFilenames } from "@/lib/format";
import { getPlatformMeta } from "@/lib/platforms";
import type { CaptureDetail, Message, Output } from "@/lib/types";
import { Lightbox } from "./Lightbox";

interface RightPaneProps {
  detail: CaptureDetail;
  messages: Message[];
  output: Output | null;
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof FileText;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </span>
      <div className="text-right text-xs font-medium">{children}</div>
    </div>
  );
}

export function RightPane({ detail, messages, output }: RightPaneProps) {
  const { settings, generation } = useLoom();
  const [busy, setBusy] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<CaptureDetail["assets"][number] | null>(null);

  const activeJob = generation[detail.captureId];
  const isGenerating = activeJob?.status === "RUNNING";
  const hasSummary = Boolean(output || detail.hasSummary || activeJob?.status === "COMPLETED");
  const platformMeta = getPlatformMeta(detail.platform);
  const messageCount = detail.stats?.messages || messages.length || 0;
  const tokenEstimate = detail.stats?.tokens || 0;

  const downloadContext = async () => {
    setBusy("context");
    try {
      await api.downloadExport(settings, detail.captureId, "context", exportFilenames.context(detail));
    } finally {
      setBusy(null);
    }
  };

  const downloadSummary = async () => {
    if (!hasSummary) return;
    setBusy("summary");
    try {
      await api.downloadExport(settings, detail.captureId, "summary", exportFilenames.summary(detail));
    } finally {
      setBusy(null);
    }
  };

  const downloadZip = async () => {
    setBusy("zip");
    try {
      await api.downloadExport(settings, detail.captureId, "zip", exportFilenames.zip(detail));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Capture Overview */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-serif text-[15px] font-semibold">Capture overview</h2>
        <div className="mt-3 divide-y divide-border/50 text-sm">
          <div className="pb-2">
            <InfoRow icon={Sparkles} label="Platform">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ color: platformMeta.color, backgroundColor: platformMeta.softBg }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: platformMeta.color }} />
                {platformMeta.label}
              </span>
            </InfoRow>
          </div>

          <div className="py-2">
            <InfoRow icon={Layers} label="Version">
              <span className="rounded border border-border bg-secondary/50 px-1.5 py-0.5 font-mono text-[11px]">
                v{detail.version}
              </span>
            </InfoRow>
          </div>

          <div className="py-2">
            <InfoRow icon={Calendar} label="Captured">
              <span title={formatDateTime(detail.capturedAt)}>
                {timeAgo(detail.capturedAt)}
              </span>
            </InfoRow>
          </div>

          <div className="py-2">
            <InfoRow icon={MessagesSquare} label="Messages">
              <span>{messageCount} msgs</span>
            </InfoRow>
          </div>

          <div className="py-2">
            <InfoRow icon={FileText} label="Tokens">
              <span>{formatTokens(tokenEstimate)}</span>
            </InfoRow>
          </div>

          <div className="pt-2">
            <InfoRow icon={ExternalLink} label="Source">
              <a
                href={detail.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
                title={detail.sourceUrl}
              >
                Original chat
                <ExternalLink className="h-3 w-3" />
              </a>
            </InfoRow>
          </div>
        </div>

        {/* Deliverables readiness indicator */}
        <div className="mt-3 rounded-xl border border-border bg-secondary/30 p-2.5 text-xs">
          <span className="font-medium text-muted-foreground">Deliverables:</span>
          <div className="mt-1.5 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>context.md</span>
              <span className="ml-auto text-[10px] text-muted-foreground">Lossless</span>
            </div>
            <div className="flex items-center gap-1.5 text-foreground">
              {isGenerating ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 loom-spin text-primary shrink-0" />
                  <span className="text-primary font-medium">summary.md</span>
                  <span className="ml-auto text-[10px] text-primary">Generating…</span>
                </>
              ) : hasSummary ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>summary.md</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">Distilled</span>
                </>
              ) : (
                <>
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">summary.md</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">Available</span>
                </>
              )}
            </div>
          </div>
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
            disabled={!hasSummary || busy !== null}
            title={hasSummary ? undefined : "Generate the distilled summary first"}
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
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[15px] font-semibold">Rescued media</h2>
          {detail.assets.length > 0 && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {detail.assets.length}
            </span>
          )}
        </div>
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
                title={`${a.name}${a.size ? ` · ${formatBytes(a.size)}` : ""}`}
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
