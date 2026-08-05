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
  const grid = bucketSeries(joins.map((d) => ({ at: d, value: 0 })), w.start, w.end, bucket);
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

export function participationSeries(hours: VolunteerHour[], w: AnalyticsWindow, bucket: Bucket): SeriesPoint[] {
  const inWin = hours.filter((h) => inRange(h.date as unknown as TsLike, w.start, w.end));
  const grid = bucketSeries(inWin.map((h) => ({ at: (h.date as unknown as TsLike).toDate(), value: 0 })), w.start, w.end, bucket);
  return grid.map((p, i) => {
    const end = i + 1 < grid.length ? grid[i + 1].t : w.end.getTime();
    const uniq = new Set(
      inWin
        .filter((h) => { const t = (h.date as unknown as TsLike).toMillis(); return t >= p.t && t < end; })
        .map((h) => h.memberId),
    );
    return { ...p, value: uniq.size };
  });
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
  if (watered !== null) {
    return t - watered > DAYS_WATER_STALE * 86400_000 ? 'attention' : 'okay';
  }
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
export function buildKpis(d: AnalyticsDataset, w: AnalyticsWindow, _now: Date): KpiDatum[] {
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
      spark: participationSeries(d.hours, w, bucket).map((p) => p.value),
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
