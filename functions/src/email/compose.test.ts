import { describe, it, expect } from 'vitest';
import { escapeHtml, personalizeTemplate, composeEmail } from './compose';
import type { Recipient } from './audience';

const denny: Recipient = { memberId: 'm-denny', displayName: 'Denny Smith', email: 'denny@example.com' };
const RSVP_URL = 'https://sacg-garden-app.web.app/rsvp/tok_abcdefghijklmnopqrstuvwxyz';

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
const answerLinks = (html: string) => html.match(/href="[^"]*answer=(yes|maybe|no)"/g) ?? [];

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;',
    );
  });
});

describe('personalizeTemplate', () => {
  it('replaces {firstName} with the first word of the display name', () => {
    expect(personalizeTemplate('Hi {firstName}!', denny)).toBe('Hi Denny!');
  });

  it('replaces {name} with the full display name, every occurrence', () => {
    expect(personalizeTemplate('{name} / {name}', denny)).toBe('Denny Smith / Denny Smith');
  });

  it('leaves unknown tokens untouched', () => {
    expect(personalizeTemplate('Plot {plotId} for {unknown}', denny)).toBe('Plot {plotId} for {unknown}');
  });

  it('fills {rsvpLink} only when a link is given', () => {
    expect(personalizeTemplate('Go: {rsvpLink}', denny, RSVP_URL)).toBe(`Go: ${RSVP_URL}`);
    expect(personalizeTemplate('Go: {rsvpLink}', denny)).toBe('Go: {rsvpLink}');
  });
});

describe('composeEmail', () => {
  it('personalizes the subject and text', () => {
    const out = composeEmail({ subject: 'Hi {firstName}', body: 'Dear {name},\nsee you.', recipient: denny });
    expect(out.subject).toBe('Hi Denny');
    expect(out.text).toBe('Dear Denny Smith,\nsee you.');
  });

  it('appends the RSVP link once when the body has no {rsvpLink} token', () => {
    const out = composeEmail({ subject: 'S', body: 'Come to the workday.', recipient: denny, rsvpUrl: RSVP_URL });
    expect(out.text).toBe(`Come to the workday.\n\nPlease RSVP here: ${RSVP_URL}`);
    expect(count(out.text, RSVP_URL)).toBe(1);
  });

  it('does not duplicate the RSVP link when the body already has {rsvpLink}', () => {
    const out = composeEmail({ subject: 'S', body: 'RSVP: {rsvpLink}\nThanks!', recipient: denny, rsvpUrl: RSVP_URL });
    expect(out.text).toBe(`RSVP: ${RSVP_URL}\nThanks!`);
    expect(count(out.text, RSVP_URL)).toBe(1);
    expect(out.text).not.toContain('Please RSVP here');
  });

  it('escapes HTML in the body', () => {
    const out = composeEmail({ subject: 'S', body: '<script>alert(1)</script>', recipient: denny });
    expect(out.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out.html).not.toContain('<script>');
  });

  it('escapes HTML in the recipient name', () => {
    const evil: Recipient = { memberId: 'm-evil', displayName: '"><img src=x onerror=1>', email: 'evil@example.com' };
    const out = composeEmail({ subject: 'S', body: 'Hello {name}', recipient: evil });
    expect(out.html).toContain('Hello &quot;&gt;&lt;img src=x onerror=1&gt;');
    expect(out.html).not.toContain('<img');
  });

  it('renders paragraphs and line breaks', () => {
    const out = composeEmail({ subject: 'S', body: 'Line one\nline two\n\nSecond paragraph', recipient: denny });
    expect(out.html).toContain('Line one<br>line two</p>');
    expect(count(out.html, '<p')).toBe(2);
  });

  it('adds Yes / Maybe / Can’t-make-it buttons when an RSVP url is given', () => {
    const out = composeEmail({ subject: 'S', body: 'Come!', recipient: denny, rsvpUrl: RSVP_URL });
    expect(answerLinks(out.html)).toEqual([
      `href="${RSVP_URL}?answer=yes"`,
      `href="${RSVP_URL}?answer=maybe"`,
      `href="${RSVP_URL}?answer=no"`,
    ]);
    expect(out.html).toContain('Yes, I&#39;ll be there');
    expect(out.html).toContain('Maybe');
    expect(out.html).toContain('Can&#39;t make it');
  });

  it('has no links at all without an RSVP url', () => {
    const out = composeEmail({ subject: 'S', body: 'Come!', recipient: denny });
    expect(out.html).not.toContain('<a ');
  });

  it('flattens line breaks in the subject', () => {
    const out = composeEmail({ subject: 'Hello\r\nBcc: x', body: 'B', recipient: denny });
    expect(out.subject).toBe('Hello Bcc: x');
  });
});
