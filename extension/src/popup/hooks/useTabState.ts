// The popup only RENDERS state. The background owns it and writes it to chrome.storage.session;
// we subscribe to changes so reopening the popup mid-run shows live progress.
import { useCallback, useEffect, useState } from 'react';
import type { OpenResponse, PopupRequest } from '../../shared/protocol';
import { getSettings } from '../../shared/settings';
import type { Action, ConnectionInfo, RunState, Settings } from '../../shared/types';

const send = <T,>(req: PopupRequest) => chrome.runtime.sendMessage(req) as Promise<T>;

export function useTabState() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [state, setState] = useState<RunState>({ kind: 'CHECKING' });
  const [connection, setConnection] = useState<ConnectionInfo>({ status: 'checking' });
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => { void getSettings().then(setSettings); }, []);

  const refresh = useCallback(async (id: number) => {
    setState((s) => (s.kind === 'RUNNING' ? s : { kind: 'CHECKING' }));
    try {
      const r = await send<OpenResponse>({ type: 'OPEN', tabId: id });
      setState(r.state);
      setConnection(r.connection);
    } catch {
      setState({ kind: 'DISCONNECTED', reason: 'unreachable' });
    }
  }, []);

  useEffect(() => {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id !== undefined) { setTabId(tab.id); void refresh(tab.id); }
    });
  }, [refresh]);

  // Live updates pushed by the background worker.
  useEffect(() => {
    if (tabId === null) return;
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session') {
        if (changes[`state:${tabId}`]?.newValue) setState(changes[`state:${tabId}`].newValue as RunState);
        if (changes.conn?.newValue) setConnection(changes.conn.newValue as ConnectionInfo);
      }
      if (area === 'local' && changes.settings?.newValue) setSettings((p) => ({ ...(p as Settings), ...changes.settings.newValue }));
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [tabId]);

  return {
    tabId, state, connection, settings,
    refresh: () => { if (tabId !== null) void refresh(tabId); },
    start: (action: Action) => { if (tabId !== null) void send({ type: 'START', tabId, action }); },
    retry: (o: { force?: boolean; skipAssets?: boolean } = {}) => { if (tabId !== null) void send({ type: 'RETRY', tabId, ...o }); },
    cancel: () => { if (tabId !== null) void send({ type: 'CANCEL', tabId }); },
  };
}
