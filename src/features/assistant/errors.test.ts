import { describe, it, expect } from 'vitest';
import { errorText } from './errors';

const callableError = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('errorText', () => {
  it("passes the server's own message through untouched", () => {
    const text = "AI assistant isn't set up yet. Brandon needs to add the Anthropic API key in Google Cloud Secret Manager (ANTHROPIC_API_KEY).";
    expect(errorText(callableError('functions/failed-precondition', text))).toBe(text);
    expect(errorText(callableError('functions/resource-exhausted', 'Daily assistant limit reached (60). It resets at midnight.'))).toBe(
      'Daily assistant limit reached (60). It resets at midnight.',
    );
  });

  it('replaces the Functions SDK\'s bare code words with something readable', () => {
    expect(errorText(callableError('functions/internal', 'internal'))).toMatch(/something went wrong/i);
    expect(errorText(callableError('functions/deadline-exceeded', 'deadline-exceeded'))).toMatch(/took too long/i);
    expect(errorText(callableError('functions/unavailable', 'unavailable'))).toMatch(/couldn't reach/i);
  });

  it('falls back for anything that is not a usable error', () => {
    expect(errorText('boom')).toBe('Something went wrong. Please try again.');
    expect(errorText(new Error('  '))).toBe('Something went wrong. Please try again.');
    expect(errorText(undefined, 'Could not approve.')).toBe('Could not approve.');
  });
});
