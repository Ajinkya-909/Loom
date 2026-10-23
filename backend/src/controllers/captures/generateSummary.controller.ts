import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../db/prisma';
import { generateSummarySchema } from '../../schemas/summary.schema';
import { distillTranscriptToSummary } from '../../pipeline/summarizer';
import { jobEvents } from '../../pipeline/jobEvents';

/**
 * POST /api/captures/:id/generate — On-Demand Summary Generation Controller
 *
 * URL parameters:
 *   - id (UUID): Capture ID
 * Body (JSON):
 *   - kind: "SUMMARY" (default)
 *   - regenerate: boolean (default false)
 */
export async function generateSummaryController(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // Validate request body
    const bodyResult = generateSummarySchema.safeParse(req.body || {});
    if (!bodyResult.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body.',
          details: bodyResult.error.flatten(),
        },
      });
    }

    const { regenerate } = bodyResult.data;

    // Find capture with chat and outputs
    const capture = await prisma.capture.findUnique({
      where: { id },
      include: {
        chat: true,
        outputs: true,
      },
    });

    if (!capture) {
      return res.status(404).json({
        error: {
          code: 'CAPTURE_NOT_FOUND',
          message: `Capture with ID "${id}" was not found.`,
        },
      });
    }

    // Step 1: Idempotency Check — return existing summary if regenerate is false
    const existingSummary = capture.outputs.find((o) => o.kind === 'SUMMARY');
    if (existingSummary && !regenerate) {
      return res.status(200).json({
        jobId: null,
        outputId: existingSummary.id,
        status: 'READY',
        cached: true,
        message: 'Summary deliverable already exists. Use {"regenerate": true} to force regeneration.',
      });
    }

    // Step 2: Read canonical context.md from disk (or DB fallback)
    const contextDiskPath = path.resolve(
      process.cwd(),
      'storage/captures',
      capture.chatId,
      `v${capture.version}`,
      'context.md'
    );

    let contextMarkdown = '';
    if (fs.existsSync(contextDiskPath)) {
      contextMarkdown = await fs.promises.readFile(contextDiskPath, 'utf-8');
    } else {
      const contextOutput = capture.outputs.find((o) => o.kind === 'CONTEXT');
      if (contextOutput) {
        contextMarkdown = contextOutput.markdown;
      }
    }

    if (!contextMarkdown || contextMarkdown.trim() === '') {
      return res.status(422).json({
        error: {
          code: 'CONTEXT_NOT_FOUND',
          message: 'Cannot generate summary: canonical context.md transcript is missing for this capture.',
        },
      });
    }

    // Step 3: Create Job record in DB
    const job = await prisma.job.create({
      data: {
        captureId: capture.id,
        type: 'SUMMARIZE',
        stage: 'queued',
        status: 'RUNNING',
        progress: 0.1,
      },
    });

    // Step 4: Respond immediately with 202 Accepted
    res.status(202).json({
      jobId: job.id,
      captureId: capture.id,
      status: 'RUNNING',
      stage: 'queued',
      streamUrl: `/api/jobs/${job.id}/events`,
    });

    // Step 5: Execute Async Summarization Pipeline in Background
    (async () => {
      try {
        jobEvents.emitStage({
          jobId: job.id,
          stage: 'reading_context',
          progress: 0.2,
          status: 'RUNNING',
          captureId: capture.id,
        });

        await prisma.job.update({
          where: { id: job.id },
          data: { stage: 'distilling', progress: 0.4 },
        });

        jobEvents.emitStage({
          jobId: job.id,
          stage: 'distilling',
          progress: 0.4,
          status: 'RUNNING',
          captureId: capture.id,
        });

        // Run Local Gemma or Gemini Fallback
        const { markdown, generatedBy } = await distillTranscriptToSummary(
          capture.chat.title,
          capture.chat.platform,
          contextMarkdown
        );

        // Save summary.md to disk
        jobEvents.emitStage({
          jobId: job.id,
          stage: 'saving',
          progress: 0.85,
          status: 'RUNNING',
          captureId: capture.id,
        });

        const summaryDiskPath = path.resolve(
          process.cwd(),
          'storage/captures',
          capture.chatId,
          `v${capture.version}`,
          'summary.md'
        );

        await fs.promises.writeFile(summaryDiskPath, markdown, 'utf-8');
        console.log(`💾 Saved summary.md (${markdown.length} chars) → ${summaryDiskPath}`);

        const relativeFilePath = `captures/${capture.chatId}/v${capture.version}/summary.md`;

        // Upsert Output record
        let output;
        if (existingSummary) {
          output = await prisma.output.update({
            where: { id: existingSummary.id },
            data: {
              markdown,
              filePath: relativeFilePath,
              generatedBy,
            },
          });
        } else {
          output = await prisma.output.create({
            data: {
              captureId: capture.id,
              kind: 'SUMMARY',
              markdown,
              filePath: relativeFilePath,
              generatedBy,
            },
          });
        }

        // Finalize Job
        await prisma.job.update({
          where: { id: job.id },
          data: {
            stage: 'completed',
            status: 'COMPLETED',
            progress: 1.0,
          },
        });

        jobEvents.emitDone({
          jobId: job.id,
          stage: 'completed',
          progress: 1.0,
          status: 'COMPLETED',
          outputId: output.id,
          captureId: capture.id,
        });

        console.log(`🎉 Summary generation finished for Capture [${capture.id}] (Job [${job.id}])`);
      } catch (err: any) {
        console.error(`❌ Background summary generation failed for Job [${job.id}]:`, err);

        const errorMessage = err?.message || 'Failed during summary distillation.';

        await prisma.job.update({
          where: { id: job.id },
          data: {
            stage: 'failed',
            status: 'FAILED',
            error: errorMessage,
          },
        });

        jobEvents.emitError({
          jobId: job.id,
          stage: 'failed',
          status: 'FAILED',
          error: errorMessage,
          captureId: capture.id,
        });
      }
    })();
  } catch (error) {
    console.error(`❌ Failed to start summary generation for "${req.params.id}":`, error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to initiate summary generation.',
      },
    });
  }
}
