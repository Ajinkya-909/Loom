import { hashString } from '../shared/hash';

/** Thrown when the run is cancelled (ABORT from background, or background no longer knows the run). */
export class AbortedError extends Error {
  constructor() { super('aborted'); this.name = 'AbortedError'; }
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new AbortedError();
}

/** Abort-aware sleep: rejects immediately on abort so Cancel is felt within one tick. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortedError());
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new AbortedError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export { hashString };
