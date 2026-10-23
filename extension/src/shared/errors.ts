// Error codes + user-facing copy. Warnings reuse the same code space (severity: 'warning').

export type ErrorCode =
  | 'NETWORK' | 'UPLOAD_TIMEOUT' | 'UNAUTHORIZED' | 'VALIDATION_FAILED' | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED' | 'SERVER_ERROR' | 'NO_SERVER_URL' | 'PERMISSION_DENIED' | 'UNSUPPORTED_PAGE'
  | 'NO_MESSAGES_FOUND' | 'CONTENT_SCRIPT_UNAVAILABLE' | 'LOAD_TIMEOUT' | 'ASSET_FAILED'
  | 'ASSET_TOO_LARGE' | 'ASSET_CORRUPT' | 'SELECTOR_FALLBACK_USED' | 'CANCELLED' | 'UNKNOWN';

export interface ErrorInfo {
  message: string;
  retryable: boolean;
  severity: 'error' | 'warning';
}

export const ERROR_INFO: Record<ErrorCode, ErrorInfo> = {
  NETWORK: { message: "Couldn't reach the server. Check that it's running and the URL is right.", retryable: true, severity: 'error' },
  UPLOAD_TIMEOUT: { message: 'The upload took too long and was stopped.', retryable: true, severity: 'error' },
  UNAUTHORIZED: { message: 'The server rejected your API token. Update it in settings.', retryable: false, severity: 'error' },
  VALIDATION_FAILED: { message: 'The server rejected this capture as invalid.', retryable: false, severity: 'error' },
  PAYLOAD_TOO_LARGE: { message: 'The capture is too large for the server. Try again without images.', retryable: false, severity: 'error' },
  RATE_LIMITED: { message: 'Too many requests. Wait a moment and retry.', retryable: true, severity: 'error' },
  SERVER_ERROR: { message: 'The server hit an error. Retry in a moment.', retryable: true, severity: 'error' },
  NO_SERVER_URL: { message: 'Add your server URL in settings first.', retryable: false, severity: 'error' },
  PERMISSION_DENIED: { message: 'Chrome blocked access to that server. Allow it to continue.', retryable: false, severity: 'error' },
  UNSUPPORTED_PAGE: { message: 'This page is not a supported chat.', retryable: false, severity: 'error' },
  NO_MESSAGES_FOUND: { message: 'No messages were found on this page. Scroll the chat once and retry.', retryable: true, severity: 'error' },
  CONTENT_SCRIPT_UNAVAILABLE: { message: "Couldn't talk to the page. Reload the tab and retry.", retryable: true, severity: 'error' },
  LOAD_TIMEOUT: { message: 'Loading the full chat timed out; the loaded part was captured.', retryable: false, severity: 'warning' },
  ASSET_FAILED: { message: "An image or file couldn't be saved.", retryable: false, severity: 'warning' },
  ASSET_TOO_LARGE: { message: 'An image or file was over the size limit and was skipped.', retryable: false, severity: 'warning' },
  ASSET_CORRUPT: { message: 'An image or file arrived damaged and was skipped.', retryable: false, severity: 'warning' },
  SELECTOR_FALLBACK_USED: { message: 'The page layout changed; a fallback selector was used.', retryable: false, severity: 'warning' },
  CANCELLED: { message: 'The capture was cancelled.', retryable: false, severity: 'warning' },
  UNKNOWN: { message: 'Something unexpected happened.', retryable: true, severity: 'error' },
};

/** Error carrying a code; thrown inside the background pipeline and mapped to a FAILED state. */
export class CaptureError extends Error {
  constructor(public code: ErrorCode, message?: string, public details?: string, public step?: string) {
    super(message ?? ERROR_INFO[code].message);
    this.name = 'CaptureError';
  }
}

export function describeWarning(code: string): string {
  if (code === 'EMPTY_MESSAGE') return 'A message looked empty.';
  if (code === 'UNKNOWN_ROLE') return 'A message had an unknown author and was saved as assistant.';
  return (ERROR_INFO as Record<string, ErrorInfo>)[code]?.message ?? code;
}
