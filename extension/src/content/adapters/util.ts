import { MIN_IMAGE_PX, TITLE_FALLBACK_CHARS } from '../../shared/constants';
import type { Role, Warning } from '../../shared/types';

/** innerText where the engine has it (browsers), textContent otherwise (jsdom in tests). */
export function textOf(el: Element): string {
  const t = (el as HTMLElement).innerText;
  return typeof t === 'string' ? t : el.textContent ?? '';
}

export function nearestScrollable(el: Element | null, doc: Document): HTMLElement {
  const view = doc.defaultView;
  let cur: Element | null = el?.parentElement ?? null;
  while (cur && view) {
    const oy = view.getComputedStyle(cur).overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && cur.scrollHeight > cur.clientHeight) return cur as HTMLElement;
    cur = cur.parentElement;
  }
  return (doc.scrollingElement ?? doc.documentElement) as HTMLElement;
}

import type { AssetCandidate } from './types';

/** Content images only: not icons/avatars, not UI action buttons. */
export function isContentImage(img: HTMLImageElement): boolean {
  const src = img.currentSrc || img.getAttribute('src') || '';
  if (!src) return false;

  // Reject UI action controls (Copy, Share, Read aloud, Like, Thumbs, Edit, More, Regenerate)
  if (
    img.closest(
      'button[aria-label*="Copy" i], button[aria-label*="Share" i], button[aria-label*="Read aloud" i], ' +
      'button[aria-label*="Edit" i], button[aria-label*="More" i], button[aria-label*="Thumbs" i], ' +
      'button[aria-label*="Good response" i], button[aria-label*="Bad response" i], ' +
      'button[aria-label*="Regenerate" i], [class*="turn-action"], [class*="action-controls"]'
    )
  ) {
    return false;
  }

  // Reject avatars and explicit icons
  if (img.closest('[class*="avatar"], [class*="icon-xs"], [class*="icon-sm"]')) return false;
  const alt = img.getAttribute('alt') || '';
  if (/avatar|user-icon|bot-icon|favicon/i.test(alt) || (/icon|logo/i.test(alt) && !/oaiusercontent|googleusercontent|anthropic|blob:/i.test(src))) {
    return false;
  }

  const w = Math.max(
    img.naturalWidth || 0,
    img.width || 0,
    img.getBoundingClientRect ? (img.getBoundingClientRect().width || 0) : 0
  );
  const h = Math.max(
    img.naturalHeight || 0,
    img.height || 0,
    img.getBoundingClientRect ? (img.getBoundingClientRect().height || 0) : 0
  );

  // If dimensions are rendered, check min dimensions
  if (w > 0 && h > 0) {
    return w > MIN_IMAGE_PX && h > MIN_IMAGE_PX;
  }

  // Dimensions not yet loaded / jsdom headless: trust valid content image sources
  if (/^(data:image\/|blob:)/i.test(src)) return true;
  if (/oaiusercontent\.com|oaidalle|googleusercontent\.com|anthropic\.com|twimg\.com|deepseek\.com/i.test(src)) return true;
  if (/\.(png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(src)) return true;

  return false;
}

export const FILE_LINK_RE = /\.(csv|tsv|pdf|zip|xlsx?|docx?|pptx?|json|txt|md)(?:$|[?#])/i;
export const FILE_NAME_RE = /[\w\-.]+\.(csv|tsv|pdf|zip|xlsx?|docx?|pptx?|json|txt|md)\b/i;

/** Extracts all images, PDFs, attachments and downloadable files from a message element */
export function extractMessageAssets(el: Element): AssetCandidate[] {
  const out: AssetCandidate[] = [];
  const seenUrls = new Set<string>();

  // 1. Content <img> elements (user uploaded and AI generated/embedded images)
  el.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
    if (!isContentImage(img)) return;
    const url = img.currentSrc || img.src || img.getAttribute('data-src') || '';
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    out.push({ url, kind: 'image', el: img });
  });

  // 2. Links to files & PDFs (markdown links, download buttons, document links)
  el.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.href || a.getAttribute('href') || '';
    if (!/^https?:|^blob:/i.test(href)) return;
    if (seenUrls.has(href)) return;

    const downloadAttr = a.getAttribute('download');
    const linkText = (a.textContent || '').trim();
    const hasDownload = downloadAttr !== null;
    const matchesFileExt = FILE_LINK_RE.test(href);
    const textHasFileExt = FILE_NAME_RE.test(linkText);
    const isFileEndpoint = /\/(files|backend-api\/files|attachments|downloads)\//i.test(href) ||
      /files\.oaiusercontent\.com/i.test(href);

    if (hasDownload || matchesFileExt || textHasFileExt || isFileEndpoint) {
      let filename = downloadAttr || undefined;
      if (!filename && textHasFileExt) {
        filename = linkText.match(FILE_NAME_RE)?.[0];
      }
      seenUrls.add(href);
      out.push({ url: href, kind: 'file', filename });
    }
  });

  // 3. Modern attachment cards / chips (Grok, ChatGPT, Claude, Gemini attachments)
  el.querySelectorAll<HTMLElement>(
    '[class*="file-card"], [data-testid*="attachment"], [data-testid*="file"], [class*="attachment"], [role="button"][aria-label*="."], [aria-label*=".pdf" i]'
  ).forEach((card) => {
    const cardAria = card.getAttribute('aria-label') || '';
    const cardText = (card.textContent || '').trim();
    const downloadBtn = card.querySelector<HTMLElement>(
      'button[aria-label*="Download" i], [aria-label*="Download" i], button[data-slot="button"]'
    );
    const downloadAria = downloadBtn?.getAttribute('aria-label') || '';

    const matched =
      cardAria.match(FILE_NAME_RE)?.[0] ||
      downloadAria.match(FILE_NAME_RE)?.[0] ||
      cardText.match(FILE_NAME_RE)?.[0] ||
      card.querySelector<HTMLAnchorElement>('a[href]')?.getAttribute('download') ||
      undefined;

    const a = card.querySelector<HTMLAnchorElement>('a[href]') || (card instanceof HTMLAnchorElement ? card : null);
    let href = a?.href || card.getAttribute('data-url') || card.getAttribute('data-file-url') || card.getAttribute('data-download-url') || '';

    if (!href) {
      const withUrl = card.querySelector<HTMLElement>('[data-url], [data-file-url], [data-download-url], [data-src], [data-path]');
      if (withUrl) {
        href = withUrl.getAttribute('data-url') || withUrl.getAttribute('data-file-url') || withUrl.getAttribute('data-download-url') || withUrl.getAttribute('data-src') || withUrl.getAttribute('data-path') || '';
      }
    }

    // Check if window.__contextPortBlobs has matching blob from URL.createObjectURL hook
    if (!href && typeof window !== 'undefined' && (window as any).__contextPortBlobs) {
      const blobs = (window as any).__contextPortBlobs as Map<string, { blob: Blob; mime: string; name?: string }>;
      for (const [blobUrl, info] of blobs.entries()) {
        if (matched && (info.name === matched || (info.mime === 'application/pdf' && matched.endsWith('.pdf')))) {
          href = blobUrl;
          break;
        }
      }
    }

    if (href && /^https?:|^blob:/i.test(href)) {
      if (!seenUrls.has(href)) {
        seenUrls.add(href);
        out.push({ url: href, kind: 'file', filename: matched, el: (downloadBtn || card) as any });
      }
      return;
    }

    // If card has matched file name but no direct URL, register for download trigger resolution
    if (matched) {
      const pseudoUrl = `attachment://${encodeURIComponent(matched)}`;
      if (!seenUrls.has(pseudoUrl)) {
        seenUrls.add(pseudoUrl);
        out.push({
          url: pseudoUrl,
          kind: 'file',
          filename: matched,
          el: (downloadBtn || card) as any,
        });
      }
    }
  });

  // 4. Standalone canvas elements (e.g. chart canvas)
  el.querySelectorAll<HTMLCanvasElement>('canvas').forEach((cv) => {
    // NEVER capture a PDF or document preview canvas as an image!
    const isDocPreview = cv.closest(
      '[class*="file-card"], [data-testid*="attachment"], [data-testid*="file"], [class*="attachment"], [aria-label*=".pdf" i], [aria-label*="preview" i], [role="button"][aria-label*="."]'
    );
    if (isDocPreview) return;

    const parentText = cv.parentElement?.textContent || '';
    if (FILE_NAME_RE.test(parentText)) return;

    // Only capture if not tiny spinner/tracker
    if (cv.width > MIN_IMAGE_PX && cv.height > MIN_IMAGE_PX) {
      try {
        const dataUrl = cv.toDataURL('image/png');
        if (dataUrl && !seenUrls.has(dataUrl)) {
          seenUrls.add(dataUrl);
          out.push({ url: dataUrl, kind: 'image', el: cv });
        }
      } catch { /* tainted */ }
    }
  });

  return out;
}

export function titleFromText(text: string | undefined): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, TITLE_FALLBACK_CHARS) : 'Untitled chat';
}

export function mapRole(raw: string | null | undefined): Role | null {
  switch ((raw ?? '').toLowerCase()) {
    case 'user': case 'human': return 'user';
    case 'assistant': case 'bot': case 'model': return 'assistant';
    case 'system': return 'system';
    case 'tool': case 'function': return 'tool';
    default: return null;
  }
}

/** Collects de-duplicated warnings. */
export class WarningBag {
  private seen = new Set<string>();
  private list: Warning[] = [];
  add(w: Warning): void {
    const k = `${w.code}:${w.ref ?? ''}:${w.detail ?? ''}`;
    if (!this.seen.has(k)) { this.seen.add(k); this.list.push(w); }
  }
  take(): Warning[] {
    const out = this.list;
    this.list = [];
    this.seen.clear();
    return out;
  }
}

export function stripScripts(el: Element): Element {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('script').forEach((s) => s.remove());
  return clone;
}
