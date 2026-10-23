import { Router } from 'express';
import { healthRouter } from './health';
import { capturesRouter } from './captures';
import { outputsRouter } from './outputs';
import { assetsRouter } from './assets';
import { jobsRouter } from './jobs';

const router = Router();

// Mount all modular sub-routers
router.use(healthRouter);
router.use(capturesRouter);
router.use(outputsRouter);
router.use(assetsRouter);
router.use(jobsRouter);

export const appRouter = router;
export { healthRouter, capturesRouter, outputsRouter, assetsRouter, jobsRouter };
