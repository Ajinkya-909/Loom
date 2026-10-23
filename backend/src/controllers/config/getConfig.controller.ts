import { Request, Response } from 'express';

/**
 * GET /api/config and GET /config — Public runtime configuration and extension handshake.
 *
 * Used by the browser extension upon opening to:
 * 1. Verify server connectivity and authorization.
 * 2. Check if local Gemma / Gemini fallback is available for summarization.
 * 3. Discover limits and supported platforms.
 */
export async function getConfigController(_req: Request, res: Response) {

  // Check if LLM summarization is available (Ollama or Gemini API key configured)
  const hasGemini = !!process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('your-key');
  const hasOllama = !!process.env.OLLAMA_BASE_URL;
  const gemmaEnabled = hasGemini || hasOllama;

  const llmProvider = hasOllama ? 'GEMMA_LOCAL' : hasGemini ? 'GEMINI_FALLBACK' : 'NONE';
  const llmModel = hasOllama
    ? (process.env.OLLAMA_MODEL || 'gemma4')
    : hasGemini
    ? (process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite')
    : 'none';

  return res.status(200).json({
    version: '1.0.0',
    authorized: true,
    gemmaEnabled,
    defaultMode: 'context',
    llm: {
      provider: llmProvider,
      model: llmModel,
      available: gemmaEnabled,
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
