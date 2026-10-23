import { PanelRight } from "lucide-react";
import { useLoom } from "@/lib/store";

const STEPS = [
  {
    n: "01",
    title: "Capture",
    body: "One click in the Loom browser extension saves the full thread — from ChatGPT, Claude, Gemini, DeepSeek or Perplexity.",
  },
  {
    n: "02",
    title: "Normalize",
    body: "Turns are structured into a lossless prompt-response transcript, with code, tables and rescued media intact.",
  },
  {
    n: "03",
    title: "Distill",
    body: "A local model distills each thread into a five-section summary you can read in ninety seconds.",
  },
  {
    n: "04",
    title: "Export",
    body: "Download context.md, summary.md, or the full .zip bundle with metadata and assets.",
  },
];

export function WelcomeCenter({ onOpenSide }: { onOpenSide: () => void }) {
  const { captures } = useLoom();
  const withSummary = captures.filter((c) => c.hasSummary).length;

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-8 px-8 py-12">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            ContextPort Workspace
          </p>
          <button
            type="button"
            onClick={onOpenSide}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary xl:hidden"
          >
            <PanelRight className="h-3.5 w-3.5" />
            Connection & stats
          </button>
        </div>
        <h1 className="mt-2 font-serif text-4xl font-semibold leading-tight tracking-tight">
          Your AI chats, distilled and portable.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
          Loom captures conversations from ChatGPT, Claude, Gemini, DeepSeek and Perplexity,
          normalizes them into clean transcripts, and exports Markdown you can drop straight into
          any repo or doc.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        {STEPS.map((s, i) => (
          <div
            key={s.n}
            className={`flex gap-4 px-5 py-4 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <span className="shrink-0 font-mono text-xs text-primary">{s.n}</span>
            <div>
              <h2 className="font-serif text-[17px] font-semibold">{s.title}</h2>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        {captures.length > 0 ? (
          <>
            Pick a capture in the library on the left to open its workspace —{" "}
            {withSummary > 0
              ? `${withSummary} of ${captures.length} already have a distilled summary.`
              : "try generating a summary from the Summary tab."}
          </>
        ) : (
          <>No captures yet — start one from the Loom browser extension.</>
        )}
      </p>
    </div>
  );
}

export function HomeRight() {
  const { conn, settings, captures } = useLoom();
  const withSummary = captures.filter((c) => c.hasSummary).length;

  return (
    <div className="flex flex-col gap-4 p-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-serif text-[15px] font-semibold">Server connection</h2>
        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{settings.apiUrl}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-medium capitalize">{conn.state === "mock" ? "mock data" : conn.state}</dd>
          </div>
          {conn.config && (
            <>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Server version</dt>
                <dd className="font-mono text-xs">v{conn.config.version}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Distillation model</dt>
                <dd className="truncate font-mono text-xs">{conn.config.llm?.model ?? "n/a"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Authorized</dt>
                <dd className="font-medium">{conn.config.authorized ? "Yes" : "No"}</dd>
              </div>
            </>
          )}
        </dl>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("loom:open-settings"))}
          className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-xs font-medium transition-colors hover:border-primary"
        >
          Connection settings
        </button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-serif text-[15px] font-semibold">Library</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Captures</dt>
            <dd className="font-medium">{captures.length}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Summaries distilled</dt>
            <dd className="font-medium">{withSummary}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-serif text-[15px] font-semibold">Shortcuts</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center justify-between gap-2">
            <span>Search the library</span>
            <kbd className="rounded border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-foreground">
              ⌘K
            </kbd>
          </li>
          <li className="flex items-center justify-between gap-2">
            <span>Switch theme</span>
            <span className="font-mono text-[10px]">Light / Dark / Auto</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
