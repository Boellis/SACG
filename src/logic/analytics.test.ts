import { describe, it, expect } from 'vitest';
import {
  resolveWindow, inRange, bucketFor, bucketSeries, computeDelta,
  fmtCompact, fmtCurrency, fmtPct,
} from './analytics';

const NOW = new Date(Date.UTC(2026, 7, 5, 12)); // Aug 5 2026 12:00Z
const ts = (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() });

describe('resolveWindow', () => {
  it('season = Jan 1 of seasonYear to now, prev = prior calendar year', () => {
    const w = resolveWindow('season', NOW, 2026);
    expect(w.start).toEqual(new Date(Date.UTC(2026, 0, 1)));
    expect(w.end).toEqual(NOW);
    expect(w.prevStart).toEqual(new Date(Date.UTC(2025, 0, 1)));
    expect(w.prevEnd).toEqual(new Date(Date.UTC(2026, 0, 1)));
    expect(w.label).toBe('2026 season');
    expect(w.prevLabel).toBe('2025 season');
  });
  it('last90 = now-90d, prev = the 90d before that', () => {
    const w = resolveWindow('last90', NOW, 2026);
    const d90 = 90 * 86400_000;
    expect(w.end).toEqual(NOW);
    expect(w.start!.getTime()).toBe(NOW.getTime() - d90);
    expect(w.prevStart!.getTime()).toBe(NOW.getTime() - 2 * d90);
    expect(w.prevEnd!.getTime()).toBe(NOW.getTime() - d90);
  });
  it('last12mo spans 365 days with a matching prior window', () => {
    const w = resolveWindow('last12mo', NOW, 2026);
    expect(w.end.getTime() - w.start!.getTime()).toBe(365 * 86400_000);
    expect(w.prevEnd!.getTime()).toBe(w.start!.getTime());
  });
  it('all = unbounded with no prior window', () => {
    const w = resolveWindow('all', NOW, 2026);
    expect(w.start).toBeNull();
    expect(w.prevStart).toBeNull();
    expect(w.prevEnd).toBeNull();
  });
});

describe('inRange', () => {
  const start = new Date(Date.UTC(2026, 0, 1));
  const end = new Date(Date.UTC(2026, 6, 1));
  it('accepts inside, start-inclusive, end-exclusive', () => {
    expect(inRange(ts(new Date(Date.UTC(2026, 2, 1))) as any, start, end)).toBe(true);
    expect(inRange(ts(start) as any, start, end)).toBe(true);
    expect(inRange(ts(end) as any, start, end)).toBe(false);
  });
  it('null start = unbounded below; missing ts = false', () => {
    expect(inRange(ts(new Date(Date.UTC(1999, 0, 1))) as any, null, end)).toBe(true);
    expect(inRange(undefined, start, end)).toBe(false);
  });
});

describe('bucketSeries', () => {
  it('month-buckets, zero-fills gaps, ascending', () => {
    const items = [
      { at: new Date(Date.UTC(2026, 0, 10)), value: 2 },
      { at: new Date(Date.UTC(2026, 0, 20)), value: 3 },
      { at: new Date(Date.UTC(2026, 2, 5)), value: 7 },
    ];
    const out = bucketSeries(items, new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 3, 1)), 'month');
    expect(out.map((p) => p.value)).toEqual([5, 0, 7]);
    expect(out[0].label).toBe('Jan');
    expect(out[2].label).toBe('Mar');
  });
  it('week-buckets start on Monday UTC', () => {
    // Thu Jan 1 2026 falls in the week starting Mon Dec 29 2025
    const out = bucketSeries(
      [{ at: new Date(Date.UTC(2026, 0, 1)), value: 1 }],
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2026, 0, 8)),
      'week',
    );
    expect(out.length).toBe(2); // week of Dec 29 + week of Jan 5
    expect(out[0].value).toBe(1);
  });
  it('null-start (all time) derives start from earliest item', () => {
    const out = bucketSeries(
      [{ at: new Date(Date.UTC(2025, 10, 3)), value: 4 }],
      null as any,
      new Date(Date.UTC(2026, 0, 15)),
      'month',
    );
    expect(out[0].label).toBe('Nov');
    expect(out.map((p) => p.value)).toEqual([4, 0, 0]);
  });
  it('empty items with null start returns a single zero bucket', () => {
    const out = bucketSeries([], null as any, new Date(Date.UTC(2026, 0, 15)), 'month');
    expect(out.length).toBe(1);
    expect(out[0].value).toBe(0);
  });
});

describe('bucketFor / computeDelta / formatters', () => {
  it('last90 → week, others → month', () => {
    expect(bucketFor('last90')).toBe('week');
    expect(bucketFor('season')).toBe('month');
    expect(bucketFor('all')).toBe('month');
  });
  it('delta up/down/flat and null-prev', () => {
    expect(computeDelta(120, 100)).toEqual({ pct: 20, dir: 'up' });
    expect(computeDelta(80, 100)).toEqual({ pct: -20, dir: 'down' });
    expect(computeDelta(100, 100)).toEqual({ pct: 0, dir: 'flat' });
    expect(computeDelta(5, null)).toEqual({ pct: null, dir: 'flat' });
    expect(computeDelta(5, 0)).toEqual({ pct: null, dir: 'flat' });
  });
  it('formatters', () => {
    expect(fmtCompact(1284)).toBe('1,284');
    expect(fmtCompact(12900)).toBe('12.9K');
    expect(fmtCurrency(1730)).toBe('$1,730');
    expect(fmtPct(0.976)).toBe('98%');
  });
});
