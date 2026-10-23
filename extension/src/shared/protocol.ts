// Typed runtime messages. Three channels:
//   popup      -> background   (PopupRequest)
//   background -> content      (ContentCommand)
//   content    -> background   (ContentEvent)
// chrome.runtime messaging is JSON-serialized: no Blobs, so binary travels as base64 chunks.
import type { Action, ConnectionInfo, CoreMeta, LastRequest, Progress, RunState, RunStep, ServerConfig, Settings, Warning, AssetRecord } from './types';
import type { ErrorCode } from './errors';

// ---------- popup -> background ----------
export type PopupRequest =
  | { type: 'OPEN'; tabId: number }
  | { type: 'START'; tabId: number; action: Action; force?: boolean; skipAssets?: boolean }
  | { type: 'RETRY'; tabId: number; force?: boolean; skipAssets?: boolean }
  | { type: 'CANCEL'; tabId: number }
  | { type: 'TEST_CONNECTION'; settings: Pick<Settings, 'serverUrl' | 'token'> };

export interface OpenResponse { state: RunState; connection: ConnectionInfo }
export type TestConnectionResponse = { ok: true; config: ServerConfig } | { ok: false; code: ErrorCode; message: string };

// ---------- background -> content ----------
export type ContentCommand =
  | { type: 'PING' }
  | { type: 'PROBE' }
  | { type: 'START_CAPTURE'; runId: string; skipAssets: boolean }
  | { type: 'ABORT'; runId: string };

export interface PingResponse { ok: true }
export interface ProbeResponse { ok: true; supported: boolean; platform?: string; title?: string; messageCount: number }
export type CaptureResponse = { ok: true } | { ok: false; code: ErrorCode; message: string; details?: string };

// ---------- content -> background ----------
export type ContentEvent =
  | { type: 'PROGRESS'; runId: string; step: RunStep; progress?: Progress; detail?: string }
  /** A string part of the upload (meta JSON / messages JSON / snapshot HTML), possibly chunked. */
  | { type: 'PART'; runId: string; part: 'meta' | 'messages' | 'snapshot'; seq: number; total: number; data: string }
  | { type: 'ASSET_BEGIN'; runId: string; record: AssetRecord }
  | { type: 'ASSET_CHUNK'; runId: string; ref: string; seq: number; total: number; data: string }
  | { type: 'ASSET_DONE'; runId: string; ref: string }
  /** Asset that could not be rescued (or was skipped). Recorded, never fatal. */
  | { type: 'ASSET_FAILED'; runId: string; record: AssetRecord }
  /** Content-side warnings, sent once after everything else. */
  | { type: 'WARNINGS'; runId: string; warnings: Warning[] }
  /** Ask the background to fetch a URL (it has host permissions). Fallback (b) of asset rescue. */
  | { type: 'FETCH_ASSET'; url: string };

export type FetchAssetResponse =
  | { ok: true; mime: string; size: number; base64: string }
  | { ok: false; error: string };

export type CoreMetaPart = CoreMeta;
export type { LastRequest };
