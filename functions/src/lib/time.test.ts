import { describe, it, expect } from 'vitest';
import {
  GARDEN_TZ,
  parseGardenLocal,
  toGardenLocal,
  formatGardenWhen,
  formatGardenDate,
  gardenToday,
} from './time';

describe('GARDEN_TZ', () => {
  it('is the garden timezone', () => {
    expect(GARDEN_TZ).toBe('America/Chicago');
  });
});

describe('parseGardenLocal', () => {
  it('maps a post-DST November time to CST (UTC-6): 9:00 AM on Nov 7 is 15:00Z', () => {
    expect(parseGardenLocal('2026-11-07T09:00').toISOString()).toBe('2026-11-07T15:00:00.000Z');
  });

  it('maps a pre-DST October time to CDT (UTC-5)', () => {
    expect(parseGardenLocal('2026-10-31T09:00').toISOString()).toBe('2026-10-31T14:00:00.000Z');
  });

  it('treats a bare date as garden-local midnight', () => {
    expect(parseGardenLocal('2026-11-07').toISOString()).toBe('2026-11-07T06:00:00.000Z');
  });

  it.each([
    'nope',
    '',
    '2026-11-07T9:00',
    '2026-11-07 09:00',
    '2026-11-07T09:00Z',
    '2026-11-07T09:00:00',
    '2026-02-30T09:00',
    '2026-11-07T24:00',
    // 2:30 AM does not exist on the March DST change day in Chicago.
    '2026-03-08T02:30',
  ])('rejects %j', (bad) => {
    expect(() => parseGardenLocal(bad)).toThrow('invalid garden-local datetime');
  });
});

describe('toGardenLocal', () => {
  it('formats an instant as garden-local YYYY-MM-DDTHH:mm', () => {
    expect(toGardenLocal(new Date('2026-11-07T15:00:00.000Z'))).toBe('2026-11-07T09:00');
    expect(toGardenLocal(new Date('2026-10-31T14:00:00.000Z'))).toBe('2026-10-31T09:00');
  });

  it('round-trips with parseGardenLocal', () => {
    expect(toGardenLocal(parseGardenLocal('2026-11-07T10:30'))).toBe('2026-11-07T10:30');
  });
});

describe('formatGardenWhen', () => {
  const p = parseGardenLocal;

  it('collapses the meridiem when both times share it', () => {
    expect(formatGardenWhen(p('2026-11-07T09:00'), p('2026-11-07T10:00'), false)).toBe(
      'Saturday, November 7, 2026, 9:00–10:00 AM',
    );
  });

  it('shows both meridiems when the range crosses noon', () => {
    expect(formatGardenWhen(p('2026-11-07T10:00'), p('2026-11-07T12:00'), false)).toBe(
      'Saturday, November 7, 2026, 10:00 AM–12:00 PM',
    );
  });

  it('shows only the date for an all-day event', () => {
    expect(formatGardenWhen(p('2026-11-07'), p('2026-11-07T23:59'), true)).toBe('Saturday, November 7, 2026');
  });

  it('shows both dates for a multi-day all-day event', () => {
    expect(formatGardenWhen(p('2026-11-07'), p('2026-11-08'), true)).toBe(
      'Saturday, November 7, 2026 – Sunday, November 8, 2026',
    );
  });

  it('shows both dates and times for a timed event spanning days', () => {
    expect(formatGardenWhen(p('2026-11-07T20:00'), p('2026-11-08T01:00'), false)).toBe(
      'Saturday, November 7, 2026, 8:00 PM – Sunday, November 8, 2026, 1:00 AM',
    );
  });
});

describe('formatGardenDate', () => {
  it('formats the garden-local date in full', () => {
    expect(formatGardenDate(new Date('2026-11-07T15:00:00.000Z'))).toBe('Saturday, November 7, 2026');
  });

  it('uses the garden date, not the UTC date', () => {
    // 03:00Z on Nov 8 is still 9 PM on Nov 7 in Chicago.
    expect(formatGardenDate(new Date('2026-11-08T03:00:00.000Z'))).toBe('Saturday, November 7, 2026');
  });
});

describe('gardenToday', () => {
  it('returns the garden-local date, not the UTC date', () => {
    expect(gardenToday(new Date('2026-11-01T04:30:00Z'))).toBe('2026-10-31');
  });

  it('defaults to now', () => {
    expect(gardenToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
