import { Request, Response } from 'express';
import { prisma } from '../../db/prisma';

/**
 * GET /api/captures/:id/messages — Structured Transcript (Messages & Blocks) Controller
 *
 * URL parameters:
 *   - id (UUID): Capture ID
 * Query parameters:
 *   - role (enum, optional): Filter by USER, ASSISTANT, or SYSTEM
 */
export async function getCaptureMessagesController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const roleQuery = typeof req.query.role === 'string' ? req.query.role.toUpperCase() : undefined;

    // Check if capture exists
    const capture = await prisma.capture.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!capture) {
      return res.status(404).json({
        error: {
          code: 'CAPTURE_NOT_FOUND',
          message: `Capture with ID "${id}" was not found.`,
        },
      });
    }

    const where: any = { captureId: id };
    if (roleQuery && ['USER', 'ASSISTANT', 'SYSTEM'].includes(roleQuery)) {
      where.role = roleQuery;
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: { idx: 'asc' },
    });

    const items = messages.map((m) => ({
      id: m.id,
      idx: m.idx,
      role: m.role,
      textPlain: m.textPlain,
      blocks: m.blocks,
      tokenEstimate: m.tokenEstimate,
    }));

    return res.status(200).json({ items });
  } catch (error) {
    console.error(`❌ Failed to retrieve messages for capture "${req.params.id}":`, error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve messages transcript.',
      },
    });
  }
}
