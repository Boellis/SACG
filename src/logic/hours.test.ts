import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { yearToDateHours, firstSixMonthsHours, hoursProgress } from './hours';
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
const h = (date: string, hours: number) => ({ date: ts(date), hours } as any);
describe('hours logic', () => {
  it('yearToDateHours sums only that year', () => {
    expect(yearToDateHours([h('2026-01-01',3), h('2026-06-01',4), h('2025-12-31',9)], 2026)).toBe(7);
  });
  it('firstSixMonthsHours counts within 6 months of join', () => {
    const joined = ts('2026-01-15');
    expect(firstSixMonthsHours([h('2026-02-01',4), h('2026-08-01',5)], joined)).toBe(4);
  });
  it('hoursProgress reports met flags', () => {
    const settings = { requiredHours:12, firstHalfHours:6, firstHalfMonths:6 } as any;
    const r = hoursProgress({ joinedAt: ts('2026-01-01') } as any,
      [h('2026-02-01',6), h('2026-03-01',6)], settings, new Date('2026-04-01'));
    expect(r.ytd).toBe(12); expect(r.metAnnual).toBe(true); expect(r.metFirstHalf).toBe(true);
  });
});
