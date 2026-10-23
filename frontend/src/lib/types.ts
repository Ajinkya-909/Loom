export type Platform =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "deepseek"
  | "perplexity"
  | "grok"
  | "generic"
  | string;

export type CaptureStatus = "READY" | "RUNNING" | "FAILED";

export type OutputKind = "SUMMARY" | "CONTEXT";

export interface Block {
  type: "text" | "code" | "table" | "image";
  content: string;
  lang?: string;
}

export interface Message {
  id: string;
  idx: number;
  role: "user" | "assistant";
  textPlain: string;
  blocks: Block[];
  tokenEstimate: number;
}

export interface CaptureVersion {
  captureId: string;
  version: number;
  createdAt: string;
}

export interface CaptureStats {
  tokens: number;
  messages: number;
  codeBlocks: number;
  tables: number;
  assets: number;
}

export interface Asset {
  id: string;
  name: string;
  mime: string;
  size?: number;
  url: string;
}

export interface CaptureListItem {
  chatId: string;
  captureId: string;
  title: string;
  platform: Platform;
  version: number;
  status: CaptureStatus;
  messageCount: number;
  tokenEstimate: number;
  hasSummary: boolean;
  updatedAt: string;
}

export interface CaptureDetail {
  captureId: string;
  chatId: string;
  title: string;
  platform: Platform;
  version: number;
  status: CaptureStatus;
  sourceUrl: string;
  capturedAt: string;
  stats: CaptureStats;
  versions: CaptureVersion[];
  hasSummary: boolean;
  assets: Asset[];
  activeJob?: {
    id: string;
    type: string;
    stage: string;
    status: string;
    progress: number;
  } | null;
}

export interface Output {
  id: string;
  captureId: string;
  kind: OutputKind;
  markdown: string;
  generatedBy: string;
  createdAt: string;
}

export interface ServerConfig {
  version: string;
  authorized: boolean;
  llm: {
    provider: string;
    model: string;
    available: boolean;
  };
}

export interface JobState {
  status: "RUNNING" | "COMPLETED" | "FAILED";
  stage: string;
  progress: number;
  outputId?: string;
  error?: string;
}
