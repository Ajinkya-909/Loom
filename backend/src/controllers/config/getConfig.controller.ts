import { Request, Response } from 'express';
import { env } from '../../config/env';
import { isOllamaAvailable } from '../../utils/ai';

export async function getConfigController(_req: Request, res: Response) {
  const ollamaOnline = await isOllamaAvailable();
  const hasGemini =
    !!env.GEMINI_API_KEY &&
    env.GEMINI_API_KEY.trim() !== '' &&
    !env.GEMINI_API_KEY.includes('your-key');

  let llmProvider: 'GEMMA_LOCAL' | 'GEMINI_FALLBACK' | 'NONE';
  let llmModel: string;
  let llmAvailable: boolean;

  if (env.GEMMA_ONLY) {
    llmProvider = 'GEMMA_LOCAL';
    llmModel = env.OLLAMA_MODEL;
    llmAvailable = ollamaOnline;
  } else if (ollamaOnline) {
    llmProvider = 'GEMMA_LOCAL';
    llmModel = env.OLLAMA_MODEL;
    llmAvailable = true;
  } else if (hasGemini) {
    llmProvider = 'GEMINI_FALLBACK';
    llmModel = env.GEMINI_MODEL;
    llmAvailable = true;
  } else {
    llmProvider = 'NONE';
    llmModel = 'none';
    llmAvailable = false;
  }

  return res.status(200).json({
    version: '1.0.0',
    authorized: true,
    gemmaEnabled: llmAvailable,
    gemmaOnly: env.GEMMA_ONLY,
    defaultMode: 'context',
    llm: {
      provider: llmProvider,
      model: llmModel,
      available: llmAvailable,
    },
    supportedPlatforms: [
      'CHATGPT',
      'CLAUDE',
      'GEMINI',
      'GROK',
      'DEEPSEEK',
      'PERPLEXITY',
      'GENERIC',
    ],
    limits: {
      maxPayloadMb: 100,
      maxMessageCount: 500,
    },
  });
}
