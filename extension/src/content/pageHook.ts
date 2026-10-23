// Runs in the page's MAIN world to intercept file downloads and object URLs.
export function initContextPortPageHook(): void {
  if (typeof window === 'undefined' || (window as any).__contextPortHooked) return;
  (window as any).__contextPortHooked = true;

  const blobs = new Map<string, { blob: Blob; mime: string; name?: string; time: number }>();
  (window as any).__contextPortBlobs = blobs;
  const recentDownloads: Array<{ url: string; filename: string; time: number }> = [];
  (window as any).__contextPortDownloads = recentDownloads;

  // 1. Intercept URL.createObjectURL so all generated files (PDFs, CSVs, blobs) are captured
  const origCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (obj: any): string {
    const url = origCreateObjectURL.call(URL, obj);
    if (obj instanceof Blob) {
      blobs.set(url, {
        blob: obj,
        mime: obj.type || 'application/octet-stream',
        name: (obj as any).name,
        time: Date.now(),
      });
    }
    return url;
  };

  // 2. Intercept HTMLAnchorElement.prototype.click to catch dynamic downloads
  const origAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const href = this.href;
    const download = this.download || this.getAttribute('download') || '';
    if (href) {
      recentDownloads.push({ url: href, filename: download, time: Date.now() });
      window.dispatchEvent(
        new CustomEvent('CONTEXTPORT_DOWNLOAD', {
          detail: { url: href, filename: download },
        })
      );
      if ((window as any).__contextPortIntercepting) {
        return; // Suppress real browser download prompt during programmatic capture
      }
    }
    return origAnchorClick.call(this);
  };
}

initContextPortPageHook();
