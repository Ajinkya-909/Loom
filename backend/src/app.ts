import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health';
import { capturesRouter } from './routes/captures';
import { outputsRouter } from './routes/outputs';
import { assetsRouter } from './routes/assets';

export function createApp() {
  const app = express();

  // Standard middleware
  app.use(cors());
  app.use(express.json());

  // Mount routes
  app.use(healthRouter);
  app.use(capturesRouter);
  app.use(outputsRouter);
  app.use(assetsRouter);

  // Catch-all 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    });
  });

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled application error:', err);
    res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  return app;
}
