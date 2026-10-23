import { Router } from 'express';
import { getHealthController } from '../controllers/health';

const router = Router();

// ============================================================================
// GET /health and GET /api/health — System & Database Health Check
// ============================================================================
router.get(['/health', '/api/health'], getHealthController);

export const healthRouter = router;
