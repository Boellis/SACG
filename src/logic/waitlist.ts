import type { Member } from '../lib/types';
export function waitlistOrder(members: Member[]) {
  return members.filter(m=>m.status==='pending')
    .sort((a,b)=>a.createdAt.toMillis()-b.createdAt.toMillis());
}
