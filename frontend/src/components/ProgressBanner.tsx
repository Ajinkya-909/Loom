import { Check, Loader2 } from "lucide-react";

interface ProgressBannerProps {
  stage: string;
  progress: number;
  done?: boolean;
}

export function ProgressBanner({ stage, progress, done }: ProgressBannerProps) {
  if (done) {
    return (
      <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-success/30 bg-success-soft px-4 py-2.5 text-sm text-success">
        <Check className="h-4 w-4" />
        <span className="font-medium">{stage || "Summary ready"}</span>
      </div>
    );
  }
  return (
    <div className="mb-5 rounded-xl border border-primary/30 bg-accent px-4 py-3">
      <div className="flex items-center gap-2.5">
        <Loader2 className="h-4 w-4 shrink-0 loom-spin text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{stage}</span>
        <span className="font-mono text-xs text-muted-foreground">{Math.round(progress)}%</span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="relative h-full overflow-hidden rounded-full bg-primary loom-shimmer"
          style={{ width: `${Math.max(3, Math.min(progress, 100))}%` }}
        />
      </div>
    </div>
  );
}
