// Toolbar badge, per tab. running "…" blue | success "✓" green (clears after 5 s) | failed "!" red.
import { SUCCESS_BADGE_MS } from '../shared/constants';
import type { RunState } from '../shared/types';

const timers = new Map<number, ReturnType<typeof setTimeout>>();

const COLORS = { running: '#3B6FD4', success: '#2E8B5F', failed: '#C8452F' };

function set(tabId: number, text: string, color?: string): void {
  // The tab may be gone; badge calls are best-effort.
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  if (color) chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
}

export function applyBadge(tabId: number, state: RunState): void {
  const pending = timers.get(tabId);
  if (pending) { clearTimeout(pending); timers.delete(tabId); }

  switch (state.kind) {
    case 'RUNNING':
      set(tabId, '…', COLORS.running);
      break;
    case 'SUCCESS':
    case 'PARTIAL_SUCCESS':
    case 'DUPLICATE':
      set(tabId, '✓', COLORS.success);
      timers.set(tabId, setTimeout(() => { set(tabId, ''); timers.delete(tabId); }, SUCCESS_BADGE_MS));
      break;
    case 'FAILED':
      set(tabId, '!', COLORS.failed); // stays until the next run
      break;
    default:
      set(tabId, '');
  }
}
