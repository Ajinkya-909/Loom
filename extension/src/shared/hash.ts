export function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** SHA-256 hex of a Blob (works in content scripts, workers and jsdom-less Node 20). */
export async function sha256Blob(blob: Blob): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
}

/** Small, fast, non-crypto string hash (djb2) used only for fallback de-dup keys. */
export function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
