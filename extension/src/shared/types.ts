import type { ErrorCode } from './errors';

export type Action = 'context' | 'summarize';
export type Role = 'user' | 'assistant' | 'system' | 'tool';
export type PlatformId = 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'perplexity' | 'deepseek' | 'generic';

export interface RawMessage {
  idx: number;       // 0-based, final DOM order, stable
  role: Role;
  html: string;      // outerHTML, scripts removed, otherwise untouched
  text: string;      // innerText
  domId?: string;
}

export interface ExpectedCounts {
  messageCount: number;
  codeBlockCount: number;
  tableCount: number;
  imageCount: number;
}

export type WarningCode = ErrorCode | 'EMPTY_MESSAGE' | 'UNKNOWN_ROLE';
export interface Warning { code: WarningCode; ref?: string; detail?: string }

export interface AssetRecord {
  ref: string;
  originalUrl: string;
  messageIdx: number;
  kind?: 'image' | 'file';
  mime?: string;
  sha256?: string;
  sizeBytes?: number;
  filename?: string;
  uploaded: boolean;
  error?: string;
}

/** What the content script knows before assets are rescued. */
export interface CoreMeta {
  platform: PlatformId;
  sourceUrl: string;
  title: string;
  modelLabel?: string;
  capturedAt: string;
  expected: ExpectedCounts;
}

export interface CaptureMeta extends CoreMeta {
  action: Action;
  extensionVersion: string;
  assets: AssetRecord[];
  clientWarnings: Warning[];
}

export type RunStep = 'LOADING_CHAT' | 'CAPTURING' | 'RESCUING_ASSETS' | 'UPLOADING';
export interface Progress { done: number; total?: number }

export type RunState =
  | { kind: 'CHECKING' }
  | { kind: 'DISCONNECTED'; reason: 'unreachable' | 'no_server_url' }
  | { kind: 'UNAUTHORIZED' }
  | { kind: 'UNSUPPORTED_PAGE' }
  | { kind: 'NO_CHAT' }
  | { kind: 'READY'; platform: string; title?: string; messageCountHint?: number }
  | { kind: 'RUNNING'; runId: string; action: Action; step: RunStep; progress?: Progress; detail?: string; startedAt: number }
  | { kind: 'SUCCESS'; captureId: string; version: number; viewerUrl: string; action: Action }
  | { kind: 'PARTIAL_SUCCESS'; captureId: string; version: number; viewerUrl: string; warnings: Warning[] }
  | { kind: 'DUPLICATE'; captureId: string; version: number; viewerUrl: string }
  | { kind: 'FAILED'; code: ErrorCode; message: string; step?: string; retryable: boolean; details?: string }
  | { kind: 'CANCELLED' };

export interface ServerConfig {
  version: string;
  gemmaEnabled: boolean;
  authorized: boolean;
  defaultMode?: string;
}

export interface ConnectionInfo {
  status: 'checking' | 'connected' | 'disconnected' | 'unauthorized';
  config?: ServerConfig;
}

export type ThemePref = 'auto' | 'light' | 'dark';

export interface Settings {
  serverUrl: string;
  webUrl: string;
  token: string;
  openViewerAfterUpload: boolean;
  theme: ThemePref;
}

/** Remembered per tab so Retry / "Capture again anyway" know what to repeat. */
export interface LastRequest { action: Action; force?: boolean; skipAssets?: boolean }

export interface AcceptedResponse {
  chatId?: string; captureId: string; version: number; jobId?: string;
  duplicate: false; viewerUrl: string; eventsUrl?: string;
}
export interface DuplicateResponse { duplicate: true; captureId: string; version: number; viewerUrl: string }
