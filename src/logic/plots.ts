import type { Plot } from '../lib/types';
export const splitPlotIds = (n: number) => ({ a: `${n}A`, b: `${n}B` });
export const isAvailable = (p: Plot) => p.status === 'available';
export function groupByNumber(plots: Plot[]) {
  const m = new Map<number, Plot[]>();
  for (const p of plots) { const a = m.get(p.number) ?? []; a.push(p); m.set(p.number, a); }
  return m;
}
