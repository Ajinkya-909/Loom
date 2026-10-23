import { useState } from 'react';
import type { TestConnectionResponse } from '../../shared/protocol';
import { getSettings, isLocalUrl, normalizeUrl, originPattern, saveSettings } from '../../shared/settings';
import type { Settings, ThemePref } from '../../shared/types';
import { Back, Eye, EyeOff } from './icons';

interface Props { initial: Settings; onBack: () => void }

export function SettingsView({ initial, onBack }: Props) {
  const [form, setForm] = useState<Settings>(initial);
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setResult(null);
    const serverUrl = normalizeUrl(form.serverUrl);
    const webUrl = normalizeUrl(form.webUrl);
    if (!serverUrl) return setResult({ ok: false, text: 'Server URL must be a valid http(s) address, e.g. http://localhost:4000' });
    if (!webUrl) return setResult({ ok: false, text: 'Web app URL must be a valid http(s) address.' });

    setBusy(true);
    try {
      // Must run first so it still counts as a response to the click (user gesture).
      if (!isLocalUrl(serverUrl)) {
        const granted = await chrome.permissions.request({ origins: [originPattern(serverUrl)] });
        if (!granted) return setResult({ ok: false, text: 'Permission denied. Chrome needs access to your server to upload captures.' });
      }
      await saveSettings({ ...form, serverUrl, webUrl });
      setForm((f) => ({ ...f, serverUrl, webUrl }));
      const r = (await chrome.runtime.sendMessage({ type: 'TEST_CONNECTION', settings: { serverUrl, token: form.token } })) as TestConnectionResponse;
      setResult(r.ok
        ? { ok: true, text: `Connected · server v${r.config.version} · Gemma ${r.config.gemmaEnabled ? 'on' : 'off'}` }
        : { ok: false, text: r.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings">
      <button type="button" className="linkbtn back" onClick={onBack}><Back /> Back</button>
      <h2 className="settings-title">Settings</h2>

      <label className="field">
        <span>Server URL (API)</span>
        <input value={form.serverUrl} onChange={(e) => set('serverUrl', e.target.value)} placeholder="http://localhost:4000" spellCheck={false} inputMode="url" />
      </label>
      <label className="field">
        <span>Web app URL</span>
        <input value={form.webUrl} onChange={(e) => set('webUrl', e.target.value)} placeholder="http://localhost:3000" spellCheck={false} inputMode="url" />
      </label>
      <label className="field">
        <span>API token (optional)</span>
        <div className="input-row">
          <input type={showToken ? 'text' : 'password'} value={form.token} onChange={(e) => set('token', e.target.value)} autoComplete="off" spellCheck={false} />
          <button type="button" className="iconbtn" onClick={() => setShowToken((v) => !v)} aria-label={showToken ? 'Hide token' : 'Show token'}>
            {showToken ? <EyeOff /> : <Eye />}
          </button>
        </div>
      </label>

      <label className="check">
        <input type="checkbox" checked={form.openViewerAfterUpload} onChange={(e) => set('openViewerAfterUpload', e.target.checked)} />
        <span>Open viewer after upload</span>
      </label>

      <div className="field">
        <span>Theme</span>
        <div className="seg" role="radiogroup" aria-label="Theme">
          {(['auto', 'light', 'dark'] as ThemePref[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={form.theme === t} className={form.theme === t ? 'on' : ''}
              onClick={() => { set('theme', t); void getSettings().then(() => saveSettings({ theme: t })); }}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {result && <p className={`notice ${result.ok ? 'ok' : 'bad'}`} role="status">{result.text}</p>}

      <div className="actions row">
        <button type="button" className="btn primary" disabled={busy} onClick={() => void save()}>{busy ? 'Testing…' : 'Save & test connection'}</button>
      </div>
    </div>
  );
}
