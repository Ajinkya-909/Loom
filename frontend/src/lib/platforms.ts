import type { Platform } from "./types";

export interface PlatformMeta {
  label: string;
  color: string;
  softBg: string;
  letter: string;
}

/** Platform brand colors are data (like chart colors), not theme tokens. */
export const PLATFORMS: Record<Platform, PlatformMeta> = {
  chatgpt: { label: "ChatGPT", color: "#10a37f", softBg: "rgba(16,163,127,0.12)", letter: "G" },
  claude: { label: "Claude", color: "#d97757", softBg: "rgba(217,119,87,0.13)", letter: "C" },
  gemini: { label: "Gemini", color: "#4796e3", softBg: "rgba(71,150,227,0.13)", letter: "G" },
  deepseek: { label: "DeepSeek", color: "#5b6cfa", softBg: "rgba(91,108,250,0.13)", letter: "D" },
  perplexity: { label: "Perplexity", color: "#20808d", softBg: "rgba(32,128,141,0.13)", letter: "P" },
};

export const PLATFORM_ORDER: Platform[] = ["chatgpt", "claude", "gemini", "deepseek", "perplexity"];
