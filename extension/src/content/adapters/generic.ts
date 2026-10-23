import type { ExpectedCounts, RawMessage } from '../../shared/types';
import type { AssetCandidate, MessageEl, PlatformAdapter } from './types';
import {
  extractMessageAssets,
  isContentImage,
  mapRole,
  nearestScrollable,
  stripScripts,
  textOf,
  titleFromText,
  WarningBag,
} from './util';

export const GENERIC_SELECTORS = [
  '[data-message-author-role]',
  '[data-testid*="conversation-turn"], [data-testid*="chat-turn"]',
  '[data-testid*="message"], [data-testid*="chat-row"]',
  '[class*="ChatMessage"], [class*="chat-message"], [class*="message-item"]',
  '[class*="user-bubble"], [class*="agent-turn"], [class*="assistant-bubble"]',
  '[class*="bubble"][class*="message"]',
  'main article',
  'article',
];

export function createGenericAdapter(): PlatformAdapter {
  const warnings = new WarningBag();

  const roleOf = (el: Element, idx: number): 'user' | 'assistant' => {
    const raw =
      el.getAttribute('data-message-author-role') ||
      el.getAttribute('data-role') ||
      el.getAttribute('data-turn') ||
      el.getAttribute('data-testid') ||
      '';
    const mapped = mapRole(raw);
    if (mapped === 'user') return 'user';
    if (mapped === 'assistant') return 'assistant';

    const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    if (cls.includes('user') || cls.includes('human')) return 'user';
    if (cls.includes('assistant') || cls.includes('bot') || cls.includes('agent') || cls.includes('model')) return 'assistant';

    // Alternate: even idx is user, odd idx is assistant
    return idx % 2 === 0 ? 'user' : 'assistant';
  };

  const adapter: PlatformAdapter = {
    id: 'generic',
    matches: (url) => url.protocol === 'http:' || url.protocol === 'https:',

    listMessageElements(doc) {
      for (const sel of GENERIC_SELECTORS) {
        const found = Array.from(doc.querySelectorAll<HTMLElement>(sel));
        if (found.length) return found;
      }
      return [];
    },

    getDomId(el) {
      return el.getAttribute('id') || el.getAttribute('data-testid') || undefined;
    },

    toRawMessage(el: MessageEl, idx: number): RawMessage {
      const role = roleOf(el, idx);
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('button, svg, [role="button"]').forEach((n) => n.remove());

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
      return titleFromText(doc.title);
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
