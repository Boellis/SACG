import { describe, it, expect, beforeEach } from 'vitest';
import { testDb, clearFirestore } from '../testing/emulator';
import { AudienceSchema, resolveAudience, describeAudience, type Audience } from './audience';

const db = testDb();

const MEMBERS: Record<string, Record<string, unknown>> = {
  admin1: { displayName: 'Ada Admin', email: 'ada@example.com', role: 'admin', status: 'active' },
  m1: { displayName: 'Alice Example', email: '  alice@example.com ', role: 'member', status: 'active' },
  m2: { displayName: 'Bob Example', email: 'Shared@Example.com', role: 'member', status: 'active' },
  m3: { displayName: 'Carol Example', email: 'shared@example.com', role: 'member', status: 'active' },
  m4: { displayName: 'Dan Example', email: '   ', role: 'member', status: 'active' },
  p1: { displayName: 'Pat Pending', email: 'pat@example.com', role: 'member', status: 'pending' },
  admin2: { displayName: 'Ivy Inactive', email: 'ivy@example.com', role: 'admin', status: 'inactive' },
};

beforeEach(async () => {
  await clearFirestore();
  const batch = db.batch();
  for (const [id, data] of Object.entries(MEMBERS)) batch.set(db.doc(`members/${id}`), data);
  batch.set(db.doc('events/E1'), { title: 'Workday', type: 'workday' });
  batch.set(db.doc('events/E1/rsvps/m1'), { status: 'yes', displayName: 'Alice Example' });
  batch.set(db.doc('events/E1/rsvps/m2'), { status: 'no', displayName: 'Bob Example' });
  await batch.commit();
});

const names = (r: { recipients: { displayName: string }[] }) => r.recipients.map((x) => x.displayName);

describe('resolveAudience', () => {
  it('all_active: active members with a unique trimmed email, sorted by name', async () => {
    const out = await resolveAudience(db, { kind: 'all_active' });
    expect(out.recipients).toEqual([
      { memberId: 'admin1', displayName: 'Ada Admin', email: 'ada@example.com' },
      { memberId: 'm1', displayName: 'Alice Example', email: 'alice@example.com' },
      { memberId: 'm2', displayName: 'Bob Example', email: 'Shared@Example.com' },
    ]);
    expect(out.skippedNoEmail).toBe(1);
  });

  it('admins: only active admins', async () => {
    const out = await resolveAudience(db, { kind: 'admins' });
    expect(names(out)).toEqual(['Ada Admin']);
    expect(out.skippedNoEmail).toBe(0);
  });

  it('members: explicit ids, excluding pending and unknown ids', async () => {
    const out = await resolveAudience(db, { kind: 'members', memberIds: ['p1', 'm1', 'nobody'] });
    expect(names(out)).toEqual(['Alice Example']);
  });

  it("event_rsvp ['none']: active members who haven't answered", async () => {
    const out = await resolveAudience(db, { kind: 'event_rsvp', eventId: 'E1', statuses: ['none'] });
    expect(names(out)).toEqual(['Ada Admin', 'Carol Example']);
    expect(out.skippedNoEmail).toBe(1); // Dan has no email
  });

  it('event_rsvp by answer', async () => {
    const out = await resolveAudience(db, { kind: 'event_rsvp', eventId: 'E1', statuses: ['yes', 'no'] });
    expect(names(out)).toEqual(['Alice Example', 'Bob Example']);
  });

  it('event_rsvp for a deleted event is not-found', async () => {
    await expect(
      resolveAudience(db, { kind: 'event_rsvp', eventId: 'gone', statuses: ['none'] }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('AudienceSchema', () => {
  it('rejects raw email-address audiences', () => {
    expect(AudienceSchema.safeParse({ kind: 'emails', emails: ['evil@example.com'] }).success).toBe(false);
  });

  it('rejects extra keys (strict objects)', () => {
    expect(AudienceSchema.safeParse({ kind: 'all_active', emails: ['evil@example.com'] }).success).toBe(false);
    expect(
      AudienceSchema.safeParse({ kind: 'members', memberIds: ['m1'], emails: ['evil@example.com'] }).success,
    ).toBe(false);
  });

  it('bounds memberIds to 1..150 valid document ids', () => {
    expect(AudienceSchema.safeParse({ kind: 'members', memberIds: [] }).success).toBe(false);
    const ids = Array.from({ length: 151 }, (_, i) => `m${i}`);
    expect(AudienceSchema.safeParse({ kind: 'members', memberIds: ids }).success).toBe(false);
    expect(AudienceSchema.safeParse({ kind: 'members', memberIds: ids.slice(0, 150) }).success).toBe(true);
    expect(AudienceSchema.safeParse({ kind: 'members', memberIds: ['a/b'] }).success).toBe(false);
  });

  it('requires at least one known RSVP status', () => {
    expect(AudienceSchema.safeParse({ kind: 'event_rsvp', eventId: 'E1', statuses: [] }).success).toBe(false);
    expect(AudienceSchema.safeParse({ kind: 'event_rsvp', eventId: 'E1', statuses: ['sure'] }).success).toBe(false);
    expect(
      AudienceSchema.safeParse({ kind: 'event_rsvp', eventId: 'E1', statuses: ['yes', 'none'] }).success,
    ).toBe(true);
  });

  it('accepts the simple kinds', () => {
    expect(AudienceSchema.safeParse({ kind: 'all_active' }).success).toBe(true);
    expect(AudienceSchema.safeParse({ kind: 'admins' }).success).toBe(true);
  });
});

describe('describeAudience', () => {
  it.each<[Audience, string]>([
    [{ kind: 'all_active' }, 'All active members'],
    [{ kind: 'admins' }, 'Admins'],
    [{ kind: 'members', memberIds: ['m1'] }, '1 selected member'],
    [{ kind: 'members', memberIds: ['m1', 'm2'] }, '2 selected members'],
    [{ kind: 'event_rsvp', eventId: 'E1', statuses: ['none'] }, "Active members who haven't responded"],
    [{ kind: 'event_rsvp', eventId: 'E1', statuses: ['yes', 'maybe'] }, 'Active members who answered yes or maybe'],
    [
      { kind: 'event_rsvp', eventId: 'E1', statuses: ['no', 'none'] },
      "Active members who answered no or haven't responded",
    ],
  ])('%j → %s', (audience, text) => {
    expect(describeAudience(audience)).toBe(text);
  });
});
