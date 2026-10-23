// Every time / size box in one place. Tune here, not in the logic.

export const EXTENSION_VERSION = '0.1.0';
export const DEBUG = false; // flips console.debug on. Never logs chat content or the token.

// Network
export const GET_TIMEOUT_MS = 8_000;
export const UPLOAD_TIMEOUT_MS = 120_000;

// loadAll
export const SCROLL_WAIT_MS = 400;
export const SCROLL_STEP_WAIT_MS = 180;
export const STABLE_CHECKS = 3;
export const MAX_LOAD_ITERATIONS = 60;
export const LOAD_TIMEOUT_MS = 45_000;
export const MAX_SCROLL_STEPS = 400;

// Assets
export const MAX_ASSET_BYTES = 15 * 1024 * 1024;
export const MAX_TOTAL_ASSET_BYTES = 40 * 1024 * 1024;
export const MIN_IMAGE_PX = 32;

// Transfer content script -> background (runtime messages are JSON-serialized)
export const JSON_CHUNK_CHARS = 8 * 1024 * 1024;       // messages/snapshot string parts
export const ASSET_CHUNK_RAW_BYTES = 3 * 1024 * 1024;  // 3 MB raw  ->  4 MB base64 (multiple of 3 keeps base64 unpadded)

// Keep-alive ping during long steps
export const KEEPALIVE_MS = 20_000;

// Misc
export const SUCCESS_BADGE_MS = 5_000;
export const TITLE_FALLBACK_CHARS = 60;
export const DEFAULT_SERVER_URL = 'http://localhost:4000';
export const DEFAULT_WEB_URL = 'http://localhost:8080';
