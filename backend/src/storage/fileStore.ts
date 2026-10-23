import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// ============================================================================
// Storage root directory
//
// Resolves relative to the backend working directory.
// Result: d:\...\Loom\backend\storage
// ============================================================================
const STORAGE_ROOT = path.resolve(process.cwd(), 'storage');

// ============================================================================
// Types
// ============================================================================

export interface CaptureDirectories {
  /** Root directory for this capture version: storage/captures/{chatId}/v{version} */
  root: string;
  /** Raw files directory: storage/captures/{chatId}/v{version}/raw */
  rawDir: string;
  /** Assets directory: storage/captures/{chatId}/v{version}/assets */
  assetsDir: string;
}

export interface SavedAssetInfo {
  /** Relative path within the capture: assets/{assetId}.{ext} */
  localPath: string;
  /** SHA-256 hash of the asset file for integrity verification */
  sha256: string;
}

// ============================================================================
// Directory Preparation
// ============================================================================

/**
 * Creates the full directory hierarchy for a new capture version:
 *
 *   storage/captures/{chatId}/v{version}/raw/
 *   storage/captures/{chatId}/v{version}/assets/
 *
 * Uses recursive mkdir — safe to call even if parent directories exist.
 */
export async function prepareCaptureDirectories(
  chatId: string,
  version: number
): Promise<CaptureDirectories> {
  const root = path.join(STORAGE_ROOT, 'captures', chatId, `v${version}`);
  const rawDir = path.join(root, 'raw');
  const assetsDir = path.join(root, 'assets');

  await fs.mkdir(rawDir, { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });

  return { root, rawDir, assetsDir };
}

// ============================================================================
// File Saving Operations
// ============================================================================

/**
 * Saves the raw HTML snapshot to raw/snapshot.html
 */
export async function saveSnapshotFile(
  rawDir: string,
  buffer: Buffer
): Promise<void> {
  await fs.writeFile(path.join(rawDir, 'snapshot.html'), buffer);
}

/**
 * Saves the raw messages JSON array to raw/messages.json
 * Pretty-printed for human readability when inspecting raw storage.
 */
export async function saveMessagesFile(
  rawDir: string,
  messages: unknown[]
): Promise<void> {
  await fs.writeFile(
    path.join(rawDir, 'messages.json'),
    JSON.stringify(messages, null, 2),
    'utf-8'
  );
}

/**
 * Saves a binary asset file (image / diagram) to assets/{assetId}.{ext}
 *
 * Returns:
 * - localPath: relative path for DB storage and context.md references
 * - sha256: integrity hash for deduplication and verification
 */
export async function saveAssetFile(
  assetsDir: string,
  assetId: string,
  buffer: Buffer,
  mime: string,
  originalFilename?: string
): Promise<SavedAssetInfo> {
  const ext = mimeToExtension(mime, originalFilename);
  const cleanOriginalName = originalFilename
    ? path.basename(originalFilename).replace(/[^\w.\-]+/g, '_').slice(-80)
    : '';
  const isGeneric = !cleanOriginalName || /^(image|file|asset)[_-]?\d*\.[a-z0-9]+$/i.test(cleanOriginalName);
  let filename = isGeneric ? `${assetId}.${ext}` : `${assetId}-${cleanOriginalName}`;
  if (!filename.toLowerCase().endsWith(`.${ext}`)) {
    filename = `${filename}.${ext}`;
  }
  const filePath = path.join(assetsDir, filename);

  await fs.writeFile(filePath, buffer);

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    localPath: `assets/${filename}`,
    sha256,
  };
}

/**
 * Writes the compiled context.md to the capture version root directory.
 * Returns the absolute file path for confirmation logging.
 */
export async function saveContextMarkdown(
  captureRoot: string,
  markdown: string
): Promise<string> {
  const filePath = path.join(captureRoot, 'context.md');
  await fs.writeFile(filePath, markdown, 'utf-8');
  return filePath;
}

// ============================================================================
// Hashing & Deduplication
// ============================================================================

/**
 * Computes a SHA-256 hash over the ordered concatenation of all message
 * plain texts, separated by a unique boundary marker.
 *
 * Used for deduplication: if two captures of the same chat produce the
 * same hash, the second capture is flagged as a duplicate and skipped.
 */
export function computeContentHash(messages: Array<{ text: string }>): string {
  const combined = messages.map((m) => m.text).join('\n---MSG_BOUNDARY---\n');
  return crypto.createHash('sha256').update(combined, 'utf-8').digest('hex');
}

// ============================================================================
// Utility: MIME type → file extension mapping
// ============================================================================

function mimeToExtension(mime: string, originalFilename?: string): string {
  if (originalFilename) {
    const ext = path.extname(originalFilename).replace(/^\./, '').toLowerCase();
    if (ext && /^[a-z0-9]{2,5}$/.test(ext)) return ext;
  }
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'application/pdf': 'pdf',
    'text/csv': 'csv',
    'text/plain': 'txt',
    'application/zip': 'zip',
    'application/json': 'json',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/msword': 'doc',
    'text/html': 'html',
    'application/xhtml+xml': 'html',
  };
  return map[mime] || 'bin';
}
