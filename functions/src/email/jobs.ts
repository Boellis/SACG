import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { AudienceSchema, DocIdSchema, MAX_RECIPIENTS, resolveAudience, type Audience, type Recipient } from './audience';
import { composeEmail, RSVP_LINK_TOKEN } from './compose';
import { findOrCreateInvite, rsvpUrl } from '../rsvp/invites';

export { MAX_RECIPIENTS };
/** Spacing between sends so Gmail's SMTP rate limit doesn't 421 a burst. */
export const EMAIL_GAP_MS = 4000;
/** onEmailJobCreated's timeout (the most an event trigger may have). A full
 *  job must finish inside it: see the timing budget test in jobs.test.ts. */
export const EMAIL_TRIGGER_TIMEOUT_S = 540;
/** How long a run's claim on a job holds. Longer than the trigger timeout, so
 *  a live run is never stolen from; a dead run's job is resumed once it lapses. */
export const LEASE_MS = 600_000;
export const EMAIL_JOBS = 'emailJobs';
const MAX_SUBJECT = 200;
const MAX_BODY = 20_000;

export type EmailJobSource = 'assistant' | 'calendar' | 'email-page';
export type EmailJobStatus = 'queued' | 'sending' | 'done' | 'failed';

export interface CreateEmailJobInput {
  audience: Audience;
  subject: string;
  body: string;
  rsvpEventId?: string;
  testMemberId?: string;
  source: EmailJobSource;
  createdBy: string;
  createdByName: string;
  assistantRef?: { threadId: string; actionId: string };
  /**
   * Queue under this id instead of a random one, making the call idempotent:
   * if a job with this id exists (an earlier attempt queued it, even one that
   * reported a failure), that job is returned and nothing new is queued.
   */
  jobId?: string;
}

/** Shape of an `emailJobs/{jobId}` doc (spec §4). Admin-readable, server-written. */
export interface EmailJobDoc {
  subject: string;
  body: string;
  rsvpEventId?: string;
  recipients: Recipient[];
  total: number;
  sent: number;
  failed: number;
  skippedNoEmail: number;
  status: EmailJobStatus;
  test: boolean;
  source: EmailJobSource;
  createdBy: string;
  createdByName: string;
  createdAt: Timestamp;
  /** When the current (or last) run claimed the job; see LEASE_MS. */
  claimedAt?: Timestamp;
  finishedAt?: Timestamp;
  error?: string;
  assistantRef?: { threadId: string; actionId: string };
}

const invalid = (message: string) => new HttpsError('invalid-argument', message);

const summaryOf = (job: DocumentSnapshot) => ({
  jobId: job.id,
  total: Number(job.get('total') ?? 0),
  skipped: Number(job.get('skippedNoEmail') ?? 0),
});

/**
 * Validate a send, resolve its audience server-side and queue an `emailJobs`
 * doc (status 'queued'); `onEmailJobCreated` then delivers it. With
 * `testMemberId` the audience becomes exactly that one member (`test: true`).
 * With `jobId` the job is created under that id, once: a repeat call returns
 * the existing job without re-checking anything (it may already be sending).
 */
export async function createEmailJob(
  db: Firestore,
  input: CreateEmailJobInput,
): Promise<{ jobId: string; total: number; skipped: number }> {
  const fixedId = input.jobId !== undefined;
  if (fixedId && !DocIdSchema.safeParse(input.jobId).success) throw invalid("That email job id isn't valid.");
  const ref = fixedId ? db.collection(EMAIL_JOBS).doc(input.jobId!) : db.collection(EMAIL_JOBS).doc();
  if (fixedId) {
    const existing = await ref.get();
    if (existing.exists) return summaryOf(existing);
  }

  const subject = String(input.subject ?? '').trim();
  const body = String(input.body ?? '');
  if (!subject) throw invalid('Add a subject.');
  if (subject.length > MAX_SUBJECT) throw invalid(`The subject must be ${MAX_SUBJECT} characters or fewer.`);
  if (!body.trim()) throw invalid('Add a message.');
  if (body.length > MAX_BODY) throw invalid('The message must be 20,000 characters or fewer.');
  if (!input.rsvpEventId && (body.includes(RSVP_LINK_TOKEN) || subject.includes(RSVP_LINK_TOKEN))) {
    throw invalid('The message uses {rsvpLink}, but no RSVP event was chosen.');
  }
  // Re-validated here (not only in the callable) so no caller can sneak in a
  // raw-address audience.
  const parsed = AudienceSchema.safeParse(input.audience);
  if (!parsed.success) throw invalid("That audience isn't valid.");
  let audience: Audience = parsed.data;
  if (input.testMemberId !== undefined) {
    if (!DocIdSchema.safeParse(input.testMemberId).success) throw invalid("That test recipient isn't valid.");
    audience = { kind: 'members', memberIds: [input.testMemberId] };
  }

  if (input.rsvpEventId !== undefined) {
    if (!DocIdSchema.safeParse(input.rsvpEventId).success) throw invalid("That RSVP event isn't valid.");
    const event = await db.collection('events').doc(input.rsvpEventId).get();
    if (!event.exists) throw new HttpsError('not-found', 'That event no longer exists.');
  }

  const { recipients, skippedNoEmail } = await resolveAudience(db, audience);
  if (recipients.length === 0) {
    throw invalid(
      skippedNoEmail > 0
        ? `No one to email: ${skippedNoEmail} matching member(s) have no email address.`
        : 'No one to email: no active members match that audience.',
    );
  }
  if (recipients.length > MAX_RECIPIENTS) {
    throw invalid(`That's ${recipients.length} recipients; the limit is ${MAX_RECIPIENTS} per email.`);
  }

  try {
    // create(), never set(): a job id is queued at most once.
    await ref.create({
      subject,
      body,
      ...(input.rsvpEventId ? { rsvpEventId: input.rsvpEventId } : {}),
      recipients,
      total: recipients.length,
      sent: 0,
      failed: 0,
      skippedNoEmail,
      status: 'queued',
      test: input.testMemberId !== undefined,
      source: input.source,
      createdBy: input.createdBy,
      createdByName: input.createdByName,
      createdAt: FieldValue.serverTimestamp(),
      ...(input.assistantRef ? { assistantRef: input.assistantRef } : {}),
    });
  } catch (err) {
    // A concurrent call with the same fixed id got there first: its job stands.
    if (fixedId && isAlreadyExists(err)) return summaryOf(await ref.get());
    throw err;
  }
  return { jobId: ref.id, total: recipients.length, skipped: skippedNoEmail };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
// gRPC ALREADY_EXISTS from create(): this recipient's mail doc was written by an
// earlier attempt, so the email is already queued.
const isAlreadyExists = (err: unknown) => (err as { code?: unknown } | null)?.code === 6;

/**
 * Thrown when another run holds a fresh lease on the job. The trigger retries
 * (`retry: true`), so a redelivered event backs off until that run finishes
 * (the job is then done: a no-op) or its lease lapses (a retry then resumes it).
 */
export class EmailJobBusyError extends Error {
  constructor(jobId: string) {
    super(`emailJob ${jobId} is held by another run's lease; retry later`);
    this.name = 'EmailJobBusyError';
  }
}

export interface ProcessEmailJobOptions {
  gapMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Clock for the lease (injectable for tests). */
  now?: () => Date;
}

type Claim = { kind: 'claimed'; job: EmailJobDoc } | { kind: 'busy' } | { kind: 'skip' };

// A lease is fresh until it is older than LEASE_MS. A job left 'sending'
// without one has no live run to protect, so it counts as lapsed.
const leaseIsFresh = (claimedAt: unknown, now: Date) =>
  claimedAt instanceof Timestamp && now.getTime() - claimedAt.toMillis() <= LEASE_MS;

/**
 * Deliver a job: one `mail/{jobId}_{memberId}` doc per recipient (picked up by
 * the Trigger Email extension), each newly written one followed by a `gapMs`
 * gap. A run claims the job in a transaction (status 'sending', `claimedAt`
 * from `now`) when it is 'queued', or 'sending' under a lapsed lease: that is a
 * run that died, and this one resumes it. A fresh lease throws
 * EmailJobBusyError; a done/failed or missing job is a no-op.
 *
 * Mail docs are written with create(), so a resume or a second trigger never
 * sends twice. A recipient whose doc already exists counts as sent, without a
 * gap. `sent`/`failed` are absolute counts over all recipients, never
 * increments, so a resume can't double-count. Per-recipient failures are
 * counted and the job still ends 'done' (or 'failed' if every send failed).
 * Any other error (e.g. a progress write) propagates, leaving the job leased,
 * and the trigger's retry resumes it once the lease lapses.
 */
export async function processEmailJob(
  db: Firestore,
  jobId: string,
  opts: ProcessEmailJobOptions = {},
): Promise<void> {
  const gapMs = opts.gapMs ?? EMAIL_GAP_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = opts.now ?? (() => new Date());
  const ref = db.collection(EMAIL_JOBS).doc(jobId);

  const claim = await db.runTransaction(async (tx): Promise<Claim> => {
    const snap = await tx.get(ref);
    const status = snap.get('status');
    if (!snap.exists || (status !== 'queued' && status !== 'sending')) return { kind: 'skip' };
    const at = now();
    if (status === 'sending' && leaseIsFresh(snap.get('claimedAt'), at)) return { kind: 'busy' };
    tx.update(ref, { status: 'sending', claimedAt: Timestamp.fromDate(at) });
    return { kind: 'claimed', job: snap.data() as EmailJobDoc };
  });
  if (claim.kind === 'busy') throw new EmailJobBusyError(jobId);
  if (claim.kind === 'skip') return;
  const { job } = claim;

  let sent = 0;
  let failed = 0;
  let lastError = '';
  try {
    for (const [i, r] of job.recipients.entries()) {
      let outcome: 'created' | 'existed' | 'failed';
      try {
        const link = job.rsvpEventId
          ? rsvpUrl(
              await findOrCreateInvite(db, {
                eventId: job.rsvpEventId,
                memberId: r.memberId,
                displayName: r.displayName,
              }),
            )
          : undefined;
        const message = composeEmail({ subject: job.subject, body: job.body, recipient: r, rsvpUrl: link });
        await db.collection('mail').doc(`${jobId}_${r.memberId}`).create({
          to: [r.email],
          message,
          toName: r.displayName,
          createdBy: job.createdBy,
          createdAt: FieldValue.serverTimestamp(),
          emailJobId: jobId,
        });
        outcome = 'created';
      } catch (err) {
        if (isAlreadyExists(err)) {
          outcome = 'existed';
        } else {
          outcome = 'failed';
          lastError = errorText(err);
          logger.error(`emailJob ${jobId}: send to member ${r.memberId} failed`, { error: lastError });
        }
      }
      if (outcome === 'failed') failed += 1;
      else sent += 1;
      // A doc an earlier run already queued: no gap, and no progress write (a
      // resume skips through these quickly; the final write has the counts).
      if (outcome === 'existed') continue;
      await ref.update({ sent, failed });
      if (outcome === 'created' && gapMs > 0 && i < job.recipients.length - 1) await sleep(gapMs);
    }
    const allFailed = failed > 0 && sent === 0;
    await ref.update({
      sent,
      failed,
      status: allFailed ? 'failed' : 'done',
      finishedAt: FieldValue.serverTimestamp(),
      ...(allFailed ? { error: lastError || 'Every send failed.' } : {}),
    });
  } catch (err) {
    logger.error(`emailJob ${jobId} interrupted; it stays leased and a retry resumes it`, {
      error: errorText(err),
      sent,
      failed,
    });
    throw err;
  }
}
