import { generateWithFallback, LlmGenerationResult } from '../utils/ai';

const SYSTEM_PROMPT = `You are Loom's Senior Technical Distiller.
Your job is to read raw, multi-turn AI developer chat transcripts and synthesize them into an authoritative, canonical summary deliverable titled "summary.md".

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

/**
 * Distills a canonical context.md transcript into summary.md using Gemma (with Gemini fallback).
 */
export async function distillTranscriptToSummary(
  chatTitle: string,
  platform: string,
  contextMarkdown: string
): Promise<{ markdown: string; generatedBy: { provider: string; model: string; version: string } }> {
  const userPrompt = `Please synthesize and distill the following AI developer conversation transcript into the canonical 5-section "summary.md".

Chat Title: ${chatTitle}
Platform: ${platform}

--- BEGIN CONTEXT TRANSCRIPT ---
${contextMarkdown}
--- END CONTEXT TRANSCRIPT ---`;

  const result: LlmGenerationResult = await generateWithFallback(
    userPrompt,
    SYSTEM_PROMPT
  );

  // Clean any markdown codefence wrapping if the model wrapped the entire output in ```markdown
  let cleanMarkdown = result.text.trim();
  if (cleanMarkdown.startsWith('```markdown') && cleanMarkdown.endsWith('```')) {
    cleanMarkdown = cleanMarkdown.substring(11, cleanMarkdown.length - 3).trim();
  } else if (cleanMarkdown.startsWith('```') && cleanMarkdown.endsWith('```')) {
    cleanMarkdown = cleanMarkdown.substring(3, cleanMarkdown.length - 3).trim();
  }

  return {
    markdown: cleanMarkdown,
    generatedBy: {
      provider: result.provider,
      model: result.model,
      version: '1.0',
    },
  };
}
