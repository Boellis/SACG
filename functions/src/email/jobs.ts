import { FieldValue, type Firestore, type Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { AudienceSchema, DocIdSchema, resolveAudience, type Audience, type Recipient } from './audience';
import { composeEmail, RSVP_LINK_TOKEN } from './compose';
import { findOrCreateInvite, rsvpUrl } from '../rsvp/invites';

export const MAX_RECIPIENTS = 150;
/** Spacing between sends so Gmail's SMTP rate limit doesn't 421 a burst. */
export const EMAIL_GAP_MS = 4000;
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
  finishedAt?: Timestamp;
  error?: string;
  assistantRef?: { threadId: string; actionId: string };
}

const invalid = (message: string) => new HttpsError('invalid-argument', message);

/**
 * Validate a send, resolve its audience server-side and queue an `emailJobs`
 * doc (status 'queued'); `onEmailJobCreated` then delivers it. With
 * `testMemberId` the audience becomes exactly that one member (`test: true`).
 */
export async function createEmailJob(
  db: Firestore,
  input: CreateEmailJobInput,
): Promise<{ jobId: string; total: number; skipped: number }> {
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

  const ref = db.collection(EMAIL_JOBS).doc();
  await ref.set({
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
  return { jobId: ref.id, total: recipients.length, skipped: skippedNoEmail };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
// gRPC ALREADY_EXISTS from create(): this recipient's mail doc was written by an
// earlier attempt, so the email is already queued.
const isAlreadyExists = (err: unknown) => (err as { code?: unknown } | null)?.code === 6;

/**
 * Deliver a queued job: one `mail/{jobId}_{memberId}` doc per recipient (picked
 * up by the Trigger Email extension), spaced `gapMs` apart. Idempotent: only a
 * 'queued' job is claimed (transactionally → 'sending'), and mail docs are
 * written with create(), so a retry or a second trigger never sends twice.
 */
export async function processEmailJob(
  db: Firestore,
  jobId: string,
  opts: { gapMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const gapMs = opts.gapMs ?? EMAIL_GAP_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const ref = db.collection(EMAIL_JOBS).doc(jobId);

  const job = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('status') !== 'queued') return null;
    tx.update(ref, { status: 'sending' });
    return snap.data() as EmailJobDoc;
  });
  if (!job) return;

  let sent = 0;
  let failed = 0;
  let lastError = '';
  try {
    for (const [i, r] of job.recipients.entries()) {
      if (i > 0 && gapMs > 0) await sleep(gapMs);
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
        sent += 1;
      } catch (err) {
        if (isAlreadyExists(err)) {
          sent += 1;
        } else {
          failed += 1;
          lastError = errorText(err);
          logger.error(`emailJob ${jobId}: send to member ${r.memberId} failed`, { error: lastError });
        }
      }
      await ref.update({ sent, failed });
    }
    const allFailed = failed > 0 && sent === 0;
    await ref.update({
      status: allFailed ? 'failed' : 'done',
      finishedAt: FieldValue.serverTimestamp(),
      ...(allFailed ? { error: lastError || 'Every send failed.' } : {}),
    });
  } catch (err) {
    logger.error(`emailJob ${jobId} aborted`, { error: errorText(err) });
    await ref.update({ status: 'failed', error: errorText(err), sent, failed, finishedAt: FieldValue.serverTimestamp() });
  }
}
