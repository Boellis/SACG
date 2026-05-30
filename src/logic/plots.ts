import type { Plot } from '../lib/types';
export const splitPlotIds = (n: number) => ({ a: `${n}A`, b: `${n}B` });
export const isAvailable = (p: Plot) => p.status === 'available';
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
