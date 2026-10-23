import { Router } from 'express';
import { captureUpload } from '../middleware/upload';
import {
  createCaptureController,
  listCapturesController,
  getCaptureController,
  getCaptureMessagesController,
  exportCaptureController,
} from '../controllers/captures';

const router = Router();

// ============================================================================
// Capture Routes
// ============================================================================

// POST /api/captures — Core Ingestion & Normalization
router.post('/api/captures', captureUpload, createCaptureController);

// GET /api/captures — Capture Library & Full-Text Search
router.get('/api/captures', listCapturesController);

// GET /api/captures/:id — Capture Overview & Fidelity Stats
router.get('/api/captures/:id', getCaptureController);

// GET /api/captures/:id/messages — Structured Transcript (Messages & Blocks)
router.get('/api/captures/:id/messages', getCaptureMessagesController);

// GET /api/captures/:id/export — 1-Click Multi-Format Artifact Exporter
router.get('/api/captures/:id/export', exportCaptureController);

export const capturesRouter = router;
