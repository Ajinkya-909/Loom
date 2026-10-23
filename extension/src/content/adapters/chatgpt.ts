// ChatGPT adapter (FULL). ChatGPT changes markup often, so EVERY selector is here, each with an
// ordered fallback list. Never use hashed/generated class names. Verify against the live DOM.
import { isChatGptUrl } from '../../shared/platforms';
import type { ExpectedCounts, RawMessage } from '../../shared/types';
import type { AssetCandidate, MessageEl, PlatformAdapter } from './types';
import { extractMessageAssets, isContentImage, mapRole, nearestScrollable, stripScripts, textOf, titleFromText, WarningBag } from './util';

export const SELECTORS = {
  /** Ordered: first selector that matches anything wins; index > 0 raises SELECTOR_FALLBACK_USED. */
  message: [
    '[data-message-author-role]',
    '[data-testid^="conversation-turn"]',
    '[data-testid*="conversation-turn"]',
    'article[data-testid^="conversation-turn"]',
    '[data-turn]',
    '[data-message-id]',
    '[data-chatgpt-search-unit-key]',
    '[data-user-message-bubble="true"]',
    'main [class*="agent-turn"], main [class*="user-turn"]',
    'main article',
  ],
  messageIdAttr: 'data-message-id',
  roleAttr: 'data-message-author-role',
  /** Newer markup puts the role on the turn wrapper instead. */
  turnRoleAttr: 'data-turn',
  code: ['pre', 'div[class*="code-block"]', 'div[class*="highlight"]'],
  table: ['table'],
  image: ['img'],
  /** Used ONLY by countExpected: a different query path from listMessageElements on purpose. */
  expectedMessage: [
    '[data-message-author-role]',
    '[data-testid^="conversation-turn"]',
    '[data-testid*="conversation-turn"]',
    '[data-turn]',
    '[data-message-id]',
    'main article',
  ],
  model: ['[data-testid="model-switcher-dropdown-button"]', 'button[aria-label*="model" i]'],
};

const TITLE_SUFFIX = /\s*[-–|]\s*ChatGPT\s*$/i;

export function createChatGptAdapter(): PlatformAdapter {
  const warnings = new WarningBag();

  const roleOf = (el: Element): string | null => {
    // 1. Direct attributes on element or children
    const direct =
      el.getAttribute(SELECTORS.roleAttr)
      ?? el.querySelector(`[${SELECTORS.roleAttr}]`)?.getAttribute(SELECTORS.roleAttr)
      ?? el.getAttribute(SELECTORS.turnRoleAttr)
      ?? el.querySelector(`[${SELECTORS.turnRoleAttr}]`)?.getAttribute(SELECTORS.turnRoleAttr);
    if (direct) return direct;

    // 2. data-testid indicators (e.g. conversation-turn-user, user-message, assistant-message)
    const testId = el.getAttribute('data-testid') || '';
    if (testId.includes('user')) return 'user';
    if (testId.includes('assistant')) return 'assistant';

    // 3. User bubble or assistant markdown styling markers
    if (el.querySelector('[data-user-message-bubble="true"]')) return 'user';
    if (
      el.querySelector('[data-markdown-text-style="assistant-message"]') ||
      el.querySelector('.markdown')
    ) {
      return 'assistant';
    }

    // 4. Action buttons unique to user vs assistant
    if (el.querySelector('button[aria-label*="Edit" i]')) return 'user';
    if (
      el.querySelector(
        'button[aria-label*="Read aloud" i], button[aria-label*="Copy" i], button[aria-label*="Good response" i], button[aria-label*="Bad response" i]'
      )
    ) {
      return 'assistant';
    }

    // 5. Screen reader text
    const sr = el.querySelector('.sr-only, [class*="sr-only"]')?.textContent?.toLowerCase() || '';
    if (sr.includes('you said')) return 'user';
    if (sr.includes('chatgpt said') || sr.includes('assistant said')) return 'assistant';

    // 6. Class name markers
    const cls = typeof el.className === 'string' ? el.className.toLowerCase() : '';
    if (cls.includes('user-turn') || cls.includes('user')) return 'user';
    if (cls.includes('agent-turn') || cls.includes('assistant')) return 'assistant';

    return null;
  };

  const adapter: PlatformAdapter = {
    id: 'chatgpt',
    matches: (url) => isChatGptUrl(url),

    listMessageElements(doc) {
      for (let i = 0; i < SELECTORS.message.length; i++) {
        const found = Array.from(doc.querySelectorAll<HTMLElement>(SELECTORS.message[i]));
        if (found.length) {
          if (i > 0) warnings.add({ code: 'SELECTOR_FALLBACK_USED', detail: SELECTORS.message[i] });
          return found;
        }
      }
      return [];
    },

    getDomId(el) {
      return el.getAttribute(SELECTORS.messageIdAttr)
        ?? el.querySelector(`[${SELECTORS.messageIdAttr}]`)?.getAttribute(SELECTORS.messageIdAttr)
        ?? undefined;
    },

    toRawMessage(el: MessageEl, idx: number): RawMessage {
      const rawRole = roleOf(el);
      let role = mapRole(rawRole);
      if (!role) {
        role = 'assistant';
        warnings.add({ code: 'UNKNOWN_ROLE', detail: rawRole ?? 'missing' });
      }
      const domId = adapter.getDomId(el);
      return { idx, role, html: stripScripts(el).outerHTML, text: textOf(el), ...(domId ? { domId } : {}) };
    },

    getTitle(doc) {
      const fromPage = (doc.title || '').replace(TITLE_SUFFIX, '').trim();
      if (fromPage && fromPage.toLowerCase() !== 'chatgpt') return fromPage;
      const firstUser = adapter.listMessageElements(doc).find((el) => mapRole(roleOf(el)) === 'user');
      return titleFromText(firstUser ? textOf(firstUser) : undefined);
    },

    getModelLabel(doc) {
      for (const sel of SELECTORS.model) {
        const t = doc.querySelector(sel)?.textContent?.trim();
        if (t) return t.slice(0, 60);
      }
      return undefined;
    },

    findScrollContainer(doc) {
      return nearestScrollable(adapter.listMessageElements(doc)[0] ?? null, doc);
    },

    countExpected(doc): ExpectedCounts {
      const first = (sels: string[]) => {
        for (const s of sels) {
          const n = doc.querySelectorAll(s).length;
          if (n) return n;
        }
        return 0;
      };
      const images = Array.from(doc.querySelectorAll<HTMLImageElement>(
        SELECTORS.expectedMessage.map((m) => `${m} img`).join(', '),
      )).filter(isContentImage);
      return {
        messageCount: first(SELECTORS.expectedMessage),
        codeBlockCount: first(SELECTORS.code),
        tableCount: first(SELECTORS.table),
        imageCount: new Set(images).size,
      };
    },

    findAssets(el): AssetCandidate[] {
      return extractMessageAssets(el);
    },

    takeWarnings: () => warnings.take(),
  };
  return adapter;
}
