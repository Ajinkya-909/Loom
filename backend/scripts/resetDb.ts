/**
 * ============================================================================
 * Loom - Database & Storage Clean / Reset Script
 * ============================================================================
 * 
 * HOW TO RUN THIS SCRIPT:
 * 
 * 1. From the backend folder:
 *      cd backend
 *      npm run db:reset
 *    OR directly:
 *      cd backend
 *      npx tsx scripts/resetDb.ts
 * 
 * 2. From the root directory:
 *      npm --prefix backend run db:reset
 *    OR directly:
 *      npx --prefix backend tsx backend/scripts/resetDb.ts
 * 
 * WHAT THIS SCRIPT DOES:
 * - Wipes all stored records across all database tables (Chats, Captures,
 *   Messages, Assets, Outputs, and Background Jobs) using Prisma.
 * - Cleans up saved raw captures and extracted media files in
 *   `backend/storage/captures/` while preserving the directory structure.
 * - Leaves the database in a completely clean, fresh state ready for presentations!
 * ============================================================================
 */

import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables (.env in backend or root)
const backendEnvPath = path.resolve(__dirname, '../.env');
const rootEnvPath = path.resolve(__dirname, '../../.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

const prisma = new PrismaClient();

async function cleanStorageDirectory(dirPath: string): Promise<number> {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  let removedCount = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    try {
      if (entry.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        removedCount++;
      } else if (entry.isFile()) {
        fs.unlinkSync(fullPath);
        removedCount++;
      }
    } catch (err) {
      console.warn(`  ⚠️ Could not remove file/dir: ${fullPath}`, err);
    }
  }

  return removedCount;
}

async function main() {
  console.log('\n==================================================');
  console.log('🧹 LOOM DATABASE & STORAGE CLEANUP SCRIPT');
  console.log('==================================================');

  try {
    console.log('\n🔌 Connecting to PostgreSQL database...');
    await prisma.$connect();
    console.log('✅ Connected successfully.\n');

    console.log('🗑️  Deleting all database records...');

    // Run deletions in dependency order to respect foreign key constraints
    const [
      deletedJobs,
      deletedOutputs,
      deletedAssets,
      deletedMessages,
      deletedCaptures,
      deletedChats,
    ] = await prisma.$transaction([
      prisma.job.deleteMany(),
      prisma.output.deleteMany(),
      prisma.asset.deleteMany(),
      prisma.message.deleteMany(),
      prisma.capture.deleteMany(),
      prisma.chat.deleteMany(),
    ]);

    console.log(`  • Jobs deleted:     ${deletedJobs.count}`);
    console.log(`  • Outputs deleted:  ${deletedOutputs.count}`);
    console.log(`  • Assets deleted:   ${deletedAssets.count}`);
    console.log(`  • Messages deleted: ${deletedMessages.count}`);
    console.log(`  • Captures deleted: ${deletedCaptures.count}`);
    console.log(`  • Chats deleted:    ${deletedChats.count}`);

    console.log('\n📁 Cleaning local file storage in backend/storage/captures/ ...');
    const storageCapturesDir = path.resolve(__dirname, '../storage/captures');
    const removedStorageItems = await cleanStorageDirectory(storageCapturesDir);
    console.log(`  • Removed ${removedStorageItems} storage directories/files.`);

    console.log('\n==================================================');
    console.log('✨ All records and storage successfully wiped!');
    console.log('🎉 Database is fresh and ready for your presentation.');
    console.log('==================================================\n');
  } catch (error) {
    console.error('\n❌ Error resetting database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
