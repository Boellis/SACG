import { describe, it, expect } from 'vitest';
import { GARDEN_TZ, formatGardenDate, formatGardenTime, formatGardenWhen } from './gardenTime';

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
