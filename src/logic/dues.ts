import type { Plot } from '../lib/types';
export function computeDuesRollup(plots: Plot[]) {
  const assigned = plots.filter(p => p.status === 'assigned');
  const expected = assigned.reduce((s,p)=>s+(p.duesAmount||0),0);
  const collected = assigned.filter(p=>p.duesPaid).reduce((s,p)=>s+(p.duesAmount||0),0);
  const unpaid = assigned.filter(p=>!p.duesPaid);
  return { expected, collected, outstanding: expected-collected, unpaid };
}
