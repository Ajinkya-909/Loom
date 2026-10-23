
/**
 * Typed client for the Loom companion server (default http://localhost:4000,
 * configurable via VITE_API_URL or the in-app Settings modal).
 */
import type {
  CaptureDetail,
  CaptureListItem,
  Message,
  Output,
  OutputKind,
  ServerConfig,
} from "./types";
import type { LoomSettings } from "./settings";
import type { Platform } from "./types";

const TIMEOUT_MS = 5000;

function headersFor(token: string): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) {
    h["Authorization"] = `Bearer ${token}`;
    h["apikey"] = token;
  }
  return h;
}

async function req<T>(
  s: LoomSettings,
  path: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(s.apiUrl + path, {
      ...init,
      headers: { ...headersFor(s.token), ...(init?.headers as Record<string, string> | undefined) },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const health = (s: LoomSettings) =>
  req<{ status: string; database: { connected: boolean } }>(s, "/health");

export const config = (s: LoomSettings) => req<ServerConfig>(s, "/api/config");

export const captures = (
  s: LoomSettings,
  q: string,
  platform: "all" | Platform,
  limit = 50,
) => req<{ items: CaptureListItem[] }>(s, `/api/captures?q=${encodeURIComponent(q)}&platform=${platform === "all" ? "" : platform}&limit=${limit}`);

export const capture = (s: LoomSettings, id: string, version?: number) =>
  req<CaptureDetail>(s, `/api/captures/${id}${version ? `?version=${version}` : ""}`);

export const messages = (s: LoomSettings, id: string, version?: number) =>
  req<{ items: Message[] }>(s, `/api/captures/${id}/messages${version ? `?version=${version}` : ""}`);

export const output = (s: LoomSettings, id: string, kind: OutputKind = "SUMMARY") =>
  req<Output>(s, `/api/outputs/${id}?kind=${kind}`);

export const generate = (
  s: LoomSettings,
  id: string,
  kind: OutputKind = "SUMMARY",
  regenerate = false,
) =>
  req<{ jobId: string; outputId?: string; status: string }>(s, `/api/captures/${id}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, regenerate }),
  });

export const assetUrl = (s: LoomSettings, id: string) => `${s.apiUrl}/api/assets/${id}`;

export const exportUrl = (s: LoomSettings, id: string, format: "context" | "summary" | "zip") =>
  `${s.apiUrl}/api/captures/${id}/export?format=${format}`;

/** Fetch an export as a blob and trigger a browser download. Returns false when offline. */
export async function downloadExport(
  s: LoomSettings,
  id: string,
  format: "context" | "summary" | "zip",
  filename: string,
): Promise<boolean> {
  try {
    const res = await fetch(exportUrl(s, id, format), { headers: headersFor(s.token) });
    if (!res.ok) return false;
    const blob = await res.blob();
    triggerDownload(blob, filename);
    return true;
  } catch {
    return false;
  }
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export interface JobSseEvent {
  stage?: string;
  progress?: number;
  status?: string;
  outputId?: string;
  error?: string;
}

/** Subscribe to job progress over Server-Sent Events. Returns a close function. */
export function subscribeJob(
  s: LoomSettings,
  jobId: string,
  onEvent: (ev: JobSseEvent) => void,
): () => void {
  const url = `${s.apiUrl}/api/jobs/${jobId}/events${s.token ? `?token=${encodeURIComponent(s.token)}` : ""}`;
  const es = new EventSource(url);

  const handleMessage = (msg: MessageEvent) => {
    let ev: JobSseEvent = {};
    try {
      ev = JSON.parse(msg.data) as JobSseEvent;
    } catch {
      return;
    }
    onEvent(ev);
    const status = (ev.status ?? ev.stage ?? "").toUpperCase();
    if (status === "COMPLETED" || status === "FAILED") {
      es.close();
    }
  };

  es.addEventListener("stage", handleMessage);
  es.addEventListener("done", handleMessage);
  es.addEventListener("error", (e: any) => {
    // If e is a MessageEvent with data, handle it
    if (e?.data) {
      handleMessage(e);
    } else {
      es.close();
    }
  });
  es.onmessage = handleMessage;

  return () => es.close();
}
