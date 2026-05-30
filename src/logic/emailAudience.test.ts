import { describe, it, expect } from 'vitest';
import { activeMemberEmails, customEmails, dedupeEmails } from './emailAudience';
const m = (id:string, email:string, status:string) => ({ id, email, status } as any);
describe('email audience', () => {
  const members = [ m('1','a@x.com','active'), m('2','b@x.com','pending'), m('3','c@x.com','active') ];
  it('activeMemberEmails returns only active', () => {
    expect(activeMemberEmails(members)).toEqual(['a@x.com','c@x.com']);
  });
  it('customEmails maps selected ids', () => {
    expect(customEmails(members, ['3','1'])).toEqual(['c@x.com','a@x.com']);
  });
  it('dedupeEmails removes duplicates case-insensitively', () => {
    expect(dedupeEmails(['A@x.com','a@x.com','b@x.com'])).toEqual(['A@x.com','b@x.com']);
  });
});
