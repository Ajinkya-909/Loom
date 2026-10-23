/**
 * Utility functions for file and filename manipulation
 */

/**
 * Sanitizes a title string into a filesystem-safe filename.
 * Strips non-alphanumeric characters, converts whitespace to underscores,
 * and limits length to 60 characters.
 */
export function sanitizeFilename(title: string): string {
  return (
    title
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '_')
      .substring(0, 60) || 'chat'
  );
}

/**
 * Extracts associated message index from uploaded asset filename patterns.
 * Supports patterns like msg-0, message_1, diagram-2, image_3, or leading digits.
 */
export function extractMessageIdxFromFilename(filename: string): number {
  const msgMatch = filename.match(/(?:msg|message)[_-](\d+)/i);
  if (msgMatch) return parseInt(msgMatch[1], 10);

  const assetMatch = filename.match(/(?:diagram|image|asset|img)[_-](\d+)/i);
  if (assetMatch) return parseInt(assetMatch[1], 10);

  const numMatch = filename.match(/^(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);

  return 0;
}
