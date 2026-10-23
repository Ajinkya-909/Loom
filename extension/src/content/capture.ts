// Content-side capture pipeline: load all -> collect -> send core data -> rescue assets.
import { JSON_CHUNK_CHARS } from '../shared/constants';
import { CaptureError } from '../shared/errors';
import type { ContentEvent } from '../shared/protocol';
import type { CoreMeta, RawMessage, Warning } from '../shared/types';
import type { PlatformAdapter } from './adapters/types';
import { rescueAssets } from './assets';
import { loadAll } from './loadAll';

export interface CaptureDeps {
  adapter: PlatformAdapter;
  doc: Document;
  runId: string;
  skipAssets: boolean;
  signal: AbortSignal;
  post: (ev: ContentEvent) => Promise<void>;
  ask: <T>(ev: ContentEvent) => Promise<T>;
}

/** Page HTML with scripts removed. Never mutates the live DOM (works on a clone). */
export function snapshotHtml(doc: Document): string {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script').forEach((s) => s.remove());
  return `<!DOCTYPE html>\n${clone.outerHTML}`;
}

/** A string part is split into <= JSON_CHUNK_CHARS pieces; always at least one (even if empty). */
async function sendString(deps: CaptureDeps, part: 'meta' | 'messages' | 'snapshot', data: string): Promise<void> {
  const total = Math.max(1, Math.ceil(data.length / JSON_CHUNK_CHARS));
  for (let seq = 0; seq < total; seq++) {
    await deps.post({ type: 'PART', runId: deps.runId, part, seq, total, data: data.slice(seq * JSON_CHUNK_CHARS, (seq + 1) * JSON_CHUNK_CHARS) });
  }
}

export async function runCapture(deps: CaptureDeps): Promise<void> {
  const { adapter, doc, runId } = deps;
  const warnings: Warning[] = [];
  adapter.takeWarnings(); // drop anything left from probing

  // 1. LOAD
  await deps.post({ type: 'PROGRESS', runId, step: 'LOADING_CHAT', detail: 'Loaded 0 messages' });
  const loaded = await loadAll(adapter, doc, deps.signal, (n) => {
    void deps.post({ type: 'PROGRESS', runId, step: 'LOADING_CHAT', detail: `Loaded ${n} messages` }).catch(() => {});
  });
  if (loaded.timedOut) warnings.push({ code: 'LOAD_TIMEOUT' });

  // 2. CAPTURE
  await deps.post({ type: 'PROGRESS', runId, step: 'CAPTURING' });
  if (loaded.messages.length === 0) {
    throw new CaptureError('NO_MESSAGES_FOUND'); // nothing is uploaded
  }
  const messages: RawMessage[] = loaded.messages.map((m, idx) => ({ ...m.raw, idx }));
  messages.forEach((m) => {
    if (!m.text.trim() && !loaded.messages[m.idx].candidates.length) warnings.push({ code: 'EMPTY_MESSAGE', detail: `idx ${m.idx}` });
  });

  const core: CoreMeta = {
    platform: adapter.id,
    sourceUrl: location.href,
    title: adapter.getTitle(doc),
    modelLabel: adapter.getModelLabel?.(doc),
    capturedAt: new Date().toISOString(),
    // Counted from the live DOM with separate selectors, NOT from the serialized output above.
    expected: adapter.countExpected(doc),
  };

  await sendString(deps, 'meta', JSON.stringify(core));
  await sendString(deps, 'messages', JSON.stringify(messages));
  await sendString(deps, 'snapshot', snapshotHtml(doc));

  // 3. ASSETS
  await deps.post({ type: 'PROGRESS', runId, step: 'RESCUING_ASSETS', progress: { done: 0 } });
  await rescueAssets({
    collected: loaded.messages, skipAssets: deps.skipAssets, signal: deps.signal, runId,
    post: deps.post, ask: deps.ask, warnings,
    report: (done, total) => { void deps.post({ type: 'PROGRESS', runId, step: 'RESCUING_ASSETS', progress: { done, total } }).catch(() => {}); },
  });

  warnings.push(...adapter.takeWarnings());
  await deps.post({ type: 'WARNINGS', runId, warnings });
}
