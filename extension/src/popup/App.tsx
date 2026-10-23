import { useEffect, useState } from 'react';
import { EXTENSION_VERSION } from '../shared/constants';
import { joinWebUrl } from '../shared/settings';
import { ActionButtons } from './components/ActionButtons';
import { ErrorBox } from './components/ErrorBox';
import { Gear, Logo, External } from './components/icons';
import { SettingsView } from './components/SettingsView';
import { StatusCard } from './components/StatusCard';
import { StepList } from './components/StepList';
import { useTabState } from './hooks/useTabState';

const CONN_LABEL = { checking: 'Checking', connected: 'Connected', disconnected: 'Offline', unauthorized: 'Token needed' } as const;

export function App() {
  const t = useTabState();
  const [view, setView] = useState<'main' | 'settings'>('main');

  // Theme: "auto" follows the OS (light = warm paper, dark = charcoal); otherwise force it.
  useEffect(() => {
    const theme = t.settings?.theme ?? 'auto';
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [t.settings?.theme]);

  const openUrl = (url: string) => void chrome.tabs.create({ url });
  const webUrl = t.settings?.webUrl ?? '';
  const gemma = t.connection.config?.gemmaEnabled === true;

  return (
    <div className="shell">
      <header className="header">
        <div className="brand"><Logo /><span className="brand-name">Loom</span></div>
        <span className={`pill ${t.connection.status}`} title={`Server: ${CONN_LABEL[t.connection.status]}`}>
          <i className="dot" />{CONN_LABEL[t.connection.status]}
        </span>
        <button type="button" className={`iconbtn ${view === 'settings' ? 'on' : ''}`} aria-label="Settings" aria-pressed={view === 'settings'}
          onClick={() => { if (view === 'settings') t.refresh(); setView(view === 'settings' ? 'main' : 'settings'); }}>
          <Gear />
        </button>
      </header>

      {view === 'settings' && t.settings ? (
        <SettingsView initial={t.settings} onBack={() => { t.refresh(); setView('main'); }} />
      ) : (
        <main className="main">
          <StatusCard state={t.state} />
          {t.state.kind === 'RUNNING' && <StepList step={t.state.step} />}
          {t.state.kind === 'FAILED' && <ErrorBox state={t.state} />}
          {(t.state.kind === 'DISCONNECTED' || t.state.kind === 'UNAUTHORIZED') && (
            <button type="button" className="btn secondary" onClick={() => setView('settings')}>Open settings</button>
          )}
          <ActionButtons
            state={t.state} gemmaEnabled={gemma}
            onStart={t.start} onCancel={t.cancel} onRetry={t.retry}
            onOpenViewer={(v) => openUrl(joinWebUrl(webUrl, v))}
          />
        </main>
      )}

      <footer className="footer">
        <button type="button" className="linkbtn" disabled={!t.settings?.serverUrl} onClick={() => openUrl(webUrl)}>
          Open library <External />
        </button>
        <span className="muted small">v{EXTENSION_VERSION}</span>
      </footer>
    </div>
  );
}
