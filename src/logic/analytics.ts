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
