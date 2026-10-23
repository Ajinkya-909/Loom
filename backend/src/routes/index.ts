import { Router } from 'express';
import { healthRouter } from './health';
import { capturesRouter } from './captures';
import { outputsRouter } from './outputs';
import { assetsRouter } from './assets';

const router = Router();

// Mount all modular sub-routers
router.use(healthRouter);
router.use(capturesRouter);
router.use(outputsRouter);
router.use(assetsRouter);

export const appRouter = router;
export { healthRouter, capturesRouter, outputsRouter, assetsRouter };
