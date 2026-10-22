import { env } from './config/env';
import { createApp } from './app';
import { checkDatabaseConnection, prisma } from './db/prisma';

async function bootstrap() {
  console.log('🚀 Initializing backend service...');

  // 1. Verify database connection
  await checkDatabaseConnection();

  // 2. Start HTTP server
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`✅ Backend is running successfully on port ${env.PORT}`);
    console.log(`📍 Health check endpoint: http://localhost:${env.PORT}/health`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      console.log('HTTP server closed.');
      await prisma.$disconnect();
      console.log('Database connection closed.');
      process.exit(0);
    });

    // Force shutdown after timeout if graceful close hangs
    setTimeout(() => {
      console.error('Forcefully terminating process after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error('❌ Failed to start backend service:', error);
  process.exit(1);
});
