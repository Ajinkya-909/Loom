import multer, { MulterError } from 'multer';
import { Request, Response, NextFunction } from 'express';

// ============================================================================
// File size and count limits
// ============================================================================
const TOTAL_PAYLOAD_LIMIT = 100 * 1024 * 1024; // 100 MB total payload
const MAX_FILE_COUNT = 200;                    // snapshot + assets
const MAX_TEXT_FIELDS = 20;                    // meta + other fields

// ============================================================================
// Allowed MIME types — strictly enforced by file filter
// ============================================================================
const ALLOWED_SNAPSHOT_MIMES = new Set([
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'application/octet-stream',
]);

// Multer configuration
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: TOTAL_PAYLOAD_LIMIT,
    files: MAX_FILE_COUNT,
    fields: MAX_TEXT_FIELDS,
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'snapshot') {
      const isHtmlExt = /\.(html|htm)$/i.test(file.originalname);
      if (ALLOWED_SNAPSHOT_MIMES.has(file.mimetype) || isHtmlExt) {
        cb(null, true);
      } else {
        cb(
          new Error(
            `Invalid snapshot MIME type "${file.mimetype}". Expected HTML file.`
          )
        );
      }
    } else if (file.fieldname === 'assets') {
      // Allow image, stylesheet, script, font, or binary asset files
      cb(null, true);
    } else {
      cb(
        new Error(
          `Unexpected file field: "${file.fieldname}". Only "snapshot" and "assets" are accepted.`
        )
      );
    }
  },
});

// Configure expected multipart file fields
const captureFields = upload.fields([
  { name: 'snapshot', maxCount: 1 },
  { name: 'assets', maxCount: 20 },
]);

// ============================================================================
// Exported middleware with clean error wrapping
//
// Wraps multer to produce consistent JSON error responses matching
// the API error envelope format.
// ============================================================================
export function captureUpload(req: Request, res: Response, next: NextFunction): void {
  captureFields(req, res, (err: any) => {
    if (err) {
      if (err instanceof MulterError) {
        // Multer-specific errors (file too large, too many files, etc.)
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `Upload error: ${err.message}`,
            details: { field: err.field, multerCode: err.code },
          },
        });
      }

      // Custom file filter errors or other upload errors
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message || 'Invalid file upload',
        },
      });
    }

    next();
  });
}
