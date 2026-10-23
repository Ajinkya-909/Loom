import { Router } from 'express';
import { getConfigController } from '../controllers/config';

const router = Router();

// ============================================================================
// GET /api/config — Runtime settings & Extension Handshake
// ============================================================================
router.get(['/config', '/api/config'], getConfigController);

export const configRouter = router;
