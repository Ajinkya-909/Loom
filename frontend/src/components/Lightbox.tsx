import { useEffect } from "react";
import { Download, X } from "lucide-react";
import type { Asset } from "@/lib/types";
import { formatBytes } from "@/lib/format";

interface LightboxProps {
  asset: Asset;
  onClose: () => void;
}

export function Lightbox({ asset, onClose }: LightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/70 p-8"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-border bg-card p-3 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={asset.name}
      >
        <img
          src={asset.url}
          alt={asset.name}
          className="max-h-[70vh] w-full rounded-xl border border-border object-contain"
        />
        <div className="flex items-center gap-3 px-2 pb-1 pt-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{asset.name}</p>
            <p className="text-xs text-muted-foreground">
              {asset.size ? `${formatBytes(asset.size)} · ` : ""}{asset.mime}
            </p>
          </div>
          <a
            href={asset.url}
            download={asset.name}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="inline-grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
