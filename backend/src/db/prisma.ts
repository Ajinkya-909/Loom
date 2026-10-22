import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Verifies that the PostgreSQL database is reachable via Prisma.
 */
export async function checkDatabaseConnection(): Promise<void> {
  try {
    await prisma.$connect();
    // Run a lightweight probe query to verify active connectivity
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection is done successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}
