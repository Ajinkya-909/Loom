import { env } from '../config/env';

export interface LlmGenerationResult {
  text: string;
  provider: 'GEMMA_LOCAL' | 'GEMINI_FALLBACK';
  model: string;
}

/**
 * Checks if local Ollama server is reachable and responsive.
 */
export async function isOllamaAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${env.OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Invokes local Gemma model via Ollama REST API.
 */
export async function generateWithLocalGemma(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const controller = new AbortController();
  // Configurable timeout for local CPU/GPU inference on longer context
  const timeout = setTimeout(() => controller.abort(), env.OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${env.OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.OLLAMA_MODEL,
        prompt,
        system: systemPrompt,
        stream: false,
        options: {
          temperature: 0.2,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama error [HTTP ${res.status}]: ${errText || res.statusText}`);
    }

    const data = (await res.json()) as { response?: string };
    if (!data.response) {
      throw new Error('Ollama returned empty response content.');
    }

    return data.response.trim();
  } finally {
    clearTimeout(timeout);
  }
}

/**
/**
 * Direct call to Google Gemini REST endpoint for a specific model.
 */
async function callGeminiApi(
  modelName: string,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  if (!env.GEMINI_API_KEY || env.GEMINI_API_KEY.trim() === '') {
    throw new Error('GEMINI_API_KEY is not configured in .env');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;
  const controller = new AbortController();
  // 60-second timeout per generation attempt
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const fullText = systemPrompt
      ? `${systemPrompt}\n\n---\n\n${prompt}`
      : prompt;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: fullText }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Gemini API error [HTTP ${res.status} for ${modelName}]: ${errText || res.statusText}`);
    }

    const data = (await res.json()) as any;
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      throw new Error(`Gemini API returned an empty completion for ${modelName}.`);
    }

    return candidateText.trim();
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      throw new Error(`Gemini request timed out or was aborted for model ${modelName}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Invokes Google Gemini API as cloud fallback with automatic backup model cascade.
 * If the configured model (e.g. gemini-3.8-flash) experiences high demand (HTTP 503)
 * or times out, it automatically falls back to gemini-3.1-flash-lite.
 */
export async function generateWithGemini(
  prompt: string,
  systemPrompt?: string
): Promise<{ text: string; model: string }> {
  const primaryModel = env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const backupModel = primaryModel === 'gemini-3.1-flash-lite' ? 'gemini-3.8-flash' : 'gemini-3.1-flash-lite';

  try {
    console.log(`🌐 Calling primary Gemini model (${primaryModel})...`);
    const text = await callGeminiApi(primaryModel, prompt, systemPrompt);
    return { text, model: primaryModel };
  } catch (primaryErr: any) {
    console.warn(`⚠️ Primary Gemini model (${primaryModel}) failed: ${primaryErr?.message || primaryErr}`);
    console.log(`🔄 Attempting backup Gemini model (${backupModel})...`);

    try {
      const text = await callGeminiApi(backupModel, prompt, systemPrompt);
      console.log(`✅ Backup Gemini model (${backupModel}) succeeded!`);
      return { text, model: backupModel };
    } catch (backupErr: any) {
      throw new Error(
        `All Gemini models failed. Primary (${primaryModel}): ${primaryErr?.message || primaryErr} | Backup (${backupModel}): ${backupErr?.message || backupErr}`
      );
    }
  }
}

/**
 * High-level generation function with automatic fallback:
 * 1. Tries local Gemma first.
 * 2. If unreachable or fails, falls back to Gemini API (with backup model cascade).
 */
export async function generateWithFallback(
  prompt: string,
  systemPrompt?: string
): Promise<LlmGenerationResult> {
  // STRICT MODE: Gemma only. No cloud fallback, errors are surfaced loudly.
  if (env.GEMMA_ONLY) {
    console.log(`🤖 [GEMMA_ONLY] Using local Gemma via Ollama (${env.OLLAMA_MODEL}) at ${env.OLLAMA_BASE_URL}`);
    const text = await generateWithLocalGemma(prompt, systemPrompt);
    console.log(`✅ Local Gemma generated output (${text.length} chars)`);
    return {
      text,
      provider: 'GEMMA_LOCAL',
      model: env.OLLAMA_MODEL,
    };
  }

  // NORMAL MODE: try Gemma first, then Gemini fallback
  const ollamaOnline = await isOllamaAvailable();
  if (ollamaOnline) {
    try {
      console.log(`🤖 Attempting local Gemma distillation via Ollama (${env.OLLAMA_MODEL})...`);
      const text = await generateWithLocalGemma(prompt, systemPrompt);
      console.log(`✅ Local Gemma generated summary successfully (${text.length} chars)`);
      return {
        text,
        provider: 'GEMMA_LOCAL',
        model: env.OLLAMA_MODEL,
      };
    } catch (gemmaErr: any) {
      console.warn(`⚠️ Local Gemma failed: ${gemmaErr?.message || gemmaErr}`);
    }
  } else {
    console.log(`ℹ️ Local Ollama not detected at ${env.OLLAMA_BASE_URL}, switching to Gemini fallback.`);
  }

  // Step 2: Attempt Google Gemini Fallback
  try {
    const { text, model: usedModel } = await generateWithGemini(prompt, systemPrompt);
    console.log(`✅ Gemini generated summary successfully via ${usedModel} (${text.length} chars)`);
    return {
      text,
      provider: 'GEMINI_FALLBACK',
      model: usedModel,
    };
  } catch (geminiErr: any) {
    console.error(`❌ Gemini fallback failed: ${geminiErr?.message || geminiErr}`);
    throw new Error(
      `Summary generation failed. Local Gemma error and Gemini fallback failed: ${geminiErr?.message || geminiErr}`
    );
  }
}
