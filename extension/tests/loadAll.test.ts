import { describe, expect, it } from 'vitest';
import { mergeOrder } from '../src/content/loadAll';

describe('mergeOrder (DOM order across scroll steps / virtualized lists)', () => {
  it('appends when nothing visible is known yet (scrolling down)', () => {
    const o = ['a', 'b'];
    mergeOrder(o, ['c', 'd']);
    expect(o).toEqual(['a', 'b', 'c', 'd']);
  });

  it('inserts older messages before the first known one', () => {
    const o = ['c', 'd'];
    mergeOrder(o, ['a', 'b', 'c', 'd']);
    expect(o).toEqual(['a', 'b', 'c', 'd']);
  });

  it('inserts new keys between known neighbours', () => {
    const o = ['a', 'd'];
    mergeOrder(o, ['a', 'b', 'c', 'd']);
    expect(o).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is idempotent and keeps order for overlapping windows', () => {
    const o: string[] = [];
    mergeOrder(o, ['a', 'b', 'c']);
    mergeOrder(o, ['b', 'c', 'd']);
    mergeOrder(o, ['c', 'd', 'e']);
    mergeOrder(o, ['c', 'd', 'e']);
    expect(o).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
