import { describeWarning } from '../../shared/errors';
import { PLATFORM_LABEL } from '../../shared/platforms';
import type { RunState, Warning } from '../../shared/types';
import { Alert, Chat, Check, Key, Plug, Spinner } from './icons';

export type Tone = 'neutral' | 'busy' | 'success' | 'warn' | 'error';

/** Copy per state, taken from the product spec. */
export function statusFor(s: RunState): { tone: Tone; title: string; detail?: string } {
  switch (s.kind) {
    case 'CHECKING': return { tone: 'busy', title: 'Checking…', detail: 'Connecting to your ContextPort server' };
    case 'DISCONNECTED':
      return s.reason === 'no_server_url'
        ? { tone: 'warn', title: 'Add a server URL', detail: 'Open settings and enter your ContextPort server address.' }
        : { tone: 'error', title: "Can't reach server", detail: 'Is Docker running? Check the server URL in settings.' };
    case 'UNAUTHORIZED': return { tone: 'warn', title: 'Token needed', detail: 'Add your API token in settings.' };
    case 'UNSUPPORTED_PAGE': return { tone: 'neutral', title: 'Open a chat to start', detail: 'ContextPort works on ChatGPT. More platforms coming.' };
    case 'NO_CHAT': return { tone: 'neutral', title: 'No conversation found', detail: 'Open a chat with at least one message.' };
    case 'READY': return { tone: 'success', title: 'Ready to capture', detail: `${s.title ?? 'Untitled chat'} · ${PLATFORM_LABEL[s.platform] ?? s.platform}` };
    case 'RUNNING':
      switch (s.step) {
        case 'LOADING_CHAT': return { tone: 'busy', title: 'Loading full chat…', detail: s.detail ?? 'Loaded 0 messages' };
        case 'CAPTURING': return { tone: 'busy', title: 'Capturing messages…' };
        case 'RESCUING_ASSETS':
          return { tone: 'busy', title: 'Saving images…', detail: s.progress?.total !== undefined ? `${s.progress.done} of ${s.progress.total}` : undefined };
        case 'UPLOADING': return { tone: 'busy', title: 'Uploading…' };
      }
      return { tone: 'busy', title: 'Working…' };
    case 'SUCCESS': return { tone: 'success', title: 'Context created ✓', detail: `Version ${s.version} saved · Ready to view in Loom` };
    case 'PARTIAL_SUCCESS': {
      const k = s.warnings.length;
      return { tone: 'warn', title: 'Context created with warnings', detail: `Version ${s.version} saved (${k} ${k === 1 ? 'warning' : 'warnings'})` };
    }
    case 'DUPLICATE': return { tone: 'neutral', title: 'Already captured', detail: `No changes detected since version ${s.version}` };
    case 'FAILED': return { tone: 'error', title: 'Something went wrong', detail: s.message };
    case 'CANCELLED': return { tone: 'neutral', title: 'Cancelled', detail: 'Nothing was uploaded' };
  }
}

function icon(s: RunState, tone: Tone) {
  if (tone === 'busy') return <Spinner />;
  if (s.kind === 'DISCONNECTED') return <Plug />;
  if (s.kind === 'UNAUTHORIZED') return <Key />;
  if (tone === 'success') return <Check />;
  if (tone === 'warn' || tone === 'error') return <Alert />;
  return <Chat />;
}

function groupWarnings(ws: Warning[]): Array<{ text: string; n: number }> {
  const m = new Map<string, number>();
  for (const w of ws) m.set(describeWarning(w.code), (m.get(describeWarning(w.code)) ?? 0) + 1);
  return [...m].map(([text, n]) => ({ text, n }));
}

export function StatusCard({ state }: { state: RunState }) {
  const { tone, title, detail } = statusFor(state);
  return (
    <section className={`card status tone-${tone}`} aria-live="polite">
      <div className="status-icon">{icon(state, tone)}</div>
      <div className="status-body">
        <h2 className="status-title">{title}</h2>
        {detail && <p className="status-detail">{detail}</p>}
        {state.kind === 'RUNNING' && state.step === 'RESCUING_ASSETS' && state.progress?.total ? (
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={state.progress.total} aria-valuenow={state.progress.done}>
            <span style={{ width: `${Math.round((state.progress.done / state.progress.total) * 100)}%` }} />
          </div>
        ) : null}
        {state.kind === 'PARTIAL_SUCCESS' && (
          <details className="warnings">
            <summary>Show details</summary>
            <ul>
              {groupWarnings(state.warnings).map((w) => (
                <li key={w.text}>{w.text}{w.n > 1 ? ` (×${w.n})` : ''}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
