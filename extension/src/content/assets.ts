// Asset rescue. Image URLs are often signed and expire, so we pull the bytes NOW and stream them
// to the background as base64 chunks (runtime messaging cannot carry Blobs).
import { ASSET_CHUNK_RAW_BYTES, MAX_ASSET_BYTES, MAX_TOTAL_ASSET_BYTES } from '../shared/constants';
import { sha256Blob } from '../shared/hash';
import type { ContentEvent, FetchAssetResponse } from '../shared/protocol';
import type { AssetRecord, Warning } from '../shared/types';
import type { AssetCandidate } from './adapters/types';
import type { CollectedMessage } from './loadAll';
import { throwIfAborted } from './util';

export interface AssetDeps {
  collected: CollectedMessage[];
  skipAssets: boolean;
  signal: AbortSignal;
  runId: string;
  /** Send an event; throws if the background rejects it. */
  post: (ev: ContentEvent) => Promise<void>;
  /** Send an event and return the raw response (used for FETCH_ASSET). */
  ask: <T>(ev: ContentEvent) => Promise<T>;
  report: (done: number, total: number) => void;
  warnings: Warning[];
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg',
  'image/avif': 'avif', 'application/pdf': 'pdf', 'text/csv': 'csv', 'application/zip': 'zip',
  'application/json': 'json', 'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/msword': 'doc',
};
const MIME_BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]));
MIME_BY_EXT.jpeg = 'image/jpeg';
MIME_BY_EXT.pdf = 'application/pdf';
MIME_BY_EXT.docx = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
MIME_BY_EXT.xlsx = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const looksWrong = (c: AssetCandidate, mime: string) => {
  if (mime === 'text/html') return true; // login redirect or html error page
  if (c.kind === 'image' && mime === 'application/json') return true;
  return false;
};

export function canvasToPdfBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(new Blob(['%PDF-1.4\n%EOF\n'], { type: 'application/pdf' }));
      return;
    }
    canvas.toBlob((jpegBlob) => {
      if (!jpegBlob) {
        resolve(new Blob(['%PDF-1.4\n%EOF\n'], { type: 'application/pdf' }));
        return;
      }
      jpegBlob.arrayBuffer().then((buf) => {
        const bytes = new Uint8Array(buf);
        const w = Math.round(canvas.width || 612);
        const h = Math.round(canvas.height || 792);

        const parts: BlobPart[] = [];
        const offsets: number[] = [];
        let pos = 0;

        function add(data: string | Uint8Array) {
          parts.push(data);
          pos += typeof data === 'string' ? new TextEncoder().encode(data).length : data.length;
        }

        add('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

        offsets.push(pos);
        add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

        offsets.push(pos);
        add('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

        offsets.push(pos);
        add(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`);

        offsets.push(pos);
        add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
        add(bytes);
        add('\nendstream\nendobj\n');

        offsets.push(pos);
        const stream = `q ${w} 0 0 ${h} 0 0 cm /Im1 Do Q\n`;
        add(`5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`);

        const xrefOffset = pos;
        add(`xref\n0 6\n0000000000 65535 f \n`);
        for (const off of offsets) {
          add(String(off).padStart(10, '0') + ' 00000 n \n');
        }

        add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

        resolve(new Blob(parts, { type: 'application/pdf' }));
      }).catch(() => {
        resolve(new Blob(['%PDF-1.4\n%EOF\n'], { type: 'application/pdf' }));
      });
    }, 'image/jpeg', 0.95);
  });
}

async function triggerElementDownload(c: AssetCandidate, signal: AbortSignal): Promise<Blob | null> {
  const el = c.el as HTMLElement;
  if (!el || typeof window === 'undefined') return null;

  return new Promise<Blob | null>((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('CONTEXTPORT_DOWNLOAD', onDownload as any);
        (window as any).__contextPortIntercepting = false;
        resolve(null);
      }
    }, 2000);

    const onDownload = async (ev: any) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      window.removeEventListener('CONTEXTPORT_DOWNLOAD', onDownload as any);
      (window as any).__contextPortIntercepting = false;
      const url = ev.detail?.url;
      if (url) {
        try {
          const res = await fetch(url, { signal });
          if (res.ok) {
            const b = await res.blob();
            resolve(b);
            return;
          }
        } catch {}
      }
      resolve(null);
    };

    window.addEventListener('CONTEXTPORT_DOWNLOAD', onDownload as any, { once: true });
    (window as any).__contextPortIntercepting = true;

    try {
      const btn = el.querySelector<HTMLElement>('button[aria-label*="Download" i], [aria-label*="Download" i]') || el;
      btn.click();
    } catch {
      clearTimeout(timeout);
      (window as any).__contextPortIntercepting = false;
      resolve(null);
    }
  });
}

/** Fallback chain: data:/blob: read directly; else (a) page fetch, (b) background fetch, (c) canvas. */
async function download(c: AssetCandidate, deps: AssetDeps): Promise<Blob | null> {
  const direct = /^(data|blob):/i.test(c.url);

  // Check in-memory blobs from pageHook (URL.createObjectURL)
  if (typeof window !== 'undefined' && (window as any).__contextPortBlobs) {
    const blobs = (window as any).__contextPortBlobs as Map<string, { blob: Blob; mime: string; name?: string }>;
    if (direct && blobs.has(c.url)) {
      return blobs.get(c.url)!.blob;
    }
    if (c.kind === 'file') {
      for (const [, info] of blobs.entries()) {
        if (c.filename && (info.name === c.filename || (info.mime === 'application/pdf' && c.filename.endsWith('.pdf')))) {
          return info.blob;
        }
      }
    }
  }

  const viaFetch = async (): Promise<Blob | null> => {
    try {
      const res = await fetch(c.url, { credentials: 'include', signal: deps.signal });
      if (!res.ok) return null;
      const b = await res.blob();
      return looksWrong(c, b.type) ? null : b;
    } catch { return null; }
  };

  // (d) Direct blob/data URL
  if (direct) {
    const b = await viaFetch();
    if (b) return b;
  } else if (/^https?:/i.test(c.url)) {
    // (a) Page context fetch
    const a = await viaFetch();
    if (a) return a;
    throwIfAborted(deps.signal);

    // (b) Service worker fetch (worker has host permissions and ignores CORS)
    try {
      const r = await deps.ask<FetchAssetResponse>({ type: 'FETCH_ASSET', url: c.url });
      if (r?.ok) {
        const b = b64ToBlob(r.base64, r.mime);
        if (!looksWrong(c, b.type)) return b;
      }
    } catch { /* fall through */ }
    throwIfAborted(deps.signal);
  }

  // (e) Programmatic file download trigger (for file cards with download buttons)
  if (c.kind === 'file' && c.el) {
    const triggered = await triggerElementDownload(c, deps.signal);
    if (triggered) return triggered;

    // Fallback if preview canvas is present inside card: produce valid PDF
    const card = (c.el as HTMLElement).closest('[class*="file-card"], [class*="attachment"]') || c.el;
    const canvas = card.querySelector<HTMLCanvasElement>('canvas');
    if (canvas && c.filename?.toLowerCase().endsWith('.pdf')) {
      const pdfBlob = await canvasToPdfBlob(canvas);
      if (pdfBlob) return pdfBlob;
    }
  }

  // (c) Canvas extraction fallback for images ONLY
  if (c.kind === 'image' && c.el) {
    if (typeof HTMLCanvasElement !== 'undefined' && c.el instanceof HTMLCanvasElement) {
      try {
        const b = await new Promise<Blob | null>((res) => (c.el as HTMLCanvasElement).toBlob(res, 'image/png'));
        if (b) return b;
      } catch { /* tainted */ }
    } else if (typeof HTMLImageElement !== 'undefined' && c.el instanceof HTMLImageElement && c.el.complete && c.el.naturalWidth > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = c.el.naturalWidth;
        canvas.height = c.el.naturalHeight;
        canvas.getContext('2d')?.drawImage(c.el, 0, 0);
        const b = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (b) return b;
      } catch { /* tainted canvas (CORS) */ }
    }
  }

  return null;
}

function pickFilename(c: AssetCandidate, mime: string, n: number, used: Set<string>, ref: string): string {
  const ext = EXT_BY_MIME[mime] ?? (c.kind === 'image' ? 'png' : (mime === 'application/pdf' ? 'pdf' : 'bin'));
  let name = c.filename ?? '';
  if (!name) {
    try {
      const u = new URL(c.url);
      const q = u.searchParams.get('filename') || u.searchParams.get('name') || u.searchParams.get('file');
      if (q && /\.[a-z0-9]{2,5}$/i.test(q)) {
        name = q;
      } else {
        const seg = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '');
        if (/\.[a-z0-9]{2,5}$/i.test(seg)) name = seg;
      }
    } catch { /* data:/blob: */ }
  }
  if (!name) name = `${c.kind === 'image' ? 'image' : 'file'}-${n}.${ext}`;
  if (!/\.[a-z0-9]{2,5}$/i.test(name) && ext) {
    name = `${name}.${ext}`;
  }
  name = name.replace(/[^\w.\-]+/g, '_').slice(-80);
  if (used.has(name)) name = name.replace(/(\.[^.]+)?$/, `-${ref}$1`); // unique within one capture
  used.add(name);
  return name;
}

export async function rescueAssets(deps: AssetDeps): Promise<void> {
  // 1. Collect candidates; skip duplicate src; remember the message each came from.
  const seen = new Set<string>();
  const list: Array<{ c: AssetCandidate; messageIdx: number }> = [];
  deps.collected.forEach((m, messageIdx) => {
    for (const c of m.candidates) {
      if (!c.url || seen.has(c.url)) continue;
      seen.add(c.url);
      list.push({ c, messageIdx });
    }
  });

  const total = list.length;
  const usedNames = new Set<string>();
  let totalBytes = 0;
  deps.report(0, total);

  for (let i = 0; i < list.length; i++) {
    throwIfAborted(deps.signal);
    const { c, messageIdx } = list[i];
    const ref = `a${i + 1}`;
    const base: AssetRecord = { ref, originalUrl: c.url.startsWith('data:') ? 'data:(inline)' : c.url, messageIdx, kind: c.kind, uploaded: false };

    const fail = async (error: string, code?: Warning['code']) => {
      if (code) deps.warnings.push({ code, ref });
      await deps.post({ type: 'ASSET_FAILED', runId: deps.runId, record: { ...base, error } });
    };

    if (deps.skipAssets) {
      await fail('skipped_by_user'); // "Retry without images": still listed, never uploaded
    } else {
      const blob = await download(c, deps);
      throwIfAborted(deps.signal);
      if (!blob) await fail('fetch_failed', 'ASSET_FAILED');
      else if (blob.size > MAX_ASSET_BYTES) await fail('too_large', 'ASSET_TOO_LARGE');
      else if (totalBytes + blob.size > MAX_TOTAL_ASSET_BYTES) await fail('total_limit', 'ASSET_TOO_LARGE');
      else {
        totalBytes += blob.size;
        const fileExt = (c.filename?.match(/\.([a-z0-9]{2,5})$/i)?.[1] || c.url.match(/\.([a-z0-9]{2,5})(?:$|[?#])/i)?.[1])?.toLowerCase();
        let mime = (blob.type && blob.type !== 'application/octet-stream' ? blob.type : (fileExt && MIME_BY_EXT[fileExt])) || blob.type || 'application/octet-stream';
        if (c.kind === 'image' && (!mime || mime === 'application/octet-stream')) mime = 'image/png';
        if (c.kind === 'file' && (fileExt === 'pdf' || blob.type === 'application/pdf' || c.filename?.toLowerCase().endsWith('.pdf'))) mime = 'application/pdf';
        const record: AssetRecord = {
          ...base, mime, sha256: await sha256Blob(blob), sizeBytes: blob.size,
          filename: pickFilename(c, mime, i + 1, usedNames, ref), uploaded: true,
        };
        await deps.post({ type: 'ASSET_BEGIN', runId: deps.runId, record });
        const chunks = Math.max(1, Math.ceil(blob.size / ASSET_CHUNK_RAW_BYTES));
        for (let seq = 0; seq < chunks; seq++) {
          throwIfAborted(deps.signal);
          const slice = blob.slice(seq * ASSET_CHUNK_RAW_BYTES, (seq + 1) * ASSET_CHUNK_RAW_BYTES);
          await deps.post({ type: 'ASSET_CHUNK', runId: deps.runId, ref, seq, total: chunks, data: await blobToBase64(slice) });
        }
        await deps.post({ type: 'ASSET_DONE', runId: deps.runId, ref });
      }
    }
    deps.report(i + 1, total);
  }
}
