import { canStart } from '../../shared/stateMachine';
import type { RunState } from '../../shared/types';
import { Download, External, Stop } from './icons';

interface Props {
  state: RunState;
  gemmaEnabled: boolean;
  onStart: (a: 'context' | 'summarize') => void;
  onCancel: () => void;
  onRetry: (o?: { force?: boolean; skipAssets?: boolean }) => void;
  onOpenViewer: (viewerUrl: string) => void;
}

export function ActionButtons({ state, gemmaEnabled, onStart, onCancel, onRetry, onOpenViewer }: Props) {
  const enabled = canStart(state);
  const running = state.kind === 'RUNNING';
  const summarizeOn = enabled && gemmaEnabled;
  const viewerUrl = state.kind === 'SUCCESS' || state.kind === 'PARTIAL_SUCCESS' || state.kind === 'DUPLICATE' ? state.viewerUrl : null;

  if (viewerUrl) {
    return (
      <div className="actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => onOpenViewer(viewerUrl)}
        >
          Open in Loom Dashboard <External />
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={() => window.close()}
        >
          Close
        </button>
        {state.kind === 'DUPLICATE' ? (
          <button type="button" className="btn ghost" onClick={() => onRetry({ force: true })}>
            Capture again anyway
          </button>
        ) : (
          <button type="button" className="btn ghost" onClick={() => onStart('context')}>
            Capture another version
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="actions">
      <button type="button" className="btn primary" disabled={!enabled} onClick={() => onStart('context')}>
        <Download /> Get context
      </button>
      {/* A disabled <button> swallows hover, so the tooltip lives on the wrapper. */}
      <span className="tip" title={gemmaEnabled ? undefined : 'Gemma is not configured on the server'}>
        <button type="button" className="btn secondary" disabled={!summarizeOn} onClick={() => onStart('summarize')}>
          Summarize context
        </button>
      </span>

      {running && (
        <button type="button" className="btn ghost danger" onClick={onCancel}><Stop /> Cancel</button>
      )}
      {state.kind === 'FAILED' && state.retryable && (
        <button type="button" className="btn ghost" onClick={() => onRetry()}>Retry</button>
      )}
      {state.kind === 'FAILED' && state.code === 'PAYLOAD_TOO_LARGE' && (
        <button type="button" className="btn ghost" onClick={() => onRetry({ skipAssets: true })}>Retry without images</button>
      )}
    </div>
  );
}
