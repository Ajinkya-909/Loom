import { Bot, ExternalLink, Loader2, PanelRight, Sparkles, User } from "lucide-react";
import { useLoom } from "@/lib/store";
import { PLATFORMS } from "@/lib/platforms";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { Asset, CaptureDetail, Message, Output } from "@/lib/types";
import { Markdown } from "./Markdown";
import { CodeBlock } from "./CodeBlock";
import { ProgressBanner } from "./ProgressBanner";

type Tab = "summary" | "context";

interface WorkspaceProps {
  detail: CaptureDetail;
  messages: Message[];
  output: Output | null;
  tab: Tab;
  onTabChange: (t: Tab) => void;
  version: number;
  onVersionChange: (v: number) => void;
  onGenerate: () => void;
  onOpenInspector: () => void;
}

function PlatformBadge({ platform }: { platform: CaptureDetail["platform"] }) {
  const meta = PLATFORMS[platform];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color: meta.color, backgroundColor: meta.softBg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

function MessageBlock({ block, assets }: { block: Message["blocks"][number]; assets: Asset[] }) {
  if (block.type === "code") {
    return <CodeBlock code={block.content} lang={block.lang} />;
  }
  if (block.type === "table") {
    return <Markdown>{block.content}</Markdown>;
  }
  if (block.type === "image") {
    const asset = assets.find((a) => a.id === block.content);
    const src = asset?.url ?? (block.content.startsWith("http") ? block.content : "");
    return src ? (
      <img
        src={src}
        alt={asset?.name ?? "Rescued asset"}
        loading="lazy"
        className="max-w-lg rounded-xl border border-border"
      />
    ) : null;
  }
  return <Markdown>{block.content}</Markdown>;
}

function ContextView({ messages, assets }: { messages: Message[]; assets: Asset[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`rounded-2xl border bg-card p-5 ${
            m.role === "user" ? "border-l-primary border-l-[3px] border-border" : "border-border"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-grid h-6 w-6 place-items-center rounded-full ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
              }`}
            >
              {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide">
              {m.role === "user" ? "User" : "Assistant"}
            </span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              ~{m.tokenEstimate} tok
            </span>
          </div>
          <div className="mt-3 space-y-3">
            {m.blocks.map((b, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <MessageBlock key={i} block={b} assets={assets} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function CaptureWorkspace({
  detail,
  messages,
  output,
  tab,
  onTabChange,
  version,
  onVersionChange,
  onGenerate,
  onOpenInspector,
}: WorkspaceProps) {
  const { generation } = useLoom();
  const job = generation[detail.captureId];
  const running = job?.status === "RUNNING";

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col px-8 py-8">
      {/* Live progress banner */}
      {job && job.status === "RUNNING" && <ProgressBanner stage={job.stage} progress={job.progress} />}
      {job && job.status === "COMPLETED" && <ProgressBanner stage={job.stage} progress={100} done />}

      {/* Capture header */}
      <div className="flex flex-wrap items-center gap-2">
        <PlatformBadge platform={detail.platform} />
        <span className="text-xs text-muted-foreground" title={formatDateTime(detail.capturedAt)}>
          Captured {timeAgo(detail.capturedAt)}
        </span>
      </div>
      <h1 className="mt-2 font-serif text-[26px] font-semibold leading-tight tracking-tight">
        {detail.title}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {detail.versions.length > 1 ? (
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            Version
            <select
              value={version}
              onChange={(e) => onVersionChange(Number(e.target.value))}
              className="rounded-lg border border-border bg-card px-2 py-1 font-mono text-xs outline-none focus:border-primary"
            >
              {detail.versions.map((v) => (
                <option key={v.captureId + v.version} value={v.version}>
                  v{v.version}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="font-mono text-xs text-muted-foreground">v{detail.version}</span>
        )}
        <a
          href={detail.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Open original chat
          <ExternalLink className="h-3 w-3" />
        </a>
        <button
          type="button"
          onClick={onOpenInspector}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary xl:hidden"
        >
          <PanelRight className="h-3.5 w-3.5" />
          Stats & exports
        </button>
      </div>

      {/* View mode tabs */}
      <div className="mt-6 inline-flex w-fit rounded-xl bg-secondary p-1" role="tablist">
        {(
          [
            { value: "summary" as Tab, label: "Summary", file: "summary.md" },
            { value: "context" as Tab, label: "Context Transcript", file: "context.md" },
          ] satisfies { value: Tab; label: string; file: string }[]
        ).map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => onTabChange(t.value)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            <span className="font-mono text-[10px] opacity-60">{t.file}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="mt-6">
        {tab === "summary" ? (
          output ? (
            <div className="rounded-2xl border border-border bg-card p-6">
              <Markdown>{output.markdown}</Markdown>
              <div className="mt-6 flex items-center gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
                <span>
                  Distilled by <span className="font-mono">{output.generatedBy}</span> ·{" "}
                  {timeAgo(output.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={onGenerate}
                  disabled={running}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium text-primary transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {running ? <Loader2 className="h-3 w-3 loom-spin" /> : <Sparkles className="h-3 w-3" />}
                  Regenerate
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-accent text-primary">
                <Sparkles className="h-5 w-5" />
              </span>
              <h2 className="mt-4 font-serif text-xl font-semibold">No distilled summary yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Loom will normalize the transcript and distill a five-section summary with your
                local model.
              </p>
              <button
                type="button"
                onClick={onGenerate}
                disabled={running}
                className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                {running ? <Loader2 className="h-4 w-4 loom-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate Distilled Summary
              </button>
            </div>
          )
        ) : (
          <>
            {!output && !running && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="flex-1 text-muted-foreground">No distilled summary yet.</span>
                <button
                  type="button"
                  onClick={onGenerate}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-accent-hover"
                >
                  <Sparkles className="h-3 w-3" />
                  Generate summary
                </button>
              </div>
            )}
            <ContextView messages={messages} assets={detail.assets} />
          </>
        )}
      </div>
    </div>
  );
}
