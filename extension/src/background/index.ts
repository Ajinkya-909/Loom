// Service worker entry: a thin message router. Real logic lives in orchestrator.ts.
import type { ContentEvent, PopupRequest } from '../shared/protocol';
import {
  cancelRun, handleContentEvent, handleOpen, handleTestConnection, onTabNavigated, onTabRemoved, recoverOrphans, retryRun, startRun,
} from './orchestrator';

const POPUP_TYPES = new Set(['OPEN', 'START', 'RETRY', 'CANCEL', 'TEST_CONNECTION']);

async function route(msg: PopupRequest | ContentEvent, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (POPUP_TYPES.has(msg.type)) {
    const req = msg as PopupRequest;
    switch (req.type) {
      case 'OPEN': return handleOpen(req.tabId);
      case 'START': void startRun(req.tabId, req.action, { force: req.force, skipAssets: req.skipAssets }); return { ok: true };
      case 'RETRY': void retryRun(req.tabId, { force: req.force, skipAssets: req.skipAssets }); return { ok: true };
      case 'CANCEL': await cancelRun(req.tabId); return { ok: true };
      case 'TEST_CONNECTION': return handleTestConnection(req.settings);
    }
  }
  // Everything else must come from a content script, i.e. have a tab.
  if (sender.tab?.id === undefined) return { ok: false, error: 'no_tab' };
  return handleContentEvent(sender.tab.id, msg as ContentEvent);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  route(msg, sender).then(sendResponse, (e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : 'error' }));
  return true; // async response
});

chrome.tabs.onRemoved.addListener((tabId) => { void onTabRemoved(tabId); });

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.url) void onTabNavigated(tabId, 'url');          // includes SPA route changes
  else if (info.status === 'loading') void onTabNavigated(tabId, 'loading'); // reload mid-run
});

// Runs every time the worker boots: any RUNNING state left in storage belongs to a dead worker.
void recoverOrphans();
