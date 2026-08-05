# Executive Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an admin-only, one-page executive analytics dashboard at `/analytics` (tabs: Overview, Finance, Operations, Engagement) with a date-range filter, period-over-period deltas, a demo-data toggle, light/dark theming, drill-downs, and a printable committee report.

**Architecture:** All aggregation math lives in pure functions in `src/logic/analytics.ts` operating on an `AnalyticsDataset` (raw domain arrays). The dataset comes either from existing Firestore listeners (live) or from a deterministic generator (`demoData.ts`) — swapped upstream so both modes exercise identical code. UI is a lazily-loaded route chunk (`AnalyticsPage` shell + one component per tab) so Recharts never lands in the main bundle.

**Tech Stack:** React 18 + TypeScript + Tailwind (existing), react-router-dom v6 nested routes, Recharts 2.x (new dep, lazy chunk), vitest + @testing-library/react (existing patterns), plain CSS custom properties for the viz theme.

**Spec:** `docs/superpowers/specs/2026-08-05-executive-analytics-dashboard-design.md`

## Global Constraints

- **Recharts 2.x only** — install `recharts@^2.15.4`. Do NOT install a React-19-only major (project is React 18.3).
- **No Firestore rules changes.** Admins already read everything needed. Do not touch `firestore.rules`, indexes, or Functions.
- **All date math is UTC** (`getUTCFullYear`, `Date.UTC`, …) — matches existing `src/logic/hours.ts`; keeps tests timezone-stable.
- **No `Date.now()` / `new Date()` inside logic or demoData internals** — "now" is always a parameter.
- **No `firebase/firestore` runtime imports in `src/logic/analytics.ts` or `src/features/analytics/demoData.ts`** — type-only imports (`import type`) are fine (erased at compile time). Component tests mock `firebase/firestore` as `{}`, so a runtime import would crash them.
- **Demo data is deterministic**: seeded mulberry32 PRNG, fixed seed; two calls with the same args are deep-equal.
- **Committee language**: user-facing copy says "committee report", never "board".
- **Dataviz non-negotiables** (from the dataviz skill, apply to every chart):
  - Colors come only from the token file (Task 6) — never eyeballed hex.
  - Bars ≤ 24px thick, 4px rounded data-end / square baseline; lines 2px; area fills ~10% opacity; gridlines solid hairline `#e1e0d9` (dark `#2c2c2a`), never dashed.
  - Stacked segments separated by a 2px surface-colored stroke (the surface gap).
  - Text never wears a series color — labels/values/legends use text tokens; identity comes from a colored swatch beside the text.
  - Legend present for ≥ 2 series; none for single-series charts (title names it). Label selectively — never a number on every point.
  - One axis per chart. Never dual-axis.
  - Every chart card ships a **table view** toggle (the WCAG twin) and hover tooltips (values lead, labels follow).
  - Status colors (good/warning/serious) only where the value MEANS good/bad (upkeep tiers, cohorts), always paired with a label, never for plain series identity.
  - Stat tiles: sentence-case label, semibold proportional-figure value (no `tabular-nums` on big numbers), signed delta vs a named period, sparkline in de-emphasis gray with accent end dot.
- **Every commit message** ends with:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01PtZa4EScmNxNNBgFNAeJcN
  ```
- **Run commands from the repo root.** Tests: `npx vitest run <file>` for a single file; `npm test` for the suite. Pre-existing failures in `src/features/calendar/CalendarPage.test.tsx` (4 RSVP tests) are documented debt — ignore them; do not fix or worsen.

## Shared type vocabulary (defined in Task 1–3, consumed everywhere)

```ts
// src/logic/analytics.ts
export interface TsLike { toDate(): Date; toMillis(): number }   // structural subset of Firestore Timestamp
export type RangeKey = 'season' | 'last90' | 'last12mo' | 'all';
export interface AnalyticsWindow {
  key: RangeKey;
  start: Date | null;        // null = unbounded (All time)
  end: Date;                 // exclusive
  prevStart: Date | null;    // prior equal-length window, [prevStart, prevEnd)
  prevEnd: Date | null;
  label: string;             // e.g. "2026 season", "Last 90 days"
  prevLabel: string;         // e.g. "2025 season", "prior 90 days"
}
export interface SeriesPoint { t: number; label: string; value: number }
export type Bucket = 'week' | 'month';
export interface Delta { pct: number | null; dir: 'up' | 'down' | 'flat' }
export type UpkeepTier = 'thriving' | 'okay' | 'attention' | 'nodata';
export type CohortKey = 'done' | 'onTrack' | 'behind';
export interface DuesHistoryRow { season: string; tier: string; amount: number }
export interface AnalyticsDataset {
  members: Member[]; plots: Plot[]; hours: VolunteerHour[];
  events: GardenEvent[]; threads: ForumThread[]; polls: Poll[];
  rsvpsByEvent: Record<string, Rsvp[]>;   // eventId → rsvps
  votesByPoll: Record<string, PollVote[]>; // pollId → votes
  duesHistory: DuesHistoryRow[];
  settings: OrgSettings;
}
```

Existing signatures you may reuse (do not re-implement): `computeDuesRollup(plots)` → `{expected, collected, outstanding, unpaid}` (`src/logic/dues.ts`); `waitlistOrder(members)` (`src/logic/waitlist.ts`); `yearToDateHours(entries, year)`, `hoursProgress(member, entries, settings, now)` (`src/logic/hours.ts`); `isPlotHeldBy(plot, memberId)` (`src/logic/plots.ts`); UI kit `Card, Button, Badge, Modal, Table, Th, Td` (`src/components/ui.tsx`).

In tests, fake Timestamps as `{ toDate: () => d, toMillis: () => d.getTime() } as any` (existing pattern in `Dashboard.test.tsx`).

---

### Task 1: Window & series math (`logic/analytics.ts` part 1)

**Files:**
- Create: `src/logic/analytics.ts`
- Create: `src/logic/analytics.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `TsLike`, `RangeKey`, `AnalyticsWindow`, `resolveWindow(key, now, seasonYear)`, `inRange(ts, start, end)`, `Bucket`, `bucketFor(key)`, `bucketSeries(items, start, end, bucket)`, `SeriesPoint`, `Delta`, `computeDelta(current, previous)`, `fmtCompact(n)`, `fmtCurrency(n)`, `fmtPct(n)` — exactly as typed below. Later tasks import these names verbatim.

- [ ] **Step 1: Write the failing tests**

```ts
// src/logic/analytics.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/logic/analytics.test.ts`
Expected: FAIL — `Failed to resolve import "./analytics"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/logic/analytics.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/logic/analytics.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/logic/analytics.ts src/logic/analytics.test.ts
git commit -m "feat(analytics): window resolution, bucketed series, delta math"
```

---

### Task 2: KPI & growth metrics (`logic/analytics.ts` part 2)

**Files:**
- Modify: `src/logic/analytics.ts` (append)
- Modify: `src/logic/analytics.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 exports; `computeDuesRollup` from `./dues`; types from `../lib/types` (type-only).
- Produces: `occupancyKpi(plots)`, `duesKpi(plots)`, `activeMembers(members)`, `joinDate(m)`, `memberGrowthSeries(members, w, bucket)`, `hoursTotal(hours, w)`, `hoursSeries(hours, w, bucket)`, `participationKpi(members, hours, w)`, `waitlistCount(members)`, `collectedSeries(plots, w, bucket)`, `topVolunteers(members, hours, w, n?)`, `hoursCohorts(members, hours, settings, now)`, `expectedHoursPace(settings, now)`, `DEFAULT_ORG_SETTINGS`.

- [ ] **Step 1: Write the failing tests** (append to `src/logic/analytics.test.ts`)

```ts
import {
  occupancyKpi, duesKpi, activeMembers, memberGrowthSeries, hoursTotal, hoursSeries,
  participationKpi, waitlistCount, collectedSeries, topVolunteers,
  hoursCohorts, expectedHoursPace, DEFAULT_ORG_SETTINGS, resolveWindow as rw,
} from './analytics';

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
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/logic/analytics.test.ts`
Expected: FAIL — missing exports (`occupancyKpi` etc.). Task 1 tests still pass.

- [ ] **Step 3: Write the implementation** (append to `src/logic/analytics.ts`)

```ts
import type { Member, Plot, VolunteerHour, OrgSettings } from '../lib/types';
import { computeDuesRollup } from './dues';

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  requiredHours: 12, firstHalfHours: 6, firstHalfMonths: 6,
  defaultDeposit: 25, currentSeason: '2026', contactEmail: '',
};

export function occupancyKpi(plots: Plot[]) {
  const occupied = plots.filter((p) => p.status === 'assigned').length;
  const total = plots.length;
  return { occupied, total, pct: total === 0 ? 0 : occupied / total };
}

export function duesKpi(plots: Plot[]) {
  const r = computeDuesRollup(plots);
  return { ...r, rate: r.expected === 0 ? 0 : r.collected / r.expected };
}

export function activeMembers(members: Member[]): Member[] {
  return members.filter((m) => m.status === 'active');
}

export function joinDate(m: Member): Date | null {
  const ts = (m.joinedAt ?? m.createdAt) as unknown as TsLike | undefined;
  return ts ? ts.toDate() : null;
}

export function memberGrowthSeries(members: Member[], w: AnalyticsWindow, bucket: Bucket): SeriesPoint[] {
  const joins = members
    .filter((m) => m.status !== 'pending')
    .map((m) => joinDate(m))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  const grid = bucketSeries([], w.start, w.end, bucket);
  return grid.map((p, i) => {
    const bucketEnd = i + 1 < grid.length ? grid[i + 1].t : w.end.getTime();
    return { ...p, value: joins.filter((d) => d.getTime() < bucketEnd).length };
  });
}

export function hoursTotal(hours: VolunteerHour[], w: AnalyticsWindow): number {
  return hours
    .filter((h) => inRange(h.date as unknown as TsLike, w.start, w.end))
    .reduce((s, h) => s + h.hours, 0);
}

export function hoursSeries(hours: VolunteerHour[], w: AnalyticsWindow, bucket: Bucket): SeriesPoint[] {
  const items = hours
    .filter((h) => inRange(h.date as unknown as TsLike, w.start, w.end))
    .map((h) => ({ at: (h.date as unknown as TsLike).toDate(), value: h.hours }));
  return bucketSeries(items, w.start, w.end, bucket);
}

export function participationKpi(members: Member[], hours: VolunteerHour[], w: AnalyticsWindow) {
  const act = activeMembers(members);
  const loggers = new Set(
    hours
      .filter((h) => inRange(h.date as unknown as TsLike, w.start, w.end))
      .map((h) => h.memberId),
  );
  const participated = act.filter((m) => loggers.has(m.id)).length;
  return { pct: act.length === 0 ? 0 : participated / act.length, participated, active: act.length };
}

export function waitlistCount(members: Member[]): number {
  return members.filter((m) => m.status === 'pending').length;
}

export function collectedSeries(plots: Plot[], w: AnalyticsWindow, bucket: Bucket): SeriesPoint[] {
  const items = plots
    .filter((p) => p.duesPaid && p.paidDate && inRange(p.paidDate as unknown as TsLike, w.start, w.end))
    .map((p) => ({ at: (p.paidDate as unknown as TsLike).toDate(), value: p.duesAmount || 0 }));
  return bucketSeries(items, w.start, w.end, bucket);
}

export function topVolunteers(members: Member[], hours: VolunteerHour[], w: AnalyticsWindow, n = 8) {
  const byMember = new Map<string, number>();
  for (const h of hours) {
    if (!inRange(h.date as unknown as TsLike, w.start, w.end)) continue;
    byMember.set(h.memberId, (byMember.get(h.memberId) ?? 0) + h.hours);
  }
  return members
    .map((m) => ({ member: m, hours: byMember.get(m.id) ?? 0 }))
    .filter((r) => r.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, n);
}

export type CohortKey = 'done' | 'onTrack' | 'behind';

/** Linear pace to firstHalfHours by end of June, then on to requiredHours by year-end. */
export function expectedHoursPace(settings: OrgSettings, now: Date): number {
  const year = now.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const midYear = Date.UTC(year, 6, 1);
  const yearEnd = Date.UTC(year + 1, 0, 1);
  const t = now.getTime();
  if (t <= midYear) {
    return settings.firstHalfHours * ((t - yearStart) / (midYear - yearStart));
  }
  return (
    settings.firstHalfHours +
    (settings.requiredHours - settings.firstHalfHours) * ((t - midYear) / (yearEnd - midYear))
  );
}

export function hoursCohorts(
  members: Member[], hours: VolunteerHour[], settings: OrgSettings, now: Date,
): Record<CohortKey, Member[]> {
  const year = now.getUTCFullYear();
  const pace = expectedHoursPace(settings, now);
  const byMember = new Map<string, number>();
  for (const h of hours) {
    const d = (h.date as unknown as TsLike).toDate();
    if (d.getUTCFullYear() !== year) continue;
    byMember.set(h.memberId, (byMember.get(h.memberId) ?? 0) + h.hours);
  }
  const out: Record<CohortKey, Member[]> = { done: [], onTrack: [], behind: [] };
  for (const m of activeMembers(members)) {
    const ytd = byMember.get(m.id) ?? 0;
    if (ytd >= settings.requiredHours) out.done.push(m);
    else if (ytd >= pace) out.onTrack.push(m);
    else out.behind.push(m);
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/logic/analytics.test.ts`
Expected: PASS. Also run `npx vitest run src/logic` — no regressions in dues/hours/waitlist suites.

- [ ] **Step 5: Commit**

```bash
git add src/logic/analytics.ts src/logic/analytics.test.ts
git commit -m "feat(analytics): KPI, growth, participation, cohort metrics"
```

---

### Task 3: Operations / finance / engagement helpers (`logic/analytics.ts` part 3)

**Files:**
- Modify: `src/logic/analytics.ts` (append)
- Modify: `src/logic/analytics.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 1–2 exports; types (type-only).
- Produces: `UpkeepTier`, `upkeepTier(plot, now)`, `upkeepDistribution(plots, now)`, `cropPopularity(plots, topN?)`, `TierRollup`, `duesByTier(plots)`, `DuesHistoryRow`, `currentSeasonDuesHistory(plots)`, `duesIncreaseTable(history)`, `splitPlotUtilization(plots)`, `threadsSeries(threads, w, bucket)`, `votesSeries(votes, w, bucket)`, `rsvpBreakdown(rsvps)`, `nextEvent(events, now)`, `openPollCount(polls, now)`, `AnalyticsDataset`, `KpiDatum`, `buildKpis(d, w, now)`.

- [ ] **Step 1: Write the failing tests** (append; reuse `plot`/`member`/`hour`/`T` helpers from Task 2)

```ts
import {
  upkeepTier, upkeepDistribution, cropPopularity, duesByTier,
  currentSeasonDuesHistory, duesIncreaseTable, splitPlotUtilization,
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
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/logic/analytics.test.ts`
Expected: FAIL — missing exports. Earlier suites still pass.

- [ ] **Step 3: Write the implementation** (append to `src/logic/analytics.ts`)

```ts
import type { GardenEvent, ForumThread, Poll, PollVote, Rsvp } from '../lib/types';

export type UpkeepTier = 'thriving' | 'okay' | 'attention' | 'nodata';

const DAYS_WATER_FRESH = 14;
const DAYS_PLANT_FRESH = 120;
const DAYS_WATER_STALE = 30;

export function upkeepTier(p: Plot, now: Date): UpkeepTier {
  const t = now.getTime();
  const watered = p.lastWateredAt ? (p.lastWateredAt as unknown as TsLike).toMillis() : null;
  const wateredFresh = watered !== null && t - watered <= DAYS_WATER_FRESH * 86400_000;
  const planted = (p.crops ?? [])
    .map((c) => (c.plantedOn ? (c.plantedOn as unknown as TsLike).toMillis() : null))
    .filter((x): x is number => x !== null);
  const plantedFresh = planted.some((x) => t - x <= DAYS_PLANT_FRESH * 86400_000);
  const hasCrops = (p.crops ?? []).length > 0;
  if (wateredFresh || plantedFresh) return 'thriving';
  if (hasCrops) return 'okay';
  if (watered !== null && t - watered > DAYS_WATER_STALE * 86400_000) return 'attention';
  return 'nodata';
}

export function upkeepDistribution(plots: Plot[], now: Date): Record<UpkeepTier, Plot[]> {
  const out: Record<UpkeepTier, Plot[]> = { thriving: [], okay: [], attention: [], nodata: [] };
  for (const p of plots) {
    if (p.status !== 'assigned') continue;
    out[upkeepTier(p, now)].push(p);
  }
  return out;
}

export function cropPopularity(plots: Plot[], topN = 8): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of plots) {
    for (const c of p.crops ?? []) {
      const name = c.name.trim().toLowerCase();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const sorted = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  if (sorted.length <= topN) return sorted;
  const head = sorted.slice(0, topN);
  const other = sorted.slice(topN).reduce((s, r) => s + r.count, 0);
  return [...head, { name: 'Other', count: other }];
}

export interface TierRollup {
  tier: string; amount: number; expected: number; collected: number;
  outstanding: number; plots: Plot[]; unpaid: Plot[];
}

export function duesByTier(plots: Plot[]): TierRollup[] {
  const assigned = plots.filter((p) => p.status === 'assigned');
  const byAmount = new Map<number, Plot[]>();
  for (const p of assigned) {
    const a = p.duesAmount || 0;
    byAmount.set(a, [...(byAmount.get(a) ?? []), p]);
  }
  return [...byAmount.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([amount, ps]) => {
      const collected = ps.filter((p) => p.duesPaid).reduce((s, p) => s + (p.duesAmount || 0), 0);
      const expected = ps.reduce((s, p) => s + (p.duesAmount || 0), 0);
      return {
        tier: `$${amount}`, amount, expected, collected,
        outstanding: expected - collected, plots: ps, unpaid: ps.filter((p) => !p.duesPaid),
      };
    });
}

export interface DuesHistoryRow { season: string; tier: string; amount: number }

export function currentSeasonDuesHistory(plots: Plot[]): DuesHistoryRow[] {
  return duesByTier(plots).map((t) => ({
    season: plots[0]?.season ?? '', tier: t.tier, amount: t.amount,
  }));
}

export function duesIncreaseTable(history: DuesHistoryRow[]) {
  const seasons = [...new Set(history.map((h) => h.season))].sort();
  const tiers = [...new Set(history.map((h) => h.tier))]
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const rows = tiers.map((tier) => {
    const amounts = seasons.map((s) => history.find((h) => h.season === s && h.tier === tier)?.amount ?? null);
    const pctChanges = amounts.map((a, i) => {
      if (i === 0 || a === null) return null;
      const prev = amounts[i - 1];
      if (prev === null || prev === 0) return null;
      return Math.round(((a - prev) / prev) * 100);
    });
    return { tier, amounts, pctChanges };
  });
  return { seasons, rows };
}

export function splitPlotUtilization(plots: Plot[]) {
  const wholes = plots.filter((p) => p.half === 'whole');
  const halves = plots.filter((p) => p.half !== 'whole');
  return {
    wholes: wholes.length,
    assignedWholes: wholes.filter((p) => p.status === 'assigned').length,
    halves: halves.length,
    assignedHalves: halves.filter((p) => p.status === 'assigned').length,
  };
}

function createdSeries(items: { createdAt?: unknown }[], w: AnalyticsWindow, bucket: Bucket): SeriesPoint[] {
  const pts = items
    .filter((x) => inRange(x.createdAt as TsLike | undefined, w.start, w.end))
    .map((x) => ({ at: (x.createdAt as TsLike).toDate(), value: 1 }));
  return bucketSeries(pts, w.start, w.end, bucket);
}

export function threadsSeries(threads: ForumThread[], w: AnalyticsWindow, bucket: Bucket): SeriesPoint[] {
  return createdSeries(threads, w, bucket);
}
export function votesSeries(votes: PollVote[], w: AnalyticsWindow, bucket: Bucket): SeriesPoint[] {
  return createdSeries(votes, w, bucket);
}

export function rsvpBreakdown(rsvps: Rsvp[]) {
  return {
    yes: rsvps.filter((r) => r.status === 'yes').length,
    maybe: rsvps.filter((r) => r.status === 'maybe').length,
    no: rsvps.filter((r) => r.status === 'no').length,
  };
}

export function nextEvent(events: GardenEvent[], now: Date): GardenEvent | null {
  const t = now.getTime();
  const upcoming = events
    .filter((e) => (e.end as unknown as TsLike).toMillis() > t)
    .sort((a, b) => (a.start as unknown as TsLike).toMillis() - (b.start as unknown as TsLike).toMillis());
  return upcoming[0] ?? null;
}

export function openPollCount(polls: Poll[], now: Date): number {
  const t = now.getTime();
  return polls.filter((p) => {
    if (p.closed) return false;
    if (!p.expiresAt) return true;
    return (p.expiresAt as unknown as TsLike).toMillis() > t;
  }).length;
}

export interface AnalyticsDataset {
  members: Member[]; plots: Plot[]; hours: VolunteerHour[];
  events: GardenEvent[]; threads: ForumThread[]; polls: Poll[];
  rsvpsByEvent: Record<string, Rsvp[]>;
  votesByPoll: Record<string, PollVote[]>;
  duesHistory: DuesHistoryRow[];
  settings: OrgSettings;
}

export interface KpiDatum {
  key: string;
  label: string;
  display: string;
  detail: string;
  delta: Delta | null;
  goodWhenUp: boolean;
  spark: number[] | null;
}

/** Six Overview tiles. Sparklines only where the metric has real history —
 * occupancy & waitlist are point-in-time, so they carry none. */
export function buildKpis(d: AnalyticsDataset, w: AnalyticsWindow, now: Date): KpiDatum[] {
  const bucket = bucketFor(w.key);
  const occ = occupancyKpi(d.plots);
  const dues = duesKpi(d.plots);
  const act = activeMembers(d.members);
  const part = participationKpi(d.members, d.hours, w);
  const hrs = hoursTotal(d.hours, w);
  const prevW: AnalyticsWindow | null = w.prevStart && w.prevEnd
    ? { ...w, start: w.prevStart, end: w.prevEnd, prevStart: null, prevEnd: null }
    : null;
  const prevHours = prevW ? hoursTotal(d.hours, prevW) : null;
  const prevPart = prevW ? participationKpi(d.members, d.hours, prevW) : null;
  const growth = memberGrowthSeries(d.members, w, bucket);
  const growthStart = growth[0]?.value ?? 0;
  const growthEnd = growth[growth.length - 1]?.value ?? 0;
  return [
    {
      key: 'occupancy', label: 'Plot occupancy', display: fmtPct(occ.pct),
      detail: `${occ.occupied} of ${occ.total} plots`, delta: null, goodWhenUp: true, spark: null,
    },
    {
      key: 'dues', label: 'Dues collected', display: fmtCurrency(dues.collected),
      detail: `${fmtPct(dues.rate)} of ${fmtCurrency(dues.expected)}`,
      delta: null, goodWhenUp: true,
      spark: collectedSeries(d.plots, w, bucket).map((p) => p.value),
    },
    {
      key: 'members', label: 'Active members', display: fmtCompact(act.length),
      detail: w.prevStart ? `${growthEnd - growthStart >= 0 ? '+' : ''}${growthEnd - growthStart} in ${w.label}` : 'all time',
      delta: computeDelta(growthEnd, growthStart || null), goodWhenUp: true,
      spark: growth.map((p) => p.value),
    },
    {
      key: 'participation', label: 'Participation rate', display: fmtPct(part.pct),
      detail: `${part.participated} of ${part.active} members logged hours`,
      delta: prevPart ? computeDelta(part.participated, prevPart.participated || null) : null,
      goodWhenUp: true,
      spark: hoursSeries(d.hours, w, bucket).map((p) => p.value),
    },
    {
      key: 'hours', label: 'Volunteer hours', display: fmtCompact(hrs),
      detail: w.label,
      delta: computeDelta(hrs, prevHours), goodWhenUp: true,
      spark: hoursSeries(d.hours, w, bucket).map((p) => p.value),
    },
    {
      key: 'waitlist', label: 'Waitlist', display: fmtCompact(waitlistCount(d.members)),
      detail: 'pending applications', delta: null, goodWhenUp: false, spark: null,
    },
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/logic/analytics.test.ts`
Expected: PASS (all three parts).

- [ ] **Step 5: Commit**

```bash
git add src/logic/analytics.ts src/logic/analytics.test.ts
git commit -m "feat(analytics): upkeep tiers, dues tiers/history, engagement series, KPI assembly"
```

---

### Task 4: Deterministic demo dataset (`demoData.ts`)

**Files:**
- Create: `src/features/analytics/demoData.ts`
- Create: `src/features/analytics/demoData.test.ts`

**Interfaces:**
- Consumes: `AnalyticsDataset`, `DuesHistoryRow`, `DEFAULT_ORG_SETTINGS` from `../../logic/analytics`; domain types (type-only).
- Produces: `mulberry32(seed): () => number`, `buildDemoDataset(now: Date): AnalyticsDataset`, `demoTs(d: Date): Timestamp` (fake — `{toDate, toMillis}` cast). No `firebase/firestore` runtime import.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/analytics/demoData.test.ts
import { describe, it, expect } from 'vitest';
import { buildDemoDataset, mulberry32 } from './demoData';
import { upkeepDistribution } from '../../logic/analytics';

const NOW = new Date(Date.UTC(2026, 7, 5, 12));

describe('mulberry32', () => {
  it('same seed → same sequence; values in [0,1)', () => {
    const a = mulberry32(42); const b = mulberry32(42);
    const seqA = [a(), a(), a()]; const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
    for (const v of seqA) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('buildDemoDataset', () => {
  it('is deterministic (deep-equal on JSON round-trip)', () => {
    const a = buildDemoDataset(NOW);
    const b = buildDemoDataset(NOW);
    expect(JSON.parse(JSON.stringify(a, tsSafe))).toEqual(JSON.parse(JSON.stringify(b, tsSafe)));
    function tsSafe(_k: string, v: unknown) {
      return v && typeof v === 'object' && 'toMillis' in (v as any) ? (v as any).toMillis() : v;
    }
  });
  it('has rich, plausible history', () => {
    const d = buildDemoDataset(NOW);
    expect(d.members.length).toBeGreaterThanOrEqual(60);
    expect(d.plots.length).toBe(42);
    expect(d.hours.length).toBeGreaterThan(200);
    expect(d.events.length).toBeGreaterThanOrEqual(20);
    expect(d.duesHistory.filter((r) => r.season === '2024').length).toBeGreaterThan(0);
    expect([...new Set(d.duesHistory.map((r) => r.season))].sort()).toEqual(['2024', '2025', '2026']);
    // most dues paid, some unpaid
    const assigned = d.plots.filter((p) => p.status === 'assigned');
    const paid = assigned.filter((p) => p.duesPaid);
    expect(paid.length / assigned.length).toBeGreaterThan(0.6);
    expect(paid.length).toBeLessThan(assigned.length);
    // every event has an rsvps entry; every poll has votes
    for (const e of d.events) expect(d.rsvpsByEvent[e.id]).toBeDefined();
    for (const p of d.polls) expect(d.votesByPoll[p.id]).toBeDefined();
    // hours span more than a year back
    const times = d.hours.map((h) => (h.date as any).toMillis());
    expect(Math.min(...times)).toBeLessThan(NOW.getTime() - 365 * 86400_000);
  });
  it('populates all four upkeep tiers', () => {
    const d = buildDemoDataset(NOW);
    const dist = upkeepDistribution(d.plots, NOW);
    expect(dist.thriving.length).toBeGreaterThan(0);
    expect(dist.okay.length).toBeGreaterThan(0);
    expect(dist.attention.length).toBeGreaterThan(0);
    expect(dist.nodata.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/analytics/demoData.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the implementation**

Full file (the shape matters more than exact constants — but keep counts/ratios in the tested ranges):

```ts
// src/features/analytics/demoData.ts
// Deterministic demo dataset for presentations. Same TypeScript shapes as
// production so the logic layer can't tell live from demo. No firebase
// runtime imports (component tests mock 'firebase/firestore' as {}).
import type { Timestamp } from 'firebase/firestore';
import type {
  Member, Plot, VolunteerHour, GardenEvent, ForumThread, Poll, PollVote, Rsvp,
} from '../../lib/types';
import { DEFAULT_ORG_SETTINGS, type AnalyticsDataset, type DuesHistoryRow } from '../../logic/analytics';

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoTs(d: Date): Timestamp {
  return { toDate: () => d, toMillis: () => d.getTime() } as unknown as Timestamp;
}

const FIRST = ['Ada','Rosa','Miguel','June','Theo','Priya','Sam','Lena','Omar','Nora','Eli','Maya','Ken','Iris','Joel','Faye','Hugo','Zoe','Ray','Tess','Ana','Beto','Cleo','Dev','Em','Gus','Hana','Ivan','Jade','Kai','Lior','Mona','Nico','Opal','Pia','Quinn','Rui','Sage','Tom','Uma','Vera','Wes','Ximena','Yara','Zed','Avery','Blair','Cruz','Dana','Ellis','Fern','Gray','Hollis','Indy','Jules','Kit','Lane','Marlo','Noel','Oakley','Parker','Reese','Skyler','Tatum','Vale','Winter','Arlo','Birdie','Cedar','Dove'];
const LAST = ['Rusnak','Widhalm','Harris','Nichols','Zimmermann','Good','Ellis','Vasquez','Okafor','Lindqvist','Marsh','Bell','Ito','Farid','Novak','Reyes','Stone','Klein','Bauer','Fox'];
const CROPS = ['tomato','kale','corn','squash','okra','basil','pepper','cucumber','zucchini','marigold','onion','strawberry','pumpkin','radish'];
const TIER_AMOUNTS = [35, 42, 55, 69];

export function buildDemoDataset(now: Date): AnalyticsDataset {
  const rand = mulberry32(20260805);
  const t = now.getTime();
  const daysAgo = (n: number) => new Date(t - n * 86400_000);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  // --- members: ~70 joining over ~2.5 years, seasonal clustering (spring-heavy)
  const members: Member[] = [];
  for (let i = 0; i < 70; i++) {
    const back = Math.floor(rand() * 900); // up to ~2.5y
    const joined = daysAgo(back);
    // nudge toward Feb–May: re-roll month once if it landed Jul–Dec
    const m = joined.getUTCMonth();
    const join2 = m >= 6 && rand() < 0.5
      ? new Date(Date.UTC(joined.getUTCFullYear(), Math.floor(rand() * 4) + 1, 1 + Math.floor(rand() * 27)))
      : joined;
    const name = `${FIRST[i % FIRST.length]} ${pick(LAST)}`;
    members.push({
      id: `demo-m${i}`, uid: `demo-m${i}`, email: `demo${i}@example.com`,
      displayName: name, role: 'member',
      status: i < 62 ? 'active' : 'pending',
      joinedAt: demoTs(join2 < now ? join2 : joined),
      createdAt: demoTs(join2 < now ? join2 : joined),
      currentYearHours: 0,
    });
  }

  // --- plots: 42, ~90% assigned; dues mostly paid; upkeep signals span all tiers
  const plots: Plot[] = [];
  for (let i = 1; i <= 42; i++) {
    const assigned = rand() < 0.9;
    const holder = assigned ? members[i % 60] : undefined;
    const amount = TIER_AMOUNTS[i % TIER_AMOUNTS.length];
    const duesPaid = assigned && rand() < 0.8;
    const upkeepRoll = rand();
    const crops = upkeepRoll < 0.75
      ? [
          // <0.4 band plants fresh (≤120d); the okay band plants stale (>130d)
          // so it can't leak into "thriving" via plantedFresh.
          { name: pick(CROPS), plantedOn: demoTs(daysAgo(upkeepRoll < 0.4 ? Math.floor(rand() * 100) + 10 : Math.floor(rand() * 200) + 130)) },
          { name: pick(CROPS) },
        ]
      : [];
    const lastWateredAt =
      upkeepRoll < 0.4 ? demoTs(daysAgo(Math.floor(rand() * 10) + 1))       // fresh → thriving
      : upkeepRoll >= 0.75 && upkeepRoll < 0.88 ? demoTs(daysAgo(45 + Math.floor(rand() * 60))) // stale, no crops → attention
      : undefined;                                                           // rest: okay / nodata
    plots.push({
      id: String(i), number: i, half: 'whole', size: `${amount}`,
      status: assigned ? 'assigned' : 'available',
      holderMemberId: holder?.id, holderMemberIds: holder ? [holder.id] : [],
      holderName: holder?.displayName,
      duesAmount: amount, depositAmount: 25,
      duesPaid, depositPaid: assigned,
      paidDate: duesPaid ? demoTs(daysAgo(Math.floor(rand() * 180) + 5)) : undefined,
      season: '2026',
      crops,
      ...(lastWateredAt ? { lastWateredAt } : {}),
    });
  }

  // --- volunteer hours: ~2.5y weekly entries, spring/fall peaks
  const hours: VolunteerHour[] = [];
  let hid = 0;
  for (let back = 900; back >= 0; back -= 7) {
    const d = daysAgo(back);
    const m = d.getUTCMonth();
    const seasonal = m >= 2 && m <= 5 ? 1.6 : m >= 8 && m <= 10 ? 1.3 : 0.7;
    const entries = Math.floor(rand() * 4 * seasonal);
    for (let e = 0; e < entries; e++) {
      const who = members[Math.floor(rand() * 62)];
      hours.push({
        id: `demo-h${hid++}`, memberId: who.id,
        date: demoTs(new Date(d.getTime() + Math.floor(rand() * 6) * 86400_000)),
        hours: 1 + Math.floor(rand() * 3),
        recordedBy: who.id, createdAt: demoTs(d),
      });
    }
  }

  // --- events + rsvps: ~30 events over 2.5y (a few upcoming), workday/meeting mix
  const events: GardenEvent[] = [];
  const rsvpsByEvent: Record<string, Rsvp[]> = {};
  for (let i = 0; i < 30; i++) {
    // i=0..27 spread over the past ~2.4y; the last two land in the future
    // (negative "days ago") so nextEvent() has something upcoming to show.
    const back = 880 - i * 30 - (i >= 28 ? 60 : 0) + Math.floor(rand() * 10);
    const start = daysAgo(back);
    const id = `demo-e${i}`;
    events.push({
      id, title: i % 2 ? 'Community workday' : 'Monthly meeting',
      type: i % 2 ? 'workday' : 'meeting',
      start: demoTs(start), end: demoTs(new Date(start.getTime() + 2 * 3600_000)),
      allDay: false, createdBy: 'demo-m0',
    });
    const n = 5 + Math.floor(rand() * 20);
    rsvpsByEvent[id] = Array.from({ length: n }, (_, j) => ({
      id: `demo-r${i}-${j}`,
      status: rand() < 0.6 ? 'yes' : rand() < 0.5 ? 'maybe' : 'no',
      displayName: members[j % 62].displayName,
      respondedAt: demoTs(daysAgo(Math.max(0, back - 3))),
    }));
  }

  // --- forum threads & polls
  const threads: ForumThread[] = Array.from({ length: 40 }, (_, i) => ({
    id: `demo-t${i}`, title: `Thread ${i}`, body: '…',
    authorId: members[i % 62].id, authorName: members[i % 62].displayName,
    createdAt: demoTs(daysAgo(Math.floor(rand() * 800))),
  }));
  const polls: Poll[] = Array.from({ length: 6 }, (_, i) => ({
    id: `demo-p${i}`, question: `Poll ${i}?`,
    options: [{ id: '0', text: 'Yes' }, { id: '1', text: 'No' }],
    createdAt: demoTs(daysAgo(60 + i * 120)), createdBy: 'demo-m0', authorName: 'Ada',
    closed: i > 3,
  }));
  const votesByPoll: Record<string, PollVote[]> = {};
  for (const p of polls) {
    const n = 8 + Math.floor(rand() * 30);
    votesByPoll[p.id] = Array.from({ length: n }, (_, j) => ({
      id: `demo-v${p.id}-${j}`, optionId: rand() < 0.6 ? '0' : '1',
      memberId: members[j % 62].id,
      createdAt: demoTs(daysAgo(Math.max(0, Math.floor(rand() * 100)))),
    }));
  }

  // --- three seasons of dues rates (the "dues increases" story)
  const duesHistory: DuesHistoryRow[] = [];
  const seasonRates: Record<string, number[]> = {
    '2024': [30, 36, 48, 60], '2025': [32, 39, 52, 65], '2026': TIER_AMOUNTS,
  };
  for (const [season, rates] of Object.entries(seasonRates)) {
    rates.forEach((amount, i) => {
      duesHistory.push({ season, tier: `$${TIER_AMOUNTS[i]}`, amount });
    });
  }

  return {
    members, plots, hours, events, threads, polls,
    rsvpsByEvent, votesByPoll, duesHistory,
    settings: DEFAULT_ORG_SETTINGS,
  };
}
```

Note: if the tier-population test (`attention`/`nodata` both > 0) fails due to the random draw, adjust the `upkeepRoll` thresholds — do NOT loosen the test. Determinism means one seed → one fixed outcome; tune thresholds until all four tiers are populated.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/analytics/demoData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics/demoData.ts src/features/analytics/demoData.test.ts
git commit -m "feat(analytics): deterministic demo dataset (seeded, 2.5y history)"
```

---

### Task 5: One-shot RSVP & vote fetchers

**Files:**
- Modify: `src/features/calendar/eventsApi.ts`
- Modify: `src/features/polls/pollsApi.ts`
- Modify: `src/features/calendar/eventsApi.test.ts` (append)
- Modify: `src/features/polls/pollsApi.test.ts` (append)

**Interfaces:**
- Consumes: `rsvpsCol(eventId)`, `votesCol(pollId)` from `src/data/collections.ts`; `getDocs` from firebase/firestore.
- Produces: `fetchRsvps(eventId: string): Promise<Rsvp[]>` (eventsApi), `fetchVotes(pollId: string): Promise<PollVote[]>` (pollsApi).

- [ ] **Step 1: Read both existing test files first** (`src/features/calendar/eventsApi.test.ts`, `src/features/polls/pollsApi.test.ts`) and follow their established mocking style exactly. Both already `vi.mock('firebase/firestore', …)` — **extend that factory** with a `getDocs: vi.fn()` entry (do not add a second mock call). Then append a failing test to each, shaped like this (adapt import style to the file's idiom):

```ts
// append to eventsApi.test.ts
it('fetchRsvps maps a one-shot getDocs snapshot', async () => {
  const { getDocs } = await import('firebase/firestore');
  vi.mocked(getDocs).mockResolvedValueOnce({
    docs: [{ data: () => ({ id: 'u1', status: 'yes', displayName: 'A' }) }],
  } as any);
  const { fetchRsvps } = await import('./eventsApi');
  const rsvps = await fetchRsvps('e1');
  expect(rsvps).toEqual([{ id: 'u1', status: 'yes', displayName: 'A' }]);
  expect(getDocs).toHaveBeenCalledTimes(1);
});
```

```ts
// append to pollsApi.test.ts
it('fetchVotes maps a one-shot getDocs snapshot', async () => {
  const { getDocs } = await import('firebase/firestore');
  vi.mocked(getDocs).mockResolvedValueOnce({
    docs: [{ id: 'u1', data: () => ({ optionId: '0', memberId: 'u1' }) }],
  } as any);
  const { fetchVotes } = await import('./pollsApi');
  const votes = await fetchVotes('p1');
  expect(votes).toEqual([{ id: 'u1', optionId: '0', memberId: 'u1' }]);
});
```

(`rsvpsCol`/`votesCol` come from `src/data/collections.ts`, which the existing mocks already neutralize — if they don't, mock `../../data/collections` with `rsvpsCol: vi.fn()` / `votesCol: vi.fn()`. The assertion that matters: one `getDocs` call, docs mapped to typed objects — `Rsvp` carries `id` inside `data()` via the converter; `PollVote` takes `id` from the doc id.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/calendar/eventsApi.test.ts src/features/polls/pollsApi.test.ts`
Expected: FAIL — `fetchRsvps` / `fetchVotes` not exported.

- [ ] **Step 3: Implement**

```ts
// eventsApi.ts — add getDocs to the firebase/firestore import list, then:
export async function fetchRsvps(eventId: string): Promise<Rsvp[]> {
  const snap = await getDocs(rsvpsCol(eventId));
  return snap.docs.map((d) => d.data());
}
```

```ts
// pollsApi.ts — add getDocs to the firebase/firestore import list, then:
export async function fetchVotes(pollId: string): Promise<PollVote[]> {
  const snap = await getDocs(votesCol(pollId));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PollVote, 'id'>) }));
}
```

- [ ] **Step 4: Run to verify pass** — same command. Expected: PASS, no regressions in either file.

- [ ] **Step 5: Commit**

```bash
git add src/features/calendar/eventsApi.ts src/features/calendar/eventsApi.test.ts src/features/polls/pollsApi.ts src/features/polls/pollsApi.test.ts
git commit -m "feat(analytics): one-shot fetchRsvps/fetchVotes for bounded engagement reads"
```

---

### Task 6: Viz tokens + analytics stylesheet + palette validation

**Files:**
- Create: `src/features/analytics/tokens.ts`
- Create: `src/features/analytics/analytics.css`

**Interfaces:**
- Consumes: nothing.
- Produces: `type VizMode = 'light' | 'dark'`; `VIZ: Record<VizMode, VizTokens>` where `VizTokens` has exactly: `surface, page, textPrimary, textSecondary, muted, grid, baseline, border, series1..series4, seqTrack, neutralFill, good, warning, serious, deltaUp, deltaDown, sparkLine, sparkDot`. CSS classes: `.alx-root` (+ `[data-mode='dark']`), `.alx-card`, `.alx-controls`, `.alx-tab`, `.alx-badge-demo`, `.alx-print-header`, print rules.

- [ ] **Step 1: Write `tokens.ts`** (values are the dataviz reference palette verbatim — do not invent hex):

```ts
// src/features/analytics/tokens.ts
// Reference dataviz palette (validated). Chart marks read these via props
// (SVG attributes can't resolve CSS vars); page chrome uses the same values
// as CSS custom properties in analytics.css — keep the two files in sync.
export type VizMode = 'light' | 'dark';

export interface VizTokens {
  surface: string; page: string;
  textPrimary: string; textSecondary: string; muted: string;
  grid: string; baseline: string; border: string;
  series1: string; series2: string; series3: string; series4: string;
  seqTrack: string;      // lighter step of the blue ramp (meter track)
  neutralFill: string;   // de-emphasis fill (outstanding remainder, "maybe")
  good: string; warning: string; serious: string;
  deltaUp: string; deltaDown: string;
  sparkLine: string; sparkDot: string;
}

export const VIZ: Record<VizMode, VizTokens> = {
  light: {
    surface: '#fcfcfb', page: '#f9f9f7',
    textPrimary: '#0b0b0b', textSecondary: '#52514e', muted: '#898781',
    grid: '#e1e0d9', baseline: '#c3c2b7', border: 'rgba(11,11,11,0.10)',
    series1: '#2a78d6', series2: '#eb6834', series3: '#1baf7a', series4: '#eda100',
    seqTrack: '#cde2fb', neutralFill: '#e1e0d9',
    good: '#0ca30c', warning: '#fab219', serious: '#ec835a',
    deltaUp: '#006300', deltaDown: '#d03b3b',
    sparkLine: '#c3c2b7', sparkDot: '#2a78d6',
  },
  dark: {
    surface: '#1a1a19', page: '#0d0d0d',
    textPrimary: '#ffffff', textSecondary: '#c3c2b7', muted: '#898781',
    grid: '#2c2c2a', baseline: '#383835', border: 'rgba(255,255,255,0.10)',
    series1: '#3987e5', series2: '#d95926', series3: '#199e70', series4: '#c98500',
    seqTrack: '#184f95', neutralFill: '#383835',
    good: '#0ca30c', warning: '#fab219', serious: '#ec835a',
    deltaUp: '#0ca30c', deltaDown: '#d03b3b',
    sparkLine: '#383835', sparkDot: '#3987e5',
  },
};

export const RED_POLE = { light: '#e34948', dark: '#e66767' }; // RSVP "no" (diverging pole, slot 8)
```

- [ ] **Step 2: Write `analytics.css`** — chrome vars, dark scope, print:

```css
/* src/features/analytics/analytics.css
   Values mirror tokens.ts (the dataviz reference palette). */
.alx-root {
  --alx-surface: #fcfcfb;
  --alx-page: #f9f9f7;
  --alx-text: #0b0b0b;
  --alx-text-2: #52514e;
  --alx-muted: #898781;
  --alx-grid: #e1e0d9;
  --alx-border: rgba(11, 11, 11, 0.1);
  --alx-accent: #2a78d6;
  background: var(--alx-page);
  color: var(--alx-text);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  margin: -1.5rem;            /* bleed over Layout's p-6 so the page plane is ours */
  padding: 1.5rem;
  min-height: calc(100vh - 3.5rem);
}
.alx-root[data-mode='dark'] {
  --alx-surface: #1a1a19;
  --alx-page: #0d0d0d;
  --alx-text: #ffffff;
  --alx-text-2: #c3c2b7;
  --alx-muted: #898781;
  --alx-grid: #2c2c2a;
  --alx-border: rgba(255, 255, 255, 0.1);
  --alx-accent: #3987e5;
}
.alx-card {
  background: var(--alx-surface);
  border: 1px solid var(--alx-border);
  border-radius: 1rem;
  padding: 1.25rem;
  break-inside: avoid;
}
.alx-tab {
  padding: 0.375rem 0.875rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--alx-text-2);
}
.alx-tab[aria-current='page'] {
  background: var(--alx-accent);
  color: #ffffff;
}
.alx-badge-demo {
  background: #fab219;
  color: #0b0b0b;
  font-weight: 700;
  font-size: 0.6875rem;
  letter-spacing: 0.05em;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}
.alx-print-header { display: none; }

@media print {
  /* Print exactly the analytics area, forced light, no app chrome. */
  body * { visibility: hidden; }
  .alx-root, .alx-root * { visibility: visible; }
  .alx-root {
    position: absolute; inset: 0 auto auto 0; width: 100%;
    margin: 0; padding: 1rem;
    --alx-surface: #fcfcfb; --alx-page: #ffffff; --alx-text: #0b0b0b;
    --alx-text-2: #52514e; --alx-muted: #898781; --alx-grid: #e1e0d9;
    --alx-border: rgba(11, 11, 11, 0.1); --alx-accent: #2a78d6;
  }
  .alx-controls, .alx-tabs { display: none !important; }
  .alx-print-header { display: block; margin-bottom: 1rem; }
  .alx-card { box-shadow: none; }
}
```

(Charts read hex from `tokens.ts` per mode, so printing forces light chrome; chart marks printed from dark mode keep dark-step hexes — acceptable, both step sets are print-legible. Do not attempt CSS vars inside Recharts props.)

- [ ] **Step 3: Validate the categorical slots — run, don't eyeball** (from repo root; the dataviz skill lives at the absolute path below):

```bash
node "C:\Users\brand\AppData\Local\Temp\claude\bundled-skills\2.1.222\d711f3f43b62e57d8509a40495706056\dataviz\scripts\validate_palette.js" "#2a78d6,#eb6834,#1baf7a,#eda100" --mode light
node "C:\Users\brand\AppData\Local\Temp\claude\bundled-skills\2.1.222\d711f3f43b62e57d8509a40495706056\dataviz\scripts\validate_palette.js" "#3987e5,#d95926,#199e70,#c98500" --mode dark --surface "#1a1a19"
```

Expected: exit 0 both runs (reference palette slots 1–4; WARNs about sub-3:1 light-mode contrast on aqua/yellow are the documented relief-rule case — our charts always pair those fills with visible value labels or the table view). If a run FAILs, the hexes were mistyped — re-copy from this plan.

- [ ] **Step 4: Typecheck** (no tests for pure constants/CSS):

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics/tokens.ts src/features/analytics/analytics.css
git commit -m "feat(analytics): viz tokens (reference palette) + themed/print stylesheet"
```

---

### Task 7: Shared components — KpiTile, DeltaBadge, Sparkline, ChartCard, EmptyState, DrilldownPanel

**Files:**
- Create: `src/features/analytics/components/DeltaBadge.tsx`
- Create: `src/features/analytics/components/Sparkline.tsx`
- Create: `src/features/analytics/components/KpiTile.tsx`
- Create: `src/features/analytics/components/ChartCard.tsx`
- Create: `src/features/analytics/components/DrilldownPanel.tsx`
- Create: `src/features/analytics/components/components.test.tsx`
- Modify: `src/features/analytics/analytics.css` (add `--alx-delta-good` to both mode scopes)

**Interfaces:**
- Consumes: `KpiDatum`, `Delta` from `../../../logic/analytics`; `VizTokens` from `../tokens`; `Modal, Table, Th, Td` from `../../../components/ui`.
- Produces (props are the contract for Tasks 10–13):
  - `DeltaBadge({ delta, goodWhenUp, prevLabel }: { delta: Delta | null; goodWhenUp: boolean; prevLabel: string })`
  - `Sparkline({ points, tokens }: { points: number[]; tokens: VizTokens })`
  - `KpiTile({ kpi, prevLabel, tokens }: { kpi: KpiDatum; prevLabel: string; tokens: VizTokens })`
  - `ChartCard({ title, subtitle?, empty?, table?, children }: { title: string; subtitle?: string; empty?: { when: boolean; message: string }; table?: { columns: string[]; rows: (string | number)[][] }; children: React.ReactNode })`
  - `DrilldownPanel({ open, onClose, title, columns, rows }: { open: boolean; onClose: () => void; title: string; columns: string[]; rows: { cells: (string | number)[]; href?: string }[] })`

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/analytics/components/components.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
vi.mock('firebase/firestore', () => ({}));
import { DeltaBadge } from './DeltaBadge';
import { KpiTile } from './KpiTile';
import { ChartCard } from './ChartCard';
import { DrilldownPanel } from './DrilldownPanel';
import { VIZ } from '../tokens';

describe('DeltaBadge', () => {
  it('renders signed pct with direction arrow', () => {
    render(<DeltaBadge delta={{ pct: 12, dir: 'up' }} goodWhenUp prevLabel="2025 season" />);
    expect(screen.getByText(/▲\s*12%/)).toBeInTheDocument();
    expect(screen.getByText(/vs 2025 season/)).toBeInTheDocument();
  });
  it('renders an em dash when no prior window', () => {
    render(<DeltaBadge delta={{ pct: null, dir: 'flat' }} goodWhenUp prevLabel="" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

describe('KpiTile', () => {
  it('shows label, value, detail, sparkline', () => {
    render(
      <KpiTile
        prevLabel="2025 season"
        tokens={VIZ.light}
        kpi={{ key: 'hours', label: 'Volunteer hours', display: '128', detail: '2026 season',
               delta: { pct: 5, dir: 'up' }, goodWhenUp: true, spark: [1, 2, 3] }}
      />,
    );
    expect(screen.getByText('Volunteer hours')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
    expect(document.querySelector('svg')).not.toBeNull(); // sparkline
  });
});

describe('ChartCard', () => {
  it('renders children normally and the empty state when empty.when', () => {
    const { rerender } = render(
      <ChartCard title="Hours"><div data-testid="chart" /></ChartCard>,
    );
    expect(screen.getByTestId('chart')).toBeInTheDocument();
    rerender(
      <ChartCard title="Hours" empty={{ when: true, message: 'No hours logged in this window' }}>
        <div data-testid="chart" />
      </ChartCard>,
    );
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
    expect(screen.getByText('No hours logged in this window')).toBeInTheDocument();
  });
  it('table toggle swaps chart for the table twin', () => {
    render(
      <ChartCard title="Hours" table={{ columns: ['Week', 'Hours'], rows: [['Mar 2', 4]] }}>
        <div data-testid="chart" />
      </ChartCard>,
    );
    fireEvent.click(screen.getByRole('button', { name: /table/i }));
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
    expect(screen.getByText('Mar 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /chart/i }));
    expect(screen.getByTestId('chart')).toBeInTheDocument();
  });
});

describe('DrilldownPanel', () => {
  it('lists rows with links when open', () => {
    render(
      <MemoryRouter>
        <DrilldownPanel
          open onClose={() => {}} title="Unpaid plots"
          columns={['Plot', 'Holder', 'Amount']}
          rows={[{ cells: ['12', 'Ada', '$42'], href: '/plots/12' }]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Unpaid plots')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /12/ })).toHaveAttribute('href', '/plots/12');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/features/analytics/components/components.test.tsx` → FAIL (modules missing).

- [ ] **Step 3: Implement the five components**

```tsx
// DeltaBadge.tsx
import type { Delta } from '../../../logic/analytics';

export function DeltaBadge({ delta, goodWhenUp, prevLabel }:
  { delta: Delta | null; goodWhenUp: boolean; prevLabel: string }) {
  if (!delta || delta.pct === null) {
    return <span className="text-xs" style={{ color: 'var(--alx-muted)' }}>—</span>;
  }
  const up = delta.dir === 'up';
  const flat = delta.dir === 'flat';
  const good = flat ? null : up === goodWhenUp;
  const color = flat ? 'var(--alx-muted)' : good ? 'var(--alx-delta-good, #006300)' : '#d03b3b';
  const arrow = flat ? '■' : up ? '▲' : '▼';
  return (
    <span className="text-xs font-medium inline-flex items-baseline gap-1">
      <span style={{ color }}>{arrow} {Math.abs(delta.pct)}%</span>
      {prevLabel && <span style={{ color: 'var(--alx-muted)' }}>vs {prevLabel}</span>}
    </span>
  );
}
```

(Add `--alx-delta-good: #006300;` to `.alx-root` and `--alx-delta-good: #0ca30c;` to the dark scope in `analytics.css` as part of this task.)

```tsx
// Sparkline.tsx — 12-bucket hand-SVG line, de-emphasis gray + accent end dot
import type { VizTokens } from '../tokens';

export function Sparkline({ points, tokens }: { points: number[]; tokens: VizTokens }) {
  if (points.length < 2) return null;
  const w = 96, h = 28, pad = 3;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (v: number) => h - pad - ((v - min) * (h - 2 * pad)) / (max - min || 1);
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lastX = x(points.length - 1), lastY = y(points[points.length - 1]);
  return (
    <svg width={w} height={h} aria-hidden="true">
      <path d={d} fill="none" stroke={tokens.sparkLine} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={4} fill={tokens.sparkDot} stroke={tokens.surface} strokeWidth={2} />
    </svg>
  );
}
```

```tsx
// KpiTile.tsx — the stat-tile contract: label / value / delta / trend
import type { KpiDatum } from '../../../logic/analytics';
import type { VizTokens } from '../tokens';
import { DeltaBadge } from './DeltaBadge';
import { Sparkline } from './Sparkline';

export function KpiTile({ kpi, prevLabel, tokens }:
  { kpi: KpiDatum; prevLabel: string; tokens: VizTokens }) {
  return (
    <div className="alx-card flex flex-col gap-1.5">
      <p className="text-xs font-medium" style={{ color: 'var(--alx-text-2)' }}>{kpi.label}</p>
      <p className="text-3xl font-semibold leading-none" style={{ color: 'var(--alx-text)' }}>{kpi.display}</p>
      <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>{kpi.detail}</p>
      <div className="flex items-end justify-between gap-2 mt-1">
        <DeltaBadge delta={kpi.delta} goodWhenUp={kpi.goodWhenUp} prevLabel={prevLabel} />
        {kpi.spark && <Sparkline points={kpi.spark} tokens={tokens} />}
      </div>
    </div>
  );
}
```

```tsx
// ChartCard.tsx — titled card with empty state + table-view twin
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Table, Th, Td } from '../../../components/ui';

export function ChartCard({ title, subtitle, empty, table, children }: {
  title: string; subtitle?: string;
  empty?: { when: boolean; message: string };
  table?: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  const isEmpty = empty?.when ?? false;
  return (
    <section className="alx-card flex flex-col gap-3">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--alx-text)' }}>{title}</h3>
          {subtitle && <p className="text-xs" style={{ color: 'var(--alx-muted)' }}>{subtitle}</p>}
        </div>
        {table && !isEmpty && (
          <button
            type="button"
            onClick={() => setShowTable((s) => !s)}
            className="text-xs px-2 py-1 rounded-md border"
            style={{ borderColor: 'var(--alx-border)', color: 'var(--alx-text-2)' }}
          >
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </header>
      {isEmpty ? (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--alx-muted)' }}>{empty!.message}</p>
      ) : showTable && table ? (
        <Table>
          <thead><tr>{table.columns.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>{r.map((cell, j) => (
                <Td key={j} className={j > 0 ? 'tabular-nums' : ''}>{cell}</Td>
              ))}</tr>
            ))}
          </tbody>
        </Table>
      ) : children}
    </section>
  );
}
```

```tsx
// DrilldownPanel.tsx — click-through list on top of the existing Modal
import { Link } from 'react-router-dom';
import { Modal, Table, Th, Td } from '../../../components/ui';

export function DrilldownPanel({ open, onClose, title, columns, rows }: {
  open: boolean; onClose: () => void; title: string;
  columns: string[]; rows: { cells: (string | number)[]; href?: string }[];
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <Table>
        <thead><tr>{columns.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.cells.map((cell, j) => (
                <Td key={j} className={j > 0 ? 'tabular-nums' : ''}>
                  {j === 0 && r.href
                    ? <Link className="underline text-garden-700" to={r.href}>{cell}</Link>
                    : cell}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </Modal>
  );
}
```

Note the ChartCard/KpiTile/DrilldownPanel use inline `style` with CSS vars for themed chrome (Tailwind classes only for spacing/typography) — Tailwind's palette is NOT used inside the analytics area except the `text-garden-700` link accent.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/features/analytics/components/components.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics/components src/features/analytics/analytics.css
git commit -m "feat(analytics): KpiTile, ChartCard w/ table twin, DrilldownPanel, sparkline"
```

---

### Task 8: `useAnalyticsData` hook

**Files:**
- Create: `src/features/analytics/useAnalyticsData.ts`
- Create: `src/features/analytics/useAnalyticsData.test.tsx`

**Interfaces:**
- Consumes: `listenPlots` (`../plots/plotsApi`), `listenMembers` (`../members/membersApi`), `listenAllHours` (`../hours/hoursApi`), `listenEvents`, `fetchRsvps` (`../calendar/eventsApi`), `listenThreads` (`../forum/forumApi`), `listenPolls`, `fetchVotes` (`../polls/pollsApi`), `listenSettings` (`../settings/settingsApi`), `buildDemoDataset` (`./demoData`), `AnalyticsDataset`, `currentSeasonDuesHistory`, `DEFAULT_ORG_SETTINGS` (`../../logic/analytics`).
- Produces: `useAnalyticsData(demo: boolean, now: Date): { data: AnalyticsDataset | null; error: string | null }` — `data` is null while loading; in demo mode it is the demo dataset immediately (memoized on `now`).

Behavior contract:
- Demo mode: no listeners at all; `data = useMemo(() => buildDemoDataset(now), [now])` when `demo`.
- Live mode: subscribe to the 7 listeners; when events/polls arrive, one-shot `fetchRsvps` per event and `fetchVotes` per poll (Promise.all, results keyed by id; on rejection use `{}` and set a non-fatal `error`). `settings` null → `DEFAULT_ORG_SETTINGS`. `duesHistory = currentSeasonDuesHistory(plots)`. `data` stays null until members+plots+hours have all delivered once (events/threads/polls default `[]` if not yet arrived — don't block first paint on them).
- All unsubscribes returned on cleanup; switching `demo` true→false re-subscribes.

- [ ] **Step 1: Write the failing tests** — mock every API module (Dashboard.test.tsx idiom: `vi.mock('../plots/plotsApi', () => ({ listenPlots: vi.fn() }))` etc., `vi.mock('firebase/firestore', () => ({}))`), render a probe component that calls the hook and prints `data === null ? 'loading' : data.members.length`:

```tsx
// src/features/analytics/useAnalyticsData.test.tsx (essential cases)
it('demo mode returns the demo dataset without touching listeners', () => {
  render(<Probe demo />);
  expect(screen.getByText('70')).toBeInTheDocument();       // demo member count
  expect(mockedListenMembers).not.toHaveBeenCalled();
});
it('live mode assembles the dataset from listeners', async () => {
  // arrange each mocked listener to synchronously cb() fixtures and return vi.fn()
  render(<Probe demo={false} />);
  expect(await screen.findByText('2')).toBeInTheDocument(); // fixture member count
});
it('live mode falls back to DEFAULT_ORG_SETTINGS when settings doc is absent', async () => {
  // listenSettings cb(null); probe prints data.settings.requiredHours
  render(<ProbeSettings demo={false} />);
  expect(await screen.findByText('12')).toBeInTheDocument();
});
it('unsubscribes everything on unmount', () => {
  const unsub = vi.fn();
  // every mocked listener returns unsub
  const { unmount } = render(<Probe demo={false} />);
  unmount();
  expect(unsub).toHaveBeenCalledTimes(7);
});
```

- [ ] **Step 2: Run to verify failure** → module missing.

- [ ] **Step 3: Implement**

```ts
// src/features/analytics/useAnalyticsData.ts
import { useEffect, useMemo, useState } from 'react';
import { listenPlots } from '../plots/plotsApi';
import { listenMembers } from '../members/membersApi';
import { listenAllHours } from '../hours/hoursApi';
import { listenEvents, fetchRsvps } from '../calendar/eventsApi';
import { listenThreads } from '../forum/forumApi';
import { listenPolls, fetchVotes } from '../polls/pollsApi';
import { listenSettings } from '../settings/settingsApi';
import {
  DEFAULT_ORG_SETTINGS, currentSeasonDuesHistory, type AnalyticsDataset,
} from '../../logic/analytics';
import { buildDemoDataset } from './demoData';
import type { Member, Plot, VolunteerHour, GardenEvent, ForumThread, Poll, OrgSettings, Rsvp, PollVote } from '../../lib/types';

export function useAnalyticsData(demo: boolean, now: Date): { data: AnalyticsDataset | null; error: string | null } {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [hours, setHours] = useState<VolunteerHour[] | null>(null);
  const [events, setEvents] = useState<GardenEvent[]>([]);
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [rsvpsByEvent, setRsvpsByEvent] = useState<Record<string, Rsvp[]>>({});
  const [votesByPoll, setVotesByPoll] = useState<Record<string, PollVote[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    const unsubs = [
      listenMembers(setMembers),
      listenPlots(setPlots),
      listenAllHours(setHours),
      listenEvents(setEvents),
      listenThreads(setThreads),
      listenPolls(setPolls),
      listenSettings(setSettings),
    ];
    return () => unsubs.forEach((u) => u());
  }, [demo]);

  useEffect(() => {
    if (demo || events.length === 0) return;
    let cancelled = false;
    Promise.all(events.map(async (e) => [e.id, await fetchRsvps(e.id)] as const))
      .then((pairs) => { if (!cancelled) setRsvpsByEvent(Object.fromEntries(pairs)); })
      .catch(() => { if (!cancelled) setError('Some RSVP counts failed to load'); });
    return () => { cancelled = true; };
  }, [demo, events]);

  useEffect(() => {
    if (demo || polls.length === 0) return;
    let cancelled = false;
    Promise.all(polls.map(async (p) => [p.id, await fetchVotes(p.id)] as const))
      .then((pairs) => { if (!cancelled) setVotesByPoll(Object.fromEntries(pairs)); })
      .catch(() => { if (!cancelled) setError('Some poll votes failed to load'); });
    return () => { cancelled = true; };
  }, [demo, polls]);

  const demoData = useMemo(() => (demo ? buildDemoDataset(now) : null), [demo, now]);

  if (demo) return { data: demoData, error: null };
  if (members === null || plots === null || hours === null) return { data: null, error };
  return {
    data: {
      members, plots, hours, events, threads, polls,
      rsvpsByEvent, votesByPoll,
      duesHistory: currentSeasonDuesHistory(plots),
      settings: settings ?? DEFAULT_ORG_SETTINGS,
    },
    error,
  };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/features/analytics/useAnalyticsData.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics/useAnalyticsData.ts src/features/analytics/useAnalyticsData.test.tsx
git commit -m "feat(analytics): useAnalyticsData hook (live listeners / demo swap upstream)"
```

---

### Task 9: Page shell, routing, nav — and install Recharts

**Files:**
- Create: `src/features/analytics/AnalyticsPage.tsx`
- Create: `src/features/analytics/AnalyticsPage.test.tsx`
- Create: `src/features/analytics/tabs/OverviewTab.tsx` (stub this task, real in Task 10)
- Create: `src/features/analytics/tabs/FinanceTab.tsx` (stub)
- Create: `src/features/analytics/tabs/OperationsTab.tsx` (stub)
- Create: `src/features/analytics/tabs/EngagementTab.tsx` (stub)
- Modify: `src/App.tsx` (add lazy route)
- Modify: `src/components/Layout.tsx:25-31` (add nav item)
- Modify: `src/features/dashboard/Dashboard.tsx` (add "Open Analytics →" link card in AdminDashboard grid)

**Interfaces:**
- Consumes: `useAnalyticsData`, `resolveWindow`, `bucketFor`, `RangeKey`, `AnalyticsWindow`, `AnalyticsDataset`, `VIZ`, `VizMode`, `VizTokens`.
- Produces: the outlet context contract every tab consumes via `useAlx()`:

```ts
// exported from AnalyticsPage.tsx
export interface AlxContext {
  data: AnalyticsDataset;      // non-null: shell gates rendering until loaded
  w: AnalyticsWindow;
  bucket: Bucket;
  tokens: VizTokens;
  mode: VizMode;
  now: Date;
  demo: boolean;
}
export function useAlx(): AlxContext   // wraps useOutletContext<AlxContext>()
```

Each stub tab: `export default function OverviewTab() { const { w } = useAlx(); return <p data-testid="tab-overview">Overview — {w.label}</p>; }` (same pattern, unique testid, for all four).

- [ ] **Step 1: Install Recharts** (needed by Tasks 10–13; installing here keeps those tasks pure-code):

Run: `npm install recharts@^2.15.4`
Then: `npx tsc --noEmit` — expected clean.

- [ ] **Step 2: Write the failing tests**

```tsx
// src/features/analytics/AnalyticsPage.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('firebase/firestore', () => ({}));
// mock ALL api modules exactly like useAnalyticsData.test.tsx, with fixtures:
// 2 members (1 active, 1 pending), 2 plots, 1 hours entry, empty events/threads/polls, settings null.
import AnalyticsPage from './AnalyticsPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/analytics/*" element={<AnalyticsPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { localStorage.clear(); /* + reset mocks to fixtures */ });

it('renders the Overview tab by default with header controls', () => {
  renderAt('/analytics');
  expect(screen.getByTestId('tab-overview')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /print committee report/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/demo data/i)).toBeInTheDocument();
});
it('routes tabs by URL', () => {
  renderAt('/analytics/finance');
  expect(screen.getByTestId('tab-finance')).toBeInTheDocument();
});
it('date-range change reaches tabs through context', () => {
  renderAt('/analytics');
  fireEvent.click(screen.getByRole('button', { name: /last 90 days/i }));
  expect(screen.getByTestId('tab-overview')).toHaveTextContent('Last 90 days');
});
it('demo toggle shows the DEMO DATA badge and persists', () => {
  renderAt('/analytics');
  fireEvent.click(screen.getByLabelText(/demo data/i));
  expect(screen.getByText('DEMO DATA')).toBeInTheDocument();
  expect(localStorage.getItem('alx-demo')).toBe('1');
});
it('theme toggle flips data-mode and persists', () => {
  const { container } = renderAt('/analytics');
  fireEvent.click(screen.getByRole('button', { name: /dark/i }));
  expect(container.querySelector('.alx-root')!.getAttribute('data-mode')).toBe('dark');
  expect(localStorage.getItem('alx-mode')).toBe('dark');
});
```

- [ ] **Step 3: Run to verify failure** → modules missing.

- [ ] **Step 4: Implement the shell**

```tsx
// src/features/analytics/AnalyticsPage.tsx
import { useMemo, useState } from 'react';
import { NavLink, Outlet, Route, Routes, useOutletContext } from 'react-router-dom';
import './analytics.css';
import { useAnalyticsData } from './useAnalyticsData';
import {
  resolveWindow, bucketFor,
  type RangeKey, type AnalyticsWindow, type AnalyticsDataset, type Bucket,
} from '../../logic/analytics';
import { VIZ, type VizMode, type VizTokens } from './tokens';
import OverviewTab from './tabs/OverviewTab';
import FinanceTab from './tabs/FinanceTab';
import OperationsTab from './tabs/OperationsTab';
import EngagementTab from './tabs/EngagementTab';

export interface AlxContext {
  data: AnalyticsDataset; w: AnalyticsWindow; bucket: Bucket;
  tokens: VizTokens; mode: VizMode; now: Date; demo: boolean;
}
export function useAlx(): AlxContext {
  return useOutletContext<AlxContext>();
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'season', label: 'This season' },
  { key: 'last90', label: 'Last 90 days' },
  { key: 'last12mo', label: 'Last 12 months' },
  { key: 'all', label: 'All time' },
];
const TABS = [
  { to: '/analytics', end: true, label: 'Overview' },
  { to: '/analytics/finance', end: false, label: 'Finance' },
  { to: '/analytics/operations', end: false, label: 'Operations' },
  { to: '/analytics/engagement', end: false, label: 'Engagement' },
];

function Shell() {
  const now = useMemo(() => new Date(), []);
  const [range, setRange] = useState<RangeKey>('season');
  const [demo, setDemo] = useState(() => localStorage.getItem('alx-demo') === '1');
  const [mode, setMode] = useState<VizMode>(() => (localStorage.getItem('alx-mode') === 'dark' ? 'dark' : 'light'));
  const { data, error } = useAnalyticsData(demo, now);

  const seasonYear = Number(data?.settings.currentSeason) || now.getUTCFullYear();
  const w = useMemo(() => resolveWindow(range, now, seasonYear), [range, now, seasonYear]);

  const toggleDemo = () => setDemo((d) => { localStorage.setItem('alx-demo', d ? '0' : '1'); return !d; });
  const toggleMode = () => setMode((m) => {
    const next = m === 'light' ? 'dark' : 'light';
    localStorage.setItem('alx-mode', next);
    return next;
  });

  return (
    <div className="alx-root" data-mode={mode}>
      <div className="alx-print-header">
        <h1 className="text-xl font-bold">South Austin Community Garden — Committee Report</h1>
        <p className="text-sm" style={{ color: 'var(--alx-text-2)' }}>
          {w.label} · generated {now.toLocaleDateString('en-US', { dateStyle: 'long' })}
          {demo ? ' · DEMO DATA' : ''}
        </p>
      </div>

      <div className="alx-controls flex flex-wrap items-center gap-3 mb-4">
        <h1 className="text-xl font-bold mr-2">Analytics</h1>
        {demo && <span className="alx-badge-demo">DEMO DATA</span>}
        <div className="flex gap-1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.key} type="button" onClick={() => setRange(r.key)}
              className="alx-tab" aria-current={range === r.key ? 'page' : undefined}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <label className="text-xs flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--alx-text-2)' }}>
            <input type="checkbox" checked={demo} onChange={toggleDemo} aria-label="Demo data" />
            Demo data
          </label>
          <button type="button" onClick={toggleMode} className="alx-tab" aria-label={mode === 'light' ? 'Dark' : 'Light'}>
            {mode === 'light' ? '🌙 Dark' : '☀️ Light'}
          </button>
          <button type="button" onClick={() => window.print()} className="alx-tab" style={{ border: '1px solid var(--alx-border)' }}>
            🖨 Print committee report
          </button>
        </div>
      </div>

      <nav className="alx-tabs flex gap-1 mb-5" aria-label="Dashboard sections">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="alx-tab">{t.label}</NavLink>
        ))}
      </nav>

      {error && <p className="text-xs mb-3" style={{ color: '#d03b3b' }}>{error}</p>}

      {data === null ? (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="alx-card animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <Outlet context={{ data, w, bucket: bucketFor(range), tokens: VIZ[mode], mode, now, demo } satisfies AlxContext} />
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<OverviewTab />} />
        <Route path="finance" element={<FinanceTab />} />
        <Route path="operations" element={<OperationsTab />} />
        <Route path="engagement" element={<EngagementTab />} />
      </Route>
    </Routes>
  );
}
```

`NavLink` gets `aria-current="page"` automatically when active — the `.alx-tab[aria-current='page']` CSS handles both tabs and range buttons.

- [ ] **Step 5: Wire the route, nav, and dashboard link**

In `src/App.tsx`, next to the `WholeGardenPage` lazy import:

```tsx
const AnalyticsPage = lazy(() => import('./features/analytics/AnalyticsPage'));
```

Inside the `<Route element={<RequireAdmin />}>` block (with the other admin routes):

```tsx
<Route
  path="/analytics/*"
  element={
    <Suspense fallback={<div className="p-6 text-gray-500 text-sm">Loading analytics…</div>}>
      <AnalyticsPage />
    </Suspense>
  }
/>
```

In `src/components/Layout.tsx`, `adminNavItems` gains a first entry:

```ts
const adminNavItems: NavItem[] = [
  { to: '/analytics', label: 'Analytics' },
  { to: '/members', label: 'Members' },
  // …existing entries unchanged
];
```

In `src/features/dashboard/Dashboard.tsx` `AdminDashboard`, append one card to the existing grid (after the Community hours card):

```tsx
<Card title="Analytics">
  <p className="text-sm text-gray-500">Occupancy, dues, participation & upkeep — committee-ready.</p>
  <Link to="/analytics">
    <Button variant="secondary" className="mt-4 w-full">Open Analytics →</Button>
  </Link>
</Card>
```

- [ ] **Step 6: Run to verify pass**

Run: `npx vitest run src/features/analytics/AnalyticsPage.test.tsx src/components/Layout.test.tsx src/features/dashboard/Dashboard.test.tsx`
Expected: PASS (Layout/Dashboard suites must not regress; if Layout.test asserts the exact nav list, update it to include Analytics).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/features/analytics src/App.tsx src/components/Layout.tsx src/features/dashboard/Dashboard.tsx
git commit -m "feat(analytics): /analytics shell — tabs, range filter, demo/theme toggles, print header, lazy route"
```

---

### Task 10: Overview tab

**Files:**
- Modify: `src/features/analytics/tabs/OverviewTab.tsx` (replace stub)
- Create: `src/features/analytics/tabs/OverviewTab.test.tsx`

**Interfaces:**
- Consumes: `useAlx()`; `buildKpis`, `memberGrowthSeries`, `hoursSeries`, `duesKpi`, `occupancyKpi`, `nextEvent`, `rsvpBreakdown`, `openPollCount`, `fmtCurrency`, `fmtPct`; `KpiTile`, `ChartCard`; Recharts (`ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip`).
- Produces: default export `OverviewTab`.

Layout (top→bottom): KPI row (6 tiles, `grid-cols-2 lg:grid-cols-6`); 2×2 hero grid (`lg:grid-cols-2`): member growth line · weekly/monthly hours columns · dues collection meter · plot status stacked bar; activity strip (3 small cards).

Chart specs (dataviz):
- **Member growth**: single-series line, `stroke=tokens.series1`, `strokeWidth=2`, `dot=false`, end dot via `activeDot`; no legend (title carries it); `CartesianGrid stroke=tokens.grid vertical={false}`; axes tick fill `tokens.muted`, `axisLine={{ stroke: tokens.baseline }}`, `tickLine=false`; crosshair tooltip (`Tooltip cursor={{ stroke: tokens.baseline }}`). Table twin: bucket label / members.
- **Hours**: single-series `Bar fill=tokens.series1 barSize={20} radius={[4,4,0,0]}`; per-mark tooltip (`cursor={{ fill: 'transparent' }}`); table twin.
- **Dues meter** (single ratio vs limit): NOT Recharts — a hand-rolled meter div: track `background: tokens.seqTrack`, fill `tokens.series1`, height 12px, radius 6px; headline `fmtCurrency(collected)` + `of {fmtCurrency(expected)} · {fmtPct(rate)}` as text. Empty state (`expected === 0`): "No dues configured".
- **Plot status**: one horizontal stacked bar (`layout="vertical"`, single row) — segments assigned/available/reserved/inactive in slots 1–4 with `stroke=tokens.surface strokeWidth={2}` (the surface gap); legend (4 series) as small swatch+label row (text tokens, not colored text); counts direct-labeled when segment wide enough, tooltip + table twin always.
- **Activity strip**: "Next event" (title, date, `{yes} yes · {maybe} maybe` from `rsvpBreakdown(rsvpsByEvent[ev.id] ?? [])`), "Newest threads" (top 3 titles by createdAt), "Open polls" (`openPollCount`). Plain cards, no charts.

- [ ] **Step 1: Write the failing tests** — same mocking approach as AnalyticsPage.test (render `<AnalyticsPage/>` at `/analytics` with fixtures; Recharts renders empty in jsdom, so assert on tiles/cards/tables):

```tsx
it('renders six KPI tiles', () => {
  renderAt('/analytics');
  for (const label of ['Plot occupancy', 'Dues collected', 'Active members', 'Participation rate', 'Volunteer hours', 'Waitlist']) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
});
it('renders the four hero chart cards + activity strip', () => {
  renderAt('/analytics');
  // default range = This season → monthly buckets → "by month"
  for (const title of ['Member growth', 'Volunteer hours by month', 'Dues collection', 'Plot status', 'Next event', 'Newest threads', 'Open polls']) {
    expect(screen.getByText(new RegExp(title, 'i'))).toBeInTheDocument();
  }
});
it('shows chart empty state when no hours in window', () => {
  // fixtures with hours: []
  renderAt('/analytics');
  expect(screen.getByText(/no hours logged in this window/i)).toBeInTheDocument();
});
```

(Title says "by week" for last90 and "by month" otherwise — compute `Volunteer hours by ${bucket}`; test against the default range's variant.)

- [ ] **Step 2: Run to verify failure** (stub still renders).
- [ ] **Step 3: Implement per the specs above.** Keep every color from `tokens`; text via CSS vars. Legend swatches: 10×10 rounded-sm div + text-xs label in `--alx-text-2`.
- [ ] **Step 4: Run to verify pass** — `npx vitest run src/features/analytics`.
- [ ] **Step 5: Commit** — `git commit -m "feat(analytics): Overview tab — KPI row, growth/hours/dues/status heroes, activity strip"`

---

### Task 11: Finance tab

**Files:**
- Modify: `src/features/analytics/tabs/FinanceTab.tsx` (replace stub)
- Create: `src/features/analytics/tabs/FinanceTab.test.tsx`

**Interfaces:**
- Consumes: `useAlx()`; `duesByTier`, `duesIncreaseTable`, `collectedSeries`, `duesKpi`, `fmtCurrency`; `ChartCard`, `DrilldownPanel`; Recharts.
- Produces: default export `FinanceTab`.

Widgets:
1. **Dues by size tier** — vertical grouped→stacked columns: one column per tier (`$35/$42/$55/$69`), stacked collected (`tokens.series1`) + outstanding (`tokens.neutralFill`), surface-gap strokes, legend (2 series), value labels on caps (`fmtCurrency(expected)`), tooltip, table twin (Tier/Collected/Outstanding/Total). **Clicking a column's outstanding segment (or the bar when fully unpaid) opens `DrilldownPanel`** titled `Unpaid — ${tier}` with rows `[plot.id, holderName ?? '—', fmtCurrency(duesAmount)]`, `href: /plots/{id}` (Recharts `onClick` on the outstanding `<Bar>`; payload carries the tier row → look up its `unpaid`).
2. **Collection over time** — cumulative line from `collectedSeries` (running sum before render), single series blue, empty state "No payments recorded in this window" (real data today: all-unpaid → the empty state shows; demo shows a rich curve).
3. **Deposits** — hand-rolled meter (same pattern as dues meter): deposits collected = assigned plots with `depositPaid` × `depositAmount`; track `seqTrack`, fill `series1`.
4. **Dues rates by season** ("dues increases") — `ChartCard` with **table only** (no chart): columns = seasons, rows = tiers, cells `fmtCurrency(amount)` + pct badge (`▲ n%` in `--alx-delta-good`... no — increases in cost are neutral, not "good": render pct in `--alx-text-2`, no color judgement), `tabular-nums`. Subtitle: real mode `"One season of recorded rates"` when only one season exists.

- [ ] **Step 1: Write the failing tests** — same harness as `OverviewTab.test.tsx` (mock all APIs, render `<AnalyticsPage/>` at `/analytics/finance`). Fixtures: 2 assigned plots — id `1` at `$42` unpaid held by "Ada", id `2` at `$69` paid (no `paidDate`) — plus settings null:

```tsx
it('renders the four finance cards', () => {
  renderAt('/analytics/finance');
  for (const t of ['Dues by size tier', 'Collection over time', 'Deposits', 'Dues rates by season']) {
    expect(screen.getByText(new RegExp(t, 'i'))).toBeInTheDocument();
  }
});
it('table twin lists tier rollups', () => {
  renderAt('/analytics/finance');
  fireEvent.click(within(screen.getByText('Dues by size tier').closest('section')!)
    .getByRole('button', { name: /table/i }));
  expect(screen.getByText('$42')).toBeInTheDocument();   // tier column
});
it('season table shows current rates with a one-season subtitle in live mode', () => {
  renderAt('/analytics/finance');
  expect(screen.getByText(/one season of recorded rates/i)).toBeInTheDocument();
});
it('collection-over-time shows its empty state when nothing was paid in window', () => {
  renderAt('/analytics/finance');   // fixture plot 2 is paid but has no paidDate
  expect(screen.getByText(/no payments recorded in this window/i)).toBeInTheDocument();
});
it('unpaid drilldown opens from the card header', () => {
  renderAt('/analytics/finance');
  fireEvent.click(screen.getByRole('button', { name: /view unpaid/i }));
  expect(screen.getByText(/unpaid dues/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /1/ })).toHaveAttribute('href', '/plots/1');
});
```

Recharts `onClick` doesn't fire in jsdom (zero-size SVG), so alongside the chart-segment click (which opens the clicked tier's list) the card header gets a small **"View unpaid"** button opening the same `DrilldownPanel` titled "Unpaid dues" with ALL tiers' unpaid rows (`[plot.id, holderName ?? '—', tier]`, `href: /plots/{id}`). That header button is also the keyboard path — a chart-only click would be mouse-only, which the dataviz interaction rules forbid.
- [ ] **Step 2: Verify failure** (stub still renders).
- [ ] **Step 3: Implement** per the widget specs above.
- [ ] **Step 4: `npx vitest run src/features/analytics` → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(analytics): Finance tab — tier stacks w/ unpaid drilldown, collection trend, deposits, season rates"`

---

### Task 12: Operations tab

**Files:**
- Modify: `src/features/analytics/tabs/OperationsTab.tsx` (replace stub)
- Create: `src/features/analytics/tabs/OperationsTab.test.tsx`

**Interfaces:**
- Consumes: `useAlx()`; `upkeepDistribution`, `cropPopularity`, `splitPlotUtilization`, `occupancyKpi`, `waitlistCount`; `ChartCard`, `DrilldownPanel`; Recharts.
- Produces: default export `OperationsTab`.

Widgets:
1. **Plot upkeep** — horizontal stacked bar of the four tiers. These MEAN good/bad → status colors with label pairing: thriving `tokens.good` 🌿, okay `tokens.warning` ☀️, attention `tokens.serious` ⚠️, no data `tokens.neutralFill` ▫️. Legend row with icon + label + count (icons satisfy the never-color-alone rule); surface-gap strokes; tooltip; table twin. Warning/serious are sub-3:1 on light surface — counts are ALWAYS direct-labeled in the legend (the relief rule).
2. **Needs attention** — list card: plots in `attention` (and a subdued "No upkeep data" count line for `nodata`), each row `Plot {id} — {holderName}`, link `/plots/{id}`. Empty state: "Every assigned plot shows recent activity 🎉".
3. **Crop popularity** — horizontal bars, top 8 + Other; nominal categories → ONE hue (`tokens.series1`) for every bar (never a ramp, never per-bar hues); "Other" in `tokens.neutralFill`; value at bar tip; tooltip; table twin.
4. **Split-plot utilization** — two meters (wholes assigned/total, halves assigned/total), same meter pattern.
5. **Open plots vs waitlist** — stat pair card: open plot count (`total - occupied`) and `waitlistCount`, with the line `"{waitlist} people waiting for {open} open plots"`.

- [ ] **Step 1: Write the failing tests** — harness as before at `/analytics/operations`. Fixtures: plot 1 assigned with `crops: []` + `lastWateredAt` 45 days ago (→ attention, holder "Ada"), plot 2 assigned with a fresh-planted crop `kale` (→ thriving), plot 3 available; one pending member:

```tsx
it('renders the operations cards', () => {
  renderAt('/analytics/operations');
  for (const t of ['Plot upkeep', 'Needs attention', 'Crop popularity', 'Split-plot utilization', 'Open plots vs waitlist']) {
    expect(screen.getByText(new RegExp(t, 'i'))).toBeInTheDocument();
  }
});
it('upkeep legend pairs icon + label + count (never color alone)', () => {
  renderAt('/analytics/operations');
  expect(screen.getByText(/thriving/i)).toBeInTheDocument();
  expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
});
it('attention list links to the plot', () => {
  renderAt('/analytics/operations');
  expect(screen.getByRole('link', { name: /plot 1/i })).toHaveAttribute('href', '/plots/1');
});
it('crop table twin lists kale', () => {
  renderAt('/analytics/operations');
  fireEvent.click(within(screen.getByText('Crop popularity').closest('section')!)
    .getByRole('button', { name: /table/i }));
  expect(screen.getByText('kale')).toBeInTheDocument();
});
it('states the waitlist-vs-open-plots line', () => {
  renderAt('/analytics/operations');
  expect(screen.getByText(/1 (person|people) waiting for 1 open plot/i)).toBeInTheDocument();
});
```
- [ ] **Step 2–5:** verify failure → implement per the widget specs → `npx vitest run src/features/analytics` PASS → commit `"feat(analytics): Operations tab — upkeep tiers, attention list, crop popularity, utilization"`.

---

### Task 13: Engagement tab

**Files:**
- Modify: `src/features/analytics/tabs/EngagementTab.tsx` (replace stub)
- Create: `src/features/analytics/tabs/EngagementTab.test.tsx`

**Interfaces:**
- Consumes: `useAlx()`; `hoursCohorts`, `expectedHoursPace`, `participationKpi`, `topVolunteers`, `rsvpBreakdown`, `threadsSeries`, `votesSeries`, `inRange`, `fmtCompact`; `ChartCard`; Recharts; `RED_POLE` from `../tokens`.
- Produces: default export `EngagementTab`.

Widgets:
1. **Hours requirement cohorts** — three columns (Done / On track / Behind) with status colors + labels (good/warning/serious; count labels on caps — relief rule for warning/serious). Subtitle: `"12h required · pace today: {expectedHoursPace(...).toFixed(1)}h"`. Table twin lists cohort members (names joined, truncated to first 10 + "+n more").
2. **Participation trend** — line: distinct members logging per bucket (derive inline: group in-window hours by bucket via `bucketSeries` on `{at, value: 1}` per FIRST entry of each member per bucket — simplest: build a `Set` of `memberId|bucketStart` first). Single series blue.
3. **Top volunteers** — table card (no chart): rank, name, hours (`tabular-nums`), rows link nothing for members without admin pages? They do have: `/members/{id}` — link the name.
4. **Event RSVPs** — horizontal stacked bar per in-window event (latest 6): yes (`tokens.series1`) / maybe (`tokens.neutralFill`) / no (`RED_POLE[mode]`) — the yes↔no poles read as opposite, maybe is the neutral mid; legend; surface gaps; tooltip; table twin. Empty state "No events in this window".
5. **Community activity** — two small-multiple line cards side by side: "Forum threads" and "Poll votes" (each single-series blue — small multiples of one metric each, no shared-axis trickery).

- [ ] **Step 1: Write the failing tests** — harness as before at `/analytics/engagement`. Fixtures: 2 active members ("Ada" id `m1` with a 3h entry this season, "Rosa" id `m2` with none), no events, one thread:

```tsx
it('renders the engagement cards', () => {
  renderAt('/analytics/engagement');
  for (const t of ['Hours requirement', 'Participation trend', 'Top volunteers', 'Event RSVPs', 'Forum threads', 'Poll votes']) {
    expect(screen.getByText(new RegExp(t, 'i'))).toBeInTheDocument();
  }
});
it('cohort legend shows Done / On track / Behind with counts', () => {
  renderAt('/analytics/engagement');
  expect(screen.getByText(/on track/i)).toBeInTheDocument();
  expect(screen.getByText(/behind/i)).toBeInTheDocument();
});
it('top volunteers links the member admin page', () => {
  renderAt('/analytics/engagement');
  expect(screen.getByRole('link', { name: /ada/i })).toHaveAttribute('href', '/members/m1');
});
it('RSVP card shows its empty state with no events in window', () => {
  renderAt('/analytics/engagement');
  expect(screen.getByText(/no events in this window/i)).toBeInTheDocument();
});
```
- [ ] **Step 2–5:** verify failure → implement per the widget specs → `npx vitest run src/features/analytics` PASS → commit `"feat(analytics): Engagement tab — cohorts, participation, volunteers, RSVPs, activity"`.

---

### Task 14: Full verification, visual pass, deploy

**Files:** none new (fixes only if verification finds problems).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: everything green EXCEPT the 4 pre-existing `CalendarPage.test.tsx` RSVP failures (documented debt — confirm the count is still exactly 4 and they're the same tests).

- [ ] **Step 2: Production build + bundle check**

Run: `npm run build`
Expected: clean tsc + vite build. Then list `dist/assets` and confirm (a) a separate `AnalyticsPage-*.js` chunk exists containing recharts, (b) the main `index-*.js` is within a few KB of its pre-task size (compare against `git stash` baseline only if suspicious).

- [ ] **Step 3: Visual eyeball (the validator checks color, not layout)**

Run `npm run dev`, open `http://localhost:5173/analytics` signed in as admin (or temporarily flip the demo toggle default if auth is awkward in dev — do not commit that flip). Check, in BOTH light and dark, demo ON:
- KPI row: no clipped values, deltas show arrows, sparklines draw.
- Each tab: no label collisions, bars ≤24px with rounded tops, hairline solid grid, legends present on multi-series charts, tooltips appear on hover, table toggles work.
- Print preview (Ctrl+P): committee header shows, controls/nav hidden, light theme forced, cards don't split across pages, DEMO DATA notes in header when demo is on.
- Demo OFF (live data): dues meter shows $0 state honestly, hours charts show real sparse data or their empty states — nothing looks broken.
Fix anything that matches a dataviz anti-pattern before proceeding.

- [ ] **Step 4: Deploy (hosting only — no rules/index/function changes)**

Run: `npm run build; firebase deploy --only hosting --project sacg-garden-app`
Expected: released. The SPA is served no-cache so it shows up on refresh; still tell Brandon to hard-refresh.

- [ ] **Step 5: Final commit & wrap-up**

```bash
git add -A
git commit -m "feat(analytics): executive analytics dashboard at /analytics"   # only if fixes were made in this task
```

Report: URL (`https://sacg-garden-app.web.app/analytics`), what shipped per tab, demo-toggle behavior, and the standing calendar-test debt.
