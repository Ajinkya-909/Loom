// Reassembles assets that the content script streams as base64 chunks.
// Verifies byte length and sha256; a mismatch marks that asset uploaded:false + ASSET_CORRUPT.
import { sha256Blob } from '../shared/hash';
import type { AssetBlob } from '../shared/payload';
import type { AssetRecord, Warning } from '../shared/types';

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface Pending { total: number; parts: Array<Uint8Array | undefined>; got: number }

export class AssetReceiver {
  private records = new Map<string, AssetRecord>();
  private pending = new Map<string, Pending>();
  readonly blobs = new Map<string, AssetBlob>();
  readonly warnings: Warning[] = [];

  /** Content script announces an asset before sending its chunks. */
  begin(record: AssetRecord): void {
    this.records.set(record.ref, { ...record });
    this.pending.set(record.ref, { total: 0, parts: [], got: 0 });
  }

  chunk(ref: string, seq: number, total: number, data: string): void {
    const p = this.pending.get(ref);
    if (!p) return; // unknown or already-finished ref: ignore
    p.total = total;
    if (p.parts[seq] === undefined) { p.parts[seq] = b64ToBytes(data); p.got++; }
  }

  /** All chunks sent: assemble, verify, and build the Blob. */
  async done(ref: string): Promise<void> {
    const rec = this.records.get(ref);
    const p = this.pending.get(ref);
    this.pending.delete(ref);
    if (!rec || !p) return;

    if (p.got !== p.total || p.total === 0) return this.markBad(rec, 'incomplete', 'ASSET_FAILED');

    const blob = new Blob(p.parts as BlobPart[], { type: rec.mime ?? 'application/octet-stream' });
    if (rec.sizeBytes !== undefined && blob.size !== rec.sizeBytes) return this.markBad(rec, 'size_mismatch', 'ASSET_CORRUPT');
    if (rec.sha256 && (await sha256Blob(blob)) !== rec.sha256) return this.markBad(rec, 'sha256_mismatch', 'ASSET_CORRUPT');

    this.blobs.set(ref, { blob, filename: rec.filename ?? `${ref}.bin`, mime: rec.mime ?? 'application/octet-stream' });
  }

  /** Asset the content script could not rescue (or skipped). Recorded only; never fatal. */
  fail(record: AssetRecord): void {
    this.records.set(record.ref, { ...record, uploaded: false });
  }

  private markBad(rec: AssetRecord, error: string, code: 'ASSET_CORRUPT' | 'ASSET_FAILED'): void {
    rec.uploaded = false;
    rec.error = error;
    this.warnings.push({ code, ref: rec.ref });
  }

  /** Final asset list for meta.assets. Anything announced but never completed becomes not-uploaded. */
  buildRecords(): AssetRecord[] {
    for (const [ref, rec] of this.records) {
      if (rec.uploaded && !this.blobs.has(ref)) {
        rec.uploaded = false;
        rec.error ??= 'incomplete';
        if (!this.warnings.some((w) => w.ref === ref)) this.warnings.push({ code: 'ASSET_FAILED', ref });
      }
    }
    return [...this.records.values()];
  }

  /** Drop every buffer (after upload or on cancel). */
  free(): void {
    this.records.clear();
    this.pending.clear();
    this.blobs.clear();
    this.warnings.length = 0;
  }
}
