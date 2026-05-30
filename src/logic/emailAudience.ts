import type { Member } from '../lib/types';
export const activeMemberEmails = (ms: Member[]) => ms.filter(m=>m.status==='active').map(m=>m.email);
export const customEmails = (ms: Member[], ids: string[]) =>
  ids.map(id=>ms.find(m=>m.id===id)?.email).filter((e): e is string => !!e);
export function dedupeEmails(emails: string[]) {
  const seen = new Set<string>(); const out: string[] = [];
  for (const e of emails) { const k=e.toLowerCase(); if(!seen.has(k)){ seen.add(k); out.push(e);} }
  return out;
}
