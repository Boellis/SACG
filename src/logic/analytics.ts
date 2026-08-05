export interface TsLike { toDate(): Date; toMillis(): number }
export type RangeKey = 'season' | 'last90' | 'last12mo' | 'all';
export interface AnalyticsWindow {
  key: RangeKey;
  start: Date | null;
  end: Date;
  prevStart: Date | null;
  prevEnd: Date | null;
  label: string;
  prevLabel: string;
}
export interface SeriesPoint { t: number; label: string; value: number }
export type Bucket = 'week' | 'month';
export interface Delta { pct: number | null; dir: 'up' | 'down' | 'flat' }

const DAY = 86400_000;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function resolveWindow(key: RangeKey, now: Date, seasonYear: number): AnalyticsWindow {
  if (key === 'season') {
    const start = new Date(Date.UTC(seasonYear, 0, 1));
    return {
      key, start, end: now,
      prevStart: new Date(Date.UTC(seasonYear - 1, 0, 1)),
      prevEnd: start,
      label: `${seasonYear} season`, prevLabel: `${seasonYear - 1} season`,
    };
  }
  if (key === 'last90' || key === 'last12mo') {
    const span = key === 'last90' ? 90 * DAY : 365 * DAY;
    const start = new Date(now.getTime() - span);
    return {
      key, start, end: now,
      prevStart: new Date(now.getTime() - 2 * span), prevEnd: start,
      label: key === 'last90' ? 'Last 90 days' : 'Last 12 months',
      prevLabel: key === 'last90' ? 'prior 90 days' : 'prior 12 months',
    };
  }
  return { key, start: null, end: now, prevStart: null, prevEnd: null, label: 'All time', prevLabel: '' };
}

export function inRange(ts: TsLike | undefined | null, start: Date | null, end: Date): boolean {
  if (!ts) return false;
  const t = ts.toMillis();
  return (start === null || t >= start.getTime()) && t < end.getTime();
}

export function bucketFor(key: RangeKey): Bucket {
  return key === 'last90' ? 'week' : 'month';
}

function monthStart(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
function weekStart(d: Date): number {
  const day = d.getUTCDay(); // 0 Sun … 6 Sat; Monday-start offset:
  const offset = (day + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offset);
}
function nextBucket(t: number, bucket: Bucket): number {
  const d = new Date(t);
  return bucket === 'month'
    ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    : t + 7 * DAY;
}
function bucketLabel(t: number, bucket: Bucket): string {
  const d = new Date(t);
  return bucket === 'month'
    ? MONTHS[d.getUTCMonth()]
    : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function bucketSeries(
  items: { at: Date; value: number }[],
  start: Date | null,
  end: Date,
  bucket: Bucket,
): SeriesPoint[] {
  const startOf = bucket === 'month' ? monthStart : weekStart;
  let s: number;
  if (start) s = startOf(start);
  else if (items.length) s = startOf(new Date(Math.min(...items.map((i) => i.at.getTime()))));
  else s = startOf(end);
  const out: SeriesPoint[] = [];
  for (let t = s; t < end.getTime(); t = nextBucket(t, bucket)) {
    out.push({ t, label: bucketLabel(t, bucket), value: 0 });
  }
  if (out.length === 0) out.push({ t: s, label: bucketLabel(s, bucket), value: 0 });
  for (const it of items) {
    const bt = startOf(it.at);
    const p = out.find((o) => o.t === bt);
    if (p) p.value += it.value;
  }
  return out;
}

export function computeDelta(current: number, previous: number | null): Delta {
  if (previous === null || previous === 0) return { pct: null, dir: 'flat' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 10000) {
    const k = n / 1000;
    return `${k >= 100 ? Math.round(k) : Math.round(k * 10) / 10}K`;
  }
  return n.toLocaleString('en-US');
}
export function fmtCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}
export function fmtPct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
