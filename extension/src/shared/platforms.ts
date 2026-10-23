// URL-only platform detection, shared by the background (which cannot touch the DOM) and adapters.
import type { PlatformId } from './types';

export function isChatGptUrl(url: URL): boolean {
  return url.protocol === 'https:' && (url.hostname === 'chatgpt.com' || url.hostname === 'chat.openai.com');
}

export function isClaudeUrl(url: URL): boolean {
  return url.protocol === 'https:' && (url.hostname === 'claude.ai' || url.hostname.endsWith('.claude.ai'));
}

export function isGeminiUrl(url: URL): boolean {
  return url.protocol === 'https:' && (url.hostname === 'gemini.google.com' || url.hostname === 'bard.google.com');
}

export function isGrokUrl(url: URL): boolean {
  return url.protocol === 'https:' && (url.hostname === 'grok.com' || url.hostname === 'x.ai' || url.hostname.endsWith('.x.ai'));
}

export function isPerplexityUrl(url: URL): boolean {
  return url.protocol === 'https:' && (url.hostname === 'perplexity.ai' || url.hostname.endsWith('.perplexity.ai'));
}

export function isDeepSeekUrl(url: URL): boolean {
  return url.protocol === 'https:' && (url.hostname === 'deepseek.com' || url.hostname.endsWith('.deepseek.com'));
}

export function platformFromUrl(raw: string | undefined): PlatformId | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (isChatGptUrl(u)) return 'chatgpt';
    if (isClaudeUrl(u)) return 'claude';
    if (isGeminiUrl(u)) return 'gemini';
    if (isGrokUrl(u)) return 'grok';
    if (isPerplexityUrl(u)) return 'perplexity';
    if (isDeepSeekUrl(u)) return 'deepseek';
    // If standard http/https URL, allow generic probe
    if (u.protocol === 'http:' || u.protocol === 'https:') return 'generic';
  } catch { /* not a URL */ }
  return null;
}

export const PLATFORM_LABEL: Record<string, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  grok: 'Grok',
  perplexity: 'Perplexity',
  deepseek: 'DeepSeek',
  generic: 'AI Conversation',
};
