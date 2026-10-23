import { isGeminiUrl } from '../../shared/platforms';
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

export const GEMINI_SELECTORS = {
  message: [
    'user-query, model-response',
    'sparkler-chat-turn',
    'div.chat-turn',
    'div[class*="chat-turn"]',
    'div[class*="conversation-turn"]',
    'div.conversation-container',
  ],
  code: ['pre', 'code-block'],
  table: ['table'],
  image: ['img'],
};

export function createGeminiAdapter(): PlatformAdapter {
  const warnings = new WarningBag();

  const roleOf = (el: Element): 'user' | 'assistant' => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'user-query' || el.querySelector('.query-text')) return 'user';
    return 'assistant';
  };

  const adapter: PlatformAdapter = {
    id: 'gemini',
    matches: (url) => isGeminiUrl(url),

    listMessageElements(doc) {
      for (const sel of GEMINI_SELECTORS.message) {
        const found = Array.from(doc.querySelectorAll<HTMLElement>(sel));
        if (found.length) return found;
      }
      return [];
    },

    getDomId(el) {
      return el.getAttribute('id') || undefined;
    },

    toRawMessage(el: MessageEl, idx: number): RawMessage {
      const role = roleOf(el);
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('button, svg, [role="button"], .response-actions, .screen-reader-user-query-label').forEach((n) => n.remove());

      let cleanText = textOf(clone);
      if (role === 'user') {
        cleanText = cleanText.replace(/^You said\s*/i, '').trim();
      } else {
        cleanText = cleanText.replace(/^Gemini said\s*/i, '').trim();
      }

      const domId = adapter.getDomId(el);
      return {
        idx,
        role,
        html: stripScripts(clone).outerHTML,
        text: cleanText,
        ...(domId ? { domId } : {}),
      };
    },

    getTitle(doc) {
      const fromPage = (doc.title || '').replace(/\s*[-–|]\s*(Google Gemini|Gemini)\s*$/i, '').trim();
      if (fromPage && !fromPage.toLowerCase().includes('gemini')) return fromPage;
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
        codeBlockCount: doc.querySelectorAll('pre, code-block').length,
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
