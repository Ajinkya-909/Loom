import type { ExpectedCounts, PlatformId, RawMessage, Warning } from '../../shared/types';

export type MessageEl = HTMLElement;

/** A downloadable thing found inside a message (image or file link). */
export interface AssetCandidate {
  url: string;
  kind: 'image' | 'file';
  el?: HTMLImageElement | HTMLCanvasElement; // kept for canvas fallback
  filename?: string;
}

/**
 * Everything platform-specific lives behind this interface. To add a platform:
 * create one file in adapters/ and register it in adapters/index.ts. Nothing else changes.
 */
export interface PlatformAdapter {
  id: PlatformId;
  matches(url: URL): boolean;
  getTitle(doc: Document): string;                 // falls back to first user message (60 chars), then "Untitled chat"
  getModelLabel?(doc: Document): string | undefined;
  findScrollContainer(doc: Document): HTMLElement; // the element that scrolls the conversation
  listMessageElements(doc: Document): MessageEl[]; // in DOM order
  toRawMessage(el: MessageEl, idx: number): RawMessage;
  countExpected(doc: Document): ExpectedCounts;    // independent counting (separate selectors)

  // --- additions beyond the minimal spec, needed by the generic pipeline ---
  /** Stable platform message id, if the DOM exposes one (used as the de-dup key while scrolling). */
  getDomId(el: MessageEl): string | undefined;
  /** Images and file links inside one message. */
  findAssets(el: MessageEl): AssetCandidate[];
  /** Warnings raised since the last call (selector fallback, unknown role). De-duplicated. */
  takeWarnings(): Warning[];
}
