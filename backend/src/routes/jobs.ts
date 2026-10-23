import { Router } from 'express';
import { streamJobEventsController } from '../controllers/jobs';

const router = Router();

// ============================================================================
// GET /api/jobs/:id/events — Server-Sent Events (SSE) Live Progress Stream
// ============================================================================
router.get('/api/jobs/:id/events', streamJobEventsController);

export const jobsRouter = router;
