import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { testDb, clearFirestore } from '../testing/emulator';
import { findOrCreateInvite } from './invites';
import { getInvite, submitRsvp, rsvpGetInvite, rsvpSubmit, MAX_SUBMITS_PER_TOKEN } from './callables';

const db = testDb();
const NOW = new Date('2026-11-01T12:00:00Z');
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

let token: string;

beforeEach(async () => {
  await clearFirestore();
  await db.doc('members/m-denny').set({
    displayName: 'Denny Smith',
    email: 'denny@example.com',
    phone: '555-010-0199',
    role: 'member',
    status: 'active',
  });
  await db.doc('members/m-bea').set({ displayName: 'Bea Example', email: 'bea@example.com', status: 'active' });
  await db.doc('events/NOV7').set({
    title: 'November Meeting',
    type: 'meeting',
    start: ts('2026-11-07T15:00:00Z'),
    end: ts('2026-11-07T16:00:00Z'),
    allDay: false,
    location: 'Garden pavilion',
    description: 'Monthly meeting, then the workday.',
    createdBy: 'admin1',
  });
  // Another member's answer, which must never leak into Denny's view.
  await db.doc('events/NOV7/rsvps/m-bea').set({ status: 'yes', displayName: 'Bea Example', partySize: 2 });
  token = await findOrCreateInvite(db, { eventId: 'NOV7', memberId: 'm-denny', displayName: 'Denny Smith' });
});

const rsvpDoc = async () => (await db.doc('events/NOV7/rsvps/m-denny').get()).data();
const inviteDoc = async () => (await db.doc(`rsvpInvites/${token}`).get()).data()!;

/** Every key at every depth of a value. */
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [k, ...allKeys(v)]);
  }
  return [];
}

describe('getInvite', () => {
  it("returns the event, the invitee's first name and no answer yet", async () => {
    await expect(getInvite(db, token, NOW)).resolves.toEqual({
      event: {
        id: 'NOV7',
        title: 'November Meeting',
        type: 'meeting',
        start: '2026-11-07T15:00:00.000Z',
        end: '2026-11-07T16:00:00.000Z',
        allDay: false,
        location: 'Garden pavilion',
        description: 'Monthly meeting, then the workday.',
      },
      firstName: 'Denny',
      response: null,
      open: true,
    });
  });

  it("returns the invitee's current answer only", async () => {
    await submitRsvp(db, { token, status: 'maybe', partySize: 2, note: 'veggie' }, NOW);
    const view = await getInvite(db, token, NOW);
    expect(view.response).toEqual({ status: 'maybe', partySize: 2, note: 'veggie' });
  });

  it('never returns an email address, phone or other member data', async () => {
    const view = await getInvite(db, token, NOW);
    const keys = allKeys(view);
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('phone');
    expect(keys).not.toContain('createdBy');
    expect(JSON.stringify(view)).not.toMatch(/@|Bea|555-/);
  });

  it('is closed once the event has ended', async () => {
    await expect(getInvite(db, token, new Date('2026-11-07T16:00:01Z'))).resolves.toMatchObject({ open: false });
  });

  it.each([
    ['an unknown well-formed token', 'A'.repeat(43)],
    ['a malformed token', 'smoke-bogus-token'],
    ['a token with bad characters', 'abc/def/../ghi$jkl%mnopqrstuvwxyz'],
    ['a missing token', undefined],
    ['a non-string token', 12345],
  ])('rejects %s as not-found', async (_label, bad) => {
    await expect(getInvite(db, bad, NOW)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects a link to a deleted event as not-found', async () => {
    await db.doc('events/NOV7').delete();
    await expect(getInvite(db, token, NOW)).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('submitRsvp', () => {
  it('records a yes with party size and note from the email link', async () => {
    const res = await submitRsvp(db, { token, status: 'yes', partySize: 3, note: 'veggie' }, NOW);
    expect(res).toEqual({ response: { status: 'yes', partySize: 3, note: 'veggie' } });
    const doc = await rsvpDoc();
    expect(doc).toMatchObject({ status: 'yes', displayName: 'Denny Smith', partySize: 3, note: 'veggie', source: 'email' });
    expect(doc!.respondedAt).toBeInstanceOf(Timestamp);
    const invite = await inviteDoc();
    expect(invite.uses).toBe(1);
    expect(invite.lastUsedAt).toBeInstanceOf(Timestamp);
  });

  it('defaults party size to 1 for yes and maybe', async () => {
    await submitRsvp(db, { token, status: 'maybe' }, NOW);
    expect(await rsvpDoc()).toMatchObject({ status: 'maybe', partySize: 1 });
  });

  it('re-submitting no removes the party size (and an omitted note)', async () => {
    await submitRsvp(db, { token, status: 'yes', partySize: 3, note: 'veggie' }, NOW);
    const res = await submitRsvp(db, { token, status: 'no', partySize: 4 }, NOW);
    expect(res).toEqual({ response: { status: 'no' } });
    const doc = await rsvpDoc();
    expect(doc).toMatchObject({ status: 'no', source: 'email' });
    expect(doc).not.toHaveProperty('partySize');
    expect(doc).not.toHaveProperty('note');
  });

  it('trims the note and drops an empty one', async () => {
    await submitRsvp(db, { token, status: 'yes', note: '   ' }, NOW);
    expect(await rsvpDoc()).not.toHaveProperty('note');
    await submitRsvp(db, { token, status: 'yes', note: '  bringing pie  ' }, NOW);
    expect(await rsvpDoc()).toMatchObject({ note: 'bringing pie' });
  });

  it('rejects bogus and malformed tokens as not-found', async () => {
    await expect(submitRsvp(db, { token: 'A'.repeat(43), status: 'yes' }, NOW)).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(submitRsvp(db, { token: 'smoke-bogus-token', status: 'yes' }, NOW)).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(submitRsvp(db, null, NOW)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects a link to a deleted event as not-found', async () => {
    await db.doc('events/NOV7').delete();
    await expect(submitRsvp(db, { token, status: 'yes' }, NOW)).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rejects an ended event as failed-precondition', async () => {
    await expect(
      submitRsvp(db, { token, status: 'yes' }, new Date('2026-11-07T16:00:01Z')),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(await rsvpDoc()).toBeUndefined();
  });

  it(`allows ${MAX_SUBMITS_PER_TOKEN} submits per link; the next is resource-exhausted`, async () => {
    expect(MAX_SUBMITS_PER_TOKEN).toBe(50);
    await db.doc(`rsvpInvites/${token}`).update({ uses: 49 });
    await submitRsvp(db, { token, status: 'yes', partySize: 2 }, NOW); // 50th
    await expect(submitRsvp(db, { token, status: 'no' }, NOW)).rejects.toMatchObject({
      code: 'resource-exhausted',
    }); // 51st
    expect(await rsvpDoc()).toMatchObject({ status: 'yes', partySize: 2 });
    expect((await inviteDoc()).uses).toBe(50);
  });

  it.each([
    ['party size 0', { partySize: 0 }],
    ['party size 21', { partySize: 21 }],
    ['a fractional party size', { partySize: 2.5 }],
    ['a note over 500 chars', { note: 'x'.repeat(501) }],
    ['an unknown status', { status: 'sure' }],
    ['an extra field', { email: 'evil@example.com' }],
  ])('rejects %s as invalid-argument', async (_label, over) => {
    await expect(submitRsvp(db, { token, status: 'yes', ...over }, NOW)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(await rsvpDoc()).toBeUndefined();
  });

  it('never returns an email address', async () => {
    const res = await submitRsvp(db, { token, status: 'yes', partySize: 2, note: 'hi' }, NOW);
    expect(allKeys(res)).not.toContain('email');
    expect(JSON.stringify(res)).not.toContain('@');
  });
});

describe('public callables (no sign-in)', () => {
  // The wrappers use the real clock, so they get an event that never ends.
  let futureToken: string;
  beforeEach(async () => {
    await db.doc('events/FUTURE').set({
      title: 'Spring Planting',
      type: 'workday',
      start: ts('2099-03-07T15:00:00Z'),
      end: ts('2099-03-07T18:00:00Z'),
      allDay: false,
    });
    futureToken = await findOrCreateInvite(db, { eventId: 'FUTURE', memberId: 'm-denny', displayName: 'Denny Smith' });
  });

  const req = (data: unknown) => ({ data, rawRequest: {} }) as unknown as CallableRequest;

  it('rsvpGetInvite answers an anonymous caller', async () => {
    const view = await rsvpGetInvite.run(req({ token: futureToken }));
    expect(view).toMatchObject({ firstName: 'Denny', open: true, event: { id: 'FUTURE' } });
  });

  it('rsvpGetInvite rejects the smoke-check bogus token as not-found', async () => {
    await expect(rsvpGetInvite.run(req({ token: 'smoke-bogus-token' }))).rejects.toMatchObject({ code: 'not-found' });
    await expect(rsvpGetInvite.run(req(null))).rejects.toMatchObject({ code: 'not-found' });
  });

  it('rsvpSubmit records an anonymous answer', async () => {
    await rsvpSubmit.run(req({ token: futureToken, status: 'yes', partySize: 2 }));
    expect((await db.doc('events/FUTURE/rsvps/m-denny').get()).data()).toMatchObject({
      status: 'yes',
      partySize: 2,
      source: 'email',
    });
  });
});
