import { Router, Request, Response } from 'express';
import fs from 'fs';
import { prisma } from '../db/prisma';

const router = Router();

// ============================================================================
// GET /api/outputs/:id — Deliverable & Canonical Markdown
//
// URL parameters:
//   - id (UUID): Output ID
// Query parameters:
//   - format (string, optional): 'raw' for text/markdown stream, otherwise JSON
// ============================================================================
router.get('/api/outputs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const format = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'json';

    const output = await prisma.output.findUnique({
      where: { id },
    });

    if (!output) {
      return res.status(404).json({
        error: {
          code: 'OUTPUT_NOT_FOUND',
          message: `Output deliverable with ID "${id}" was not found.`,
        },
      });
    }

    // Read latest markdown from disk if file exists, fallback to database record
    let markdown = output.markdown;
    if (output.filePath && fs.existsSync(output.filePath)) {
      try {
        markdown = fs.readFileSync(output.filePath, 'utf-8');
      } catch (err) {
        console.warn(`Could not read markdown from disk at ${output.filePath}, using DB record:`, err);
      }
    }

    // Return raw markdown if requested
    if (format === 'raw') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      return res.status(200).send(markdown);
    }

    // Return standard JSON response
    return res.status(200).json({
      id: output.id,
      captureId: output.captureId,
      kind: output.kind,
      markdown,
      generatedBy: output.generatedBy,
      createdAt: output.createdAt.toISOString(),
    });
  } catch (error) {
    console.error(`❌ Failed to retrieve output "${req.params.id}":`, error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve output deliverable.',
      },
    });
  }
});

export const outputsRouter = router;
