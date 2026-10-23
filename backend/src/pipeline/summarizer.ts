import { generateWithFallback, LlmGenerationResult } from '../utils/ai';

export interface SummarizeProgressCallback {
  (stage: string, progress: number): void | Promise<void>;
}

const CANONICAL_5_SECTION_PROMPT = `You are Loom's Senior Technical Distiller.
Your job is to read AI developer chat transcripts and synthesize them into an authoritative, canonical summary deliverable titled "summary.md".

CRITICAL INSTRUCTIONS:
1. Output PURE Markdown only. Do not add any conversational prelude (e.g. "Sure, here is the summary") or sign-offs.
2. Adhere strictly to the following 5-section structure and exact heading titles:

# Summary & Context Analysis: <Chat Title>

## 1. Objective & Intent
[Clear, precise synthesis of the developer's core inquiry, requirements, constraints, and problem statement.]

## 2. Key Decisions & Architecture
* **[Decision/Pattern 1]**: [Detailed technical rationale, chosen architectural approach, library trade-offs, and design patterns.]
* **[Decision/Pattern 2]**: [Data flow, schema choices, and component responsibilities.]

## 3. Discarded Approaches & Failures
* [Document any dead ends, errors encountered, incorrect code patterns, or approaches that were attempted and later abandoned during the conversation.]

## 4. Final Code & Deliverables
\`\`\`<language>
[Clean, consolidated, fully working, and production-ready final code implementation resolving the prompt. Do not output truncated code or placeholder comments.]
\`\`\`

## 5. Next Steps & Open Items
- [ ] [Remaining action items, edge cases to handle, tests to write, or follow-up architectural questions.]

3. Preserve all exact library names, versions, paths, and variables discussed in the conversation.
4. Ensure Section 2 (Key Decisions & Architecture) and Section 4 (Final Code & Deliverables) are thorough, concrete, and deeply technical.`;

const CHUNK_MAP_SYSTEM_PROMPT = `You are Loom's Technical Conversation Analyst.
Analyze this excerpt of a multi-turn developer AI conversation. Extract high-density technical notes covering:
1. Core intent, questions, and problem statements
2. Architectural decisions, frameworks, database schemas, and design patterns
3. Errors encountered, abandoned approaches, or debugging dead ends
4. Working code snippets, deliverables, and implementation details
5. Action items and next steps

Output concise, dense, factual markdown notes only. Do not add conversational padding.`;

/**
 * Splits canonical context.md into logical conversation turns.
 */
function splitContextIntoTurns(contextMarkdown: string): { header: string; turns: string[] } {
  // Find the first turn marker: "### 👤 User"
  const firstTurnIdx = contextMarkdown.indexOf('### 👤 User');
  if (firstTurnIdx === -1) {
    // Fallback: split by double horizontal rules or large paragraphs if no turn markers
    const parts = contextMarkdown.split(/\n---\n/);
    return {
      header: parts[0] || '',
      turns: parts.slice(1).filter((p) => p.trim().length > 0),
    };
  }

  const header = contextMarkdown.substring(0, firstTurnIdx).trim();
  const body = contextMarkdown.substring(firstTurnIdx);

  // Split by "### 👤 User" boundary
  const rawTurns = body.split(/(?=\n### 👤 User|^### 👤 User)/);
  const turns = rawTurns
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return { header, turns };
}

/**
 * Estimates token count from text length (rough ~4 characters per token).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Groups conversation turns into chunk buckets of up to maxTokens each.
 */
function groupTurnsIntoChunks(turns: string[], maxTokensPerChunk = 2000): string[] {
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const turn of turns) {
    const turnTokens = estimateTokens(turn);
    if (currentTokens + turnTokens > maxTokensPerChunk && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n\n---\n\n'));
      currentChunk = [turn];
      currentTokens = turnTokens;
    } else {
      currentChunk.push(turn);
      currentTokens += turnTokens;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n\n---\n\n'));
  }

  return chunks;
}

/**
 * Cleans markdown code fence wrappers from LLM output.
 */
function cleanMarkdownOutput(rawText: string): string {
  let clean = rawText.trim();
  if (clean.startsWith('```markdown') && clean.endsWith('```')) {
    clean = clean.substring(11, clean.length - 3).trim();
  } else if (clean.startsWith('```') && clean.endsWith('```')) {
    clean = clean.substring(3, clean.length - 3).trim();
  }
  return clean;
}

/**
 * Distills a canonical context.md transcript into summary.md using Gemma / Gemini fallback.
 * Uses 1-pass synthesis for small context (< 3,000 tokens) and Map-Reduce chunking for long conversations.
 */
export async function distillTranscriptToSummary(
  chatTitle: string,
  platform: string,
  contextMarkdown: string,
  onProgress?: SummarizeProgressCallback
): Promise<{ markdown: string; generatedBy: { provider: string; model: string; version: string } }> {
  const totalTokens = estimateTokens(contextMarkdown);
  const DIRECT_THRESHOLD_TOKENS = 3000;

  console.log(`📊 Transcript size: ~${totalTokens} estimated tokens (${contextMarkdown.length} chars)`);

  // =========================================================================
  // Path A: Direct 1-Pass Synthesis (Fast Path for Small/Medium Conversations)
  // =========================================================================
  if (totalTokens <= DIRECT_THRESHOLD_TOKENS) {
    console.log(`⚡ Direct 1-pass synthesis selected (~${totalTokens} <= ${DIRECT_THRESHOLD_TOKENS} tokens)`);
    await onProgress?.('distilling_direct', 0.4);

    const userPrompt = `Please synthesize and distill the following AI developer conversation transcript into the canonical 5-section "summary.md".

Chat Title: ${chatTitle}
Platform: ${platform}

--- BEGIN CONTEXT TRANSCRIPT ---
${contextMarkdown}
--- END CONTEXT TRANSCRIPT ---`;

    const result: LlmGenerationResult = await generateWithFallback(
      userPrompt,
      CANONICAL_5_SECTION_PROMPT
    );

    return {
      markdown: cleanMarkdownOutput(result.text),
      generatedBy: {
        provider: result.provider,
        model: result.model,
        version: '1.0',
      },
    };
  }

  // =========================================================================
  // Path B: Map-Reduce Chunking (For Long Conversations with Many Turns)
  // =========================================================================
  console.log(`🧩 Multi-stage chunking selected (~${totalTokens} > ${DIRECT_THRESHOLD_TOKENS} tokens)`);
  const { header, turns } = splitContextIntoTurns(contextMarkdown);

  // Group turns into manageable chunks of ~2,000 tokens
  const chunks = groupTurnsIntoChunks(turns, 2000);
  console.log(`✂️  Split transcript into ${chunks.length} processing chunks across ${turns.length} turns`);

  const intermediateNotes: string[] = [];
  let lastProvider = 'GEMMA_LOCAL';
  let lastModel = 'gemma:2b';

  // Stage 1: Map — Extract technical notes from each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunkProgress = 0.2 + (i / chunks.length) * 0.55;
    const stageName = `chunk_${i + 1}_of_${chunks.length}`;
    console.log(`⏳ Processing ${stageName} (~${estimateTokens(chunks[i])} tokens)...`);
    await onProgress?.(stageName, Math.round(chunkProgress * 100) / 100);

    const chunkPrompt = `Chat Title: ${chatTitle}
Platform: ${platform}
Chunk: Part ${i + 1} of ${chunks.length}

--- CONVERSATION CHUNK ---
${chunks[i]}
--- END CHUNK ---`;

    const chunkResult = await generateWithFallback(chunkPrompt, CHUNK_MAP_SYSTEM_PROMPT);
    intermediateNotes.push(`### Excerpt Analysis (Part ${i + 1} of ${chunks.length}):\n${chunkResult.text.trim()}`);
    lastProvider = chunkResult.provider;
    lastModel = chunkResult.model;
  }

  // Stage 2: Reduce — Final Synthesis into Canonical 5-Section summary.md
  console.log(`🔨 Synthesizing final canonical summary from ${chunks.length} chunks...`);
  await onProgress?.('synthesizing_final', 0.85);

  const finalPrompt = `Please synthesize the following extracted technical notes from a multi-turn developer chat into the canonical 5-section "summary.md".

Chat Title: ${chatTitle}
Platform: ${platform}
Header Info: ${header}

--- EXTRACTED CHUNK NOTES ---
${intermediateNotes.join('\n\n---\n\n')}
--- END NOTES ---`;

  const finalResult = await generateWithFallback(finalPrompt, CANONICAL_5_SECTION_PROMPT);

  return {
    markdown: cleanMarkdownOutput(finalResult.text),
    generatedBy: {
      provider: finalResult.provider || lastProvider,
      model: finalResult.model || lastModel,
      version: '1.0',
    },
  };
}
