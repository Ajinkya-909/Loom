// Runs one capture end to end and owns the state machine (via the pure reducer in shared/).
// Flow: popup -> background -> content (load, capture, rescue assets) -> background -> server.
import { KEEPALIVE_MS, EXTENSION_VERSION, MAX_ASSET_BYTES } from '../shared/constants';
import { CaptureError, ERROR_INFO } from '../shared/errors';
import { debug } from '../shared/log';
import { buildCaptureForm } from '../shared/payload';
import { platformFromUrl } from '../shared/platforms';
import type {
  CaptureResponse, ContentCommand, ContentEvent, FetchAssetResponse, OpenResponse, ProbeResponse, TestConnectionResponse,
} from '../shared/protocol';
import { getSettings, isLocalUrl, joinWebUrl, originPattern } from '../shared/settings';
import { isResultState, isRunning, reduce, type StateEvent } from '../shared/stateMachine';
import type { Action, CaptureMeta, ConnectionInfo, CoreMeta, RunState, Settings, Warning } from '../shared/types';
import { getConfig, postCapture } from './apiClient';
import { AssetReceiver } from './assetReceiver';
import { applyBadge } from './badge';
import { clearTab, getConn, getLast, getState, listStoredTabs, setConn, setLast, setState } from './stateStore';

interface LiveRun {
  runId: string;
  tabId: number;
  action: Action;
  force: boolean;
  skipAssets: boolean;
  abort: AbortController;
  receiver: AssetReceiver;
  parts: Record<'meta' | 'messages' | 'snapshot', string[]>;
  contentWarnings: Warning[];
  keepAlive?: ReturnType<typeof setInterval>;
}

/** In-memory only. Lost if the worker dies, which is exactly what recoverOrphans() detects. */
const live = new Map<number, LiveRun>();

// ---------------------------------------------------------------- state commits
// Each tab's commits are serialized so read-modify-write on storage never interleaves.
const queues = new Map<number, Promise<unknown>>();

export function commit(tabId: number, ev: StateEvent): Promise<RunState> {
  const prev = queues.get(tabId) ?? Promise.resolve();
  const next = prev.then(async () => {
    const before = (await getState(tabId)) ?? ({ kind: 'CHECKING' } as RunState);
    const after = reduce(before, ev);
    if (after !== before) {
      await setState(tabId, after);
      applyBadge(tabId, after);
    }
    return after;
  });
  queues.set(tabId, next.catch(() => undefined));
  return next;
}

// ---------------------------------------------------------------- tab messaging
function sendToTab<T>(tabId: number, cmd: ContentCommand): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, cmd, (res) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(res as T);
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** PING; if the tab predates the install, inject the content script and try again. */
async function ensureContent(tabId: number): Promise<void> {
  const ping = async () => {
    try {
      const r = await Promise.race([sendToTab<{ ok: boolean }>(tabId, { type: 'PING' }), sleep(1500).then(() => undefined)]);
      return r?.ok === true;
    } catch { return false; }
  };
  if (await ping()) return;

  // At runtime the manifest lists the BUILT content-script path (CRXJS rewrites it to a loader file).
  const files = chrome.runtime.getManifest().content_scripts?.[0]?.js ?? [];
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files });
  } catch (e) {
    throw new CaptureError('CONTENT_SCRIPT_UNAVAILABLE', undefined, e instanceof Error ? e.message : undefined);
  }
  for (let i = 0; i < 5; i++) {
    await sleep(250);
    if (await ping()) return;
  }
  throw new CaptureError('CONTENT_SCRIPT_UNAVAILABLE');
}

// ---------------------------------------------------------------- connection + page probe
async function refreshConnection(): Promise<{ conn: ConnectionInfo; reason?: 'no_server_url' | 'unreachable' }> {
  const s = await getSettings();
  if (!s.serverUrl) {
    const conn: ConnectionInfo = { status: 'disconnected' };
    await setConn(conn);
    return { conn, reason: 'no_server_url' };
  }
  let conn: ConnectionInfo;
  let reason: 'unreachable' | undefined;
  try {
    const config = await getConfig(s);
    conn = { status: config.authorized ? 'connected' : 'unauthorized', config };
  } catch (e) {
    if (e instanceof CaptureError && e.code === 'UNAUTHORIZED') conn = { status: 'unauthorized' };
    else { conn = { status: 'disconnected' }; reason = 'unreachable'; }
  }
  await setConn(conn);
  return { conn, reason };
}

async function probePage(tabId: number, c: Awaited<ReturnType<typeof refreshConnection>>): Promise<Extract<RunState, { kind: 'DISCONNECTED' | 'UNAUTHORIZED' | 'UNSUPPORTED_PAGE' | 'NO_CHAT' | 'READY' }>> {
  if (c.reason === 'no_server_url') return { kind: 'DISCONNECTED', reason: 'no_server_url' };
  if (c.reason === 'unreachable') return { kind: 'DISCONNECTED', reason: 'unreachable' };
  if (c.conn.status === 'unauthorized') return { kind: 'UNAUTHORIZED' };

  let tabUrl: string | undefined;
  try { tabUrl = (await chrome.tabs.get(tabId)).url; } catch { /* tab closed */ }
  const platform = platformFromUrl(tabUrl);
  if (!platform) return { kind: 'UNSUPPORTED_PAGE' };

  try {
    await ensureContent(tabId);
    const p = await sendToTab<ProbeResponse>(tabId, { type: 'PROBE' });
    if (!p.supported) return { kind: 'UNSUPPORTED_PAGE' };
    if (p.messageCount === 0) return { kind: 'NO_CHAT' };
    return { kind: 'READY', platform: p.platform ?? platform, title: p.title, messageCountHint: p.messageCount };
  } catch {
    // Can't tell: let the user try; a real run reports CONTENT_SCRIPT_UNAVAILABLE if it persists.
    return { kind: 'READY', platform };
  }
}

/** Popup opened. Live runs and result states are kept; everything else is re-probed. */
export async function handleOpen(tabId: number): Promise<OpenResponse> {
  const state = await getState(tabId);
  if (state && isRunning(state)) return { state, connection: await getConn() };

  const keep = !!state && isResultState(state);
  if (!keep) await commit(tabId, { type: 'CHECK_START' });
  const c = await refreshConnection();
  if (!keep) await commit(tabId, { type: 'CHECK_RESULT', result: await probePage(tabId, c) });
  return { state: (await getState(tabId)) ?? { kind: 'CHECKING' }, connection: c.conn };
}

export async function handleTestConnection(s: Pick<Settings, 'serverUrl' | 'token'>): Promise<TestConnectionResponse> {
  try {
    const config = await getConfig(s);
    if (!config.authorized) return { ok: false, code: 'UNAUTHORIZED', message: ERROR_INFO.UNAUTHORIZED.message };
    return { ok: true, config };
  } catch (e) {
    const ce = e instanceof CaptureError ? e : new CaptureError('UNKNOWN');
    return { ok: false, code: ce.code, message: ce.message + (ce.details ? ` (${ce.details})` : '') };
  }
}

// ---------------------------------------------------------------- run lifecycle
export async function startRun(tabId: number, action: Action, opts: { force?: boolean; skipAssets?: boolean } = {}): Promise<void> {
  if (live.has(tabId)) return; // one run per tab; a second START is ignored
  const runId = crypto.randomUUID();
  const next = await commit(tabId, { type: 'START', runId, action, now: Date.now() });
  if (next.kind !== 'RUNNING' || next.runId !== runId) return; // reducer refused (not a startable state)

  const run: LiveRun = {
    runId, tabId, action, force: !!opts.force, skipAssets: !!opts.skipAssets,
    abort: new AbortController(), receiver: new AssetReceiver(),
    parts: { meta: [], messages: [], snapshot: [] }, contentWarnings: [],
  };
  live.set(tabId, run);
  await setLast(tabId, { action, force: run.force, skipAssets: run.skipAssets });
  // Keep the worker alive through long scrolls: any extension API call resets the idle timer.
  run.keepAlive = setInterval(() => { void chrome.runtime.getPlatformInfo(); }, KEEPALIVE_MS);

  try {
    await execute(run);
  } catch (e) {
    await failRun(run, e);
  } finally {
    cleanup(run);
  }
}

export async function retryRun(tabId: number, o: { force?: boolean; skipAssets?: boolean }): Promise<void> {
  const last = await getLast(tabId);
  if (!last) return;
  await startRun(tabId, last.action, { force: o.force ?? last.force, skipAssets: o.skipAssets ?? last.skipAssets });
}

function cleanup(run: LiveRun): void {
  if (run.keepAlive) clearInterval(run.keepAlive);
  run.receiver.free();
  run.parts = { meta: [], messages: [], snapshot: [] };
  if (live.get(run.tabId) === run) live.delete(run.tabId);
}

/** Aborts everything for a tab: upload fetch, content-script scrolling/downloads, buffers. */
export async function cancelRun(tabId: number): Promise<void> {
  const run = live.get(tabId);
  if (!run) {
    // Nothing live (upload already finished, or orphaned). Only clear a stuck RUNNING state.
    const s = await getState(tabId);
    if (s && isRunning(s)) await commit(tabId, { type: 'CANCEL' });
    return;
  }
  run.abort.abort();
  sendToTab(tabId, { type: 'ABORT', runId: run.runId }).catch(() => {});
  live.delete(tabId); // late results from the still-awaiting execute() are ignored by the reducer
  cleanup(run);
  await commit(tabId, { type: 'CANCEL', runId: run.runId });
}

function assertActive(run: LiveRun): void {
  if (run.abort.signal.aborted) throw new CaptureError('CANCELLED');
}

async function execute(run: LiveRun): Promise<void> {
  const { tabId, runId } = run;
  const settings = await getSettings();
  if (!settings.serverUrl) throw new CaptureError('NO_SERVER_URL');
  if (!isLocalUrl(settings.serverUrl) && !(await chrome.permissions.contains({ origins: [originPattern(settings.serverUrl)] }))) {
    throw new CaptureError('PERMISSION_DENIED');
  }

  await ensureContent(tabId);
  assertActive(run);

  // The content script answers only when its whole capture + asset transfer is done.
  const res = await sendToTab<CaptureResponse | undefined>(tabId, { type: 'START_CAPTURE', runId, skipAssets: run.skipAssets });
  assertActive(run);
  if (!res) throw new CaptureError('CONTENT_SCRIPT_UNAVAILABLE');
  if (!res.ok) throw new CaptureError(res.code, res.message, res.details);

  await commit(tabId, { type: 'PROGRESS', runId, step: 'UPLOADING' });

  const core = JSON.parse(run.parts.meta.join('')) as CoreMeta;
  const messagesJson = run.parts.messages.join('');
  const snapshotHtml = run.parts.snapshot.join('');
  const assets = run.receiver.buildRecords();
  const clientWarnings = [...run.contentWarnings, ...run.receiver.warnings];

  const meta: CaptureMeta = { action: run.action, ...core, extensionVersion: EXTENSION_VERSION, assets, clientWarnings };
  const form = buildCaptureForm({ meta, messagesJson, snapshotHtml, assets: run.receiver.blobs });

  const result = await postCapture(settings, form, { force: run.force, signal: run.abort.signal });

  // Upload finished: from here on Cancel has no effect.
  live.delete(tabId);
  cleanup(run);

  if (result.kind === 'duplicate') {
    await commit(tabId, { type: 'DUPLICATE', runId, ...pick(result.data) });
    return;
  }
  await commit(tabId, { type: 'ACCEPTED', runId, ...pick(result.data), warnings: clientWarnings });
  if (settings.openViewerAfterUpload) {
    void chrome.tabs.create({ url: joinWebUrl(settings.webUrl, result.data.viewerUrl) });
  }
}

const pick = (d: { captureId: string; version: number; viewerUrl: string }) => ({ captureId: d.captureId, version: d.version, viewerUrl: d.viewerUrl });

async function failRun(run: LiveRun, err: unknown): Promise<void> {
  const ce = err instanceof CaptureError ? err : new CaptureError('UNKNOWN', undefined, err instanceof Error ? err.message : undefined);
  debug('run failed', ce.code);
  if (ce.code === 'CANCELLED') {
    await commit(run.tabId, { type: 'CANCEL', runId: run.runId }); // no-op if already CANCELLED
    return;
  }
  await commit(run.tabId, {
    type: 'FAIL', runId: run.runId, code: ce.code, message: ce.message,
    step: ce.step, retryable: ERROR_INFO[ce.code].retryable, details: ce.details,
  });
}

// ---------------------------------------------------------------- content -> background events
export async function handleContentEvent(tabId: number, ev: ContentEvent): Promise<unknown> {
  if (ev.type === 'FETCH_ASSET') return fetchAssetForContent(ev.url);

  const run = live.get(tabId);
  if (!run || run.runId !== ev.runId) return { ok: false, error: 'unknown_run' }; // tells content to stop

  switch (ev.type) {
    case 'PROGRESS':
      await commit(tabId, { type: 'PROGRESS', runId: ev.runId, step: ev.step, progress: ev.progress, detail: ev.detail });
      break;
    case 'PART':
      run.parts[ev.part][ev.seq] = ev.data;
      break;
    case 'ASSET_BEGIN': run.receiver.begin(ev.record); break;
    case 'ASSET_CHUNK': run.receiver.chunk(ev.ref, ev.seq, ev.total, ev.data); break;
    case 'ASSET_DONE': await run.receiver.done(ev.ref); break;
    case 'ASSET_FAILED': run.receiver.fail(ev.record); break;
    case 'WARNINGS': run.contentWarnings.push(...ev.warnings); break;
  }
  return { ok: true };
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

/** Fallback (b) of asset rescue: the worker has host permissions, the page may not (CORS). */
async function fetchAssetForContent(url: string): Promise<FetchAssetResponse> {
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'unsupported_scheme' };
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) return { ok: false, error: `http_${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_ASSET_BYTES) return { ok: false, error: 'too_large' };
    return { ok: true, mime: res.headers.get('content-type')?.split(';')[0] ?? '', size: buf.byteLength, base64: bytesToBase64(buf) };
  } catch {
    return { ok: false, error: 'fetch_failed' };
  }
}

// ---------------------------------------------------------------- tab + worker lifecycle
/** Tab closed: stop any run and forget its state. */
export async function onTabRemoved(tabId: number): Promise<void> {
  await cancelRun(tabId);
  await clearTab(tabId);
}

/** Navigation / reload / SPA route change: cancel a live run and reset to CHECKING. */
export async function onTabNavigated(tabId: number, reason: 'url' | 'loading'): Promise<void> {
  if (live.has(tabId)) await cancelRun(tabId);
  else if (reason === 'loading') return; // plain reload with no run: nothing to reset
  await commit(tabId, { type: 'NAVIGATED' });
}

/** On worker start the in-memory `live` map is empty, so any stored RUNNING state is orphaned. */
export async function recoverOrphans(): Promise<void> {
  for (const { tabId, state } of await listStoredTabs()) {
    if (isRunning(state) && !live.has(tabId)) await commit(tabId, { type: 'WORKER_RESTART' });
  }
}
