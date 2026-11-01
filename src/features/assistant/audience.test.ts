import { describe, it, expect } from 'vitest';
import { describeAudience, audienceRecipientCount } from './audience';
import type { Member, Rsvp } from '../../lib/types';

describe('describeAudience', () => {
  it('names each audience in plain words', () => {
    expect(describeAudience({ kind: 'all_active' })).toBe('All active members');
    expect(describeAudience({ kind: 'admins' })).toBe('Admins only');
    expect(describeAudience({ kind: 'members', memberIds: ['a', 'b', 'c'] })).toBe('3 selected members');
    expect(describeAudience({ kind: 'event_rsvp', eventId: 'e1', statuses: ['none'] })).toBe(
      "Event RSVPs: haven't responded",
    );
  });

  it('is correct for one member, and does not count a repeated id twice', () => {
    expect(describeAudience({ kind: 'members', memberIds: ['a'] })).toBe('1 selected member');
    expect(describeAudience({ kind: 'members', memberIds: ['a', 'a', 'b'] })).toBe('2 selected members');
  });

  it('lists RSVP answers in a fixed order whatever order they arrive in', () => {
    expect(describeAudience({ kind: 'event_rsvp', eventId: 'e1', statuses: ['none', 'maybe', 'yes'] })).toBe(
      "Event RSVPs: yes, maybe, haven't responded",
    );
    expect(describeAudience({ kind: 'event_rsvp', eventId: 'e1', statuses: ['no'] })).toBe('Event RSVPs: no');
  });
});

const member = (id: string, over: Partial<Member> = {}): Member =>
  ({ id, uid: id, email: `${id}@example.com`, displayName: id, role: 'member', status: 'active', ...over }) as Member;

const rsvp = (id: string, status: Rsvp['status']): Rsvp => ({ id, status, displayName: id }) as Rsvp;

describe('audienceRecipientCount', () => {
  const members = [
    member('admin1', { role: 'admin' }),
    member('alice'),
    member('bob'),
    member('dupe', { email: 'ALICE@example.com' }), // same address as alice
    member('noemail', { email: '  ' }),
    member('pending', { status: 'pending' }),
    member('gone', { status: 'inactive' }),
  ];

  it('counts active members with an address, once per address', () => {
    // admin1, alice, bob. Not: dupe (alice's address), noemail, pending, gone.
    expect(audienceRecipientCount({ kind: 'all_active' }, members)).toBe(3);
  });

  it('counts only admins', () => {
    expect(audienceRecipientCount({ kind: 'admins' }, members)).toBe(1);
  });

  it('counts the picked members who can actually be emailed', () => {
    expect(
      audienceRecipientCount({ kind: 'members', memberIds: ['alice', 'bob', 'pending', 'noemail', 'nobody'] }, members),
    ).toBe(2);
  });

  it('counts members by their answer to the event, treating no answer as "none"', () => {
    const roster = members.filter((m) => m.id !== 'dupe');
    const rsvps = [rsvp('alice', 'yes'), rsvp('bob', 'no')];
    expect(audienceRecipientCount({ kind: 'event_rsvp', eventId: 'e1', statuses: ['none'] }, roster, rsvps)).toBe(1); // admin1
    expect(audienceRecipientCount({ kind: 'event_rsvp', eventId: 'e1', statuses: ['yes', 'no'] }, roster, rsvps)).toBe(2);
    expect(audienceRecipientCount({ kind: 'event_rsvp', eventId: 'e1', statuses: ['maybe'] }, roster, rsvps)).toBe(0);
  });

  it('follows the server: members are filtered by their own answer first, then one email per address', () => {
    // Alice answered; her duplicate record (same address) did not, so "haven't responded" still reaches that address.
    const rsvps = [rsvp('alice', 'yes'), rsvp('bob', 'no')];
    expect(audienceRecipientCount({ kind: 'event_rsvp', eventId: 'e1', statuses: ['none'] }, members, rsvps)).toBe(2); // admin1 + alice's address via dupe
  });

  it('cannot tell yet for an event audience whose answers have not loaded', () => {
    expect(audienceRecipientCount({ kind: 'event_rsvp', eventId: 'e1', statuses: ['none'] }, members, null)).toBeNull();
    expect(audienceRecipientCount({ kind: 'all_active' }, members, null)).toBe(3);
  });
});
