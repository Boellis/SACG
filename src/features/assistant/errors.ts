const DEFAULT_TEXT = 'Something went wrong. Please try again.';

// The Functions SDK reports failures it raises itself (no network, timeout) with
// the bare code word as the message. Anything the server sent has real words.
const BARE_CODE_TEXT: Record<string, string> = {
  internal: 'Something went wrong. Check your connection and try again.',
  unknown: DEFAULT_TEXT,
  unavailable: "Couldn't reach the assistant. Check your connection and try again.",
  'deadline-exceeded':
    'The assistant took too long to answer. Open the conversation to see whether it finished; otherwise try again.',
};

/**
 * Text to show for a failed callable. The server's own messages ("Daily
 * assistant limit reached…", "Approve the event first") are written for admins
 * and pass through verbatim; the SDK's bare code words become readable.
 */
export function errorText(err: unknown, fallback = DEFAULT_TEXT): string {
  const message = err instanceof Error ? err.message.trim() : '';
  if (!message) return fallback;
  return BARE_CODE_TEXT[message] ?? message;
}
