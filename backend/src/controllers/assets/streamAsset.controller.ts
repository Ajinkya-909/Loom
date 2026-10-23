import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../db/prisma';

/**
 * GET /api/assets/:id — Stream Rescued Media Asset Controller
 *
 * URL parameters:
 *   - id (UUID): Asset ID
 */
export async function streamAssetController(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        capture: {
          select: {
            chatId: true,
            version: true,
          },
        },
      },
    });

    if (!asset) {
      return res.status(404).json({
        error: {
          code: 'ASSET_NOT_FOUND',
          message: `Asset with ID "${id}" was not found.`,
        },
      });
    }

    // Resolve absolute path to file on disk
    let absolutePath = asset.localPath;
    if (!path.isAbsolute(absolutePath)) {
      absolutePath = path.resolve(
        process.cwd(),
        'storage/captures',
        asset.capture.chatId,
        `v${asset.capture.version}`,
        asset.localPath
      );
    }

    if (!fs.existsSync(absolutePath)) {
      console.warn(`Asset file missing on disk at: ${absolutePath}`);
      return res.status(404).json({
        error: {
          code: 'ASSET_FILE_MISSING',
          message: 'Asset binary file was not found on server storage.',
        },
      });
    }

    // Set streaming headers
    const filename = path.basename(absolutePath);
    res.setHeader('Content-Type', asset.mime || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    const readStream = fs.createReadStream(absolutePath);
    readStream.on('error', (streamErr) => {
      console.error('Error streaming asset:', streamErr);
      if (!res.headersSent) {
        res.status(500).json({
          error: {
            code: 'STREAM_ERROR',
            message: 'Failed while streaming asset binary.',
          },
        });
      }
    });

    readStream.pipe(res);
  } catch (error) {
    console.error(`❌ Failed to stream asset "${req.params.id}":`, error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve asset.',
      },
    });
  }
}
