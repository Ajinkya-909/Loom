import { Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { jobEvents, JobStageEvent, JobDoneEvent, JobErrorEvent } from '../../pipeline/jobEvents';

/**
 * GET /api/jobs/:id/events — Server-Sent Events (SSE) Progress Stream Controller
 *
 * Streams real-time progress events for a background Job (normalizing, distilling, saving, done).
 */
export async function streamJobEventsController(req: Request, res: Response) {
  const { id } = req.params;

  // Set SSE streaming headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Find job in DB
  const job = await prisma.job.findUnique({
    where: { id },
  });

  if (!job) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: `Job "${id}" not found.` })}\n\n`);
    res.end();
    return;
  }

  // Helper to format SSE frame
  const sendEvent = (eventName: string, data: unknown) => {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // If already finished, return immediately
  if (job.status === 'COMPLETED') {
    sendEvent('done', {
      stage: job.stage,
      progress: 1.0,
      status: 'COMPLETED',
      captureId: job.captureId,
    });
    res.end();
    return;
  }

  if (job.status === 'FAILED') {
    sendEvent('error', {
      stage: job.stage,
      status: 'FAILED',
      error: job.error || 'Job failed.',
      captureId: job.captureId,
    });
    res.end();
    return;
  }

  // Send initial current state
  sendEvent('stage', {
    stage: job.stage,
    progress: job.progress,
    status: job.status,
    captureId: job.captureId,
  });

  // Event handlers for active job
  const onStage = (data: JobStageEvent) => {
    sendEvent('stage', data);
  };

  const onDone = (data: JobDoneEvent) => {
    sendEvent('done', data);
    cleanup();
    res.end();
  };

  const onError = (data: JobErrorEvent) => {
    sendEvent('error', data);
    cleanup();
    res.end();
  };

  const stageEventName = `job:${id}:stage`;
  const doneEventName = `job:${id}:done`;
  const errorEventName = `job:${id}:error`;

  jobEvents.on(stageEventName, onStage);
  jobEvents.on(doneEventName, onDone);
  jobEvents.on(errorEventName, onError);

  const cleanup = () => {
    jobEvents.off(stageEventName, onStage);
    jobEvents.off(doneEventName, onDone);
    jobEvents.off(errorEventName, onError);
  };

  // Cleanup on client disconnect
  req.on('close', () => {
    cleanup();
  });
}
