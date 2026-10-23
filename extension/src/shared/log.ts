import { DEBUG } from './constants';

/** Debug-only logging. Callers must never pass chat content or the token. */
export function debug(...args: unknown[]): void {
  if (DEBUG) console.debug('[ContextPort]', ...args);
}
