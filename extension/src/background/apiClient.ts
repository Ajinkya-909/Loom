// The ONLY module that talks to the backend. Always runs in the background worker.
// Never logs the token or response bodies that could contain chat content.
import { GET_TIMEOUT_MS, UPLOAD_TIMEOUT_MS } from '../shared/constants';
import { CaptureError } from '../shared/errors';
import type { AcceptedResponse, DuplicateResponse, ServerConfig, Settings } from '../shared/types';

type Conn = Pick<Settings, 'serverUrl' | 'token'>;

interface RawResponse { status: number; text: string }

/**
 * fetch with a timeout and an optional external abort signal.
 * Distinguishes user-cancel (CANCELLED) from timeout and from network failure.
 */
async function request(
  url: string, init: RequestInit, timeoutMs: number, timeoutCode: 'NETWORK' | 'UPLOAD_TIMEOUT', external?: AbortSignal,
): Promise<RawResponse> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  const onAbort = () => ctrl.abort();
  if (external?.aborted) ctrl.abort();
  external?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text(); // inside try so the timeout also covers the body
    return { status: res.status, text };
  } catch (e) {
    if (external?.aborted) throw new CaptureError('CANCELLED');
    if (timedOut) throw new CaptureError(timeoutCode, undefined, `No response within ${Math.round(timeoutMs / 1000)}s`);
    throw new CaptureError('NETWORK', undefined, e instanceof Error ? e.message : 'fetch failed');
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
}

const authHeaders = (token: string): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

/** Parse defensively: the body may not be JSON. */
function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

function serverMessage(text: string): string | undefined {
  const j = parseJson(text) as { error?: { message?: unknown } } | undefined;
  const m = j?.error?.message;
  return typeof m === 'string' ? m : text.slice(0, 300) || undefined;
}

/** GET /api/config */
export async function getConfig(conn: Conn, external?: AbortSignal): Promise<ServerConfig> {
  const r = await request(`${conn.serverUrl}/api/config`, { method: 'GET', headers: authHeaders(conn.token) }, GET_TIMEOUT_MS, 'NETWORK', external);
  if (r.status === 401 || r.status === 403) throw new CaptureError('UNAUTHORIZED');
  if (r.status < 200 || r.status >= 300) throw new CaptureError('SERVER_ERROR', undefined, `HTTP ${r.status}`);
  const j = parseJson(r.text) as Partial<ServerConfig> | undefined;
  if (!j || typeof j !== 'object') throw new CaptureError('SERVER_ERROR', undefined, 'Config response was not JSON');
  return {
    version: String(j.version ?? 'unknown'),
    gemmaEnabled: j.gemmaEnabled === true,
    authorized: j.authorized !== false,
    defaultMode: j.defaultMode,
  };
}

export type UploadResult =
  | { kind: 'accepted'; data: AcceptedResponse }
  | { kind: 'duplicate'; data: DuplicateResponse };

/** POST /api/captures (multipart). */
export async function postCapture(conn: Conn, form: FormData, opts: { force: boolean; signal: AbortSignal }): Promise<UploadResult> {
  const url = `${conn.serverUrl}/api/captures${opts.force ? '?force=1' : ''}`;
  // No Content-Type header: fetch sets multipart/form-data with the boundary itself.
  const r = await request(url, { method: 'POST', headers: authHeaders(conn.token), body: form }, UPLOAD_TIMEOUT_MS, 'UPLOAD_TIMEOUT', opts.signal);

  switch (true) {
    case r.status === 202 || r.status === 200: {
      const j = parseJson(r.text) as Record<string, unknown> | undefined;
      if (!j || typeof j.captureId !== 'string' || typeof j.viewerUrl !== 'string') {
        throw new CaptureError('SERVER_ERROR', undefined, 'Malformed success response from server');
      }
      const base = { captureId: j.captureId, version: Number(j.version ?? 1), viewerUrl: j.viewerUrl };
      if (j.duplicate === true) return { kind: 'duplicate', data: { duplicate: true, ...base } };
      return { kind: 'accepted', data: { duplicate: false, ...base, chatId: j.chatId as string | undefined, jobId: j.jobId as string | undefined, eventsUrl: j.eventsUrl as string | undefined } };
    }
    case r.status === 400: throw new CaptureError('VALIDATION_FAILED', undefined, serverMessage(r.text));
    case r.status === 401 || r.status === 403: throw new CaptureError('UNAUTHORIZED');
    case r.status === 413: throw new CaptureError('PAYLOAD_TOO_LARGE');
    case r.status === 429: throw new CaptureError('RATE_LIMITED');
    case r.status >= 500: throw new CaptureError('SERVER_ERROR', undefined, `HTTP ${r.status}`);
    default: throw new CaptureError('UNKNOWN', undefined, `Unexpected HTTP ${r.status}`);
  }
}
