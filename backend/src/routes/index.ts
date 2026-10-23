import { Router } from 'express';
import { healthRouter } from './health';
import { capturesRouter } from './captures';
import { outputsRouter } from './outputs';
import { assetsRouter } from './assets';
import { jobsRouter } from './jobs';
import { configRouter } from './config';

const router = Router();

// Mount all modular sub-routers
router.use(healthRouter);
router.use(configRouter);
router.use(capturesRouter);
router.use(outputsRouter);
router.use(assetsRouter);
router.use(jobsRouter);

export const appRouter = router;
export { healthRouter, configRouter, capturesRouter, outputsRouter, assetsRouter, jobsRouter };
