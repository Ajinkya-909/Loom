// ============================================================================
// NORMALIZER — The Heart of the Loom Pipeline
// ============================================================================
//
// This module is responsible for:
//
// 1. Parsing raw message text into typed, structured blocks (code, text,
//    tables, diagrams) with ZERO information loss.
//
// 2. Compiling the canonical context.md transcript from parsed blocks,
//    following the exact format defined in PRODUCT_SPEC.md §4.1.
//
// 3. Estimating token counts for search and UI display.
//
// Design principles:
//   ✓ NEVER truncate or strip any content from the original messages.
//   ✓ Preserve exact code block language tags, indentation, and line breaks.
//   ✓ Preserve markdown table structures character-for-character.
//   ✓ Preserve Mermaid / PlantUML / ASCII diagrams in their fenced format.
//   ✓ Handle malformed or incomplete blocks gracefully (never crash).
//   ✓ Round-trip fidelity: parse(text) → renderBlocks() ≈ original text.
//
// ============================================================================

// ============================================================================
// Block Type Definitions
// ============================================================================

export interface TextBlock {
  type: 'text';
  content: string;
}

export interface CodeBlock {
  type: 'code';
  /**
   * Language identifier (e.g., 'typescript', 'python', 'sql').
   * Defaults to 'text' if unspecified in the fence.
   */
  lang: string;
  content: string;
}

export interface TableBlock {
  type: 'table';
  /**
   * Raw markdown table content including header row, separator row,
   * and all data rows. Preserved character-for-character.
   */
  content: string;
}

export interface DiagramBlock {
  type: 'diagram';
  /** Diagram language: 'mermaid', 'plantuml', 'dot', 'graphviz', 'ditaa' */
  lang: string;
  content: string;
}

export type Block = TextBlock | CodeBlock | TableBlock | DiagramBlock;

// ============================================================================
// Known diagram languages
//
// When a fenced code block uses one of these language tags, it is classified
// as a DiagramBlock rather than a CodeBlock.
// ============================================================================
const DIAGRAM_LANGUAGES = new Set([
  'mermaid',
  'plantuml',
  'dot',
  'graphviz',
  'ditaa',
]);

// ============================================================================
// Block Parser: Raw message text → typed Block[]
// ============================================================================

/**
 * Parses a raw message text string into an array of typed blocks.
 *
 * Handles:
 * - Fenced code blocks with 3+ backticks and optional language tag
 *   (```typescript, ````python, ````` etc.)
 * - Markdown tables (consecutive lines starting with | and containing 2+ pipes)
 * - Mermaid and other diagram code blocks (auto-classified by language tag)
 * - Regular text paragraphs (everything that isn't code or table)
 * - Unclosed code blocks (treats remainder of text as code — graceful fallback)
 * - Empty or whitespace-only messages (returns single empty TextBlock)
 *
 * @param text - The raw plain text of a single message
 * @returns Array of typed blocks preserving all original content
 */
export function parseTextIntoBlocks(text: string): Block[] {
  if (!text || text.trim().length === 0) {
    return [{ type: 'text', content: '' }];
  }

  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  let textBuffer: string[] = [];

  /**
   * Flushes accumulated text lines into a TextBlock.
   * Trims leading/trailing blank lines but preserves internal line breaks.
   */
  const flushTextBuffer = (): void => {
    if (textBuffer.length > 0) {
      const content = textBuffer.join('\n').trim();
      if (content.length > 0) {
        blocks.push({ type: 'text', content });
      }
      textBuffer = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // ------------------------------------------------------------------
    // 1. Detect fenced code block opening
    //
    // Regex matches:
    //   ```typescript      → lang = "typescript"
    //   ````python         → lang = "python"   (4+ backticks)
    //   ```                → lang = ""          (no language)
    //   ```c++             → lang = "c++"       (special chars)
    //   ```c#              → lang = "c#"
    //   ```objective-c     → lang = "objective-c"
    //
    // The closing fence must have >= same number of backticks.
    // ------------------------------------------------------------------
    const codeOpenMatch = line.match(/^(`{3,})(\S*)\s*$/);
    if (codeOpenMatch) {
      flushTextBuffer();

      const fenceLength = codeOpenMatch[1].length;
      const lang = codeOpenMatch[2] || '';
      const codeLines: string[] = [];
      i++; // move past opening fence

      // Collect lines until matching closing fence is found
      let foundClosing = false;
      while (i < lines.length) {
        const closingMatch = lines[i].match(/^(`{3,})\s*$/);
        if (closingMatch && closingMatch[1].length >= fenceLength) {
          foundClosing = true;
          i++; // skip closing fence
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }

      // If no closing fence found, remaining lines were already collected
      // as code content. This handles malformed/incomplete blocks gracefully.
      if (!foundClosing) {
        console.warn(
          `[normalizer] Unclosed code block detected (lang: "${lang}"). ` +
          `Treating remaining ${codeLines.length} lines as code content.`
        );
      }

      const codeContent = codeLines.join('\n');

      // Classify: diagram languages get DiagramBlock, everything else gets CodeBlock
      if (DIAGRAM_LANGUAGES.has(lang.toLowerCase())) {
        blocks.push({
          type: 'diagram',
          lang: lang.toLowerCase(),
          content: codeContent,
        });
      } else {
        blocks.push({
          type: 'code',
          lang: lang || 'text',
          content: codeContent,
        });
      }
      continue;
    }

    // ------------------------------------------------------------------
    // 2. Detect markdown table
    //
    // A valid markdown table row:
    //   - Starts with optional whitespace followed by |
    //   - Contains at least 2 pipe characters
    //
    // We require at least 2 consecutive table rows to classify as a table
    // (prevents false positives from single lines containing |).
    // ------------------------------------------------------------------
    if (isTableRow(line)) {
      flushTextBuffer();

      const tableLines: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }

      if (tableLines.length >= 2) {
        // Genuine table: header + separator/data rows
        blocks.push({ type: 'table', content: tableLines.join('\n') });
      } else {
        // Single pipe-containing line — ambiguous, keep as text
        textBuffer.push(...tableLines);
      }
      continue;
    }

    // ------------------------------------------------------------------
    // 3. Regular text line — accumulate in buffer
    // ------------------------------------------------------------------
    textBuffer.push(line);
    i++;
  }

  // Flush any remaining accumulated text
  flushTextBuffer();

  return blocks;
}

/**
 * Checks if a line looks like a markdown table row.
 *
 * A table row must:
 * - Start with optional whitespace followed by a pipe character |
 * - Contain at least 2 pipe characters total
 *
 * This filters out lines that contain a single | (e.g., shell pipes,
 * logical OR operators) while correctly detecting table rows and
 * separator rows (| --- | --- |).
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return false;
  const pipeCount = (trimmed.match(/\|/g) || []).length;
  return pipeCount >= 2;
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimates the approximate token count for a text string.
 *
 * Uses a conservative character-based heuristic:
 *   English text:  ~4 characters per token (GPT-family tokenizers)
 *   Code:          ~3.5 characters per token (slightly less efficient)
 *   Average:       ~4 characters per token
 *
 * This is NOT a precise tokenizer — it provides a rough count for
 * dashboard display (e.g., "~3,400 tokens") and search relevance hints.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ============================================================================
// Context Markdown Compiler
// ============================================================================

/**
 * Compiles the canonical context.md transcript from parsed message blocks.
 *
 * Output format matches PRODUCT_SPEC.md §4.1 exactly:
 *
 * ```markdown
 * # Context: [Chat Title]
 * - **Platform:** [ChatGPT / Claude / Gemini]
 * - **Captured At:** [ISO Timestamp]
 * - **Source URL:** [URL]
 *
 * ---
 *
 * ### 👤 User (Prompt #1)
 * [content with code blocks, tables, diagrams preserved]
 *
 * ### 🤖 Assistant (Response #1)
 * [content with full fidelity — zero information loss]
 * ![Asset](assets/{assetId}.png)
 *
 * ---
 * ```
 *
 * @param title - Chat session title
 * @param platform - Source platform identifier
 * @param sourceUrl - Original chat URL
 * @param capturedAt - ISO 8601 timestamp of when the capture was created
 * @param messages - Array of parsed messages with their typed blocks
 * @param assets - Array of saved asset records for inline image references
 * @returns Complete context.md markdown string ready for disk and DB storage
 */
export function buildContextMarkdown(
  title: string,
  platform: string,
  sourceUrl: string,
  capturedAt: string,
  messages: Array<{
    idx: number;
    role: string;
    text: string;
    blocks: Block[];
  }>,
  assets: Array<{
    id: string;
    messageIdx: number;
    localPath: string;
    mime: string;
  }>
): string {
  const sections: string[] = [];

  // ---- Document Header ----
  sections.push(`# Context: ${title}`);
  sections.push(`- **Platform:** ${platform}`);
  sections.push(`- **Captured At:** ${capturedAt}`);
  sections.push(`- **Source URL:** ${sourceUrl}`);
  sections.push('');
  sections.push('---');
  sections.push('');

  // ---- Message Transcript ----
  let promptCount = 0;
  let responseCount = 0;

  for (const msg of messages) {
    // Role heading with emoji and sequential numbering
    if (msg.role === 'USER') {
      promptCount++;
      sections.push(`### 👤 User (Prompt #${promptCount})`);
    } else if (msg.role === 'ASSISTANT') {
      responseCount++;
      sections.push(`### 🤖 Assistant (Response #${responseCount})`);
    } else {
      sections.push(`### ⚙️ System`);
    }
    sections.push('');

    // Render each typed block back into canonical markdown
    for (const block of msg.blocks) {
      sections.push(renderBlock(block));
      sections.push('');
    }

    // Inline asset references for images associated with this message
    const messageAssets = assets.filter((a) => a.messageIdx === msg.idx);
    for (const asset of messageAssets) {
      sections.push(`![Asset](${asset.localPath})`);
      sections.push('');
    }

    // Message separator
    sections.push('---');
    sections.push('');
  }

  return sections.join('\n');
}

// ============================================================================
// Block Renderer: Typed Block → canonical markdown string
// ============================================================================

/**
 * Renders a single typed block back into its canonical markdown form.
 *
 * This ensures round-trip fidelity:
 *   parse(originalText) → blocks → renderBlock(block) ≈ original markdown
 *
 * Code blocks and diagrams are wrapped in their fenced markers with the
 * correct language tag. Tables and text are passed through as-is.
 */
function renderBlock(block: Block): string {
  switch (block.type) {
    case 'text':
      return block.content;

    case 'code':
      return `\`\`\`${block.lang}\n${block.content}\n\`\`\``;

    case 'table':
      // Tables are already valid markdown — pass through verbatim
      return block.content;

    case 'diagram':
      return `\`\`\`${block.lang}\n${block.content}\n\`\`\``;

    default:
      // Safety fallback for any unknown block type
      return (block as any).content || '';
  }
}
