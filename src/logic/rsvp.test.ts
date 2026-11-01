import { describe, it, expect } from 'vitest';
import { rsvpHeadcount, inviteAudienceCounts } from './rsvp';
import type { Member, Rsvp } from '../lib/types';

const r = (id: string, status: Rsvp['status'], partySize?: number): Rsvp =>
  ({ id, status, displayName: id, respondedAt: {} as Rsvp['respondedAt'], partySize }) as Rsvp;

const m = (id: string, over: Partial<Member> = {}): Member =>
  ({ id, uid: id, email: `${id}@example.com`, displayName: id, role: 'member', status: 'active', ...over }) as Member;

describe('rsvpHeadcount', () => {
  it('sums yes party sizes (default 1) into people, maybes separately', () => {
    expect(rsvpHeadcount([r('a', 'yes', 3), r('b', 'yes'), r('c', 'maybe', 2), r('d', 'no')])).toEqual({
      yes: 2,
      maybe: 1,
      no: 1,
      people: 4,
      maybePeople: 2,
    });
  });

  it('is all zeros for no RSVPs', () => {
    expect(rsvpHeadcount([])).toEqual({ yes: 0, maybe: 0, no: 0, people: 0, maybePeople: 0 });
  });

  it('never counts a party size on a no', () => {
    expect(rsvpHeadcount([r('a', 'no', 5)]).people).toBe(0);
  });
});

describe('inviteAudienceCounts', () => {
  const members = [
    m('me', { role: 'admin' }),
    m('alice'),
    m('bob'),
    m('bob2', { email: ' BOB@example.com ' }), // same address as bob
    m('carol', { email: '  ' }), // no address
    m('pat', { status: 'pending' }),
  ];

  it('counts what the server will send to: active, with an email, one per address', () => {
    expect(inviteAudienceCounts(members, [])).toEqual({ allActive: 3, notResponded: 3 });
  });

  it("counts only members who haven't answered for notResponded", () => {
    expect(inviteAudienceCounts(members, [r('alice', 'yes'), r('bob', 'no')])).toEqual({
      allActive: 3,
      // me, plus bob2 (bob answered, but bob2 is a separate member who hasn't)
      notResponded: 2,
    });
  });
});
