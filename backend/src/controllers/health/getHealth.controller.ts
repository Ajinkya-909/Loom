import { Request, Response } from 'express';
import { prisma } from '../../db/prisma';

/**
 * GET /health and GET /api/health — System & Database Health Check Controller
 */
export async function getHealthController(_req: Request, res: Response) {
  let dbStatus = 'disconnected';

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'error';
  }

  const isHealthy = dbStatus === 'connected';

  return res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'ok' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      server: 'running',
      database: dbStatus,
    },
  });
}
