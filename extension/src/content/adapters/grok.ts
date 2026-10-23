import { isGrokUrl } from '../../shared/platforms';
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

export const GROK_SELECTORS = {
  message: [
    '.response-content-markdown, .bg-surface-user-bubble',
    '.bg-surface-user-bubble, .streamdown-chat-md',
    '.response-content-markdown',
    'div[class*="message-bubble"]',
    'div[class*="chat-message"]',
  ],
  code: ['pre'],
  table: ['table'],
  image: ['img'],
};

export function createGrokAdapter(): PlatformAdapter {
  const warnings = new WarningBag();

  const roleOf = (el: Element): 'user' | 'assistant' => {
    if (el.closest('.bg-surface-user-bubble') || el.classList.contains('bg-surface-user-bubble')) return 'user';
    return 'assistant';
  };

  const adapter: PlatformAdapter = {
    id: 'grok',
    matches: (url) => isGrokUrl(url),

    listMessageElements(doc) {
      for (const sel of GROK_SELECTORS.message) {
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

      // Preserve file cards before cleaning UI buttons
      clone.querySelectorAll('[class*="file-card"], [class*="attachment"]').forEach((card) => {
        const cardAria = card.getAttribute('aria-label') || '';
        const fn = cardAria.match(/[\w\-.]+\.(?:csv|tsv|pdf|zip|xlsx?|docx?|pptx?|json|txt|md)\b/i)?.[0] ||
          textOf(card).match(/[\w\-.]+\.(?:csv|tsv|pdf|zip|xlsx?|docx?|pptx?|json|txt|md)\b/i)?.[0];
        if (fn) {
          const span = document.createElement('span');
          span.textContent = `\n[📎 Attached File: ${fn}]\n`;
          card.replaceWith(span);
        }
      });

      clone.querySelectorAll('button, svg, [role="button"]').forEach((n) => n.remove());

      let cleanText = textOf(clone);
      if (role === 'user') {
        cleanText = cleanText.replace(/^You\s*/i, '').trim();
      } else {
        cleanText = cleanText.replace(/^GrokWorked for [^\n]+\n*/i, '').trim();
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
      const fromPage = (doc.title || '')
        .replace(/\s*[-–|]\s*Grok.*$/i, '')
        .replace(/Back Button.*$/i, '')
        .trim();
      if (fromPage && !fromPage.toLowerCase().includes('grok')) return fromPage;
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
