/** Every garden time is America/Chicago wall time, whatever the viewer's timezone. */
export const GARDEN_TZ = 'America/Chicago';

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: GARDEN_TZ, ...opts });
const DATE_LONG = fmt({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const DATE_SHORT = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
const TIME = fmt({ hour: 'numeric', minute: '2-digit' });
const DAY_KEY = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });

// Newer ICU puts a narrow no-break space before AM/PM; keep text predictable.
const plain = (s: string) => s.replace(/[  ]/g, ' ');

/** `Saturday, November 7, 2026` (long) or `Sat, Nov 7` (short), in garden time. */
export function formatGardenDate(d: Date, style: 'long' | 'short' = 'long'): string {
  return plain((style === 'long' ? DATE_LONG : DATE_SHORT).format(d));
}

/** `9:00 AM`, in garden time. */
export function formatGardenTime(d: Date): string {
  return plain(TIME.format(d));
}

/**
 * Event time range in garden time, matching the server's emails:
 * `Saturday, November 7, 2026, 9:00–10:00 AM`, `…, 10:00 AM–12:00 PM` across
 * noon, the date alone for all-day events.
 */
export function formatGardenWhen(start: Date, end: Date, allDay: boolean): string {
  const sameDay = DAY_KEY.format(start) === DAY_KEY.format(end);
  const startDate = formatGardenDate(start);
  if (allDay) return sameDay ? startDate : `${startDate} – ${formatGardenDate(end)}`;
  const s = formatGardenTime(start);
  const e = formatGardenTime(end);
  if (!sameDay) return `${startDate}, ${s} – ${formatGardenDate(end)}, ${e}`;
  const [sClock, sPeriod] = s.split(' ');
  const [, ePeriod] = e.split(' ');
  return `${startDate}, ${sPeriod === ePeriod ? sClock : s}–${e}`;
}
