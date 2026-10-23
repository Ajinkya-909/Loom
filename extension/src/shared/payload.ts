// Builds the multipart body for POST /api/captures. Pure (FormData/Blob only) so it is testable.
import type { CaptureMeta } from './types';

export interface AssetBlob { blob: Blob; filename: string; mime: string }

export function buildCaptureForm(args: {
  meta: CaptureMeta;
  messagesJson: string;
  snapshotHtml: string;
  assets: Map<string, AssetBlob>;
}): FormData {
  const form = new FormData();
  form.append('meta', new Blob([JSON.stringify(args.meta)], { type: 'application/json' }), 'meta.json');
  form.append('messages', new Blob([args.messagesJson], { type: 'application/json' }), 'messages.json');
  form.append('snapshot', new Blob([args.snapshotHtml], { type: 'text/html' }), 'snapshot.html');
  for (const [ref, a] of args.assets) {
    form.append(`asset:${ref}`, new Blob([a.blob], { type: a.mime }), a.filename);
  }
  return form;
}
