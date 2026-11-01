import type { Recipient, RsvpAnswer } from './audience';

export const RSVP_LINK_TOKEN = '{rsvpLink}';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** First whitespace-delimited word of a display name (for {firstName}). */
export function firstNameOf(displayName: string): string {
  return String(displayName ?? '').trim().split(/\s+/)[0] ?? '';
}

/**
 * Fill `{firstName}`, `{name}` and (when a link is given) `{rsvpLink}`.
 * Any other `{...}` is left untouched so a stray brace never mangles the text.
 */
export function personalizeTemplate(t: string, r: Pick<Recipient, 'displayName'>, rsvpLink?: string): string {
  const values: Record<string, string | undefined> = {
    name: r.displayName,
    firstName: firstNameOf(r.displayName),
    rsvpLink,
  };
  return String(t ?? '').replace(/\{(name|firstName|rsvpLink)\}/g, (match, key: string) => values[key] ?? match);
}

const BUTTONS: Array<{ answer: RsvpAnswer; label: string; color: string }> = [
  { answer: 'yes', label: "Yes, I'll be there", color: '#2f7233' },
  { answer: 'maybe', label: 'Maybe', color: '#b45309' },
  { answer: 'no', label: "Can't make it", color: '#4b5563' },
];

function renderHtml(text: string, rsvpUrl?: string): string {
  const paragraphs = text
    .split(/\r?\n[ \t]*\r?\n/)
    .filter((p) => p.trim() !== '')
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
  const buttons = rsvpUrl
    ? `<p style="margin:20px 0 8px">${BUTTONS.map(
        (b) =>
          `<a href="${escapeHtml(`${rsvpUrl}?answer=${b.answer}`)}" style="display:inline-block;margin:0 8px 8px 0;` +
          `padding:10px 18px;border-radius:8px;background:${b.color};color:#ffffff;text-decoration:none;` +
          `font-weight:bold">${escapeHtml(b.label)}</a>`,
      ).join('')}</p>`
    : '';
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">' +
    `${paragraphs}${buttons}</div>`
  );
}

/**
 * Build one recipient's email. With `rsvpUrl`, a body that lacks `{rsvpLink}`
 * gets "Please RSVP here: <link>" appended, and the HTML part gets Yes / Maybe /
 * Can't-make-it buttons. Everything user-supplied is HTML-escaped.
 */
export function composeEmail({
  subject,
  body,
  recipient,
  rsvpUrl,
}: {
  subject: string;
  body: string;
  recipient: Recipient;
  rsvpUrl?: string;
}): { subject: string; text: string; html: string } {
  const template = rsvpUrl && !body.includes(RSVP_LINK_TOKEN) ? `${body}\n\nPlease RSVP here: ${RSVP_LINK_TOKEN}` : body;
  const text = personalizeTemplate(template, recipient, rsvpUrl);
  return {
    subject: personalizeTemplate(subject, recipient, rsvpUrl).replace(/[\r\n]+/g, ' '),
    text,
    html: renderHtml(text, rsvpUrl),
  };
}
