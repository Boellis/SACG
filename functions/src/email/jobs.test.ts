import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { testDb, clearFirestore } from '../testing/emulator';
import { logger } from 'firebase-functions/v2';
import {
  createEmailJob,
  processEmailJob,
  EmailJobBusyError,
  EMAIL_GAP_MS,
  EMAIL_TRIGGER_TIMEOUT_S,
  LEASE_MS,
  MAX_RECIPIENTS,
  type CreateEmailJobInput,
} from './jobs';

const db = testDb();
const FAST = { gapMs: 0 };
// The injected clock for leases.
const NOW = new Date('2026-11-07T15:00:00Z');
const clock = () => NOW;
const minutesBefore = (m: number) => Timestamp.fromMillis(NOW.getTime() - m * 60_000);

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

/** `count` more active members with email, ids bulk{from}..bulk{from + count - 1}. */
async function seedBulkMembers(count: number, from = 0): Promise<void> {
  const batch = db.batch();
  for (let i = from; i < from + count; i++) {
    batch.set(db.doc(`members/bulk${i}`), {
      displayName: `Bulk Member ${i}`,
      email: `bulk${i}@example.com`,
      role: 'member',
      status: 'active',
    });
  }
  await batch.commit();
}

/**
 * A 3-recipient job (admin1, m-bea, m-denny) as an interrupted run leaves it:
 * 'sending', claimed `claimedMinutesAgo` before NOW, with mail docs already
 * written for `alreadySent`.
 */
async function interruptedJob(claimedMinutesAgo: number, alreadySent: string[]): Promise<string> {
  const { jobId } = await createEmailJob(db, input());
  await db.doc(`emailJobs/${jobId}`).update({
    status: 'sending',
    claimedAt: minutesBefore(claimedMinutesAgo),
    sent: alreadySent.length,
  });
  for (const memberId of alreadySent) {
    await db.doc(`mail/${jobId}_${memberId}`).set({ marker: 'sent by the earlier run', emailJobId: jobId });
  }
  return jobId;
}

describe('limits', () => {
  it('a full job fits inside the trigger timeout with 30 s to spare', () => {
    expect(EMAIL_GAP_MS).toBe(4000);
    expect(EMAIL_TRIGGER_TIMEOUT_S).toBe(540);
    // A gap between every two sends, plus up to 500 ms of Firestore work per recipient.
    const worstCaseMs = (MAX_RECIPIENTS - 1) * EMAIL_GAP_MS + MAX_RECIPIENTS * 500;
    expect(worstCaseMs).toBeLessThanOrEqual(EMAIL_TRIGGER_TIMEOUT_S * 1000 - 30_000);
  });

  it('a lease outlives the trigger timeout, so a live run is never stolen from', () => {
    expect(LEASE_MS).toBe(600_000);
    expect(LEASE_MS).toBeGreaterThan(EMAIL_TRIGGER_TIMEOUT_S * 1000);
  });
});

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

  it('accepts 100 recipients and rejects 101 as invalid-argument', async () => {
    expect(MAX_RECIPIENTS).toBe(100);
    await seedBulkMembers(97); // + admin1, m-bea and m-denny = 100
    await expect(createEmailJob(db, input())).resolves.toMatchObject({ total: 100 });
    await seedBulkMembers(1, 97); // the 101st
    await expect(createEmailJob(db, input())).rejects.toMatchObject({
      code: 'invalid-argument',
      message: "That's 101 recipients; the limit is 100 per email.",
    });
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
    const runs = await Promise.allSettled([processEmailJob(db, jobId, FAST), processEmailJob(db, jobId, FAST)]);
    // One run claims the job. The other finds it under that run's fresh lease and
    // throws the retryable busy error (or, starting after the first finished, finds
    // it done and does nothing).
    expect(runs.some((r) => r.status === 'fulfilled')).toBe(true);
    for (const r of runs) if (r.status === 'rejected') expect(r.reason).toBeInstanceOf(EmailJobBusyError);
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

  it('leaves missing, done and failed jobs alone', async () => {
    await expect(processEmailJob(db, 'does-not-exist', FAST)).resolves.toBeUndefined();
    for (const status of ['done', 'failed']) {
      const { jobId } = await createEmailJob(db, input());
      await db.doc(`emailJobs/${jobId}`).update({ status });
      await expect(processEmailJob(db, jobId, FAST)).resolves.toBeUndefined();
      expect(await mailFor(jobId)).toHaveLength(0);
      expect(await jobDoc(jobId)).toMatchObject({ status, sent: 0 });
    }
  });

  it('claims a queued job with a lease from the injected clock', async () => {
    const { jobId } = await createEmailJob(db, input());
    let leased: unknown;
    // Peek at the job between sends, while this run holds it.
    const sleep = vi.fn(async () => {
      leased ??= (await jobDoc(jobId)).claimedAt;
    });
    await processEmailJob(db, jobId, { sleep, now: clock });
    expect(leased).toEqual(Timestamp.fromDate(NOW));
    expect(await jobDoc(jobId)).toMatchObject({ status: 'done', sent: 3 });
  });

  it('resumes a job whose lease expired (11 min): sends only the missing mail and ends done', async () => {
    const jobId = await interruptedJob(11, ['admin1', 'm-bea']);
    const sleep = vi.fn(async (_ms: number) => {});
    await processEmailJob(db, jobId, { sleep, now: clock });

    expect(await mailFor(jobId)).toHaveLength(3);
    for (const memberId of ['admin1', 'm-bea']) {
      // create() never overwrites: the earlier run's mail docs are untouched.
      expect((await db.doc(`mail/${jobId}_${memberId}`).get()).data()).toEqual({
        marker: 'sent by the earlier run',
        emailJobId: jobId,
      });
    }
    expect((await db.doc(`mail/${jobId}_m-denny`).get()).get('to')).toEqual(['denny@example.com']);
    const job = await jobDoc(jobId);
    expect(job).toMatchObject({ status: 'done', sent: 3, failed: 0 });
    expect(job.claimedAt).toEqual(Timestamp.fromDate(NOW));
    expect(job.finishedAt).toBeInstanceOf(Timestamp);
    expect(sleep).not.toHaveBeenCalled(); // the only new mail was also the last
  });

  it.each([1, 9])(
    'throws a retryable error and sends nothing while another run holds a fresh lease (%i min old)',
    async (minutes) => {
      const jobId = await interruptedJob(minutes, []);
      const before = await jobDoc(jobId);
      await expect(processEmailJob(db, jobId, { ...FAST, now: clock })).rejects.toBeInstanceOf(EmailJobBusyError);
      expect(await mailFor(jobId)).toHaveLength(0);
      expect(await jobDoc(jobId)).toEqual(before); // still 'sending' under the other run's lease
    },
  );

  it('never sleeps for mail an earlier run already queued, only after newly created mail', async () => {
    const jobId = await interruptedJob(11, ['admin1']);
    const sleep = vi.fn(async (_ms: number) => {});
    await processEmailJob(db, jobId, { sleep, now: clock });
    // admin1 already queued: no wait. m-bea new: one gap. m-denny new but last: no wait.
    expect(sleep.mock.calls).toEqual([[EMAIL_GAP_MS]]);
    expect(await jobDoc(jobId)).toMatchObject({ status: 'done', sent: 3, failed: 0 });
  });

  it('writes absolute counts on a resume, so nothing is double-counted', async () => {
    const jobId = await interruptedJob(11, ['admin1', 'm-bea']);
    // As the earlier run left them: m-denny's send had failed.
    await db.doc(`emailJobs/${jobId}`).update({ sent: 2, failed: 1 });
    await processEmailJob(db, jobId, { ...FAST, now: clock });
    expect(await jobDoc(jobId)).toMatchObject({ status: 'done', sent: 3, failed: 0 });
  });

  it('finishes a resumed job whose mail was all queued already (the run died before its final write)', async () => {
    const jobId = await interruptedJob(11, ['admin1', 'm-bea', 'm-denny']);
    // It queued m-denny's mail, then died before writing that progress.
    await db.doc(`emailJobs/${jobId}`).update({ sent: 2 });
    const sleep = vi.fn(async (_ms: number) => {});
    await processEmailJob(db, jobId, { sleep, now: clock });
    expect(await mailFor(jobId)).toHaveLength(3);
    expect(await jobDoc(jobId)).toMatchObject({ status: 'done', sent: 3, failed: 0 });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('resumes a job left sending without any lease', async () => {
    const { jobId } = await createEmailJob(db, input());
    await db.doc(`emailJobs/${jobId}`).update({ status: 'sending' });
    await processEmailJob(db, jobId, { ...FAST, now: clock });
    expect(await mailFor(jobId)).toHaveLength(3);
    expect(await jobDoc(jobId)).toMatchObject({ status: 'done', sent: 3, failed: 0 });
  });

  it('an infrastructure error propagates, leaving the job leased; a run after the lease resumes it', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    try {
      const { jobId } = await createEmailJob(db, input());
      const crash = new Error('instance shut down mid-job');
      await expect(
        processEmailJob(db, jobId, {
          sleep: async () => {
            throw crash;
          },
          now: clock,
        }),
      ).rejects.toBe(crash);
      // Not marked failed: still 'sending' under this run's lease, with its progress.
      expect(await jobDoc(jobId)).toMatchObject({ status: 'sending', sent: 1, failed: 0 });
      expect(await mailFor(jobId)).toHaveLength(1);

      // A redelivery inside the lease backs off ...
      await expect(processEmailJob(db, jobId, { ...FAST, now: clock })).rejects.toBeInstanceOf(EmailJobBusyError);
      // ... and one after it expires finishes the job.
      const later = () => new Date(NOW.getTime() + LEASE_MS + 1);
      await processEmailJob(db, jobId, { ...FAST, now: later });
      expect(await mailFor(jobId)).toHaveLength(3);
      expect(await jobDoc(jobId)).toMatchObject({ status: 'done', sent: 3, failed: 0 });
    } finally {
      vi.restoreAllMocks();
    }
  });
});
