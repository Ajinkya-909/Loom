// chrome.storage.local wrapper. NOTE: the API token lives here in plain text (fine for a prototype).
import { DEFAULT_SERVER_URL, DEFAULT_WEB_URL } from './constants';
import type { Settings } from './types';

const KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: DEFAULT_SERVER_URL,
  webUrl: DEFAULT_WEB_URL,
  token: '',
  openViewerAfterUpload: true,
  theme: 'auto',
};

export async function getSettings(): Promise<Settings> {
  const res = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(res[KEY] as Partial<Settings> | undefined) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

/** Validates an http(s) URL and strips trailing slashes. Returns null when invalid. */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return (u.origin + u.pathname).replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function isLocalUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1';
  } catch {
    return false;
  }
}

export function originPattern(url: string): string {
  return `${new URL(url).origin}/*`;
}

/** Joins the web app URL and a viewerUrl that is relative to it (e.g. "/c/abc"). */
export function joinWebUrl(webUrl: string, viewerUrl: string): string {
  if (/^https?:\/\//i.test(viewerUrl)) return viewerUrl;
  return `${webUrl.replace(/\/+$/, '')}/${viewerUrl.replace(/^\/+/, '')}`;
}
