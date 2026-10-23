import { isClaudeUrl } from '../../shared/platforms';
import type { ExpectedCounts, RawMessage } from '../../shared/types';
import type { AssetCandidate, MessageEl, PlatformAdapter } from './types';
import {
  extractMessageAssets,
  isContentImage,
  nearestScrollable,
  stripScripts,
  textOf,
  titleFromText,
  WarningBag,
} from './util';

export const CLAUDE_SELECTORS = {
  message: [
    '[data-testid="transcript-row"]',
    '[data-testid="user-message"], [data-testid="assistant-message"]',
    '.font-user-message, .font-claude-message',
    '[data-testid*="turn"]',
    '[data-testid*="message-row"]',
    'div[class*="ChatMessage"]',
  ],
  code: ['pre'],
  table: ['table'],
  image: ['img'],
};

export function createClaudeAdapter(): PlatformAdapter {
  const warnings = new WarningBag();

  const roleOf = (el: Element): 'user' | 'assistant' => {
    if (el.querySelector('[data-testid="user-message"], .font-user-message')) return 'user';
    if (el.querySelector('[data-testid="assistant-message"], .font-claude-message, .standard-markdown')) return 'assistant';
    const testId = el.getAttribute('data-testid') || '';
    if (testId.includes('user')) return 'user';
    if (testId.includes('assistant') || testId.includes('claude')) return 'assistant';
    return 'assistant';
  };

  const adapter: PlatformAdapter = {
    id: 'claude',
    matches: (url) => isClaudeUrl(url),

    listMessageElements(doc) {
      for (const sel of CLAUDE_SELECTORS.message) {
        const found = Array.from(doc.querySelectorAll<HTMLElement>(sel));
        if (found.length) return found;
      }
      return [];
    },

    getDomId(el) {
      return el.getAttribute('data-testid') || undefined;
    },

    toRawMessage(el: MessageEl, idx: number): RawMessage {
      const role = roleOf(el);
      const clone = el.cloneNode(true) as HTMLElement;
      // Clean non-content buttons/badges
      clone.querySelectorAll('button, svg, [role="button"], [data-testid*="actions"]').forEach((n) => n.remove());
      const domId = adapter.getDomId(el);
      return {
        idx,
        role,
        html: stripScripts(clone).outerHTML,
        text: textOf(clone),
        ...(domId ? { domId } : {}),
      };
    },

    getTitle(doc) {
      const fromPage = (doc.title || '').replace(/\s*[-–|]\s*Claude\s*$/i, '').trim();
      if (fromPage && fromPage.toLowerCase() !== 'claude') return fromPage;
      const firstUser = adapter.listMessageElements(doc).find((el) => roleOf(el) === 'user');
      return titleFromText(firstUser ? textOf(firstUser) : undefined);
    },

    findScrollContainer(doc) {
      return nearestScrollable(adapter.listMessageElements(doc)[0] ?? null, doc);
    },

    countExpected(doc): ExpectedCounts {
      const messages = adapter.listMessageElements(doc);
      return {
        messageCount: messages.length,
        codeBlockCount: doc.querySelectorAll('pre').length,
        tableCount: doc.querySelectorAll('table').length,
        imageCount: Array.from(doc.querySelectorAll<HTMLImageElement>('img')).filter(isContentImage).length,
      };
    },

    findAssets(el): AssetCandidate[] {
      return extractMessageAssets(el);
    },

    takeWarnings: () => warnings.take(),
  };

  return adapter;
}
