import { describe, it, expect } from 'vitest';
import { buildGmailComposeUrl, buildMailtoUrl } from './emailLinks';

const bcc = ['a@x.com', 'b@x.com'];
const subject = 'Hi';
const body = 'Yo';

describe('buildGmailComposeUrl', () => {
  it('returns a gmail compose URL', () => {
    const url = buildGmailComposeUrl(bcc, subject, body);
    expect(url).toContain('https://mail.google.com/mail/?view=cm&fs=1');
  });

  it('has empty to= param', () => {
    const url = buildGmailComposeUrl(bcc, subject, body);
    expect(url).toContain('to=&');
  });

  it('encodes bcc addresses joined with comma', () => {
    const url = buildGmailComposeUrl(bcc, subject, body);
    // a@x.com,b@x.com encoded
    expect(url).toContain('bcc=a%40x.com%2Cb%40x.com');
  });

  it('encodes subject', () => {
    const url = buildGmailComposeUrl(bcc, subject, body);
    expect(url).toContain('su=Hi');
  });

  it('encodes body', () => {
    const url = buildGmailComposeUrl(bcc, subject, body);
    expect(url).toContain('body=Yo');
  });

  it('handles single recipient', () => {
    const url = buildGmailComposeUrl(['test@example.com'], 'Sub', 'Msg');
    expect(url).toContain('bcc=test%40example.com');
  });

  it('handles empty bcc list', () => {
    const url = buildGmailComposeUrl([], 'Sub', 'Msg');
    expect(url).toContain('bcc=');
  });
});

describe('buildMailtoUrl', () => {
  it('returns a mailto: URL', () => {
    const url = buildMailtoUrl(bcc, subject, body);
    expect(url).toMatch(/^mailto:\?/);
  });

  it('encodes bcc addresses joined with comma', () => {
    const url = buildMailtoUrl(bcc, subject, body);
    expect(url).toContain('bcc=a%40x.com%2Cb%40x.com');
  });

  it('encodes subject', () => {
    const url = buildMailtoUrl(bcc, subject, body);
    expect(url).toContain('subject=Hi');
  });

  it('encodes body', () => {
    const url = buildMailtoUrl(bcc, subject, body);
    expect(url).toContain('body=Yo');
  });

  it('handles special chars in subject', () => {
    const url = buildMailtoUrl(bcc, 'Hello World & More', 'Hi');
    expect(url).toContain(encodeURIComponent('Hello World & More'));
  });
});
