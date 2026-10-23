// Content script entry. Listens for commands from the background; never injects visible UI and
// never mutates the page except by scrolling (inside loadAll).
import { CaptureError } from '../shared/errors';
import type { CaptureResponse, ContentCommand, ContentEvent, ProbeResponse } from '../shared/protocol';
import { detectAdapter } from './adapters';
import { runCapture } from './capture';
import { initContextPortPageHook } from './pageHook';
import { AbortedError } from './util';

declare global { interface Window { __contextportLoaded?: boolean } }

/** Background replies {ok:false} when it no longer knows the run (cancelled / worker restarted). */
async function send(ev: ContentEvent): Promise<{ ok?: boolean } | undefined> {
  return chrome.runtime.sendMessage(ev);
}

function init(): void {
  initContextPortPageHook();
  const runs = new Map<string, AbortController>();

  const probe = (): ProbeResponse => {
    const adapter = detectAdapter(location, document, { allowGeneric: true });
    if (!adapter) return { ok: true, supported: false, messageCount: 0 };
    const messageCount = adapter.listMessageElements(document).length;
    const title = messageCount ? adapter.getTitle(document) : undefined;
    adapter.takeWarnings();
    return { ok: true, supported: true, platform: adapter.id, title, messageCount };
  };

  const start = async (runId: string, skipAssets: boolean): Promise<CaptureResponse> => {
    const adapter = detectAdapter(location, document, { allowGeneric: true });
    if (!adapter) return { ok: false, code: 'UNSUPPORTED_PAGE', message: 'This page is not a supported chat.' };
    const ctrl = new AbortController();
    runs.set(runId, ctrl);

    const post = async (ev: ContentEvent) => {
      if (ctrl.signal.aborted) throw new AbortedError();
      const res = await send(ev);
      if (!res || res.ok === false) { ctrl.abort(); throw new AbortedError(); }
    };
    const ask = async <T,>(ev: ContentEvent) => (await send(ev)) as T;

    try {
      await runCapture({ adapter, doc: document, runId, skipAssets, signal: ctrl.signal, post, ask });
      return { ok: true };
    } catch (e) {
      if (e instanceof AbortedError) return { ok: false, code: 'CANCELLED', message: 'Cancelled' };
      if (e instanceof CaptureError) return { ok: false, code: e.code, message: e.message, details: e.details };
      return { ok: false, code: 'UNKNOWN', message: 'Capture failed', details: e instanceof Error ? e.message : undefined };
    } finally {
      runs.delete(runId);
    }
  };

  chrome.runtime.onMessage.addListener((msg: ContentCommand, _sender, sendResponse) => {
    switch (msg?.type) {
      case 'PING': sendResponse({ ok: true }); return false;
      case 'PROBE': sendResponse(probe()); return false;
      case 'ABORT': runs.get(msg.runId)?.abort(); sendResponse({ ok: true }); return false;
      case 'START_CAPTURE': void start(msg.runId, msg.skipAssets).then(sendResponse); return true;
      default: return false; // not ours
    }
  });
}

// Guard against double injection (manifest + scripting.executeScript share one isolated world).
if (!window.__contextportLoaded) {
  window.__contextportLoaded = true;
  init();
}
