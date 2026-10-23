import { isPerplexityUrl } from '../../shared/platforms';
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

export const PERPLEXITY_SELECTORS = {
  message: [
    '[data-testid="default-question"], [data-testid="answer-content"]',
    '[data-testid="default-question"], .default-query, [data-testid="answer-content"], div[class*="prose"]',
    '[data-testid="answer-content"]',
    'div[class*="prose"]',
  ],
  code: ['pre'],
  table: ['table'],
  image: ['img'],
};

export function createPerplexityAdapter(): PlatformAdapter {
  const warnings = new WarningBag();

  const roleOf = (el: Element): 'user' | 'assistant' => {
    if (el.matches('[data-testid="default-question"], .default-query, [class*="query"]')) return 'user';
    return 'assistant';
  };

  const adapter: PlatformAdapter = {
    id: 'perplexity',
    matches: (url) => isPerplexityUrl(url),

    listMessageElements(doc) {
      for (const sel of PERPLEXITY_SELECTORS.message) {
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
      clone.querySelectorAll('button, svg, [role="button"], .trusted-citation-check').forEach((n) => n.remove());

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
      const fromPage = (doc.title || '').replace(/\s*[-–|]\s*Perplexity\s*$/i, '').trim();
      return titleFromText(fromPage);
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
