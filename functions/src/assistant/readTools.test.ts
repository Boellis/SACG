import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { testDb, clearFirestore } from '../testing/emulator';
import type { AdminCaller } from '../lib/auth';
import { runReadTool } from './readTools';
import { READ_TOOLS } from './tools';

const db = testDb();
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
const caller: AdminCaller = { uid: 'admin1', displayName: 'Brandon Ellis', email: 'brandon@example.com' };
// Sunday, November 1, 2026, 9:00 AM in Chicago: the morning DST ended.
const NOW = new Date('2026-11-01T15:00:00Z');
const ctx = { caller, now: NOW };

const run = async (name: string, input: unknown) => JSON.parse(await runReadTool(db, name, input, ctx));

beforeEach(async () => {
  await clearFirestore();
  const members: Record<string, Record<string, unknown>> = {
    admin1: { displayName: 'Brandon Ellis', email: 'brandon@example.com', role: 'admin', status: 'active' },
    'm-denny': {
      displayName: 'Denny Smith',
      email: 'denny@example.com',
      phone: '555-010-0199',
      role: 'member',
      status: 'active',
    },
    'm-bea': { displayName: 'Bea Example', email: 'bea@example.com', role: 'member', status: 'active' },
    'm-nora': { displayName: 'Nora Nomail', email: '', role: 'member', status: 'active' },
    'm-gone': { displayName: 'Dennis Gone', email: 'dennis@example.com', role: 'member', status: 'inactive' },
  };
  for (const [id, data] of Object.entries(members)) await db.doc(`members/${id}`).set(data);
  await db.doc('settings/org').set({
    requiredHours: 12,
    firstHalfHours: 6,
    firstHalfMonths: 6,
    defaultDeposit: 25,
    currentSeason: '2026',
    contactEmail: 'organizers@example.com',
  });
  // 9:00–10:00 AM CST on Nov 7 (after the Nov 1 DST change) is 15:00–16:00Z.
  await db.doc('events/NOV7').set({
    title: 'November Member Meeting',
    type: 'meeting',
    start: ts('2026-11-07T15:00:00Z'),
    end: ts('2026-11-07T16:00:00Z'),
    allDay: false,
    location: 'Garden pavilion',
    description: 'Questions? Email organizers@example.com or call 555-010-0100.',
    createdBy: 'admin1',
  });
  await db.doc('events/NOV7/rsvps/m-bea').set({ status: 'yes', displayName: 'Bea Example', partySize: 2, note: 'veggie' });
  await db.doc('events/NOV7/rsvps/m-denny').set({
    status: 'maybe',
    displayName: 'Denny Smith',
    partySize: 3,
    note: 'text me at 555-010-0142 or denny@example.com',
    source: 'email',
  });
  await db.doc('events/NOV7/rsvps/admin1').set({ status: 'no', displayName: 'Brandon Ellis' });
  // 11:30 PM on Nov 30 garden time is already Dec 1 in UTC: still inside "November".
  await db.doc('events/LATE').set({
    title: 'Late Night Harvest',
    type: 'other',
    start: ts('2026-12-01T05:30:00Z'),
    end: ts('2026-12-01T06:00:00Z'),
    allDay: false,
  });
  await db.doc('events/OCT').set({
    title: 'October Workday',
    type: 'workday',
    start: ts('2026-10-20T14:00:00Z'),
    end: ts('2026-10-20T16:00:00Z'),
    allDay: false,
  });
  // Midnight Dec 1 garden time: outside "November".
  await db.doc('events/DEC').set({
    title: 'December Meeting',
    type: 'meeting',
    start: ts('2026-12-01T06:00:00Z'),
    end: ts('2026-12-01T07:00:00Z'),
    allDay: false,
  });
  await db.doc('emailJobs/J-old').set({
    subject: 'October newsletter',
    body: 'Hi',
    recipients: [{ memberId: 'm-denny', displayName: 'Denny Smith', email: 'denny@example.com' }],
    total: 1,
    sent: 1,
    failed: 0,
    status: 'done',
    test: false,
    createdAt: ts('2026-10-15T15:00:00Z'),
  });
  await db.doc('emailJobs/J-new').set({
    subject: 'Test: November RSVP',
    body: 'Hi',
    recipients: [{ memberId: 'admin1', displayName: 'Brandon Ellis', email: 'brandon@example.com' }],
    total: 1,
    sent: 0,
    failed: 0,
    status: 'queued',
    test: true,
    createdAt: ts('2026-10-31T20:00:00Z'),
  });
});

describe('list_events', () => {
  it('returns November events with garden-local times and RSVP headcounts', async () => {
    const out = await run('list_events', { from: '2026-11-01', to: '2026-11-30' });
    expect(out.events.map((e: { id: string }) => e.id)).toEqual(['NOV7', 'LATE']);
    expect(out.events[0]).toEqual({
      id: 'NOV7',
      title: 'November Member Meeting',
      type: 'meeting',
      start: '2026-11-07T09:00',
      end: '2026-11-07T10:00',
      allDay: false,
      when: 'Saturday, November 7, 2026, 9:00–10:00 AM',
      location: 'Garden pavilion',
      description: 'Questions? Email [email hidden] or call [phone hidden].',
      headcount: { yes: 1, maybe: 1, no: 1, people: 2 },
    });
    expect(out.events[1]).toMatchObject({ id: 'LATE', start: '2026-11-30T23:30', headcount: { people: 0 } });
  });

  it('caps a long description at 600 characters', async () => {
    await db.doc('events/NOV7').update({ description: 'x'.repeat(2000) });
    const out = await run('list_events', { from: '2026-11-07', to: '2026-11-07' });
    expect(out.events[0].description.length).toBeLessThanOrEqual(600);
  });

  it.each([
    ['a missing range', {}],
    ['a backwards range', { from: '2026-11-30', to: '2026-11-01' }],
    ['a non-date', { from: 'next week', to: '2026-11-30' }],
  ])('answers %s with an error the model can read', async (_label, input) => {
    const out = await run('list_events', input);
    expect(out.error).toEqual(expect.any(String));
    expect(out.events).toBeUndefined();
  });
});

describe('get_event_rsvps', () => {
  it("lists each answer with party size and note, the headcount and who hasn't answered", async () => {
    const out = await run('get_event_rsvps', { eventId: 'NOV7' });
    expect(out.event).toMatchObject({ id: 'NOV7', title: 'November Member Meeting', start: '2026-11-07T09:00' });
    expect(out.headcount).toEqual({ yes: 1, maybe: 1, no: 1, people: 2, maybePeople: 3 });
    expect(out.notResponded).toBe(1); // Nora (Dennis is inactive)
    expect(out.responses).toEqual([
      { name: 'Bea Example', status: 'yes', partySize: 2, note: 'veggie' },
      { name: 'Denny Smith', status: 'maybe', partySize: 3, note: 'text me at [phone hidden] or [email hidden]', viaEmail: true },
      { name: 'Brandon Ellis', status: 'no' },
    ]);
  });

  it('answers an unknown event with an error the model can read', async () => {
    expect((await run('get_event_rsvps', { eventId: 'NOPE' })).error).toMatch(/list_events/);
    expect((await run('get_event_rsvps', { eventId: 'a/b' })).error).toEqual(expect.any(String));
  });
});

describe('find_members', () => {
  it('finds "Denny Smith" from part of the name, with no contact details', async () => {
    const out = await run('find_members', { query: 'den' });
    expect(out.members).toEqual([{ id: 'm-denny', displayName: 'Denny Smith', hasEmail: true, role: 'member' }]);
  });

  it('matches any part of the name, ignores case, and says when a member has no email', async () => {
    expect((await run('find_members', { query: 'SMITH' })).members.map((m: { id: string }) => m.id)).toEqual([
      'm-denny',
    ]);
    expect((await run('find_members', { query: 'nora' })).members).toEqual([
      { id: 'm-nora', displayName: 'Nora Nomail', hasEmail: false, role: 'member' },
    ]);
  });

  it('returns at most 10 matches and says there are more', async () => {
    for (let i = 0; i < 12; i++) {
      await db.doc(`members/m-x${i}`).set({ displayName: `Xavier ${i}`, email: `x${i}@example.com`, status: 'active' });
    }
    const out = await run('find_members', { query: 'xavier' });
    expect(out.members).toHaveLength(10);
    expect(out.more).toBe(true);
  });

  it('rejects an empty query', async () => {
    expect((await run('find_members', { query: '  ' })).error).toEqual(expect.any(String));
  });
});

describe('count_audience', () => {
  it('counts deliverable recipients and those skipped for having no email', async () => {
    await expect(run('count_audience', { audience: { kind: 'all_active' } })).resolves.toEqual({
      total: 3,
      skippedNoEmail: 1,
      description: 'All active members',
    });
    await expect(
      run('count_audience', { audience: { kind: 'event_rsvp', eventId: 'NOV7', statuses: ['yes', 'maybe'] } }),
    ).resolves.toMatchObject({ total: 2 });
  });

  it('refuses a raw-address audience', async () => {
    const out = await run('count_audience', { audience: { kind: 'emails', emails: ['evil@example.com'] } });
    expect(out.error).toEqual(expect.any(String));
  });

  it('answers an RSVP audience for a missing event with an error', async () => {
    const out = await run('count_audience', { audience: { kind: 'event_rsvp', eventId: 'NOPE', statuses: ['none'] } });
    expect(out.error).toEqual(expect.any(String));
  });
});

describe('list_recent_emails', () => {
  it('lists the newest jobs first with recipient counts, never the recipients', async () => {
    const out = await run('list_recent_emails', { limit: 5 });
    expect(out.emails).toEqual([
      { subject: 'Test: November RSVP', createdAt: '2026-10-31T15:00', recipients: 1, status: 'queued', test: true },
      { subject: 'October newsletter', createdAt: '2026-10-15T10:00', recipients: 1, status: 'done', test: false },
    ]);
    expect((await run('list_recent_emails', { limit: 1 })).emails).toHaveLength(1);
  });

  it('rejects a limit over 20', async () => {
    expect((await run('list_recent_emails', { limit: 21 })).error).toEqual(expect.any(String));
  });
});

describe('get_garden_info', () => {
  it("gives today's garden date, the app links, the admin's name and the settings", async () => {
    const out = await run('get_garden_info', {});
    expect(out).toMatchObject({
      garden: 'South Austin Community Garden',
      timeZone: 'America/Chicago',
      today: 'Sunday, November 1, 2026',
      now: '2026-11-01T09:00',
      appUrl: 'https://sacg-garden-app.web.app',
      admin: 'Brandon Ellis',
      settings: { requiredHours: 12, currentSeason: '2026' },
    });
    expect(out.settings).not.toHaveProperty('contactEmail');
  });
});

describe('every read tool', () => {
  const inputs: Record<string, unknown> = {
    get_garden_info: {},
    list_events: { from: '2026-10-01', to: '2026-12-31' },
    get_event_rsvps: { eventId: 'NOV7' },
    find_members: { query: 'e' },
    count_audience: { audience: { kind: 'all_active' } },
    list_recent_emails: { limit: 20 },
  };

  it('has a test input', () => {
    expect(Object.keys(inputs).sort()).toEqual([...READ_TOOLS].sort());
  });

  it.each(Object.keys(inputs))('%s never returns an email address or phone number', async (name) => {
    const text = await runReadTool(db, name, inputs[name], ctx);
    expect(JSON.parse(text).error).toBeUndefined();
    expect(JSON.stringify(text)).not.toContain('@');
    expect(text).not.toMatch(/555-010/);
  });

  it('answers an unknown tool name with an error', async () => {
    expect((await run('delete_everything', {})).error).toEqual(expect.any(String));
  });
});
