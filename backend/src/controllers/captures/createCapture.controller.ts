import { Request, Response } from 'express';
import crypto from 'crypto';
import type { Platform } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { metaSchema, messagesSchema } from '../../schemas/capture.schema';
import * as fileStore from '../../storage/fileStore';
import * as normalizer from '../../pipeline/normalizer';
import type { Block } from '../../pipeline/normalizer';
import { scrapeChatHtml } from '../../pipeline/htmlScraper';
import path from 'path';
import fs from 'fs';
import { extractMessageIdxFromFilename } from '../../utils/file';
import { distillTranscriptToSummary } from '../../pipeline/summarizer';
import { jobEvents } from '../../pipeline/jobEvents';

/**
 * POST /api/captures — Core Ingestion & Normalization Controller
 *
 * Handles:
 * 1. Multer multipart file extraction (snapshot HTML, assets, meta, messages)
 * 2. Auto-scraping HTML if messages JSON omitted
 * 3. Platform, title, and sourceUrl resolution
 * 4. SHA-256 content hash computation & deduplication check
 * 5. Chat & Capture persistence
 * 6. Asset saving & linkage
 * 7. Normalization into typed blocks
 * 8. Canonical context.md compilation & Output generation
 * 9. Status finalization (READY / COMPLETED)
 */
export async function createCaptureController(req: Request, res: Response) {
  try {
    // ==================================================================
    // Step 1: Extract uploaded files (support both upload.any() array and fields object)
    // ==================================================================
    const rawFilesList: Express.Multer.File[] = Array.isArray(req.files)
      ? req.files
      : req.files
      ? Object.values(req.files).flat()
      : [];

    const snapshotFile = rawFilesList.find((f) => f.fieldname === 'snapshot');
    const metaFile = rawFilesList.find((f) => f.fieldname === 'meta');
    const messagesFile = rawFilesList.find((f) => f.fieldname === 'messages');
    const assetFiles = rawFilesList.filter(
      (f) => f.fieldname === 'assets' || f.fieldname.startsWith('asset')
    );

    // ==================================================================
    // Step 2: Parse and validate optional "meta" field (from body or meta.json file)
    // ==================================================================
    let metaParsed: any = {};
    const rawMetaSource = req.body?.meta || (metaFile ? metaFile.buffer.toString('utf-8') : undefined);
    if (rawMetaSource) {
      try {
        metaParsed =
          typeof rawMetaSource === 'string'
            ? JSON.parse(rawMetaSource)
            : rawMetaSource;
      } catch {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid JSON in "meta" field.',
          },
        });
      }
    }

    // Normalize meta properties for extension compatibility
    if (metaParsed && typeof metaParsed === 'object') {
      if (typeof metaParsed.platform === 'string') {
        metaParsed.platform = metaParsed.platform.toUpperCase();
      }
      if (metaParsed.action === 'summarize') {
        metaParsed.mode = 'SUMMARIZE';
      } else if (metaParsed.action === 'context') {
        metaParsed.mode = 'CONTEXT_ONLY';
      } else if (!metaParsed.mode) {
        metaParsed.mode = 'CONTEXT_ONLY';
      }
      if (metaParsed.expected && typeof metaParsed.expected === 'object') {
        metaParsed.stats = {
          expectedMessages: metaParsed.expected.messageCount,
          expectedCodeBlocks: metaParsed.expected.codeBlockCount,
          expectedImages: metaParsed.expected.imageCount,
          ...(metaParsed.stats || {}),
        };
      }
    }

    const metaResult = metaSchema.safeParse(metaParsed);
    if (!metaResult.success) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid meta data.',
          details: metaResult.error.flatten(),
        },
      });
    }
    const meta = metaResult.data;

    // ==================================================================
    // Step 3: Extract or scrape messages (from body, messages.json file, or snapshot)
    // ==================================================================
    let messages: Array<{
      idx: number;
      role: 'USER' | 'ASSISTANT' | 'SYSTEM';
      text: string;
      html?: string;
    }> = [];

    let scrapedData: ReturnType<typeof scrapeChatHtml> | null = null;
    if (snapshotFile) {
      const rawHtml = snapshotFile.buffer.toString('utf-8');
      try {
        scrapedData = scrapeChatHtml(rawHtml);
      } catch (err) {
        console.warn('⚠️ HTML scraper encountered a warning:', err);
      }
    }

    const rawMessagesSource = req.body?.messages || (messagesFile ? messagesFile.buffer.toString('utf-8') : undefined);
    if (rawMessagesSource) {
      let rawMessages: any;
      try {
        rawMessages =
          typeof rawMessagesSource === 'string'
            ? JSON.parse(rawMessagesSource)
            : rawMessagesSource;
      } catch {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid JSON in "messages" field.',
          },
        });
      }

      // Normalize message roles (e.g. 'user' -> 'USER', 'tool' -> 'SYSTEM')
      if (Array.isArray(rawMessages)) {
        rawMessages = rawMessages.map((m: any) => {
          if (m && typeof m.role === 'string') {
            const roleUpper = m.role.toUpperCase();
            return {
              ...m,
              role: roleUpper === 'TOOL' ? 'SYSTEM' : roleUpper,
            };
          }
          return m;
        });
      }

      const messagesResult = messagesSchema.safeParse(rawMessages);
      if (
        !messagesResult.success ||
        !messagesResult.data ||
        messagesResult.data.length === 0
      ) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid messages data.',
            details: messagesResult.error?.flatten(),
          },
        });
      }
      messages = messagesResult.data;
    } else if (scrapedData && scrapedData.messages.length > 0) {
      // Auto-scraped from snapshot HTML
      messages = scrapedData.messages.map((m) => ({
        idx: m.idx,
        role: m.role,
        text: m.textPlain,
      }));
      console.log(`🤖 Auto-scraped ${messages.length} messages from snapshot HTML`);
    } else {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message:
            'No conversation content found. Please provide either a "snapshot" HTML file or a "messages" JSON array.',
        },
      });
    }

    // ==================================================================
    // Step 4: Resolve session title, platform, and sourceUrl
    // ==================================================================
    const resolvedTitle =
      meta.title || scrapedData?.title || 'Untitled Chat';
    const resolvedPlatform = (
      meta.platform ||
      scrapedData?.platform ||
      'GENERIC'
    ) as Platform;
    const resolvedSourceUrl =
      meta.sourceUrl ||
      scrapedData?.sourceUrl ||
      'https://chat.loom.local';

    // ==================================================================
    // Step 5: Compute content hash for deduplication
    // ==================================================================
    const contentHash = fileStore.computeContentHash(messages);

    // ==================================================================
    // Step 6: Resolve or create Chat entity
    // ==================================================================
    let chat = await prisma.chat.findFirst({
      where: {
        sourceUrl: resolvedSourceUrl,
        platform: resolvedPlatform,
      },
    });

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          platform: resolvedPlatform,
          sourceUrl: resolvedSourceUrl,
          title: resolvedTitle,
        },
      });
      console.log(`📝 Created new Chat: "${resolvedTitle}" [${chat.id}]`);
    } else {
      if (chat.title !== resolvedTitle && meta.title) {
        chat = await prisma.chat.update({
          where: { id: chat.id },
          data: { title: resolvedTitle },
        });
      }
      console.log(`🔗 Resolved existing Chat: "${chat.title}" [${chat.id}]`);
    }

    // ==================================================================
    // Step 7: Deduplication check
    // ==================================================================
    const force = req.query.force === '1' || req.query.force === 'true';
    const latestCapture = await prisma.capture.findFirst({
      where: { chatId: chat.id },
      orderBy: { version: 'desc' },
    });

    if (!force && latestCapture && latestCapture.contentHash === contentHash) {
      console.log(
        `♻️  Duplicate detected for Chat [${chat.id}] — returning existing capture v${latestCapture.version}`
      );
      return res.status(200).json({
        chatId: chat.id,
        captureId: latestCapture.id,
        version: latestCapture.version,
        status: latestCapture.status,
        viewerUrl: `/c/${latestCapture.id}`,
        duplicate: true,
      });
    }

    // ==================================================================
    // Step 8: Determine version number
    // ==================================================================
    const version = latestCapture ? latestCapture.version + 1 : 1;
    console.log(`📸 Creating capture v${version} for Chat [${chat.id}]`);

    // ==================================================================
    // Step 9: Prepare disk directories
    // ==================================================================
    const dirs = await fileStore.prepareCaptureDirectories(chat.id, version);

    // ==================================================================
    // Step 10: Save raw files to disk
    // ==================================================================
    if (snapshotFile) {
      await fileStore.saveSnapshotFile(dirs.rawDir, snapshotFile.buffer);
      console.log(`💾 Saved snapshot.html (${snapshotFile.size} bytes)`);
    }

    await fileStore.saveMessagesFile(dirs.rawDir, messages);
    console.log(`💾 Saved messages.json (${messages.length} messages)`);

    // ==================================================================
    // Step 11: Create Capture and Job records in DB
    // ==================================================================
    const rawPath = `captures/${chat.id}/v${version}`;

    const capture = await prisma.capture.create({
      data: {
        chatId: chat.id,
        version,
        contentHash,
        status: 'PROCESSING',
        rawPath,
        stats: meta.stats || {},
      },
    });

    const job = await prisma.job.create({
      data: {
        captureId: capture.id,
        type: 'INGEST_AND_NORMALIZE',
        stage: 'normalizing',
        status: 'RUNNING',
        progress: 0.1,
      },
    });

    // ==================================================================
    // Step 12: Save assets and create Asset records
    // ==================================================================
    const assetRecords: Array<{
      id: string;
      messageIdx: number;
      localPath: string;
      mime: string;
    }> = [];

    const clientAssets: any[] = Array.isArray(metaParsed?.assets) ? metaParsed.assets : [];

    for (const assetFile of assetFiles) {
      const assetId = crypto.randomUUID();
      const refFromField = assetFile.fieldname.startsWith('asset:')
        ? assetFile.fieldname.slice(6)
        : assetFile.fieldname;
      const matchedClientAsset = clientAssets.find(
        (a: any) => a.ref === refFromField || a.filename === assetFile.originalname
      );
      const messageIdx =
        matchedClientAsset && typeof matchedClientAsset.messageIdx === 'number'
          ? matchedClientAsset.messageIdx
          : extractMessageIdxFromFilename(assetFile.originalname);

      const resolvedFilename = matchedClientAsset?.filename || assetFile.originalname;
      let resolvedMime = assetFile.mimetype;
      if ((!resolvedMime || resolvedMime === 'application/octet-stream') && matchedClientAsset?.mime) {
        resolvedMime = matchedClientAsset.mime;
      }
      if (/\.pdf$/i.test(resolvedFilename) || /\.pdf$/i.test(assetFile.originalname)) {
        resolvedMime = 'application/pdf';
      }

      const { localPath, sha256 } = await fileStore.saveAssetFile(
        dirs.assetsDir,
        assetId,
        assetFile.buffer,
        resolvedMime,
        resolvedFilename
      );

      const asset = await prisma.asset.create({
        data: {
          id: assetId,
          captureId: capture.id,
          messageIdx,
          mime: resolvedMime,
          originalUrl: null,
          localPath,
          sha256,
        },
      });

      assetRecords.push({
        id: asset.id,
        messageIdx: asset.messageIdx,
        localPath: asset.localPath,
        mime: asset.mime,
      });

      console.log(
        `🖼️  Saved asset: ${assetFile.originalname} → ${localPath} (${assetFile.size} bytes)`
      );
    }

    // ==================================================================
    // Step 13: Normalization Pipeline — Parse messages into typed blocks
    // ==================================================================
    const messageRecords: Array<{
      idx: number;
      role: string;
      textPlain: string;
      blocks: Block[];
      tokenEstimate: number;
    }> = [];

    for (const msg of messages) {
      const blocks = normalizer.parseTextIntoBlocks(msg.text);
      const tokenEstimate = normalizer.estimateTokens(msg.text);

      await prisma.message.create({
        data: {
          captureId: capture.id,
          idx: msg.idx,
          role: msg.role,
          textPlain: msg.text,
          blocks: blocks as any,
          tokenEstimate,
        },
      });

      messageRecords.push({
        idx: msg.idx,
        role: msg.role,
        textPlain: msg.text,
        blocks,
        tokenEstimate,
      });
    }

    console.log(`🔍 Parsed ${messageRecords.length} messages into structured blocks`);

    // ==================================================================
    // Step 14: Compile canonical context.md
    // ==================================================================
    const contextMarkdown = normalizer.buildContextMarkdown(
      resolvedTitle,
      resolvedPlatform,
      resolvedSourceUrl,
      capture.createdAt.toISOString(),
      messageRecords.map((m) => ({
        idx: m.idx,
        role: m.role,
        text: m.textPlain,
        blocks: m.blocks,
      })),
      assetRecords
    );

    const contextFilePath = await fileStore.saveContextMarkdown(
      dirs.root,
      contextMarkdown
    );
    console.log(`📄 Compiled context.md (${contextMarkdown.length} chars) → ${contextFilePath}`);

    // ==================================================================
    // Step 15: Create Output record for context.md
    // ==================================================================
    await prisma.output.create({
      data: {
        captureId: capture.id,
        kind: 'CONTEXT',
        markdown: contextMarkdown,
        filePath: `${rawPath}/context.md`,
        generatedBy: { pipeline: 'normalizer', version: '1.0' },
      },
    });

    // ==================================================================
    // Step 16: Calculate final stats
    // ==================================================================
    const totalTokens = messageRecords.reduce(
      (sum, m) => sum + m.tokenEstimate,
      0
    );
    const codeBlockCount = messageRecords.reduce((sum, m) => {
      return sum + m.blocks.filter((b) => b.type === 'code').length;
    }, 0);
    const tableCount = messageRecords.reduce((sum, m) => {
      return sum + m.blocks.filter((b) => b.type === 'table').length;
    }, 0);
    const diagramCount = messageRecords.reduce((sum, m) => {
      return sum + m.blocks.filter((b) => b.type === 'diagram').length;
    }, 0);

    // ==================================================================
    // Step 17: Mark Capture as READY and Job as COMPLETED
    // ==================================================================
    await prisma.capture.update({
      where: { id: capture.id },
      data: {
        status: 'READY',
        stats: {
          messageCount: messages.length,
          codeBlockCount,
          tableCount,
          diagramCount,
          tokenEstimate: totalTokens,
          assetCount: assetRecords.length,
        },
      },
    });

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        stage: 'completed',
        progress: 1.0,
      },
    });

    console.log(
      `✅ Capture v${version} complete — ${messages.length} msgs, ${codeBlockCount} code blocks, ${tableCount} tables, ${assetRecords.length} assets, ~${totalTokens} tokens`
    );

    // ==================================================================
    // Step 18: If mode === 'SUMMARIZE', spawn background distillation job
    // ==================================================================
    let summarizeJobId: string | null = null;
    if (meta.mode === 'SUMMARIZE') {
      const sumJob = await prisma.job.create({
        data: {
          captureId: capture.id,
          type: 'SUMMARIZE',
          stage: 'queued',
          status: 'RUNNING',
          progress: 0.1,
        },
      });
      summarizeJobId = sumJob.id;

      // Spawn async distillation decoupled from the request
      (async () => {
        try {
          const { markdown, generatedBy } = await distillTranscriptToSummary(
            resolvedTitle,
            resolvedPlatform,
            contextMarkdown,
            async (stageName, progressVal) => {
              try {
                await prisma.job.update({
                  where: { id: sumJob.id },
                  data: { stage: stageName, progress: progressVal },
                });
                jobEvents.emitStage({
                  jobId: sumJob.id,
                  stage: stageName,
                  progress: progressVal,
                  status: 'RUNNING',
                  captureId: capture.id,
                });
              } catch (progressErr) {
                console.warn(`Failed to update progress for summarize job ${sumJob.id}:`, progressErr);
              }
            }
          );

          // Save summary.md to disk
          const summaryDiskPath = path.resolve(dirs.root, 'summary.md');
          await fs.promises.writeFile(summaryDiskPath, markdown, 'utf-8');

          const relativeSummaryPath = `${rawPath}/summary.md`;
          const summaryOutput = await prisma.output.create({
            data: {
              captureId: capture.id,
              kind: 'SUMMARY',
              markdown,
              filePath: relativeSummaryPath,
              generatedBy,
            },
          });

          await prisma.job.update({
            where: { id: sumJob.id },
            data: { stage: 'completed', status: 'COMPLETED', progress: 1.0 },
          });

          jobEvents.emitDone({
            jobId: sumJob.id,
            stage: 'completed',
            progress: 1.0,
            status: 'COMPLETED',
            outputId: summaryOutput.id,
            captureId: capture.id,
          });
        } catch (sumErr: any) {
          console.error(`❌ Background auto-summarize failed for Job [${sumJob.id}]:`, sumErr);
          await prisma.job.update({
            where: { id: sumJob.id },
            data: { stage: 'failed', status: 'FAILED', error: sumErr?.message || 'Auto-summary failed.' },
          });
          jobEvents.emitError({
            jobId: sumJob.id,
            stage: 'failed',
            status: 'FAILED',
            error: sumErr?.message || 'Auto-summary failed.',
            captureId: capture.id,
          });
        }
      })();
    }

    // ==================================================================
    // Step 19: Return 202 Accepted
    // ==================================================================
    return res.status(202).json({
      chatId: chat.id,
      captureId: capture.id,
      version,
      jobId: summarizeJobId || job.id,
      status: 'READY',
      viewerUrl: `/c/${capture.id}`,
      duplicate: false,
    });
  } catch (error) {
    console.error('❌ Capture ingestion failed:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to process capture. Check server logs for details.',
      },
    });
  }
}
