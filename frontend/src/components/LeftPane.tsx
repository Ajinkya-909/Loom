import { useEffect, useRef } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { Loader2, Search, X } from "lucide-react";
import { useLoom } from "@/lib/store";
import { PLATFORMS, PLATFORM_ORDER, type PlatformMeta } from "@/lib/platforms";
import { formatNumber, timeAgo } from "@/lib/format";
import type { CaptureListItem, Platform } from "@/lib/types";

function PlatformChip({ platform }: { platform: Platform }) {
  const meta: PlatformMeta = PLATFORMS[platform];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color: meta.color, backgroundColor: meta.softBg }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color }}
        aria-hidden="true"
      />
      {meta.label}
    </span>
  );
}

function CaptureCard({ capture, active }: { capture: CaptureListItem; active: boolean }) {
  return (
    <Link
      to="/c/$id"
      params={{ id: capture.captureId }}
      className={`block rounded-xl border px-3 py-2.5 transition-colors ${
        active
          ? "border-primary bg-accent"
          : "border-transparent hover:border-border hover:bg-secondary"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 truncate font-serif text-[15px] font-semibold leading-snug">
          {capture.title}
        </h3>
        <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(capture.updatedAt)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <PlatformChip platform={capture.platform} />
        <span className="rounded border border-border px-1.5 py-px font-mono text-[10px] text-muted-foreground">
          v{capture.version}
        </span>
        <span className="text-[11px] text-muted-foreground">
          ~{formatNumber(capture.tokenEstimate)} tok
        </span>
        <span className="text-[11px] text-muted-foreground">· {capture.messageCount} msgs</span>
        {capture.hasSummary && (
          <span className="text-[11px] font-medium text-primary">✦ Summary</span>
        )}
      </div>
    </Link>
  );
}

export function LeftPane() {
  const { captures, capturesLoading, query, setQuery, platform, setPlatform } = useLoom();
  const inputRef = useRef<HTMLInputElement>(null);
  const params = useParams({ strict: false }) as { id?: string };

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("loom:focus-search", focus);
    return () => window.removeEventListener("loom:focus-search", focus);
  }, []);

  const filters: { value: "all" | Platform; label: string }[] = [
    { value: "all", label: "All" },
    ...PLATFORM_ORDER.map((p) => ({ value: p as "all" | Platform, label: PLATFORMS[p].label })),
  ];

  return (
    <aside className="hidden w-[280px] shrink-0 flex-col border-r border-border bg-card/40 md:flex lg:w-[320px]">
      {/* Search */}
      <div className="px-3 pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search captures…"
            aria-label="Search captures"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-8 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Platform filter chips */}
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setPlatform(f.value)}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              platform === f.value
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:border-primary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Capture list */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4 pt-1" aria-label="Capture library">
        {capturesLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 loom-spin" />
          </div>
        ) : captures.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            No captures match{query ? ` “${query}”` : " this filter"}.
          </p>
        ) : (
          captures.map((c) => <CaptureCard key={c.captureId} capture={c} active={c.captureId === params.id} />)
        )}
      </nav>
    </aside>
  );
}
