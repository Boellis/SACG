import { describe, it, expect } from 'vitest';
import { hideContactDetails } from './redact';

describe('hideContactDetails', () => {
  it.each([
    ['an email address', 'write to denny@example.com today', 'write to [email hidden] today'],
    ['a dashed number', 'call 555-010-0142', 'call [phone hidden]'],
    ['a number with parentheses', 'call (555) 010-0142', 'call [phone hidden]'],
    ['a dotted number', 'call 555.010.0142', 'call [phone hidden]'],
    ['a +1 number with spaces', 'call +1 555 010 0142', 'call [phone hidden]'],
    ['a 7-digit local number', 'call 010-0142', 'call [phone hidden]'],
    ['ten bare digits', 'text 5125550142 please', 'text [phone hidden] please'],
    ['an E.164 number', 'text +15125550142', 'text [phone hidden]'],
    ['eleven digits with a leading 1', 'text 15125550142', 'text [phone hidden]'],
  ])('hides %s', (_label, input, output) => {
    expect(hideContactDetails(input)).toBe(output);
  });

  it('leaves dates, times, money, ids and short numbers alone', () => {
    const text = 'Saturday 2026-11-07, 9:00–10:00 AM, dues $45, plot 12B, 3 people, 20 minutes, job abc123';
    expect(hideContactDetails(text)).toBe(text);
  });
});
