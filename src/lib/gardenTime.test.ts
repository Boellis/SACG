import { describe, it, expect, afterEach } from 'vitest';
import {
  GARDEN_TZ,
  formatGardenDate,
  formatGardenTime,
  formatGardenWhen,
  formatGardenLocal,
  formatGardenLocalWhen,
} from './gardenTime';

const nov7_9am = new Date('2026-11-07T15:00:00.000Z'); // 9:00 AM CST (after the Nov 1 DST change)

describe('gardenTime', () => {
  it('uses the garden timezone', () => {
    expect(GARDEN_TZ).toBe('America/Chicago');
  });

  it('shows garden wall time across the DST change, with a plain space before AM/PM', () => {
    expect(formatGardenTime(nov7_9am)).toBe('9:00 AM');
    expect(formatGardenTime(new Date('2026-10-31T14:00:00.000Z'))).toBe('9:00 AM'); // CDT
    expect(formatGardenTime(new Date('2026-11-07T18:00:00.000Z'))).toBe('12:00 PM');
  });

  it('formats the garden date, long and short', () => {
    expect(formatGardenDate(nov7_9am)).toBe('Saturday, November 7, 2026');
    expect(formatGardenDate(nov7_9am, 'short')).toBe('Sat, Nov 7');
    // 03:00Z on Nov 8 is still Nov 7 in Chicago.
    expect(formatGardenDate(new Date('2026-11-08T03:00:00.000Z'))).toBe('Saturday, November 7, 2026');
  });

  it('formats an event time range like the server does', () => {
    const at = (iso: string) => new Date(iso);
    expect(formatGardenWhen(nov7_9am, at('2026-11-07T16:00:00Z'), false)).toBe(
      'Saturday, November 7, 2026, 9:00–10:00 AM',
    );
    expect(formatGardenWhen(at('2026-11-07T16:00:00Z'), at('2026-11-07T18:00:00Z'), false)).toBe(
      'Saturday, November 7, 2026, 10:00 AM–12:00 PM',
    );
    expect(formatGardenWhen(at('2026-11-07T06:00:00Z'), at('2026-11-08T05:59:00Z'), true)).toBe(
      'Saturday, November 7, 2026',
    );
    expect(formatGardenWhen(at('2026-11-08T02:00:00Z'), at('2026-11-08T07:00:00Z'), false)).toBe(
      'Saturday, November 7, 2026, 8:00 PM – Sunday, November 8, 2026, 1:00 AM',
    );
  });
});

// Garden-local strings (`YYYY-MM-DDTHH:mm`) are wall-clock labels: the assistant's
// cards show them as typed, so DST and the viewer's timezone can't move them.
describe('garden-local strings', () => {
  it('shows a same-day range once, in the shared AM/PM', () => {
    expect(formatGardenLocalWhen('2026-11-07T09:00', '2026-11-07T10:00', false)).toBe('Sat, Nov 7 · 9:00–10:00 AM');
    expect(formatGardenLocalWhen('2026-11-07T12:00', '2026-11-07T13:30', false)).toBe('Sat, Nov 7 · 12:00–1:30 PM');
  });

  it('keeps both AM/PM when the range crosses noon', () => {
    expect(formatGardenLocalWhen('2026-11-07T10:00', '2026-11-07T12:00', false)).toBe('Sat, Nov 7 · 10:00 AM–12:00 PM');
    expect(formatGardenLocalWhen('2026-11-07T11:00', '2026-11-07T12:30', false)).toBe('Sat, Nov 7 · 11:00 AM–12:30 PM');
  });

  it('spells out both days when the event runs past midnight', () => {
    expect(formatGardenLocalWhen('2026-11-07T20:00', '2026-11-08T01:00', false)).toBe(
      'Sat, Nov 7 · 8:00 PM – Sun, Nov 8 · 1:00 AM',
    );
  });

  it('labels all-day events instead of showing clock times', () => {
    expect(formatGardenLocalWhen('2026-11-07T00:00', '2026-11-07T23:59', true)).toBe('Sat, Nov 7 · All day');
    expect(formatGardenLocalWhen('2026-11-07T00:00', '2026-11-08T23:59', true)).toBe('Sat, Nov 7 – Sun, Nov 8 · All day');
  });

  it('formats a single point, or just the date for a date-only string', () => {
    expect(formatGardenLocal('2026-11-07T00:00')).toBe('Sat, Nov 7 · 12:00 AM');
    expect(formatGardenLocal('2026-11-07T15:45')).toBe('Sat, Nov 7 · 3:45 PM');
    expect(formatGardenLocal('2026-11-20')).toBe('Fri, Nov 20');
  });

  it('never shifts a time across a DST change (no instant conversion happens)', () => {
    // Nov 1 2026 is the fall-back day; Mar 8 2026 has no 2:30 AM in Chicago. Both show as typed.
    expect(formatGardenLocal('2026-11-01T01:30')).toBe('Sun, Nov 1 · 1:30 AM');
    expect(formatGardenLocal('2026-03-08T02:30')).toBe('Sun, Mar 8 · 2:30 AM');
    expect(formatGardenLocalWhen('2026-11-07T09:00', '2026-11-07T10:00', false)).not.toMatch(/8:00|10:00 AM–11/);
  });

  it('hands back text it cannot read instead of inventing a date', () => {
    expect(formatGardenLocal('soon')).toBe('soon');
    expect(formatGardenLocal('2026-02-30T09:00')).toBe('2026-02-30T09:00');
    expect(formatGardenLocal('2026-11-07T24:00')).toBe('2026-11-07T24:00');
    expect(formatGardenLocalWhen('soon', '2026-11-07T10:00', false)).toBe('soon – 2026-11-07T10:00');
  });

  describe("doesn't depend on the viewer's timezone", () => {
    const original = process.env.TZ;
    afterEach(() => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    });

    it.each(['Asia/Tokyo', 'Pacific/Auckland', 'America/Los_Angeles', 'UTC'])('%s', (tz) => {
      process.env.TZ = tz;
      // The process really is in that zone now: 15:00Z is not hour 15 here unless we are in UTC.
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(tz);
      expect(formatGardenLocalWhen('2026-11-07T09:00', '2026-11-07T10:00', false)).toBe('Sat, Nov 7 · 9:00–10:00 AM');
      expect(formatGardenLocal('2026-11-07T00:00')).toBe('Sat, Nov 7 · 12:00 AM');
    });
  });
});
