import { Request, Response } from 'express';
import type { Platform } from '@prisma/client';
import { prisma } from '../../db/prisma';

/**
 * GET /api/captures — Capture Library & Full-Text Search Controller
 *
 * Query parameters:
 *   - q (string, optional): Title or message content search
 *   - platform (enum, optional): Filter by AI platform (e.g. CHATGPT, CLAUDE, etc.)
 *   - limit (integer, default: 20, max: 100): Pagination limit
 *   - cursor (string, optional): Chat ID for keyset pagination
 */
export async function listCapturesController(req: Request, res: Response) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const platformQuery = typeof req.query.platform === 'string' ? req.query.platform.toUpperCase() : undefined;
    const limitQuery = parseInt(req.query.limit as string, 10);
    const limit = !isNaN(limitQuery) && limitQuery > 0 ? Math.min(limitQuery, 100) : 20;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor.trim() : undefined;

    // Validate platform enum if provided
    const validPlatforms = ['CHATGPT', 'CLAUDE', 'GEMINI', 'DEEPSEEK', 'PERPLEXITY', 'GROK', 'GENERIC'];
    const platform = platformQuery && validPlatforms.includes(platformQuery)
      ? (platformQuery as Platform)
      : undefined;

    // Build Prisma where conditions
    const whereConditions: any[] = [];

    if (platform) {
      whereConditions.push({ platform });
    }

    if (q) {
      whereConditions.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          {
            captures: {
              some: {
                messages: {
                  some: {
                    textPlain: { contains: q, mode: 'insensitive' },
                  },
                },
              },
            },
          },
        ],
      });
    }

    // Handle cursor pagination
    if (cursor) {
      const cursorChat = await prisma.chat.findUnique({
        where: { id: cursor },
        select: { id: true, updatedAt: true },
      });

      if (cursorChat) {
        whereConditions.push({
          OR: [
            { updatedAt: { lt: cursorChat.updatedAt } },
            {
              updatedAt: cursorChat.updatedAt,
              id: { lt: cursorChat.id },
            },
          ],
        });
      }
    }

    const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

    // Fetch limit + 1 items to determine if a next cursor exists
    const chats = await prisma.chat.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        captures: {
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            outputs: {
              where: { kind: 'SUMMARY' },
              select: { id: true },
            },
          },
        },
      },
    });

    const hasMore = chats.length > limit;
    const pageChats = hasMore ? chats.slice(0, limit) : chats;
    const nextCursor = hasMore ? pageChats[pageChats.length - 1].id : null;

    const items = pageChats
      .filter((chat) => chat.captures.length > 0)
      .map((chat) => {
        const latestCapture = chat.captures[0];
        const stats = (latestCapture.stats as any) || {};

        return {
          chatId: chat.id,
          captureId: latestCapture.id,
          title: chat.title,
          platform: chat.platform.toLowerCase(),
          version: latestCapture.version,
          status: latestCapture.status,
          messageCount: stats.messageCount ?? 0,
          tokenEstimate: stats.tokenEstimate ?? 0,
          hasSummary: latestCapture.outputs.length > 0,
          updatedAt: chat.updatedAt.toISOString(),
        };
      });

    return res.status(200).json({
      items,
      nextCursor,
    });
  } catch (error) {
    console.error('❌ Failed to list captures:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve capture library.',
      },
    });
  }
}
