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
