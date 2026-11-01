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

// ---------------------------------------------------------------------------
// Garden-local strings: `YYYY-MM-DDTHH:mm` (or `YYYY-MM-DD`), the zone-less wall
// time the AI assistant and the server's toGardenLocal use. They are labels, not
// instants, so they are shown as written: the fields go through a UTC Date only
// to name the weekday and month, and nothing is converted to an instant. A DST
// change or the viewer's own timezone therefore cannot shift them.
// ---------------------------------------------------------------------------

const wall = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts });
const WALL_DATE = wall({ weekday: 'short', month: 'short', day: 'numeric' });
const WALL_TIME = wall({ hour: 'numeric', minute: '2-digit' });
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

/** `day` is `Sat, Nov 7`; `time` is `9:00 AM`, or null for a date-only string. Null if unreadable. */
function wallClock(local: string): { day: string; time: string | null } | null {
  const m = LOCAL_RE.exec(local);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [h, mi] = [Number(m[4] ?? 0), Number(m[5] ?? 0)];
  const at = new Date(Date.UTC(y, mo - 1, d, h, mi));
  // Date.UTC rolls Feb 30 or hour 24 over into the next day; the round trip rejects those.
  if (
    at.getUTCFullYear() !== y ||
    at.getUTCMonth() !== mo - 1 ||
    at.getUTCDate() !== d ||
    at.getUTCHours() !== h ||
    at.getUTCMinutes() !== mi
  ) {
    return null;
  }
  return { day: plain(WALL_DATE.format(at)), time: m[4] === undefined ? null : plain(WALL_TIME.format(at)) };
}

/** `Sat, Nov 7 · 9:00 AM` (just `Sat, Nov 7` for a date-only string). Unreadable text comes back as given. */
export function formatGardenLocal(local: string): string {
  const w = wallClock(local);
  if (!w) return local;
  return w.time ? `${w.day} · ${w.time}` : w.day;
}

/**
 * An event's span from garden-local start/end: `Sat, Nov 7 · 9:00–10:00 AM`,
 * `… · 10:00 AM–12:00 PM` across noon, `… · All day`, or both days spelled out
 * when it runs past midnight. Unreadable input is shown as given.
 */
export function formatGardenLocalWhen(startLocal: string, endLocal: string, allDay: boolean): string {
  const s = wallClock(startLocal);
  const e = wallClock(endLocal);
  if (!s || !e) return `${startLocal} – ${endLocal}`;
  const sameDay = startLocal.slice(0, 10) === endLocal.slice(0, 10);
  if (allDay) return sameDay ? `${s.day} · All day` : `${s.day} – ${e.day} · All day`;
  if (!s.time || !e.time) return sameDay ? s.day : `${s.day} – ${e.day}`;
  if (!sameDay) return `${s.day} · ${s.time} – ${e.day} · ${e.time}`;
  const [sClock, sPeriod] = s.time.split(' ');
  const [, ePeriod] = e.time.split(' ');
  return `${s.day} · ${sPeriod === ePeriod ? sClock : s.time}–${e.time}`;
}
