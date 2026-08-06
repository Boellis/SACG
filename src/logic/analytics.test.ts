import { describe, it, expect } from 'vitest';
import {
  resolveWindow, inRange, bucketFor, bucketSeries, computeDelta,
  fmtCompact, fmtCurrency, fmtPct,
} from './analytics';
import {
  occupancyKpi, duesKpi, memberGrowthSeries, hoursTotal, hoursSeries,
  participationKpi, participationSeries, waitlistCount, collectedSeries, topVolunteers,
  hoursCohorts, expectedHoursPace, DEFAULT_ORG_SETTINGS, resolveWindow as rw, joinedBefore,
} from './analytics';

const NOW = new Date(Date.UTC(2026, 7, 5, 12)); // Aug 5 2026 12:00Z
const ts = (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() });

describe('resolveWindow', () => {
  it('season = Jan 1 of seasonYear to now, prev = same date range one year earlier (season-to-date)', () => {
    const w = resolveWindow('season', NOW, 2026);
    expect(w.start).toEqual(new Date(Date.UTC(2026, 0, 1)));
    expect(w.end).toEqual(NOW);
    expect(w.prevStart).toEqual(new Date(Date.UTC(2025, 0, 1)));
    expect(w.prevEnd).toEqual(new Date(Date.UTC(2025, 7, 5)));
    expect(w.label).toBe('2026 season');
    expect(w.prevLabel).toBe('2025 season to date');
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
  it("memberGrowthSeries spans history for the 'all' range", () => {
    const ms = [
      member({ id: 'a', joinedAt: T(2025, 5, 1) }),
      member({ id: 'b', joinedAt: T(2026, 1, 10) }),
    ] as any;
    const s = memberGrowthSeries(ms, rw('all', NOW, 2026), 'month');
    expect(s.length).toBeGreaterThan(12);        // Jun 2025 → Aug 2026
    expect(s[0].value).toBe(1);                  // first bucket: only a
    expect(s[s.length - 1].value).toBe(2);
  });
  it('participationKpi = distinct active loggers / active members', () => {
    const ms = [member({ id: 'a' }), member({ id: 'b' }), member({ id: 'c', status: 'pending' })] as any;
    const hs = [hour({ memberId: 'a' }), hour({ id: 'h2', memberId: 'a' })] as any;
    const k = participationKpi(ms, hs, w);
    expect(k).toEqual({ pct: 0.5, participated: 1, active: 2 });
  });
  it('participationSeries counts distinct loggers per bucket, not hours', () => {
    const hs = [
      hour({ memberId: 'a', hours: 3 }),
      hour({ id: 'h2', memberId: 'a', hours: 5, date: T(2026, 3, 20) }),
      hour({ id: 'h3', memberId: 'b', hours: 1, date: T(2026, 4, 2) }),
    ] as any;
    const s = participationSeries(hs, w, 'month');
    expect(s.find((p) => p.label === 'Apr')!.value).toBe(1); // member a twice → 1
    expect(s.find((p) => p.label === 'May')!.value).toBe(1); // member b
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

import {
  upkeepTier, upkeepDistribution, cropPopularity, duesByTier,
  duesIncreaseTable, splitPlotUtilization,
  threadsSeries, votesSeries, rsvpBreakdown, nextEvent, openPollCount, buildKpis,
} from './analytics';

describe('upkeep tiers', () => {
  const NOW = new Date(Date.UTC(2026, 7, 5));
  it('thriving on fresh watering or fresh planting', () => {
    expect(upkeepTier(plot({ crops: [{ name: 'kale' }], lastWateredAt: T(2026, 7, 1) }) as any, NOW)).toBe('thriving');
    expect(upkeepTier(plot({ crops: [{ name: 'kale', plantedOn: T(2026, 5, 1) }] }) as any, NOW)).toBe('thriving');
  });
  it('okay = crops but stale/no signals (incl. undated crops)', () => {
    expect(upkeepTier(plot({ crops: [{ name: 'corn' }] }) as any, NOW)).toBe('okay');
    expect(upkeepTier(plot({ crops: [{ name: 'corn', plantedOn: T(2025, 1, 1) }] }) as any, NOW)).toBe('okay');
  });
  it('attention = no crops AND stale watering; nodata = no signals at all', () => {
    expect(upkeepTier(plot({ crops: [], lastWateredAt: T(2026, 4, 1) }) as any, NOW)).toBe('attention');
    expect(upkeepTier(plot({ crops: [] }) as any, NOW)).toBe('nodata');
  });
  it('recent watering with no crops still counts as thriving', () => {
    expect(upkeepTier(plot({ crops: [], lastWateredAt: T(2026, 7, 3) }) as any, NOW)).toBe('thriving');
  });
  it('no crops but watered 15-30 days ago is okay (data exists, not stale)', () => {
    expect(upkeepTier(plot({ crops: [], lastWateredAt: T(2026, 6, 20) }) as any, NOW)).toBe('okay'); // 16 days before Aug 5
  });
  it('distribution only includes assigned plots', () => {
    const d = upkeepDistribution([plot({ crops: [] }), plot({ id: '2', status: 'available' })] as any, NOW);
    expect(d.nodata.length).toBe(1);
    expect(d.thriving.length + d.okay.length + d.attention.length).toBe(0);
  });
});

describe('crops, tiers, split utilization', () => {
  it('cropPopularity counts case-insensitively and folds the tail into Other', () => {
    const ps = [
      plot({ crops: [{ name: 'Kale' }, { name: 'corn' }] }),
      plot({ id: '2', crops: [{ name: 'kale' }] }),
    ] as any;
    const top = cropPopularity(ps, 1);
    expect(top[0]).toEqual({ name: 'kale', count: 2 });
    expect(top[1]).toEqual({ name: 'Other', count: 1 });
  });
  it('duesByTier groups by duesAmount ascending', () => {
    const ps = [
      plot({ duesAmount: 42, duesPaid: true }),
      plot({ id: '2', duesAmount: 42 }),
      plot({ id: '3', duesAmount: 69 }),
    ] as any;
    const tiers = duesByTier(ps);
    expect(tiers.map((t) => t.tier)).toEqual(['$42', '$69']);
    expect(tiers[0]).toMatchObject({ collected: 42, outstanding: 42 });
    expect(tiers[0].unpaid.length).toBe(1);
  });
  it('duesIncreaseTable pivots seasons × tiers with % change', () => {
    const t = duesIncreaseTable([
      { season: '2025', tier: '$42', amount: 40 },
      { season: '2026', tier: '$42', amount: 42 },
      { season: '2026', tier: '$69', amount: 69 },
    ]);
    expect(t.seasons).toEqual(['2025', '2026']);
    const r42 = t.rows.find((r) => r.tier === '$42')!;
    expect(r42.amounts).toEqual([40, 42]);
    expect(r42.pctChanges).toEqual([null, 5]);
    const r69 = t.rows.find((r) => r.tier === '$69')!;
    expect(r69.amounts).toEqual([null, 69]);
  });
  it('splitPlotUtilization counts wholes vs halves', () => {
    const ps = [plot(), plot({ id: '9A', half: 'A' }), plot({ id: '9B', half: 'B', status: 'available' })] as any;
    expect(splitPlotUtilization(ps)).toEqual({ wholes: 1, assignedWholes: 1, halves: 2, assignedHalves: 1 });
  });
});

describe('engagement helpers', () => {
  const NOW = new Date(Date.UTC(2026, 7, 5));
  const w = rw('season', NOW, 2026);
  it('threads/votes series bucket by createdAt', () => {
    const th = [{ id: 't', title: '', body: '', authorId: '', authorName: '', createdAt: T(2026, 1, 2) }] as any;
    expect(threadsSeries(th, w, 'month').find((p) => p.label === 'Feb')!.value).toBe(1);
    const vs = [{ id: 'v', optionId: '0', memberId: 'm', createdAt: T(2026, 2, 2) }] as any;
    expect(votesSeries(vs, w, 'month').find((p) => p.label === 'Mar')!.value).toBe(1);
  });
  it('rsvpBreakdown tallies statuses', () => {
    const rs = [{ status: 'yes' }, { status: 'yes' }, { status: 'maybe' }, { status: 'no' }] as any;
    expect(rsvpBreakdown(rs)).toEqual({ yes: 2, maybe: 1, no: 1 });
  });
  it('nextEvent = earliest event ending after now; openPollCount uses isPollOpen semantics', () => {
    const evs = [
      { id: 'past', start: T(2026, 0, 1), end: T(2026, 0, 2) },
      { id: 'next', start: T(2026, 8, 1), end: T(2026, 8, 2) },
      { id: 'later', start: T(2026, 9, 1), end: T(2026, 9, 2) },
    ] as any;
    expect(nextEvent(evs, NOW)!.id).toBe('next');
    const polls = [
      { id: 'open', closed: false },
      { id: 'closed', closed: true },
      { id: 'expired', closed: false, expiresAt: T(2026, 0, 1) },
    ] as any;
    expect(openPollCount(polls, NOW)).toBe(1);
  });
});

describe('buildKpis', () => {
  it('produces the six tiles in order with formatted values', () => {
    const NOW = new Date(Date.UTC(2026, 7, 5));
    const w = rw('season', NOW, 2026);
    const d = {
      members: [member()], plots: [plot()], hours: [hour()],
      events: [], threads: [], polls: [], rsvpsByEvent: {}, votesByPoll: {},
      duesHistory: [], settings: DEFAULT_ORG_SETTINGS,
    } as any;
    const kpis = buildKpis(d, w, NOW);
    expect(kpis.map((k) => k.key)).toEqual(
      ['occupancy', 'dues', 'members', 'participation', 'hours', 'waitlist'],
    );
    expect(kpis[0].display).toBe('100%');
    expect(kpis[4].display).toBe('2');
    // no fabricated history: occupancy & waitlist have no sparkline
    expect(kpis[0].spark).toBeNull();
    expect(kpis[5].spark).toBeNull();
    expect(kpis[4].spark!.length).toBeGreaterThan(0);
  });

  it('members tile shows no delta on all time and counts January joiners in-window', () => {
    const NOW = new Date(Date.UTC(2026, 7, 5));
    const ms = [
      member({ id: 'jan', joinedAt: T(2026, 0, 5) }),   // joined Jan 5 — inside the season window
      member({ id: 'old', joinedAt: T(2024, 5, 1) }),   // joined 2024 — baseline
    ] as any;
    const base = {
      members: ms, plots: [], hours: [], events: [], threads: [], polls: [],
      rsvpsByEvent: {}, votesByPoll: {}, duesHistory: [], settings: DEFAULT_ORG_SETTINGS,
    } as any;
    const season = buildKpis(base, rw('season', NOW, 2026), NOW);
    const seasonMembers = season.find((k) => k.key === 'members')!;
    expect(seasonMembers.detail).toBe('+1 in 2026 season');       // jan counted, old is baseline
    expect(seasonMembers.delta!.pct).toBe(100);                    // 2 now vs 1 at 2025-08-05
    const all = buildKpis(base, rw('all', NOW, 2026), NOW);
    expect(all.find((k) => k.key === 'members')!.delta).toBeNull();
  });

  it('joinedBefore counts non-pending joins strictly before the cutoff', () => {
    const ms = [
      member({ id: 'a', joinedAt: T(2025, 0, 1) }),
      member({ id: 'b', joinedAt: T(2026, 0, 1) }),
      member({ id: 'p', status: 'pending', createdAt: T(2024, 0, 1) }),
    ] as any;
    expect(joinedBefore(ms, new Date(Date.UTC(2026, 0, 1)))).toBe(1);  // b is AT cutoff → excluded
  });
});
