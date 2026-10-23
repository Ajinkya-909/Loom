// Register all supported AI platforms
import { createChatGptAdapter } from './chatgpt';
import { createClaudeAdapter } from './claude';
import { createGeminiAdapter } from './gemini';
import { createGrokAdapter } from './grok';
import { createPerplexityAdapter } from './perplexity';
import { createDeepSeekAdapter } from './deepseek';
import { createGenericAdapter } from './generic';
import type { PlatformAdapter } from './types';

const FACTORIES: Array<() => PlatformAdapter> = [
  createChatGptAdapter,
  createClaudeAdapter,
  createGeminiAdapter,
  createGrokAdapter,
  createPerplexityAdapter,
  createDeepSeekAdapter,
];

export function detectAdapter(
  location: Location | URL,
  doc: Document,
  opts: { allowGeneric?: boolean } = {}
): PlatformAdapter | null {
  const url = new URL(location.href);
  for (const make of FACTORIES) {
    const a = make();
    if (a.matches(url)) return a;
  }

  // If URL didn't match a specific platform, check if the page has generic AI conversation patterns
  if (opts.allowGeneric) {
    const generic = createGenericAdapter();
    // Only return generic if the page actually has messages or turns
    if (generic.listMessageElements(doc).length > 0) {
      return generic;
    }
  }

  return null;
}
