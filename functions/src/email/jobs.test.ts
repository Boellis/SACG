import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { testDb, clearFirestore } from '../testing/emulator';
import { createEmailJob, processEmailJob, EMAIL_GAP_MS, MAX_RECIPIENTS, type CreateEmailJobInput } from './jobs';

const db = testDb();
const FAST = { gapMs: 0 };

const MEMBERS: Record<string, Record<string, unknown>> = {
  admin1: { displayName: 'Ada Admin', email: 'ada@example.com', role: 'admin', status: 'active' },
  'm-bea': { displayName: 'Bea Example', email: 'bea@example.com', role: 'member', status: 'active' },
  'm-denny': { displayName: 'Denny Smith', email: 'denny@example.com', role: 'member', status: 'active' },
  'p-pat': { displayName: 'Pat Pending', email: 'pat@example.com', role: 'member', status: 'pending' },
};

beforeEach(async () => {
  await clearFirestore();
  const batch = db.batch();
  for (const [id, data] of Object.entries(MEMBERS)) batch.set(db.doc(`members/${id}`), data);
  batch.set(db.doc('events/E1'), { title: 'Fall Workday', type: 'workday' });
  await batch.commit();
});

const input = (over: Partial<CreateEmailJobInput> = {}): CreateEmailJobInput => ({
  audience: { kind: 'all_active' },
  subject: 'Hello {firstName}',
  body: 'See you at the garden.',
  source: 'calendar',
  createdBy: 'admin1',
  createdByName: 'Ada Admin',
  ...over,
});

const mailFor = async (jobId: string) =>
  (await db.collection('mail').where('emailJobId', '==', jobId).get()).docs;
const jobDoc = async (jobId: string) => (await db.doc(`emailJobs/${jobId}`).get()).data()!;

describe('createEmailJob', () => {
  it('queues a job with the resolved recipients and the spec shape', async () => {
    const res = await createEmailJob(db, input());
    expect(res).toEqual({ jobId: expect.any(String), total: 3, skipped: 0 });
    const job = await jobDoc(res.jobId);
    expect(job).toMatchObject({
      subject: 'Hello {firstName}',
      body: 'See you at the garden.',
      recipients: [
        { memberId: 'admin1', displayName: 'Ada Admin', email: 'ada@example.com' },
        { memberId: 'm-bea', displayName: 'Bea Example', email: 'bea@example.com' },
        { memberId: 'm-denny', displayName: 'Denny Smith', email: 'denny@example.com' },
      ],
      total: 3,
      sent: 0,
      failed: 0,
      skippedNoEmail: 0,
      status: 'queued',
      test: false,
      source: 'calendar',
      createdBy: 'admin1',
      createdByName: 'Ada Admin',
    });
    expect(job.createdAt).toBeInstanceOf(Timestamp);
    expect(job).not.toHaveProperty('rsvpEventId');
    expect(job).not.toHaveProperty('assistantRef');
  });

  it('narrows the audience to exactly the test member and marks the job as a test', async () => {
    const res = await createEmailJob(db, input({ testMemberId: 'm-denny' }));
    expect(res.total).toBe(1);
    const job = await jobDoc(res.jobId);
    expect(job.test).toBe(true);
    expect(job.recipients).toEqual([{ memberId: 'm-denny', displayName: 'Denny Smith', email: 'denny@example.com' }]);
  });

  it('stores the RSVP event and assistant reference when given', async () => {
    const res = await createEmailJob(
      db,
      input({ rsvpEventId: 'E1', source: 'assistant', assistantRef: { threadId: 't1', actionId: 'a1' } }),
    );
    expect(await jobDoc(res.jobId)).toMatchObject({
      rsvpEventId: 'E1',
      source: 'assistant',
      assistantRef: { threadId: 't1', actionId: 'a1' },
    });
  });

  it('rejects more than MAX_RECIPIENTS recipients', async () => {
    const batch = db.batch();
    for (let i = 0; i < MAX_RECIPIENTS + 1; i++) {
      batch.set(db.doc(`members/bulk${i}`), {
        displayName: `Bulk Member ${i}`,
        email: `bulk${i}@example.com`,
        role: 'member',
        status: 'active',
      });
    }
    await batch.commit();
    await expect(createEmailJob(db, input())).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects an audience with no deliverable recipients', async () => {
    await expect(
      createEmailJob(db, input({ audience: { kind: 'members', memberIds: ['p-pat'] } })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects a missing RSVP event as not-found', async () => {
    await expect(createEmailJob(db, input({ rsvpEventId: 'nope' }))).rejects.toMatchObject({ code: 'not-found' });
  });

  it.each([
    ['empty subject', { subject: '   ' }],
    ['subject over 200 chars', { subject: 'x'.repeat(201) }],
    ['empty body', { body: '' }],
    ['body over 20000 chars', { body: 'x'.repeat(20001) }],
    ['{rsvpLink} without an RSVP event', { body: 'Reply here: {rsvpLink}' }],
    ['a raw-address audience', { audience: { kind: 'emails', emails: ['evil@example.com'] } }],
  ])('rejects %s as invalid-argument', async (_label, over) => {
    await expect(createEmailJob(db, input(over as Partial<CreateEmailJobInput>))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect((await db.collection('emailJobs').get()).size).toBe(0);
  });
});

describe('processEmailJob', () => {
  it('writes one mail doc per recipient and finishes done', async () => {
    const { jobId } = await createEmailJob(db, input());
    await processEmailJob(db, jobId, FAST);

    const mail = await mailFor(jobId);
    expect(mail.map((d) => d.id).sort()).toEqual([`${jobId}_admin1`, `${jobId}_m-bea`, `${jobId}_m-denny`]);
    const denny = (await db.doc(`mail/${jobId}_m-denny`).get()).data()!;
    expect(denny).toMatchObject({
      to: ['denny@example.com'],
      message: { subject: 'Hello Denny', text: 'See you at the garden.' },
      toName: 'Denny Smith',
      createdBy: 'admin1',
      emailJobId: jobId,
    });
    expect(denny.message.html).toContain('See you at the garden.');
    expect(denny.createdAt).toBeInstanceOf(Timestamp);

    const job = await jobDoc(jobId);
    expect(job).toMatchObject({ status: 'done', sent: 3, failed: 0 });
    expect(job.finishedAt).toBeInstanceOf(Timestamp);
  });

  it('is idempotent: re-running a finished job sends nothing new', async () => {
    const { jobId } = await createEmailJob(db, input());
    await processEmailJob(db, jobId, FAST);
    const before = (await mailFor(jobId)).map((d) => d.updateTime.toMillis()).sort();

    await processEmailJob(db, jobId, FAST);

    const after = await mailFor(jobId);
    expect(after).toHaveLength(3);
    expect(after.map((d) => d.updateTime.toMillis()).sort()).toEqual(before);
    expect(await jobDoc(jobId)).toMatchObject({ status: 'done', sent: 3 });
  });

  it('two concurrent runs of the same job send exactly once', async () => {
    const { jobId } = await createEmailJob(db, input());
    await Promise.all([processEmailJob(db, jobId, FAST), processEmailJob(db, jobId, FAST)]);
    expect(await mailFor(jobId)).toHaveLength(3);
    expect(await jobDoc(jobId)).toMatchObject({ status: 'done', sent: 3, failed: 0 });
  });

  it('counts an already-existing mail doc as sent and never overwrites it', async () => {
    const { jobId } = await createEmailJob(db, input());
    await db.doc(`mail/${jobId}_m-bea`).set({ marker: 'sent by an earlier attempt', emailJobId: jobId });

    await processEmailJob(db, jobId, FAST);

    expect((await db.doc(`mail/${jobId}_m-bea`).get()).data()).toEqual({
      marker: 'sent by an earlier attempt',
      emailJobId: jobId,
    });
    expect(await mailFor(jobId)).toHaveLength(3);
    expect(await jobDoc(jobId)).toMatchObject({ status: 'done', sent: 3, failed: 0 });
  });

  it('sends a test job to exactly one member', async () => {
    const { jobId } = await createEmailJob(db, input({ testMemberId: 'm-denny' }));
    await processEmailJob(db, jobId, FAST);
    const mail = await mailFor(jobId);
    expect(mail.map((d) => d.get('to'))).toEqual([['denny@example.com']]);
    expect(await jobDoc(jobId)).toMatchObject({ status: 'done', sent: 1, test: true });
  });

  it("gives each recipient their own RSVP link and buttons for the job's event", async () => {
    const { jobId } = await createEmailJob(db, input({ rsvpEventId: 'E1' }));
    await processEmailJob(db, jobId, FAST);

    const tokens: string[] = [];
    for (const doc of await mailFor(jobId)) {
      const memberId = doc.id.slice(jobId.length + 1);
      const { text, html } = doc.get('message');
      const m = /\/rsvp\/([A-Za-z0-9_-]+)/.exec(text);
      expect(m, `rsvp link in ${memberId}'s email`).not.toBeNull();
      const token = m![1];
      tokens.push(token);
      // The link belongs to this member's invite for this event, nobody else's.
      expect((await db.doc(`rsvpInvites/${token}`).get()).data()).toMatchObject({ eventId: 'E1', memberId });
      expect(text).toContain(`Please RSVP here: https://sacg-garden-app.web.app/rsvp/${token}`);
      for (const answer of ['yes', 'maybe', 'no']) {
        expect(html).toContain(`href="https://sacg-garden-app.web.app/rsvp/${token}?answer=${answer}"`);
      }
    }
    expect(new Set(tokens).size).toBe(3);
  });

  it('sleeps EMAIL_GAP_MS between sends, but not before the first or after the last', async () => {
    const { jobId } = await createEmailJob(db, input());
    const sleep = vi.fn(async (_ms: number) => {});
    await processEmailJob(db, jobId, { sleep });
    expect(EMAIL_GAP_MS).toBe(4000);
    expect(sleep.mock.calls).toEqual([[4000], [4000]]);
  });

  it('marks the job failed with an error when every send fails', async () => {
    // A corrupted job (recipient without an address) makes every write throw.
    await db.doc('emailJobs/broken').set({
      subject: 'S',
      body: 'B',
      recipients: [{ memberId: 'm-bea', displayName: 'Bea Example' }],
      total: 1,
      sent: 0,
      failed: 0,
      skippedNoEmail: 0,
      status: 'queued',
      test: false,
      source: 'calendar',
      createdBy: 'admin1',
      createdByName: 'Ada Admin',
    });
    await processEmailJob(db, 'broken', FAST);
    const job = await jobDoc('broken');
    expect(job).toMatchObject({ status: 'failed', sent: 0, failed: 1 });
    expect(job.error).toEqual(expect.any(String));
    expect(job.finishedAt).toBeInstanceOf(Timestamp);
  });

  it('ignores jobs that are missing or not queued', async () => {
    await processEmailJob(db, 'does-not-exist', FAST);
    const { jobId } = await createEmailJob(db, input());
    await db.doc(`emailJobs/${jobId}`).update({ status: 'sending' });
    await processEmailJob(db, jobId, FAST);
    expect(await mailFor(jobId)).toHaveLength(0);
  });
});
