import { useState } from 'react';
import { EXTENSION_VERSION } from '../../shared/constants';
import type { RunState } from '../../shared/types';
import { Copy } from './icons';

type Failed = Extract<RunState, { kind: 'FAILED' }>;

/** Copy payload: code, step, message, version, timestamp. Never the token or chat content. */
export function buildErrorReport(f: Failed): string {
  return [
    `code: ${f.code}`,
    `step: ${f.step ?? 'n/a'}`,
    `message: ${f.message}`,
    `extension: ${EXTENSION_VERSION}`,
    `time: ${new Date().toISOString()}`,
  ].join('\n');
}

export function ErrorBox({ state }: { state: Failed }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(buildErrorReport(state));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="errorbox">
      <div className="errorbox-row">
        <code className="chip">{state.code}</code>
        {state.step && <span className="muted small">at {state.step.toLowerCase().replace('_', ' ')}</span>}
      </div>
      {state.details && (
        <details className="warnings">
          <summary>Details</summary>
          <p className="small">{state.details}</p>
        </details>
      )}
      <button type="button" className="linkbtn" onClick={copy}>
        <Copy /> {copied ? 'Copied' : 'Copy error details'}
      </button>
    </div>
  );
}
