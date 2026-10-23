import { EventEmitter } from 'events';

export interface JobStageEvent {
  jobId: string;
  stage: string;
  progress: number;
  status: string;
  captureId?: string;
}

export interface JobDoneEvent {
  jobId: string;
  stage: string;
  progress: number;
  status: 'COMPLETED';
  outputId?: string;
  captureId?: string;
}

export interface JobErrorEvent {
  jobId: string;
  stage: string;
  status: 'FAILED';
  error: string;
  captureId?: string;
}

class JobEventEmitter extends EventEmitter {
  constructor() {
    super();
    // Allow high number of concurrent SSE connections without warning
    this.setMaxListeners(200);
  }

  emitStage(data: JobStageEvent) {
    this.emit(`job:${data.jobId}:stage`, data);
    this.emit('job:stage', data);
  }

  emitDone(data: JobDoneEvent) {
    this.emit(`job:${data.jobId}:done`, data);
    this.emit('job:done', data);
  }

  emitError(data: JobErrorEvent) {
    this.emit(`job:${data.jobId}:error`, data);
    this.emit('job:error', data);
  }
}

export const jobEvents = new JobEventEmitter();
