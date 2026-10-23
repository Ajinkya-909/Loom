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
    // Snapshot HTML file
    if (file.fieldname === 'snapshot') {
      const isHtmlExt = /\.(html|htm|xhtml)$/i.test(file.originalname);
      if (ALLOWED_SNAPSHOT_MIMES.has(file.mimetype) || isHtmlExt) {
        cb(null, true);
      } else {
        cb(
          new Error(
            `Invalid snapshot MIME type "${file.mimetype}". Expected HTML file.`
          )
        );
      }
    } else {
      // Allow meta.json, messages.json, and all binary asset files (asset:ref, assets, images)
      cb(null, true);
    }
  },
});

// Configure capture fields using any() to flexibly accept snapshot, meta.json, messages.json, and asset:*
const captureFields = upload.any();

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
