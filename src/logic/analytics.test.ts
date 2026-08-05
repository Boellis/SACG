import { describe, it, expect } from 'vitest';
import {
  resolveWindow, inRange, bucketFor, bucketSeries, computeDelta,
  fmtCompact, fmtCurrency, fmtPct,
} from './analytics';
import {
  occupancyKpi, duesKpi, activeMembers, memberGrowthSeries, hoursTotal, hoursSeries,
  participationKpi, waitlistCount, collectedSeries, topVolunteers,
  hoursCohorts, expectedHoursPace, DEFAULT_ORG_SETTINGS, resolveWindow as rw,
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

const T = (y: number, m: number, d: number) =>
  ({ toDate: () => new Date(Date.UTC(y, m, d)), toMillis: () => Date.UTC(y, m, d) }) as any;

const member = (o: any = {}) => ({
  id: 'm1', uid: 'm1', email: 'a@b.c', displayName: 'A', role: 'member',
  status: 'active', createdAt: T(2026, 0, 1), currentYearHours: 0, ...o,
});
const plot = (o: any = {}) => ({
  id: '1', number: 1, half: 'whole', status: 'assigned', duesAmount: 42,
  depositAmount: 25, duesPaid: false, depositPaid: false, season: '2026', crops: [], ...o,
});
const hour = (o: any = {}) => ({
  id: 'h1', memberId: 'm1', date: T(2026, 3, 10), hours: 2, recordedBy: 'm1',
  createdAt: T(2026, 3, 10), ...o,
});

describe('occupancy & dues KPIs', () => {
  it('occupancy counts assigned / total', () => {
    const k = occupancyKpi([plot(), plot({ id: '2', status: 'available' })] as any);
    expect(k).toEqual({ occupied: 1, total: 2, pct: 0.5 });
  });
  it('duesKpi wraps computeDuesRollup with a rate', () => {
    const k = duesKpi([
      plot({ duesPaid: true, duesAmount: 40 }),
      plot({ id: '2', duesAmount: 60 }),
    ] as any);
    expect(k.collected).toBe(40);
    expect(k.expected).toBe(100);
    expect(k.rate).toBe(0.4);
    expect(k.unpaid.length).toBe(1);
  });
});

describe('growth & participation', () => {
  const NOW = new Date(Date.UTC(2026, 7, 5));
  const w = rw('season', NOW, 2026);
  it('memberGrowthSeries is cumulative and excludes pending', () => {
    const ms = [
      member({ id: 'a', joinedAt: T(2025, 5, 1) }),
      member({ id: 'b', joinedAt: T(2026, 1, 10) }),
      member({ id: 'c', status: 'pending', createdAt: T(2026, 2, 1) }),
    ] as any;
    const s = memberGrowthSeries(ms, w, 'month');
    expect(s[0].value).toBe(1);      // Jan 2026: only a
    expect(s[1].value).toBe(2);      // Feb: a + b
    expect(s[s.length - 1].value).toBe(2);
  });
  it('participationKpi = distinct active loggers / active members', () => {
    const ms = [member({ id: 'a' }), member({ id: 'b' }), member({ id: 'c', status: 'pending' })] as any;
    const hs = [hour({ memberId: 'a' }), hour({ id: 'h2', memberId: 'a' })] as any;
    const k = participationKpi(ms, hs, w);
    expect(k).toEqual({ pct: 0.5, participated: 1, active: 2 });
  });
  it('hoursTotal & hoursSeries respect the window', () => {
    const hs = [hour(), hour({ id: 'h2', date: T(2024, 3, 1), hours: 9 })] as any;
    expect(hoursTotal(hs, w)).toBe(2);
    const s = hoursSeries(hs, w, 'month');
    expect(s.find((p) => p.label === 'Apr')!.value).toBe(2);
  });
  it('collectedSeries uses paidDate of paid plots', () => {
    const ps = [
      plot({ duesPaid: true, paidDate: T(2026, 2, 15), duesAmount: 42 }),
      plot({ id: '2', duesPaid: false }),
    ] as any;
    const s = collectedSeries(ps, w, 'month');
    expect(s.find((p) => p.label === 'Mar')!.value).toBe(42);
  });
  it('waitlistCount counts pending', () => {
    expect(waitlistCount([member(), member({ id: 'x', status: 'pending' })] as any)).toBe(1);
  });
  it('topVolunteers ranks by window hours', () => {
    const ms = [member({ id: 'a', displayName: 'A' }), member({ id: 'b', displayName: 'B' })] as any;
    const hs = [hour({ memberId: 'b', hours: 5 }), hour({ id: 'h2', memberId: 'a', hours: 2 })] as any;
    const top = topVolunteers(ms, hs, w, 8);
    expect(top[0].member.id).toBe('b');
    expect(top[0].hours).toBe(5);
  });
});

describe('hours cohorts', () => {
  it('pace: linear to firstHalfHours through June, then to requiredHours', () => {
    const s = DEFAULT_ORG_SETTINGS;
    expect(expectedHoursPace(s, new Date(Date.UTC(2026, 6, 1)))).toBe(6);            // exactly mid-year
    expect(expectedHoursPace(s, new Date(Date.UTC(2026, 2, 31)))).toBeCloseTo(3, 0); // ~end of March
    expect(expectedHoursPace(s, new Date(Date.UTC(2026, 11, 31)))).toBeCloseTo(12, 0);
  });
  it('buckets done / onTrack / behind', () => {
    const NOW = new Date(Date.UTC(2026, 5, 30)); // pace ≈ 5.97
    const ms = [
      member({ id: 'done' }), member({ id: 'ok' }), member({ id: 'behind' }),
    ] as any;
    const hs = [
      hour({ memberId: 'done', hours: 12, date: T(2026, 1, 1) }),
      hour({ id: 'h2', memberId: 'ok', hours: 7, date: T(2026, 1, 2) }),
      hour({ id: 'h3', memberId: 'behind', hours: 1, date: T(2026, 1, 3) }),
    ] as any;
    const c = hoursCohorts(ms, hs, DEFAULT_ORG_SETTINGS, NOW);
    expect(c.done.map((m) => m.id)).toEqual(['done']);
    expect(c.onTrack.map((m) => m.id)).toEqual(['ok']);
    expect(c.behind.map((m) => m.id)).toEqual(['behind']);
  });
});
