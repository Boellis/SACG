import type { Member } from '../lib/types';

/** First whitespace-delimited word of a display name (for {firstName}). */
export function firstNameOf(displayName: string): string {
  return (displayName ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * Replace personalization tokens in a subject/body template for one recipient.
 * Supported tokens: {name} (full display name), {firstName}, {email}.
 * Unknown tokens are left untouched so a stray brace never mangles the text.
 */
export function personalize(
  template: string,
  member: Pick<Member, 'displayName' | 'email'>,
): string {
  const values: Record<string, string> = {
    name: member.displayName ?? '',
    firstName: firstNameOf(member.displayName ?? ''),
    email: member.email ?? '',
  };
  return (template ?? '').replace(
    /\{(name|firstName|email)\}/g,
    (_match, key: string) => values[key] ?? '',
  );
}
