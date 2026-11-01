import { describe, it, expect, beforeEach } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { testDb, clearFirestore } from '../testing/emulator';
import { queueMemberEmail, onEmailJobCreated } from './callables';

const db = testDb();

beforeEach(async () => {
  await clearFirestore();
  await db.doc('members/admin1').set({
    displayName: 'Ada Admin',
    email: 'ada@example.com',
    role: 'admin',
    status: 'active',
  });
  await db.doc('members/m-denny').set({
    displayName: 'Denny Smith',
    email: 'denny@example.com',
    role: 'member',
    status: 'active',
  });
  await db.doc('events/E1').set({ title: 'Fall Workday', type: 'workday' });
});

const call = (data: unknown, uid?: string) =>
  queueMemberEmail.run({ data, auth: uid ? { uid, token: {} } : undefined, rawRequest: {} } as unknown as CallableRequest);

const valid = { audience: { kind: 'all_active' }, subject: 'Hi {firstName}', body: 'Hello!' };
const jobCount = async () => (await db.collection('emailJobs').get()).size;

describe('queueMemberEmail', () => {
  it('rejects anonymous callers', async () => {
    await expect(call(valid)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects non-admin members', async () => {
    await expect(call(valid, 'm-denny')).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('rejects a raw-address audience', async () => {
    await expect(
      call({ ...valid, audience: { kind: 'emails', emails: ['evil@example.com'] } }, 'admin1'),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(await jobCount()).toBe(0);
  });

  it("rejects unknown fields, including a client claiming the assistant's source", async () => {
    await expect(call({ ...valid, source: 'assistant' }, 'admin1')).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(call({ ...valid, to: ['evil@example.com'] }, 'admin1')).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(await jobCount()).toBe(0);
  });

  it('queues a job attributed to the calling admin, defaulting source to calendar', async () => {
    const res = await call(valid, 'admin1');
    expect(res).toEqual({ jobId: expect.any(String), total: 2, skipped: 0 });
    expect((await db.doc(`emailJobs/${res.jobId}`).get()).data()).toMatchObject({
      createdBy: 'admin1',
      createdByName: 'Ada Admin',
      source: 'calendar',
      status: 'queued',
    });
  });

  it('passes source, rsvpEventId and testMemberId through', async () => {
    const res = await call({ ...valid, source: 'email-page', rsvpEventId: 'E1', testMemberId: 'm-denny' }, 'admin1');
    expect(res.total).toBe(1);
    expect((await db.doc(`emailJobs/${res.jobId}`).get()).data()).toMatchObject({
      source: 'email-page',
      rsvpEventId: 'E1',
      test: true,
    });
  });
});

describe('onEmailJobCreated', () => {
  it('processes the newly created job', async () => {
    const { jobId } = await call({ ...valid, testMemberId: 'm-denny' }, 'admin1');
    await onEmailJobCreated.run({ params: { jobId } } as unknown as Parameters<typeof onEmailJobCreated.run>[0]);
    expect((await db.doc(`mail/${jobId}_m-denny`).get()).get('to')).toEqual(['denny@example.com']);
    expect((await db.doc(`emailJobs/${jobId}`).get()).get('status')).toBe('done');
  });
});
