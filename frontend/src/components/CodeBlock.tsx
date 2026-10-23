import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CodeBlockProps {
  code: string;
  lang?: string | undefined;
}

export function CodeBlock({ code, lang }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lines = code.replace(/\n$/, "").split("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="my-1 overflow-hidden rounded-xl border border-border bg-secondary">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {lang ?? "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <div className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed text-foreground">
        {lines.map((line, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <div key={i} className="flex">
            <span className="w-7 shrink-0 select-none pr-3 text-right text-muted-foreground/50">
              {i + 1}
            </span>
            <span className="whitespace-pre">{line.length ? line : " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
