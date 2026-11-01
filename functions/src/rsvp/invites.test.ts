import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { testDb, clearFirestore } from '../testing/emulator';
import { findOrCreateInvite, rsvpUrl } from './invites';

const db = testDb();
const denny = { eventId: 'E1', memberId: 'm-denny', displayName: 'Denny Smith' };

beforeEach(clearFirestore);

describe('findOrCreateInvite', () => {
  it('returns the same token for the same event and member', async () => {
    const first = await findOrCreateInvite(db, denny);
    const second = await findOrCreateInvite(db, denny);
    expect(second).toBe(first);
    expect((await db.collection('rsvpInvites').get()).size).toBe(1);
  });

  it('gives a different member a different token', async () => {
    const a = await findOrCreateInvite(db, denny);
    const b = await findOrCreateInvite(db, { ...denny, memberId: 'm-bea', displayName: 'Bea Example' });
    expect(b).not.toBe(a);
  });

  it('gives the same member a different token for a different event', async () => {
    const a = await findOrCreateInvite(db, denny);
    const b = await findOrCreateInvite(db, { ...denny, eventId: 'E2' });
    expect(b).not.toBe(a);
  });

  it('makes a long, url-safe token and stores the invite under it', async () => {
    const token = await findOrCreateInvite(db, denny);
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const snap = await db.doc(`rsvpInvites/${token}`).get();
    expect(snap.data()).toMatchObject({ eventId: 'E1', memberId: 'm-denny', displayName: 'Denny Smith', uses: 0 });
    expect(snap.get('createdAt')).toBeInstanceOf(Timestamp);
  });

  it('creates a single invite when called concurrently for the same pair', async () => {
    const [a, b] = await Promise.all([findOrCreateInvite(db, denny), findOrCreateInvite(db, denny)]);
    expect(b).toBe(a);
    expect((await db.collection('rsvpInvites').get()).size).toBe(1);
  });
});

describe('rsvpUrl', () => {
  it('points at the public RSVP page, optionally preselecting an answer', () => {
    expect(rsvpUrl('tok')).toBe('https://sacg-garden-app.web.app/rsvp/tok');
    expect(rsvpUrl('tok', 'yes').endsWith('/rsvp/tok?answer=yes')).toBe(true);
    expect(rsvpUrl('tok', 'no')).toBe('https://sacg-garden-app.web.app/rsvp/tok?answer=no');
  });
});
