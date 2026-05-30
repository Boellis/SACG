import { describe, it, expect } from 'vitest';
import { computeDuesRollup } from './dues';
const p = (o: Partial<any>) => ({ status:'assigned', duesAmount:30, duesPaid:false, ...o });
describe('computeDuesRollup', () => {
  it('sums expected/collected/outstanding over assigned plots only', () => {
    const r = computeDuesRollup([
      p({ duesAmount:30, duesPaid:true }),
      p({ duesAmount:20, duesPaid:false }),
      p({ status:'available', duesAmount:50, duesPaid:false }),
    ] as any);
    expect(r.expected).toBe(50);
    expect(r.collected).toBe(30);
    expect(r.outstanding).toBe(20);
    expect(r.unpaid).toHaveLength(1);
  });
});
