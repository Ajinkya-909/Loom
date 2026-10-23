import { describe, expect, it } from 'vitest';
import { buildCaptureForm, type AssetBlob } from '../src/shared/payload';
import type { CaptureMeta, RawMessage } from '../src/shared/types';

const readText = (b: Blob) =>
  new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(b); });

const messages: RawMessage[] = [
  { idx: 0, role: 'user', html: '<div>hi</div>', text: 'hi', domId: 'm1' },
  { idx: 1, role: 'assistant', html: '<div>hello</div>', text: 'hello' },
];

const meta: CaptureMeta = {
  action: 'context', platform: 'chatgpt', sourceUrl: 'https://chatgpt.com/c/abc', title: 'T',
  capturedAt: '2026-10-23T10:15:00.000Z', extensionVersion: '0.1.0',
  expected: { messageCount: 2, codeBlockCount: 0, tableCount: 0, imageCount: 2 },
  assets: [
    { ref: 'a1', originalUrl: 'https://x/a.png', messageIdx: 1, mime: 'image/png', sha256: 'ab', sizeBytes: 3, filename: 'a.png', uploaded: true },
    { ref: 'a2', originalUrl: 'https://x/b.png', messageIdx: 1, uploaded: false, error: 'fetch_failed' },
  ],
  clientWarnings: [{ code: 'ASSET_FAILED', ref: 'a2' }],
};

describe('buildCaptureForm', () => {
  const assets = new Map<string, AssetBlob>([['a1', { blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), filename: 'a.png', mime: 'image/png' }]]);
  const form = buildCaptureForm({ meta, messagesJson: JSON.stringify(messages), snapshotHtml: '<html></html>', assets });

  it('has exactly the documented part names', () => {
    expect([...form.keys()].sort()).toEqual(['asset:a1', 'messages', 'meta', 'snapshot']);
  });

  it('meta and messages are valid JSON of the right shape and type', async () => {
    const m = form.get('meta') as File;
    expect(m.type).toBe('application/json');
    const parsed = JSON.parse(await readText(m)) as CaptureMeta;
    expect(parsed.action).toBe('context');
    expect(parsed.expected.messageCount).toBe(2);

    const msgs = JSON.parse(await readText(form.get('messages') as File)) as RawMessage[];
    expect(msgs).toHaveLength(2);
    expect(msgs.map((x) => x.idx)).toEqual([0, 1]);
  });

  it('snapshot is text/html', () => {
    expect((form.get('snapshot') as File).type).toBe('text/html');
  });

  it('uploaded assets in meta match the asset:<ref> parts one-to-one', async () => {
    const parsed = JSON.parse(await readText(form.get('meta') as File)) as CaptureMeta;
    const uploadedRefs = parsed.assets.filter((a) => a.uploaded).map((a) => `asset:${a.ref}`).sort();
    const assetParts = [...form.keys()].filter((k) => k.startsWith('asset:')).sort();
    expect(assetParts).toEqual(uploadedRefs);
    // Failed assets stay listed but have no binary part.
    expect(parsed.assets.find((a) => a.ref === 'a2')).toMatchObject({ uploaded: false, error: 'fetch_failed' });
    expect(form.has('asset:a2')).toBe(false);
  });

  it('asset part carries filename, mime and bytes', async () => {
    const f = form.get('asset:a1') as File;
    expect(f.name).toBe('a.png');
    expect(f.type).toBe('image/png');
    expect(f.size).toBe(3);
  });
});
