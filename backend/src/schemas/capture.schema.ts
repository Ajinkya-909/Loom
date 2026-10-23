import { z } from 'zod';

// ============================================================================
// Platform enum (matches Prisma Platform enum exactly)
// ============================================================================
export const platformEnum = z.enum([
  'CHATGPT',
  'CLAUDE',
  'GEMINI',
  'DEEPSEEK',
  'PERPLEXITY',
  'GROK',
  'GENERIC',
]);

// ============================================================================
// Capture mode — determines if Gemma summarization runs after normalization
// ============================================================================
export const captureModeEnum = z
  .enum(['CONTEXT_ONLY', 'SUMMARIZE'])
  .default('CONTEXT_ONLY');

// ============================================================================
// Message role enum (matches Prisma MessageRole enum exactly)
// ============================================================================
export const messageRoleEnum = z.enum(['USER', 'ASSISTANT', 'SYSTEM']);

// ============================================================================
// Meta schema: Metadata about the captured chat session
//
// Sent by the extension as a JSON string in the "meta" multipart text field.
// ============================================================================
export const metaSchema = z.object({
  platform: platformEnum.optional(),
  sourceUrl: z.string().max(1024).optional(),
  title: z.string().max(255).optional(),
  mode: captureModeEnum,
  stats: z
    .object({
      expectedMessages: z.number().int().nonnegative().optional(),
      expectedCodeBlocks: z.number().int().nonnegative().optional(),
      expectedImages: z.number().int().nonnegative().optional(),
    })
    .optional()
    .default({}),
});

// ============================================================================
// Single message item schema
//
// Each message represents one turn in the conversation (user prompt,
// assistant response, or system notice).
//
// - `idx`:  Sequential 0-based index for ordering
// - `role`: Who sent the message
// - `text`: Clean plain text (used for hashing, search, block parsing)
// - `html`: Optional raw HTML from the DOM (backup for rich parsing)
// ============================================================================
export const messageItemSchema = z.object({
  idx: z.number().int().min(0, 'idx must be a non-negative integer'),
  role: messageRoleEnum,
  text: z.string().min(1, 'message text cannot be empty'),
  html: z.string().optional(),
});

// ============================================================================
// Messages array schema
//
// Optional pre-parsed messages. If omitted, backend scrapes HTML snapshot.
// ============================================================================
export const messagesSchema = z
  .array(messageItemSchema)
  .optional();

// ============================================================================
// Inferred TypeScript types for use throughout the codebase
// ============================================================================
export type Meta = z.infer<typeof metaSchema>;
export type MessageItem = z.infer<typeof messageItemSchema>;
export type Messages = z.infer<typeof messagesSchema>;
