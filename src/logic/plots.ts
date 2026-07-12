import type { Plot } from '../lib/types';
export const splitPlotIds = (n: number) => ({ a: `${n}A`, b: `${n}B` });
export const isAvailable = (p: Plot) => p.status === 'available';

/** All member ids holding this plot. Prefers the multi-holder `holderMemberIds`
 *  array; falls back to the single `holderMemberId` for plots not yet migrated. */
export function plotHolderIds(plot: Pick<Plot, 'holderMemberId' | 'holderMemberIds'>): string[] {
  if (plot.holderMemberIds && plot.holderMemberIds.length > 0) return plot.holderMemberIds;
  return plot.holderMemberId ? [plot.holderMemberId] : [];
}

/** True if `memberId` is one of the plot's holders (primary or co-gardener). */
export function isPlotHeldBy(
  plot: Pick<Plot, 'holderMemberId' | 'holderMemberIds'>,
  memberId: string | null | undefined,
): boolean {
  return !!memberId && plotHolderIds(plot).includes(memberId);
}
export function groupByNumber(plots: Plot[]) {
  const m = new Map<number, Plot[]>();
  for (const p of plots) { const a = m.get(p.number) ?? []; a.push(p); m.set(p.number, a); }
  return m;
}

export type Occupancy = 'empty' | 'partial' | 'full';
export function plotOccupancy(units: Plot[]): Occupancy {
  const occupied = units.filter((p) => p.status === 'assigned').length;
  if (occupied === 0) return 'empty';
  if (occupied === units.length) return 'full';
  return 'partial';
}
