// Per-tab run state lives in chrome.storage.session so (a) the popup can render it live via
// storage.onChanged and (b) a restarted service worker can tell which runs it lost.
import type { ConnectionInfo, LastRequest, RunState } from '../shared/types';

const stateKey = (tabId: number) => `state:${tabId}`;
const lastKey = (tabId: number) => `last:${tabId}`;
const CONN_KEY = 'conn';

export async function getState(tabId: number): Promise<RunState | undefined> {
  const r = await chrome.storage.session.get(stateKey(tabId));
  return r[stateKey(tabId)] as RunState | undefined;
}
export const setState = (tabId: number, s: RunState) => chrome.storage.session.set({ [stateKey(tabId)]: s });

export async function clearTab(tabId: number): Promise<void> {
  await chrome.storage.session.remove([stateKey(tabId), lastKey(tabId)]);
}

export async function getLast(tabId: number): Promise<LastRequest | undefined> {
  const r = await chrome.storage.session.get(lastKey(tabId));
  return r[lastKey(tabId)] as LastRequest | undefined;
}
export const setLast = (tabId: number, l: LastRequest) => chrome.storage.session.set({ [lastKey(tabId)]: l });

export async function getConn(): Promise<ConnectionInfo> {
  const r = await chrome.storage.session.get(CONN_KEY);
  return (r[CONN_KEY] as ConnectionInfo | undefined) ?? { status: 'checking' };
}
export const setConn = (c: ConnectionInfo) => chrome.storage.session.set({ [CONN_KEY]: c });

/** Tab ids that currently have a stored state (used for worker-restart recovery). */
export async function listStoredTabs(): Promise<Array<{ tabId: number; state: RunState }>> {
  const all = await chrome.storage.session.get(null);
  const out: Array<{ tabId: number; state: RunState }> = [];
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith('state:')) out.push({ tabId: Number(k.slice(6)), state: v as RunState });
  }
  return out;
}

export const STATE_KEY_PREFIX = 'state:';
export const CONN_STORAGE_KEY = CONN_KEY;
export { stateKey };
