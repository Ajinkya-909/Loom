import { describe, expect, it } from 'vitest';
import { canStart, reduce, type StateEvent } from '../src/shared/stateMachine';
import type { RunState } from '../src/shared/types';

const ready: RunState = { kind: 'READY', platform: 'chatgpt', title: 'T' };
const start = (runId = 'r1', action: 'context' | 'summarize' = 'context'): StateEvent => ({ type: 'START', runId, action, now: 1 });
const running = (runId = 'r1'): RunState => reduce(ready, start(runId));

describe('CHECKING transitions', () => {
  const checking: RunState = { kind: 'CHECKING' };
  const results: RunState[] = [
    { kind: 'DISCONNECTED', reason: 'no_server_url' },
    { kind: 'DISCONNECTED', reason: 'unreachable' },
    { kind: 'UNAUTHORIZED' },
    { kind: 'UNSUPPORTED_PAGE' },
    { kind: 'NO_CHAT' },
    ready,
  ];
  it.each(results.map((r) => [r.kind, r] as const))('CHECKING -> %s', (_k, result) => {
    expect(reduce(checking, { type: 'CHECK_RESULT', result: result as never })).toEqual(result);
  });

  it('a late probe result never overwrites a RUNNING state', () => {
    const r = running();
    expect(reduce(r, { type: 'CHECK_RESULT', result: ready as never })).toBe(r);
  });

  it('CHECK_START resets idle states to CHECKING but never a live run', () => {
    expect(reduce(ready, { type: 'CHECK_START' })).toEqual({ kind: 'CHECKING' });
    const r = running();
    expect(reduce(r, { type: 'CHECK_START' })).toBe(r);
  });
});

describe('starting a run', () => {
  const startable: RunState[] = [
    ready,
    { kind: 'SUCCESS', captureId: 'c', version: 1, viewerUrl: '/c/c', action: 'context' },
    { kind: 'DUPLICATE', captureId: 'c', version: 1, viewerUrl: '/c/c' },
    { kind: 'PARTIAL_SUCCESS', captureId: 'c', version: 1, viewerUrl: '/c/c', warnings: [{ code: 'ASSET_FAILED' }] },
    { kind: 'FAILED', code: 'NETWORK', message: 'x', retryable: true },
    { kind: 'CANCELLED' },
  ];
  it.each(startable.map((s) => [s.kind, s] as const))('%s -> RUNNING(LOADING_CHAT)', (_k, s) => {
    expect(canStart(s)).toBe(true);
    expect(reduce(s, start('r9', 'summarize'))).toMatchObject({ kind: 'RUNNING', runId: 'r9', action: 'summarize', step: 'LOADING_CHAT' });
  });

  it.each([{ kind: 'CHECKING' }, { kind: 'NO_CHAT' }, { kind: 'UNSUPPORTED_PAGE' }, { kind: 'UNAUTHORIZED' }, { kind: 'DISCONNECTED', reason: 'unreachable' }] as RunState[])(
    '%o cannot start', (s) => {
      expect(canStart(s)).toBe(false);
      expect(reduce(s, start())).toBe(s);
    },
  );

  it('a second START while RUNNING is ignored', () => {
    const r = running('first');
    const again = reduce(r, start('second', 'summarize'));
    expect(again).toBe(r);
    expect(again).toMatchObject({ runId: 'first', action: 'context' });
  });
});

describe('RUNNING', () => {
  it('walks LOADING_CHAT -> CAPTURING -> RESCUING_ASSETS -> UPLOADING with progress', () => {
    let s = running();
    s = reduce(s, { type: 'PROGRESS', runId: 'r1', step: 'LOADING_CHAT', detail: 'Loaded 40 messages' });
    expect(s).toMatchObject({ step: 'LOADING_CHAT', detail: 'Loaded 40 messages' });
    s = reduce(s, { type: 'PROGRESS', runId: 'r1', step: 'CAPTURING' });
    expect(s).toMatchObject({ step: 'CAPTURING' });
    s = reduce(s, { type: 'PROGRESS', runId: 'r1', step: 'RESCUING_ASSETS', progress: { done: 1, total: 3 } });
    expect(s).toMatchObject({ step: 'RESCUING_ASSETS', progress: { done: 1, total: 3 } });
    s = reduce(s, { type: 'PROGRESS', runId: 'r1', step: 'UPLOADING' });
    expect(s).toMatchObject({ step: 'UPLOADING' });
  });

  it('progress from a stale run is ignored', () => {
    const r = running('new');
    expect(reduce(r, { type: 'PROGRESS', runId: 'old', step: 'UPLOADING' })).toBe(r);
  });

  it('202 without warnings -> SUCCESS', () => {
    expect(reduce(running(), { type: 'ACCEPTED', runId: 'r1', captureId: 'c1', version: 2, viewerUrl: '/c/c1', warnings: [] }))
      .toEqual({ kind: 'SUCCESS', captureId: 'c1', version: 2, viewerUrl: '/c/c1', action: 'context' });
  });

  it('202 with warnings -> PARTIAL_SUCCESS', () => {
    const w = [{ code: 'ASSET_FAILED' as const, ref: 'a2' }];
    expect(reduce(running(), { type: 'ACCEPTED', runId: 'r1', captureId: 'c1', version: 2, viewerUrl: '/c/c1', warnings: w }))
      .toEqual({ kind: 'PARTIAL_SUCCESS', captureId: 'c1', version: 2, viewerUrl: '/c/c1', warnings: w });
  });

  it('200 duplicate -> DUPLICATE', () => {
    expect(reduce(running(), { type: 'DUPLICATE', runId: 'r1', captureId: 'c1', version: 3, viewerUrl: '/c/c1' }))
      .toEqual({ kind: 'DUPLICATE', captureId: 'c1', version: 3, viewerUrl: '/c/c1' });
  });

  it('any error -> FAILED, remembering the step it failed at', () => {
    let s = running();
    s = reduce(s, { type: 'PROGRESS', runId: 'r1', step: 'UPLOADING' });
    expect(reduce(s, { type: 'FAIL', runId: 'r1', code: 'SERVER_ERROR', message: 'boom', retryable: true }))
      .toMatchObject({ kind: 'FAILED', code: 'SERVER_ERROR', step: 'UPLOADING', retryable: true });
  });

  it('cancel -> CANCELLED at every step', () => {
    for (const step of ['LOADING_CHAT', 'CAPTURING', 'RESCUING_ASSETS', 'UPLOADING'] as const) {
      const s = reduce(running(), { type: 'PROGRESS', runId: 'r1', step });
      expect(reduce(s, { type: 'CANCEL', runId: 'r1' })).toEqual({ kind: 'CANCELLED' });
    }
  });

  it('cancel / results after the run ended have no effect', () => {
    const done = reduce(running(), { type: 'ACCEPTED', runId: 'r1', captureId: 'c', version: 1, viewerUrl: '/c/c', warnings: [] });
    expect(reduce(done, { type: 'CANCEL' })).toBe(done);
    expect(reduce(done, { type: 'FAIL', code: 'UNKNOWN', message: 'late', retryable: true })).toBe(done);
  });

  it('events for another run id never touch the current run', () => {
    const r = running('mine');
    expect(reduce(r, { type: 'CANCEL', runId: 'other' })).toBe(r);
    expect(reduce(r, { type: 'FAIL', runId: 'other', code: 'UNKNOWN', message: 'x', retryable: true })).toBe(r);
    expect(reduce(r, { type: 'ACCEPTED', runId: 'other', captureId: 'c', version: 1, viewerUrl: '/c/c', warnings: [] })).toBe(r);
  });
});

describe('navigation and worker restart', () => {
  it('navigation resets any state to CHECKING', () => {
    expect(reduce(running(), { type: 'NAVIGATED' })).toEqual({ kind: 'CHECKING' });
    expect(reduce(ready, { type: 'NAVIGATED' })).toEqual({ kind: 'CHECKING' });
  });

  it('worker restart mid-run -> FAILED(UNKNOWN, retryable) instead of a stuck spinner', () => {
    const s = reduce(running(), { type: 'PROGRESS', runId: 'r1', step: 'RESCUING_ASSETS' });
    expect(reduce(s, { type: 'WORKER_RESTART' })).toEqual({
      kind: 'FAILED', code: 'UNKNOWN', message: 'Capture interrupted, please retry', step: 'RESCUING_ASSETS', retryable: true,
    });
  });

  it('worker restart leaves non-running states alone', () => {
    expect(reduce(ready, { type: 'WORKER_RESTART' })).toBe(ready);
  });
});
