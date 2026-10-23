import { Router } from 'express';
import { getOutputController } from '../controllers/outputs';

const router = Router();

// ============================================================================
// GET /api/outputs/:id — Deliverable & Canonical Markdown
// ============================================================================
router.get('/api/outputs/:id', getOutputController);

export const outputsRouter = router;
