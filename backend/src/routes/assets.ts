import { Router } from 'express';
import { streamAssetController } from '../controllers/assets';

const router = Router();

// ============================================================================
// GET /api/assets/:id — Stream Rescued Media Asset
// ============================================================================
router.get('/api/assets/:id', streamAssetController);

export const assetsRouter = router;
