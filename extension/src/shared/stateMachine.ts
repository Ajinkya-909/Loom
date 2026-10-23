// Pure reducer for the per-tab run state. No chrome.* here so it can be unit-tested.
import type { ErrorCode } from './errors';
import type { Action, Progress, RunState, RunStep, Warning } from './types';

export type StateEvent =
  | { type: 'CHECK_START' }
  | { type: 'CHECK_RESULT'; result: Extract<RunState, { kind: 'DISCONNECTED' | 'UNAUTHORIZED' | 'UNSUPPORTED_PAGE' | 'NO_CHAT' | 'READY' }> }
  | { type: 'START'; runId: string; action: Action; now: number }
  | { type: 'PROGRESS'; runId: string; step: RunStep; progress?: Progress; detail?: string }
  | { type: 'ACCEPTED'; runId: string; captureId: string; version: number; viewerUrl: string; warnings: Warning[] }
  | { type: 'DUPLICATE'; runId: string; captureId: string; version: number; viewerUrl: string }
  | { type: 'FAIL'; runId?: string; code: ErrorCode; message: string; step?: string; retryable: boolean; details?: string }
  | { type: 'CANCEL'; runId?: string }
  | { type: 'NAVIGATED' }
  | { type: 'WORKER_RESTART' };

/** States from which a button press may start a run. */
const STARTABLE: ReadonlySet<RunState['kind']> = new Set([
  'READY', 'SUCCESS', 'DUPLICATE', 'PARTIAL_SUCCESS', 'FAILED', 'CANCELLED',
]);

export const canStart = (s: RunState): boolean => STARTABLE.has(s.kind);
export const isRunning = (s: RunState): boolean => s.kind === 'RUNNING';

/** States that carry a result the user may still want to see/act on when the popup reopens. */
export const isResultState = (s: RunState): boolean =>
  ['SUCCESS', 'PARTIAL_SUCCESS', 'DUPLICATE', 'FAILED', 'CANCELLED'].includes(s.kind);

export function reduce(state: RunState, ev: StateEvent): RunState {
  switch (ev.type) {
    case 'CHECK_START':
      // Never let a probe clobber a live run.
      return state.kind === 'RUNNING' ? state : { kind: 'CHECKING' };

    case 'CHECK_RESULT':
      // A late probe result is dropped unless we're still waiting for it.
      return state.kind === 'CHECKING' ? ev.result : state;

    case 'START':
      // One run per tab: a second START while RUNNING (or from a non-startable state) is ignored.
      if (!canStart(state)) return state;
      return { kind: 'RUNNING', runId: ev.runId, action: ev.action, step: 'LOADING_CHAT', startedAt: ev.now };

    case 'PROGRESS':
      if (state.kind !== 'RUNNING' || state.runId !== ev.runId) return state;
      return { ...state, step: ev.step, progress: ev.progress, detail: ev.detail };

    case 'ACCEPTED':
      if (state.kind !== 'RUNNING' || state.runId !== ev.runId) return state;
      return ev.warnings.length > 0
        ? { kind: 'PARTIAL_SUCCESS', captureId: ev.captureId, version: ev.version, viewerUrl: ev.viewerUrl, warnings: ev.warnings }
        : { kind: 'SUCCESS', captureId: ev.captureId, version: ev.version, viewerUrl: ev.viewerUrl, action: state.action };

    case 'DUPLICATE':
      if (state.kind !== 'RUNNING' || state.runId !== ev.runId) return state;
      return { kind: 'DUPLICATE', captureId: ev.captureId, version: ev.version, viewerUrl: ev.viewerUrl };

    case 'FAIL':
      if (state.kind !== 'RUNNING' || (ev.runId && state.runId !== ev.runId)) return state;
      return { kind: 'FAILED', code: ev.code, message: ev.message, step: ev.step ?? state.step, retryable: ev.retryable, details: ev.details };

    case 'CANCEL':
      if (state.kind !== 'RUNNING' || (ev.runId && state.runId !== ev.runId)) return state;
      return { kind: 'CANCELLED' };

    case 'NAVIGATED':
      return { kind: 'CHECKING' };

    case 'WORKER_RESTART':
      // The service worker died mid-run: in-memory buffers are gone, so never show a stuck spinner.
      return state.kind === 'RUNNING'
        ? { kind: 'FAILED', code: 'UNKNOWN', message: 'Capture interrupted, please retry', step: state.step, retryable: true }
        : state;
  }
}
