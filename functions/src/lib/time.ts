import { DateTime } from 'luxon';

/** Every garden time (events, emails, "today") is America/Chicago wall time. */
export const GARDEN_TZ = 'America/Chicago';

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;
const LOCAL_FMT = "yyyy-MM-dd'T'HH:mm";
const DATE_FMT = 'EEEE, MMMM d, yyyy'; // Saturday, November 7, 2026

const inGarden = (d: Date) => DateTime.fromJSDate(d, { zone: GARDEN_TZ }).setLocale('en-US');

/**
 * Garden-local `YYYY-MM-DDTHH:mm` (or `YYYY-MM-DD` = midnight) → the instant it
 * names, honouring DST: `2026-11-07T09:00` (CST) → `2026-11-07T15:00:00Z`.
 */
export function parseGardenLocal(local: string): Date {
  const m = typeof local === 'string' ? LOCAL_RE.exec(local) : null;
  if (!m) throw new Error('invalid garden-local datetime');
  const [, y, mo, d, h = '00', mi = '00'] = m;
  const dt = DateTime.fromObject(
    { year: Number(y), month: Number(mo), day: Number(d), hour: Number(h), minute: Number(mi) },
    { zone: GARDEN_TZ },
  );
  // luxon rejects impossible dates (Feb 30) but silently rolls 24:00 over and
  // shifts spring-forward gap times; the round-trip rejects all three.
  if (!dt.isValid || dt.toFormat(LOCAL_FMT) !== `${y}-${mo}-${d}T${h}:${mi}`) {
    throw new Error('invalid garden-local datetime');
  }
  return dt.toJSDate();
}

/** Instant → garden-local `YYYY-MM-DDTHH:mm`. */
export function toGardenLocal(d: Date): string {
  return inGarden(d).toFormat(LOCAL_FMT);
}

/** e.g. `Saturday, November 7, 2026` (garden date). */
export function formatGardenDate(d: Date): string {
  return inGarden(d).toFormat(DATE_FMT);
}

/**
 * Human-readable event time in garden time:
 * `Saturday, November 7, 2026, 9:00–10:00 AM`, or `…, 10:00 AM–12:00 PM` when
 * the range crosses noon; date only for all-day events.
 */
export function formatGardenWhen(start: Date, end: Date, allDay: boolean): string {
  const s = inGarden(start);
  const e = inGarden(end);
  const sameDay = s.hasSame(e, 'day');
  if (allDay) {
    return sameDay ? s.toFormat(DATE_FMT) : `${s.toFormat(DATE_FMT)} – ${e.toFormat(DATE_FMT)}`;
  }
  if (!sameDay) {
    return `${s.toFormat(DATE_FMT)}, ${s.toFormat('h:mm a')} – ${e.toFormat(DATE_FMT)}, ${e.toFormat('h:mm a')}`;
  }
  const range =
    s.toFormat('a') === e.toFormat('a')
      ? `${s.toFormat('h:mm')}–${e.toFormat('h:mm a')}`
      : `${s.toFormat('h:mm a')}–${e.toFormat('h:mm a')}`;
  return `${s.toFormat(DATE_FMT)}, ${range}`;
}

/** Today's garden-local date, `YYYY-MM-DD`. */
export function gardenToday(now: Date = new Date()): string {
  return inGarden(now).toFormat('yyyy-MM-dd');
}
