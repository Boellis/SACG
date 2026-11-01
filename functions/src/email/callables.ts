import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { REGION } from '../config';
import { requireAdmin } from '../lib/auth';
import { AudienceSchema, DocIdSchema } from './audience';
import { createEmailJob, processEmailJob, EMAIL_JOBS, EMAIL_TRIGGER_TIMEOUT_S } from './jobs';

const QueueMemberEmailInput = z
  .object({
    audience: AudienceSchema,
    subject: z.string(),
    body: z.string(),
    rsvpEventId: DocIdSchema.optional(),
    testMemberId: DocIdSchema.optional(),
    // Clients can't claim 'assistant'; only the assistant's own callable does.
    source: z.enum(['calendar', 'email-page']).default('calendar'),
  })
  .strict();

/** Admin-only: resolve an audience server-side and queue an email job. */
export const queueMemberEmail = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  const db = getFirestore();
  const caller = await requireAdmin(db, request.auth);
  const parsed = QueueMemberEmailInput.safeParse(request.data);
  if (!parsed.success) throw new HttpsError('invalid-argument', "That email request isn't valid.");
  const { audience, subject, body, rsvpEventId, testMemberId, source } = parsed.data;
  return createEmailJob(db, {
    audience,
    subject,
    body,
    rsvpEventId,
    testMemberId,
    source,
    createdBy: caller.uid,
    createdByName: caller.displayName,
  });
});

/**
 * Delivers each new email job (idempotent; see processEmailJob). Retried on
 * failure: a run that dies or times out leaves its job leased, and a retry
 * resumes it once the lease lapses. Until then a retry throws and backs off.
 */
export const onEmailJobCreated = onDocumentCreated(
  { document: `${EMAIL_JOBS}/{jobId}`, region: REGION, timeoutSeconds: EMAIL_TRIGGER_TIMEOUT_S, retry: true },
  (event) => processEmailJob(getFirestore(), event.params.jobId),
);
