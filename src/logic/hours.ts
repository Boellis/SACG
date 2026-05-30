import type { VolunteerHour, Member, OrgSettings } from '../lib/types';
const yr = (t:any)=> t.toDate().getUTCFullYear();
export function yearToDateHours(entries: VolunteerHour[], year: number) {
  return entries.filter(e=>yr(e.date)===year).reduce((s,e)=>s+e.hours,0);
}
export function firstSixMonthsHours(entries: VolunteerHour[], joinedAt: any) {
  const start = joinedAt.toDate(); const end = new Date(start); end.setMonth(end.getMonth()+6);
  return entries.filter(e=>{ const d=e.date.toDate(); return d>=start && d<end; }).reduce((s,e)=>s+e.hours,0);
}
export function hoursProgress(member: Member, entries: VolunteerHour[], settings: OrgSettings, now: Date) {
  const ytd = yearToDateHours(entries, now.getFullYear());
  const firstHalf = member.joinedAt ? firstSixMonthsHours(entries, member.joinedAt) : 0;
  return {
    ytd, required: settings.requiredHours,
    firstHalf, firstHalfRequired: settings.firstHalfHours,
    metAnnual: ytd >= settings.requiredHours,
    metFirstHalf: firstHalf >= settings.firstHalfHours,
  };
}
