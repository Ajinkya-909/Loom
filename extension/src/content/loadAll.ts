// Loads the ENTIRE conversation. Long chats lazy-load older messages when you scroll up, and
// some lists virtualize (remove off-screen nodes), so we also harvest while scrolling down.
import {
  LOAD_TIMEOUT_MS, MAX_LOAD_ITERATIONS, MAX_SCROLL_STEPS, SCROLL_STEP_WAIT_MS, SCROLL_WAIT_MS, STABLE_CHECKS,
} from '../shared/constants';
import { hashString } from '../shared/hash';
import type { RawMessage } from '../shared/types';
import type { AssetCandidate, PlatformAdapter } from './adapters/types';
import { sleep, throwIfAborted } from './util';

export interface CollectedMessage { key: string; raw: RawMessage; candidates: AssetCandidate[] }
export interface LoadResult { messages: CollectedMessage[]; timedOut: boolean }

/**
 * Merge the keys visible right now into the running DOM-order list.
 * Unknown keys before the first already-known key go before it (older messages loaded above);
 * everything else keeps its position relative to the last known neighbour; if nothing visible is
 * known yet we are scrolling down into new territory, so append.
 */
export function mergeOrder(order: string[], visible: string[]): void {
  const firstKnown = visible.findIndex((k) => order.includes(k));
  if (firstKnown === -1) { order.push(...visible); return; }
  const pos = order.indexOf(visible[firstKnown]);
  order.splice(pos, 0, ...visible.slice(0, firstKnown));
  let cursor = pos + firstKnown + 1;
  for (let i = firstKnown + 1; i < visible.length; i++) {
    const k = visible[i];
    const at = order.indexOf(k);
    if (at === -1) { order.splice(cursor, 0, k); cursor++; }
    else cursor = at + 1;
  }
}

export async function loadAll(
  adapter: PlatformAdapter, doc: Document, signal: AbortSignal, report: (loaded: number) => void,
): Promise<LoadResult> {
  const container = adapter.findScrollContainer(doc);
  const originalTop = container.scrollTop; // 1. remember scroll position
  let timedOut = false;

  // key -> message. Keyed by platform message id; fallback: index + hash of text.
  const map = new Map<string, CollectedMessage & { sig: string }>();
  const order: string[] = [];

  const collect = () => {
    const visible: string[] = [];
    adapter.listMessageElements(doc).forEach((el, i) => {
      const domId = adapter.getDomId(el);
      // Change signature detects text or newly rendered media/attachments
      const sig = `${el.textContent?.length ?? 0}:${el.querySelectorAll('img, a, canvas, [class*="file"]').length}`;
      let key = domId ? `id:${domId}` : '';
      if (key && visible.includes(key)) key += `#${i}`;
      const prev = key ? map.get(key) : undefined;
      if (prev && prev.sig === sig) { visible.push(key); return; }
      const raw = adapter.toRawMessage(el, -1); // idx assigned at the very end
      if (!key) key = `h:${i}:${hashString(raw.role + raw.text)}`;
      map.set(key, { key, raw, candidates: adapter.findAssets(el), sig });
      visible.push(key);
    });
    mergeOrder(order, visible);
  };

  try {
    // 2-3. Scroll to top until the message count is stable for STABLE_CHECKS checks.
    const started = Date.now();
    let last = -1, stable = 0, stabilized = false;
    for (let i = 0; i < MAX_LOAD_ITERATIONS; i++) {
      throwIfAborted(signal); // 8. check abort every iteration
      if (Date.now() - started > LOAD_TIMEOUT_MS) break;
      container.scrollTop = 20; // nudge so a scroll event fires even when already at the top
      await sleep(40, signal);
      container.scrollTop = 0;
      await sleep(SCROLL_WAIT_MS, signal);
      const n = adapter.listMessageElements(doc).length;
      report(n); // 6. progress
      if (n === last) stable++; else { stable = 0; last = n; }
      if (stable >= STABLE_CHECKS) { stabilized = true; break; }
    }
    if (!stabilized) timedOut = true; // 7. keep what we have, warn, continue

    // 4. Walk top -> bottom, harvesting at every step (handles virtualized lists).
    const walkStart = Date.now();
    container.scrollTop = 0;
    await sleep(SCROLL_STEP_WAIT_MS, signal);
    for (let steps = 0; ; steps++) {
      throwIfAborted(signal);
      collect();
      report(order.length);
      const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2;
      if (atBottom) break;
      if (steps >= MAX_SCROLL_STEPS || Date.now() - walkStart > LOAD_TIMEOUT_MS) { timedOut = true; break; }
      const before = container.scrollTop;
      container.scrollTop = before + Math.max(200, container.clientHeight * 0.9);
      await sleep(SCROLL_STEP_WAIT_MS, signal);
      if (container.scrollTop === before) break; // cannot scroll further
    }
    collect(); // final harvest at the bottom
  } finally {
    container.scrollTop = originalTop; // 5. restore (also on cancel/error)
  }

  const messages = order.map((k) => map.get(k)).filter((m): m is CollectedMessage & { sig: string } => !!m);
  return { messages, timedOut };
}
