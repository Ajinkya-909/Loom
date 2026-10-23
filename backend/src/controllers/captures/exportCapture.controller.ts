import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../db/prisma';
import { sanitizeFilename } from '../../utils/file';
import { createZipArchive } from '../../utils/archive';

/**
 * GET /api/captures/:id/export — 1-Click Multi-Format Artifact Exporter Controller
 *
 * URL parameters:
 *   - id (UUID): Capture ID
 * Query parameters:
 *   - format (enum, default: 'zip'): 'context' | 'summary' | 'zip'
 */
export async function exportCaptureController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const formatQuery = typeof req.query.format === 'string' ? req.query.format.toLowerCase() : 'zip';

    // 1. Fetch capture with chat, outputs, and assets
    const capture = await prisma.capture.findUnique({
      where: { id },
      include: {
        chat: true,
        outputs: true,
        assets: true,
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

    const safeTitle = sanitizeFilename(capture.chat.title);
    const version = capture.version;
    const captureRoot = path.resolve(
      process.cwd(),
      'storage/captures',
      capture.chatId,
      `v${version}`
    );

    // ------------------------------------------------------------------------
    // Format Option 1: Only context markdown (?format=context)
    // ------------------------------------------------------------------------
    if (formatQuery === 'context') {
      const contextPath = path.join(captureRoot, 'context.md');
      let markdown = '';

      if (fs.existsSync(contextPath)) {
        markdown = fs.readFileSync(contextPath, 'utf-8');
      } else {
        const contextOutput = capture.outputs.find((o) => o.kind === 'CONTEXT');
        if (contextOutput) {
          markdown = contextOutput.markdown;
        }
      }

      if (!markdown) {
        return res.status(404).json({
          error: {
            code: 'CONTEXT_NOT_FOUND',
            message: 'Context markdown is not available for this capture.',
          },
        });
      }

      const filename = `${safeTitle}-v${version}-context.md`;
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(markdown);
    }

    // ------------------------------------------------------------------------
    // Format Option 2: Only summary markdown (?format=summary)
    // ------------------------------------------------------------------------
    if (formatQuery === 'summary') {
      const summaryPath = path.join(captureRoot, 'summary.md');
      let markdown = '';

      if (fs.existsSync(summaryPath)) {
        markdown = fs.readFileSync(summaryPath, 'utf-8');
      } else {
        const summaryOutput = capture.outputs.find((o) => o.kind === 'SUMMARY');
        if (summaryOutput) {
          markdown = summaryOutput.markdown;
        }
      }

      if (!markdown) {
        return res.status(404).json({
          error: {
            code: 'SUMMARY_NOT_FOUND',
            message: 'Summary deliverable has not been generated for this capture yet. Generate it first via POST /api/captures/:id/generate.',
          },
        });
      }

      const filename = `${safeTitle}-v${version}-summary.md`;
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(markdown);
    }

    // ------------------------------------------------------------------------
    // Format Option 3: Full ZIP bundle (?format=zip, default)
    // ------------------------------------------------------------------------
    const zipFilename = `loom-export-${safeTitle}-v${version}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = createZipArchive({
      zlib: { level: 9 }, // Maximum compression
    });

    archive.on('error', (err: any) => {
      console.error('Archive generation error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          error: {
            code: 'ARCHIVE_ERROR',
            message: 'Failed to create zip archive.',
          },
        });
      }
    });

    archive.pipe(res);

    const folderPrefix = `loom-export-${safeTitle}-v${version}`;

    // 1. Add context.md
    const contextPath = path.join(captureRoot, 'context.md');
    if (fs.existsSync(contextPath)) {
      archive.file(contextPath, { name: `${folderPrefix}/context.md` });
    } else {
      const contextOutput = capture.outputs.find((o) => o.kind === 'CONTEXT');
      if (contextOutput) {
        archive.append(contextOutput.markdown, { name: `${folderPrefix}/context.md` });
      }
    }

    // 2. Add summary.md if available
    const summaryPath = path.join(captureRoot, 'summary.md');
    if (fs.existsSync(summaryPath)) {
      archive.file(summaryPath, { name: `${folderPrefix}/summary.md` });
    } else {
      const summaryOutput = capture.outputs.find((o) => o.kind === 'SUMMARY');
      if (summaryOutput) {
        archive.append(summaryOutput.markdown, { name: `${folderPrefix}/summary.md` });
      }
    }

    // 3. Add metadata.json
    const metadata = {
      chatId: capture.chatId,
      captureId: capture.id,
      title: capture.chat.title,
      platform: capture.chat.platform,
      sourceUrl: capture.chat.sourceUrl,
      version: capture.version,
      capturedAt: capture.createdAt,
      stats: capture.stats,
      assets: capture.assets.map((a) => ({
        id: a.id,
        mime: a.mime,
        localPath: a.localPath,
        sha256: a.sha256,
      })),
      exportedAt: new Date().toISOString(),
    };
    archive.append(JSON.stringify(metadata, null, 2), {
      name: `${folderPrefix}/metadata.json`,
    });

    // 4. Add rescued media assets/
    const assetsDir = path.join(captureRoot, 'assets');
    if (fs.existsSync(assetsDir)) {
      archive.directory(assetsDir, `${folderPrefix}/assets`);
    }

    // 5. Add raw snapshot & messages in raw/
    const rawDir = path.join(captureRoot, 'raw');
    if (fs.existsSync(rawDir)) {
      archive.directory(rawDir, `${folderPrefix}/raw`);
    }

    await archive.finalize();
  } catch (error) {
    console.error(`❌ Failed to export capture "${req.params.id}":`, error);
    if (!res.headersSent) {
      return res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to export capture.',
        },
      });
    }
  }
}
