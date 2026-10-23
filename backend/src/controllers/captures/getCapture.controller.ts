import { Request, Response } from 'express';
import { prisma } from '../../db/prisma';

/**
 * GET /api/captures/:id — Capture Overview & Fidelity Stats Controller
 *
 * URL parameters:
 *   - id (UUID): Capture ID
 */
export async function getCaptureController(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const capture = await prisma.capture.findUnique({
      where: { id },
      include: {
        chat: {
          include: {
            captures: {
              select: {
                id: true,
                version: true,
                createdAt: true,
              },
              orderBy: { version: 'desc' },
            },
          },
        },
        outputs: {
          select: {
            id: true,
            kind: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        assets: {
          select: {
            id: true,
            mime: true,
            localPath: true,
          },
          orderBy: { messageIdx: 'asc' },
        },
        jobs: {
          select: {
            id: true,
            type: true,
            stage: true,
            status: true,
            progress: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
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

    const rawStats = (capture.stats as any) || {};
    const stats = {
      tokens: rawStats.tokenEstimate ?? 0,
      messages: rawStats.messageCount ?? 0,
      codeBlocks: rawStats.codeBlockCount ?? 0,
      tables: rawStats.tableCount ?? 0,
      assets: capture.assets.length || (rawStats.assetCount ?? 0),
      tokenEstimate: rawStats.tokenEstimate ?? 0,
      messageCount: rawStats.messageCount ?? 0,
      codeBlockCount: rawStats.codeBlockCount ?? 0,
      tableCount: rawStats.tableCount ?? 0,
    };

    const versions = capture.chat.captures.map((c) => ({
      captureId: c.id,
      version: c.version,
      createdAt: c.createdAt.toISOString(),
    }));

    return res.status(200).json({
      id: capture.id,
      captureId: capture.id,
      chatId: capture.chatId,
      title: capture.chat.title,
      platform: capture.chat.platform.toLowerCase(),
      sourceUrl: capture.chat.sourceUrl,
      version: capture.version,
      status: capture.status,
      capturedAt: capture.createdAt.toISOString(),
      hasSummary: capture.outputs.some((o) => o.kind === 'SUMMARY'),
      stats,
      versions,
      outputs: capture.outputs.map((o) => ({
        id: o.id,
        kind: o.kind,
        createdAt: o.createdAt.toISOString(),
      })),
      assets: capture.assets.map((a) => {
        const name = a.localPath ? a.localPath.split(/[/\\]/).pop() || 'asset.bin' : 'asset.bin';
        return {
          id: a.id,
          name,
          mime: a.mime,
          url: `/api/assets/${a.id}`,
          localPath: a.localPath,
        };
      }),
      activeJob: capture.jobs[0]
        ? {
            id: capture.jobs[0].id,
            type: capture.jobs[0].type,
            stage: capture.jobs[0].stage,
            status: capture.jobs[0].status,
            progress: Math.round((capture.jobs[0].progress ?? 0) * 100),
          }
        : null,
    });
  } catch (error) {
    console.error(`❌ Failed to retrieve capture "${req.params.id}":`, error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve capture overview.',
      },
    });
  }
}
