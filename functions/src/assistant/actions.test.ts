import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { testDb, clearFirestore } from '../testing/emulator';
import type { AdminCaller } from '../lib/auth';
import { createEmailJob } from '../email/jobs';
import { executeAction, recordProposal, rejectAction, retryOnce } from './actions';
import type { ActionType } from './schemas';

const db = testDb();
const THREAD = 'T1';
const brandon: AdminCaller = { uid: 'admin1', displayName: 'Brandon Ellis', email: 'brandon@example.com' };
const NOW = new Date('2026-11-01T15:00:00Z');

const DENNY_MEETING = {
  title: 'November Member Meeting',
  type: 'meeting',
  start: '2026-11-07T09:00',
  end: '2026-11-07T10:00',
  allDay: false,
  location: 'Garden pavilion',
  description: 'Monthly meeting, then the workday.',
};
const EMAIL = {
  audience: { kind: 'all_active' },
  subject: 'Nov 7: meeting and workday',
  body: 'Hi {firstName},\n\nSee you Saturday!\n\nBrandon Ellis, on behalf of the South Austin Community Garden',
};

let n = 0;
const propose = (type: ActionType, input: unknown) =>
  recordProposal(db, THREAD, { type, input, summary: `${type} proposal`, toolUseId: `tu_${++n}` });
const run = (actionId: string, over: Partial<Parameters<typeof executeAction>[1]> = {}) =>
  executeAction(db, { threadId: THREAD, actionId, caller: brandon, mode: 'run', now: NOW, ...over });
const actionRef = (id: string) => db.doc(`assistantThreads/${THREAD}/actions/${id}`);
const action = async (id: string) => (await actionRef(id).get()).data()!;
const ago = (ms: number) => Timestamp.fromMillis(NOW.getTime() - ms);
const jobs = async (): Promise<Array<Record<string, any> & { id: string }>> =>
  (await db.collection('emailJobs').get()).docs.map((d) => ({ ...d.data(), id: d.id }));
const notes = async () =>
  (await db.collection(`assistantThreads/${THREAD}/messages`).orderBy('seq').get()).docs
    .map((d) => d.data())
    .filter((m) => m.kind === 'app_note');

beforeEach(async () => {
  await clearFirestore();
  await db.doc('members/admin1').set({ displayName: 'Brandon Ellis', email: 'brandon@example.com', role: 'admin', status: 'active' });
  await db.doc('members/m-denny').set({ displayName: 'Denny Smith', email: 'denny@example.com', role: 'member', status: 'active' });
  await db.doc('members/m-bea').set({ displayName: 'Bea Example', email: 'bea@example.com', role: 'member', status: 'active' });
  await db.doc(`assistantThreads/${THREAD}`).set({ title: 'Nov 7', messageCount: 0, updatedAt: Timestamp.fromDate(NOW) });
});

describe('executeAction: create_event', () => {
  it('creates the Denny meeting at 9:00 AM CST (15:00Z, after the Nov 1 DST change)', async () => {
    const id = await propose('create_event', DENNY_MEETING);
    const res = await run(id);
    expect(res).toEqual({
      status: 'executed',
      result: {
        eventId: expect.any(String),
        title: 'November Member Meeting',
        when: 'Saturday, November 7, 2026, 9:00–10:00 AM',
        url: 'https://sacg-garden-app.web.app/calendar',
      },
    });
    const event = (await db.doc(`events/${res.result.eventId}`).get()).data()!;
    expect(event.start.toDate().toISOString()).toBe('2026-11-07T15:00:00.000Z');
    expect(event.end.toDate().toISOString()).toBe('2026-11-07T16:00:00.000Z');
    expect(event).toEqual({
      title: 'November Member Meeting',
      type: 'meeting',
      start: expect.any(Timestamp),
      end: expect.any(Timestamp),
      allDay: false,
      location: 'Garden pavilion',
      description: 'Monthly meeting, then the workday.',
      createdBy: 'admin1',
    });
    expect(await action(id)).toMatchObject({
      status: 'executed',
      result: res.result,
      executedBy: 'admin1',
      executedByName: 'Brandon Ellis',
      executedAt: expect.any(Timestamp),
    });
  });

  it('tells the assistant with an app note', async () => {
    const id = await propose('create_event', DENNY_MEETING);
    const { result } = await run(id);
    const [note] = await notes();
    const line = `[App update] Brandon Ellis approved action ${id} (create_event): created the calendar event "November Member Meeting" (event id ${result.eventId}) for Saturday, November 7, 2026, 9:00–10:00 AM.`;
    expect(note).toMatchObject({ role: 'user', kind: 'app_note', display: { text: line } });
    expect(JSON.parse(note.raw)).toEqual([{ type: 'text', text: line }]);
  });

  it("won't test-send an event", async () => {
    const id = await propose('create_event', DENNY_MEETING);
    await expect(run(id, { mode: 'test' })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await action(id)).status).toBe('proposed');
    expect((await db.collection('events').get()).size).toBe(0);
  });

  it('applies valid overrides and refuses ones that break the schema, leaving the action proposed', async () => {
    const id = await propose('create_event', DENNY_MEETING);
    await expect(run(id, { overrides: { end: '2026-11-07T08:00' } })).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await action(id)).status).toBe('proposed');
    const { result } = await run(id, { overrides: { title: 'Member Meeting + Potluck' } });
    expect(result.title).toBe('Member Meeting + Potluck');
    expect((await action(id)).input.title).toBe('Member Meeting + Potluck');
  });
});

describe('executeAction: send_email', () => {
  it('a double approve sends exactly once', async () => {
    const id = await propose('send_email', EMAIL);
    const outcomes = await Promise.allSettled([run(id), run(id)]);
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o): o is PromiseRejectedResult => o.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'failed-precondition' });
    expect(await jobs()).toHaveLength(1);
    expect((await action(id)).status).toBe('executed');
    expect(await notes()).toHaveLength(1);
  });

  it('queues the job as the approving admin, from the assistant', async () => {
    const id = await propose('send_email', EMAIL);
    const res = await run(id);
    expect(res).toEqual({ status: 'executed', result: { jobId: expect.any(String), total: 3, skipped: 0 } });
    const [job] = await jobs();
    expect(job).toMatchObject({
      id: res.result.jobId,
      subject: EMAIL.subject,
      body: EMAIL.body,
      status: 'queued',
      test: false,
      total: 3,
      source: 'assistant',
      createdBy: 'admin1',
      createdByName: 'Brandon Ellis',
      assistantRef: { threadId: THREAD, actionId: id },
    });
    expect(job).not.toHaveProperty('rsvpEventId');
    expect((await action(id)).result).toEqual(res.result);
    expect((await notes())[0].display.text).toBe(
      `[App update] Brandon Ellis approved action ${id} (send_email): queued email job ${res.result.jobId} to 3 members.`,
    );
  });

  it('needs the event it RSVPs to approved first, then links the real event', async () => {
    const eventActionId = await propose('create_event', DENNY_MEETING);
    const emailId = await propose('send_email', { ...EMAIL, body: 'Please RSVP: {rsvpLink}', rsvp: { eventActionId } });
    expect((await action(emailId)).dependsOn).toBe(eventActionId);
    await expect(run(emailId)).rejects.toMatchObject({ code: 'failed-precondition', message: expect.stringMatching(/Approve the event first/) });
    expect((await action(emailId)).status).toBe('proposed');
    expect(await jobs()).toHaveLength(0);

    const { result: event } = await run(eventActionId);
    await run(emailId);
    const [job] = await jobs();
    expect(job.rsvpEventId).toBe(event.eventId);
  });

  it('RSVPs to an event already on the calendar by id', async () => {
    await db.doc('events/E1').set({ title: 'Workday', type: 'workday' });
    const id = await propose('send_email', { ...EMAIL, rsvp: { eventId: 'E1' } });
    await run(id);
    expect((await jobs())[0].rsvpEventId).toBe('E1');
  });

  it('test-sends to the approving admin only, keeps the action proposed, and a run still works after', async () => {
    const id = await propose('send_email', EMAIL);
    const res = await run(id, { mode: 'test' });
    expect(res).toEqual({ status: 'proposed', result: { jobId: expect.any(String), total: 1, skipped: 0 } });
    const [job] = await jobs();
    expect(job).toMatchObject({ id: res.result.jobId, test: true, total: 1, source: 'assistant' });
    expect(job.recipients).toEqual([{ memberId: 'admin1', displayName: 'Brandon Ellis', email: 'brandon@example.com' }]);
    const after = await action(id);
    expect(after.status).toBe('proposed');
    expect(after.tests).toEqual([{ at: Timestamp.fromDate(NOW), toName: 'Brandon Ellis', jobId: res.result.jobId }]);
    expect(after).not.toHaveProperty('executedBy');
    expect((await notes())[0].display.text).toBe('[App update] Test email sent to Brandon Ellis only.');

    await expect(run(id)).resolves.toMatchObject({ status: 'executed', result: { total: 3 } });
    expect((await jobs()).filter((j) => !j.test)).toHaveLength(1);
  });

  it('hides contact details in the names it puts in app notes (the model reads them)', async () => {
    await db.doc('members/m-pat').set({ displayName: 'Pat 5125550142', email: 'pat@example.com', role: 'member', status: 'active' });
    const id = await propose('send_email', EMAIL);
    await run(id, { mode: 'test', testMemberId: 'm-pat' });
    await run(id, { caller: { ...brandon, displayName: 'Brandon brandon@example.com' } });
    const [test, approval] = await notes();
    expect(test.display.text).toBe('[App update] Test email sent to Pat [phone hidden] only.');
    expect(approval.display.text).toMatch(/^\[App update\] Brandon \[email hidden\] approved action /);
    expect(JSON.stringify([test.raw, approval.raw])).not.toMatch(/5125550142|@/);
  });

  it('test-sends to a chosen member', async () => {
    const id = await propose('send_email', EMAIL);
    await run(id, { mode: 'test', testMemberId: 'm-denny' });
    expect((await jobs())[0].recipients).toEqual([{ memberId: 'm-denny', displayName: 'Denny Smith', email: 'denny@example.com' }]);
    expect((await action(id)).tests[0].toName).toBe('Denny Smith');
  });

  it('uses overrides for the send, and refuses a raw-address audience override', async () => {
    const id = await propose('send_email', EMAIL);
    await expect(run(id, { overrides: { audience: { kind: 'emails', emails: ['evil@example.com'] } } })).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect((await action(id)).status).toBe('proposed');
    expect(await jobs()).toHaveLength(0);

    await run(id, { overrides: { subject: 'New' } });
    expect((await jobs())[0].subject).toBe('New');
    expect((await action(id)).input.subject).toBe('New');
  });

  it('puts the action back to proposed with the error when the send fails', async () => {
    const id = await propose('send_email', { ...EMAIL, audience: { kind: 'members', memberIds: ['m-nobody'] } });
    await expect(run(id)).rejects.toMatchObject({ code: 'invalid-argument', message: expect.stringMatching(/No one to email/) });
    const after = await action(id);
    expect(after).toMatchObject({ status: 'proposed', error: expect.stringMatching(/No one to email/) });
    expect(after).not.toHaveProperty('executedBy');
    expect(await notes()).toHaveLength(0);
  });
});

describe('executeAction: update_event', () => {
  beforeEach(async () => {
    await db.doc('events/E1').set({
      title: 'November Meeting',
      type: 'meeting',
      start: Timestamp.fromDate(new Date('2026-11-07T15:00:00Z')),
      end: Timestamp.fromDate(new Date('2026-11-07T16:00:00Z')),
      allDay: false,
      location: 'Pavilion',
      createdBy: 'admin1',
    });
  });

  it('changes only the given fields and reports the resulting time', async () => {
    const id = await propose('update_event', { eventId: 'E1', end: '2026-11-07T10:30', location: 'Tool shed' });
    const res = await run(id);
    expect(res).toEqual({
      status: 'executed',
      result: {
        eventId: 'E1',
        title: 'November Meeting',
        when: 'Saturday, November 7, 2026, 9:00–10:30 AM',
        url: 'https://sacg-garden-app.web.app/calendar',
        changed: ['end', 'location'],
      },
    });
    const event = (await db.doc('events/E1').get()).data()!;
    expect(event.end.toDate().toISOString()).toBe('2026-11-07T16:30:00.000Z');
    expect(event).toMatchObject({ title: 'November Meeting', location: 'Tool shed', createdBy: 'admin1' });
  });

  it('refuses an end before the event start, and an event that is gone', async () => {
    const early = await propose('update_event', { eventId: 'E1', end: '2026-11-07T08:00' });
    await expect(run(early)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await action(early)).status).toBe('proposed');

    const later = await propose('update_event', { eventId: 'E1', title: 'Renamed' });
    await db.doc('events/E1').delete();
    await expect(run(later)).rejects.toMatchObject({ code: 'not-found' });
    expect(await action(later)).toMatchObject({ status: 'proposed', error: expect.any(String) });
  });
});

describe('executeAction: post_announcement and create_poll', () => {
  it('posts an announcement shaped like the lounge form, expiring at 11:59 PM garden time', async () => {
    const id = await propose('post_announcement', { title: 'Water off Saturday', body: 'Spigots off 8–10 AM.', pinned: true, expiresOn: '2026-11-14' });
    const { result } = await run(id);
    expect(result).toEqual({ announcementId: expect.any(String), title: 'Water off Saturday', url: 'https://sacg-garden-app.web.app/lounge' });
    const doc = (await db.doc(`announcements/${result.announcementId}`).get()).data()!;
    expect(doc).toEqual({
      title: 'Water off Saturday',
      body: 'Spigots off 8–10 AM.',
      pinned: true,
      expiresAt: Timestamp.fromDate(new Date('2026-11-15T05:59:00Z')),
      createdBy: 'admin1',
      authorName: 'Brandon Ellis',
      createdAt: expect.any(Timestamp),
    });
  });

  it('posts an announcement without an end date as lasting indefinitely, and refuses a past one', async () => {
    const forever = await propose('post_announcement', { title: 'Rules', body: 'Be kind.', pinned: false });
    const { result } = await run(forever);
    expect((await db.doc(`announcements/${result.announcementId}`).get()).get('expiresAt')).toBeNull();

    const stale = await propose('post_announcement', { title: 'Old', body: 'Old news.', pinned: false, expiresOn: '2026-10-31' });
    await expect(run(stale)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect((await action(stale)).status).toBe('proposed');
  });

  it('creates a poll shaped like the polls page, closing at 11:59 PM garden time', async () => {
    const id = await propose('create_poll', { question: 'What should we plant?', options: ['Tomatoes', 'Peppers', 'Squash'], closesOn: '2026-11-15' });
    const { result } = await run(id);
    expect(result).toEqual({ pollId: expect.any(String), question: 'What should we plant?', url: 'https://sacg-garden-app.web.app/polls' });
    const doc = (await db.doc(`polls/${result.pollId}`).get()).data()!;
    expect(doc).toEqual({
      question: 'What should we plant?',
      options: [
        { id: '0', text: 'Tomatoes' },
        { id: '1', text: 'Peppers' },
        { id: '2', text: 'Squash' },
      ],
      createdBy: 'admin1',
      authorName: 'Brandon Ellis',
      expiresAt: Timestamp.fromDate(new Date('2026-11-16T05:59:00Z')),
      closed: false,
      createdAt: expect.any(Timestamp),
    });
  });
});

describe('the approval state machine', () => {
  it('rejects a proposal, notes it, and then refuses to execute or reject it again', async () => {
    const id = await propose('send_email', EMAIL);
    await expect(rejectAction(db, { threadId: THREAD, actionId: id, caller: brandon })).resolves.toEqual({ status: 'rejected' });
    expect((await action(id)).status).toBe('rejected');
    expect((await notes())[0].display.text).toBe(`[App update] Brandon Ellis rejected action ${id} (send_email).`);
    await expect(run(id)).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(run(id, { mode: 'test' })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(rejectAction(db, { threadId: THREAD, actionId: id, caller: brandon })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(await jobs()).toHaveLength(0);
  });

  it('refuses to run an executed action again, or to reject it', async () => {
    const id = await propose('create_event', DENNY_MEETING);
    await run(id);
    await expect(run(id)).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(rejectAction(db, { threadId: THREAD, actionId: id, caller: brandon })).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect((await db.collection('events').get()).size).toBe(1);
  });

  it('answers an unknown action as not-found', async () => {
    await expect(run('nope')).rejects.toMatchObject({ code: 'not-found' });
    await expect(rejectAction(db, { threadId: THREAD, actionId: 'nope', caller: brandon })).rejects.toMatchObject({
      code: 'not-found',
    });
  });
});

describe('exactly-once effects', () => {
  const MEETING_DOC = {
    title: 'November Member Meeting',
    type: 'meeting',
    start: Timestamp.fromDate(new Date('2026-11-07T15:00:00Z')),
    end: Timestamp.fromDate(new Date('2026-11-07T16:00:00Z')),
    allDay: false,
    createdBy: 'admin1',
  };

  it('keys each approved effect by its action id; test sends keep their own ids', async () => {
    const eventId = await propose('create_event', DENNY_MEETING);
    expect((await run(eventId)).result.eventId).toBe(eventId);
    const postId = await propose('post_announcement', { title: 'Rules', body: 'Be kind.', pinned: false });
    expect((await run(postId)).result.announcementId).toBe(postId);
    const pollId = await propose('create_poll', { question: 'Plant what?', options: ['Kale', 'Okra'] });
    expect((await run(pollId)).result.pollId).toBe(pollId);
    const emailId = await propose('send_email', EMAIL);
    expect((await run(emailId, { mode: 'test' })).result.jobId).not.toBe(emailId);
    expect((await run(emailId)).result.jobId).toBe(emailId);
  });

  it('a re-approve after an ambiguous failure finds the effect already done: one job, one event', async () => {
    // Each first attempt committed its write, then failed and rolled back to proposed.
    const emailId = await propose('send_email', EMAIL);
    await createEmailJob(db, { ...EMAIL, audience: { kind: 'all_active' }, source: 'assistant', createdBy: 'admin1', createdByName: 'Brandon Ellis', jobId: emailId });
    await actionRef(emailId).update({ error: '4 DEADLINE_EXCEEDED' });
    await expect(run(emailId)).resolves.toEqual({ status: 'executed', result: { jobId: emailId, total: 3, skipped: 0 } });
    expect(await jobs()).toHaveLength(1);

    const eventActionId = await propose('create_event', DENNY_MEETING);
    await db.doc(`events/${eventActionId}`).create(MEETING_DOC);
    const { result } = await run(eventActionId);
    expect(result).toMatchObject({ eventId: eventActionId, when: 'Saturday, November 7, 2026, 9:00–10:00 AM' });
    expect((await db.collection('events').get()).size).toBe(1);
  });

  it('finalizes an action stuck in executing whose effect happened (its final write was lost)', async () => {
    const id = await propose('create_event', DENNY_MEETING);
    await db.doc(`events/${id}`).create(MEETING_DOC);
    await actionRef(id).update({ status: 'executing', claimedAt: ago(3 * 60_000), executedBy: 'admin1' });
    const res = await run(id);
    expect(res).toEqual({
      status: 'executed',
      result: {
        eventId: id,
        title: 'November Member Meeting',
        when: 'Saturday, November 7, 2026, 9:00–10:00 AM',
        url: 'https://sacg-garden-app.web.app/calendar',
      },
    });
    expect(await action(id)).toMatchObject({ status: 'executed', result: res.result, executedAt: expect.any(Timestamp) });
    expect((await db.collection('events').get()).size).toBe(1);
    expect(await notes()).toHaveLength(1);
  });

  it('finalizes a stuck email whose job was queued, without queuing another', async () => {
    const id = await propose('send_email', EMAIL);
    await createEmailJob(db, { ...EMAIL, audience: { kind: 'all_active' }, source: 'assistant', createdBy: 'admin1', createdByName: 'Brandon Ellis', jobId: id });
    await actionRef(id).update({ status: 'executing', claimedAt: ago(3 * 60_000) });
    await expect(run(id, { mode: 'test' })).resolves.toEqual({ status: 'executed', result: { jobId: id, total: 3, skipped: 0 } });
    expect(await jobs()).toHaveLength(1);
  });

  it('releases a stuck claim with no effect once its lease has passed; the approval then runs once', async () => {
    const id = await propose('send_email', EMAIL);
    await actionRef(id).update({ status: 'executing', claimedAt: ago(3 * 60_000), executedBy: 'admin1' });
    await run(id, { mode: 'test' });
    expect(await action(id)).toMatchObject({ status: 'proposed' });
    expect(await action(id)).not.toHaveProperty('executedBy');
    await run(id);
    expect((await jobs()).filter((j) => !j.test)).toHaveLength(1);
    expect((await action(id)).status).toBe('executed');
  });

  it('still refuses an action whose claim is fresh: another approval is running', async () => {
    const id = await propose('send_email', EMAIL);
    await actionRef(id).update({ status: 'executing', claimedAt: ago(30_000) });
    await expect(run(id)).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(run(id, { mode: 'test' })).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(await jobs()).toHaveLength(0);
  });

  it('records the claim time, and clears it when a failed run goes back to proposed', async () => {
    const id = await propose('send_email', { ...EMAIL, audience: { kind: 'members', memberIds: ['m-nobody'] } });
    const fresh = await propose('create_event', DENNY_MEETING);
    await run(fresh);
    expect((await action(fresh)).claimedAt).toEqual(Timestamp.fromDate(NOW));
    await expect(run(id)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(await action(id)).not.toHaveProperty('claimedAt');
  });
});

describe('retryOnce', () => {
  it('retries a failed write once', async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error('14 UNAVAILABLE')).mockResolvedValueOnce(undefined);
    await retryOnce(write, 0);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('gives up after the second failure', async () => {
    const write = vi.fn().mockRejectedValue(new Error('14 UNAVAILABLE'));
    await expect(retryOnce(write, 0)).rejects.toThrow('14 UNAVAILABLE');
    expect(write).toHaveBeenCalledTimes(2);
  });
});
