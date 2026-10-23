import { z } from 'zod';

export const generateSummarySchema = z.object({
  kind: z.enum(['SUMMARY']).default('SUMMARY'),
  regenerate: z.boolean().default(false),
});

export type GenerateSummaryInput = z.infer<typeof generateSummarySchema>;
