import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required and cannot be empty'),

  // Local LLM (Ollama / Gemma 4)
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('gemma4:e2b'),
  GEMMA_ONLY: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .default('false')
    .transform((v) => v === true || v === 'true'),
  OLLAMA_TIMEOUT_MS: z.coerce.number().default(300000),

  // Cloud LLM Fallback (Google Gemini)
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.1-flash-lite'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

export const env = parsed.data;
