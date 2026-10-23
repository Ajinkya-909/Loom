import type { Platform } from "./types";

export interface PlatformMeta {
  label: string;
  color: string;
  softBg: string;
  letter: string;
}

/** Platform brand colors are data (like chart colors), not theme tokens. */
export const PLATFORMS: Record<string, PlatformMeta> = {
  chatgpt: { label: "ChatGPT", color: "#10a37f", softBg: "rgba(16,163,127,0.12)", letter: "G" },
  claude: { label: "Claude", color: "#d97757", softBg: "rgba(217,119,87,0.13)", letter: "C" },
  gemini: { label: "Gemini", color: "#4796e3", softBg: "rgba(71,150,227,0.13)", letter: "G" },
  deepseek: { label: "DeepSeek", color: "#5b6cfa", softBg: "rgba(91,108,250,0.13)", letter: "D" },
  perplexity: { label: "Perplexity", color: "#20808d", softBg: "rgba(32,128,141,0.13)", letter: "P" },
  grok: { label: "Grok", color: "#ff6f00", softBg: "rgba(255,111,0,0.13)", letter: "X" },
  generic: { label: "Web Chat", color: "#71717a", softBg: "rgba(113,113,122,0.13)", letter: "W" },
};

export const PLATFORM_ORDER: string[] = ["chatgpt", "claude", "gemini", "deepseek", "perplexity"];

export function getPlatformMeta(platform?: string): PlatformMeta {
  const key = (platform || "generic").toLowerCase();
  return (
    PLATFORMS[key] ?? {
      label: platform ? platform.charAt(0).toUpperCase() + platform.slice(1).toLowerCase() : "Chat",
      color: "#71717a",
      softBg: "rgba(113,113,122,0.13)",
      letter: (platform || "C").charAt(0).toUpperCase(),
    }
  );
}
