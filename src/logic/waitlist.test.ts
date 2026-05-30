import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { waitlistOrder } from './waitlist';
const m = (id:string, status:string, t:string) => ({ id, status, createdAt: Timestamp.fromDate(new Date(t)) } as any);
describe('waitlistOrder', () => {
  it('returns pending members oldest-first', () => {
    const r = waitlistOrder([ m('a','pending','2026-03-01'), m('b','active','2026-01-01'), m('c','pending','2026-01-15') ]);
    expect(r.map(x=>x.id)).toEqual(['c','a']);
  });
});
