import { FieldValue, Timestamp, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { APP_URL } from '../config';
import type { AdminCaller } from '../lib/auth';
import { formatGardenWhen, parseGardenLocal } from '../lib/time';
import { createEmailJob } from '../email/jobs';
import { appendMessage, threadRef } from './history';
import {
  ACTION_SCHEMAS,
  describeIssues,
  type ActionType,
  type AnnouncementAction,
  type CreateEventAction,
  type PollAction,
  type SendEmailAction,
  type UpdateEventAction,
} from './schemas';

export type ActionStatus = 'proposed' | 'executing' | 'executed' | 'rejected' | 'failed';

export const actionsCol = (db: Firestore, threadId: string) => threadRef(db, threadId).collection('actions');

/** A proposal that can't be saved, with a reason the model can act on. */
export class ProposalError extends Error {}

/** Events a proposal points at, which must already be on the calendar. */
function referencedEventIds(type: ActionType, input: Record<string, unknown>): string[] {
  if (type === 'update_event') return [(input as UpdateEventAction).eventId];
  if (type !== 'send_email') return [];
  const email = input as SendEmailAction;
  return [
    ...(email.rsvp?.eventId ? [email.rsvp.eventId] : []),
    ...(email.audience.kind === 'event_rsvp' ? [email.audience.eventId] : []),
  ];
}

async function checkReferences(
  db: Firestore,
  threadId: string,
  type: ActionType,
  input: Record<string, unknown>,
  dependsOn: string | undefined,
): Promise<void> {
  if (dependsOn) {
    const dep = await actionsCol(db, threadId).doc(dependsOn).get();
    if (!dep.exists || dep.get('type') !== 'create_event') {
      throw new ProposalError(
        `there is no proposed calendar event with action id ${dependsOn} in this conversation. Use the action id from propose_calendar_event's result, or rsvp.eventId for an event already on the calendar.`,
      );
    }
    if (dep.get('status') === 'rejected') {
      throw new ProposalError(`the event proposal ${dependsOn} was rejected, so that event won't exist. Propose the event again first.`);
    }
  }
  for (const eventId of referencedEventIds(type, input)) {
    if (!(await db.collection('events').doc(eventId).get()).exists) {
      throw new ProposalError(`there is no event with id ${eventId} on the calendar. Use list_events to find event ids.`);
    }
  }
}

/**
 * Save a validated proposal as `assistantThreads/{threadId}/actions/{id}` with
 * status 'proposed'. Nothing else happens until an admin approves it. An email
 * whose RSVP points at a proposed event (`rsvp.eventActionId`) records that
 * action as `dependsOn`. Throws ProposalError for a reference that doesn't
 * resolve (unknown or rejected event proposal, missing event).
 */
export async function recordProposal(
  db: Firestore,
  threadId: string,
  p: { type: ActionType; input: unknown; summary: string; toolUseId: string; dependsOn?: string },
): Promise<string> {
  // A JSON round trip drops undefined optionals (Firestore rejects them).
  const input = JSON.parse(JSON.stringify(p.input)) as Record<string, unknown>;
  const dependsOn =
    p.dependsOn ?? (p.type === 'send_email' ? (input as SendEmailAction).rsvp?.eventActionId : undefined);
  await checkReferences(db, threadId, p.type, input, dependsOn);
  const ref = actionsCol(db, threadId).doc();
  await ref.set({
    type: p.type,
    input,
    summary: p.summary,
    status: 'proposed',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    toolUseId: p.toolUseId,
    ...(dependsOn ? { dependsOn } : {}),
  });
  return ref.id;
}

// ── Approval: proposed → executing → executed (or back to proposed) ─────────

type Json = Record<string, unknown>;

export interface ExecuteActionArgs {
  threadId: string;
  actionId: string;
  caller: AdminCaller;
  mode: 'run' | 'test';
  overrides?: Record<string, unknown>;
  testMemberId?: string;
  now?: Date;
}

const CALENDAR_URL = `${APP_URL}/calendar`;

const NOT_PROPOSED: Record<string, string> = {
  executing: 'This action is already in progress.',
  executed: 'This action was already approved and done.',
  rejected: 'This action was rejected.',
  failed: "This action failed and can't be run again. Ask the assistant for a new one.",
};
const notProposed = (status: unknown) =>
  new HttpsError(
    'failed-precondition',
    Object.prototype.hasOwnProperty.call(NOT_PROPOSED, String(status)) ? NOT_PROPOSED[String(status)] : "This action can't be run.",
  );
const notFound = () => new HttpsError('not-found', "That proposal doesn't exist.");

const asDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);

/** The end (11:59 PM garden time) of a `YYYY-MM-DD` day, which must still be ahead. */
function lastMomentOf(date: string | undefined, now: Date, what: string): Timestamp | null {
  if (!date) return null;
  const at = parseGardenLocal(`${date}T23:59`);
  if (at.getTime() <= now.getTime()) {
    throw new HttpsError('invalid-argument', `${what} (${date}) has already passed. Ask the assistant for a later date.`);
  }
  return Timestamp.fromDate(at);
}

interface Claim {
  type: ActionType;
  input: Json;
  rsvpEventId?: string;
}

/**
 * The transaction that guards execution: the action must still be 'proposed',
 * a test send must be an email, the input with any overrides (shallow; an
 * audience or rsvp is replaced whole) must pass its schema again, and an
 * email's RSVP event proposal must already be executed. A run then marks the
 * action 'executing', so a second approval (double click, retry) is refused.
 */
async function claim(db: Firestore, ref: DocumentReference, args: ExecuteActionArgs): Promise<Claim> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound();
    if (snap.get('status') !== 'proposed') throw notProposed(snap.get('status'));
    const type = snap.get('type') as ActionType;
    const schema = Object.prototype.hasOwnProperty.call(ACTION_SCHEMAS, type) ? ACTION_SCHEMAS[type] : undefined;
    if (!schema) throw new HttpsError('failed-precondition', "This app can't run that kind of action.");
    if (args.mode === 'test' && type !== 'send_email') {
      throw new HttpsError('invalid-argument', 'Only emails can be sent as a test.');
    }
    const parsed = schema.safeParse({ ...(snap.get('input') ?? {}), ...(args.overrides ?? {}) });
    if (!parsed.success) throw new HttpsError('invalid-argument', `That change isn't valid: ${describeIssues(parsed.error)}`);
    const input = JSON.parse(JSON.stringify(parsed.data)) as Json;

    let rsvpEventId: string | undefined;
    if (type === 'send_email') {
      const rsvp = (input as SendEmailAction).rsvp;
      rsvpEventId = rsvp?.eventId;
      if (rsvp?.eventActionId) {
        const event = await tx.get(actionsCol(db, args.threadId).doc(rsvp.eventActionId));
        rsvpEventId = event.get('status') === 'executed' ? event.get('result.eventId') : undefined;
        if (typeof rsvpEventId !== 'string') {
          throw new HttpsError('failed-precondition', 'Approve the event first: the RSVP links need the real calendar event.');
        }
      }
    }
    if (args.mode === 'run') {
      tx.update(ref, {
        status: 'executing',
        executedBy: args.caller.uid,
        executedByName: args.caller.displayName,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { type, input, rsvpEventId };
  });
}

/** Apply an event update: allowed fields only; the resulting end can't be before the resulting start. */
async function updateEvent(db: Firestore, u: UpdateEventAction): Promise<{ result: Json; line: string }> {
  const ref = db.collection('events').doc(u.eventId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'That event is no longer on the calendar.');
    const start = u.start !== undefined ? parseGardenLocal(u.start) : asDate(snap.get('start'));
    const end = u.end !== undefined ? parseGardenLocal(u.end) : asDate(snap.get('end'));
    if (!start || !end) throw new HttpsError('failed-precondition', "That event's time can't be read, so give both a start and an end.");
    if (end.getTime() < start.getTime()) throw new HttpsError('invalid-argument', "The event's end can't be before its start.");
    const patch: Json = {};
    if (u.title !== undefined) patch.title = u.title;
    if (u.type !== undefined) patch.type = u.type;
    if (u.start !== undefined) patch.start = Timestamp.fromDate(start);
    if (u.end !== undefined) patch.end = Timestamp.fromDate(end);
    if (u.allDay !== undefined) patch.allDay = u.allDay;
    // An empty location or description clears it.
    if (u.location !== undefined) patch.location = u.location || FieldValue.delete();
    if (u.description !== undefined) patch.description = u.description || FieldValue.delete();
    tx.update(ref, patch);
    const title = u.title ?? String(snap.get('title') ?? '');
    const when = formatGardenWhen(start, end, u.allDay ?? snap.get('allDay') === true);
    const changed = Object.keys(patch);
    return {
      result: { eventId: ref.id, title, when, url: CALENDAR_URL, changed },
      line: `updated the calendar event "${title}" (event id ${ref.id}): changed ${changed.join(', ')}; it is now ${when}.`,
    };
  });
}

/** Do what the action says. `line` is the one-line outcome for the app note. */
async function perform(db: Firestore, c: Claim, args: ExecuteActionArgs, now: Date): Promise<{ result: Json; line: string }> {
  const { caller } = args;
  switch (c.type) {
    case 'create_event': {
      const e = c.input as CreateEventAction;
      const start = parseGardenLocal(e.start);
      const end = parseGardenLocal(e.end);
      // Shaped like the calendar page's createEvent.
      const ref = await db.collection('events').add({
        title: e.title,
        type: e.type,
        start: Timestamp.fromDate(start),
        end: Timestamp.fromDate(end),
        allDay: e.allDay,
        ...(e.location ? { location: e.location } : {}),
        ...(e.description ? { description: e.description } : {}),
        createdBy: caller.uid,
      });
      const when = formatGardenWhen(start, end, e.allDay);
      return {
        result: { eventId: ref.id, title: e.title, when, url: CALENDAR_URL },
        line: `created the calendar event "${e.title}" (event id ${ref.id}) for ${when}.`,
      };
    }
    case 'update_event':
      return updateEvent(db, c.input as UpdateEventAction);
    case 'send_email': {
      const email = c.input as SendEmailAction;
      // Only queues the job; onEmailJobCreated delivers it.
      const job = await createEmailJob(db, {
        audience: email.audience,
        subject: email.subject,
        body: email.body,
        rsvpEventId: c.rsvpEventId,
        source: 'assistant',
        createdBy: caller.uid,
        createdByName: caller.displayName,
        assistantRef: { threadId: args.threadId, actionId: args.actionId },
        ...(args.mode === 'test' ? { testMemberId: args.testMemberId ?? caller.uid } : {}),
      });
      const skipped = job.skipped ? ` (${job.skipped} skipped: no email address)` : '';
      return {
        result: { jobId: job.jobId, total: job.total, skipped: job.skipped },
        line: `queued email job ${job.jobId} to ${job.total} member${job.total === 1 ? '' : 's'}${skipped}.`,
      };
    }
    case 'post_announcement': {
      const a = c.input as AnnouncementAction;
      // Shaped like the lounge's createAnnouncement.
      const ref = await db.collection('announcements').add({
        title: a.title,
        body: a.body,
        pinned: a.pinned,
        expiresAt: lastMomentOf(a.expiresOn, now, "This announcement's last day"),
        createdBy: caller.uid,
        authorName: caller.displayName,
        createdAt: FieldValue.serverTimestamp(),
      });
      return {
        result: { announcementId: ref.id, title: a.title, url: `${APP_URL}/lounge` },
        line: `posted the announcement "${a.title}" (id ${ref.id}) in the Members Lounge.`,
      };
    }
    case 'create_poll': {
      const p = c.input as PollAction;
      // Shaped like the polls page's createPoll.
      const ref = await db.collection('polls').add({
        question: p.question,
        options: p.options.map((text, i) => ({ id: String(i), text })),
        createdBy: caller.uid,
        authorName: caller.displayName,
        expiresAt: lastMomentOf(p.closesOn, now, "This poll's closing day"),
        closed: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      return {
        result: { pollId: ref.id, question: p.question, url: `${APP_URL}/polls` },
        line: `created the poll "${p.question}" (id ${ref.id}).`,
      };
    }
  }
}

/** A failed run goes back to 'proposed' (a failed test leaves it there), recording why. */
async function recordFailure(db: Firestore, ref: DocumentReference, mode: ExecuteActionArgs['mode'], err: unknown): Promise<void> {
  const error = err instanceof HttpsError ? err.message : 'Something went wrong while doing this. Try again.';
  await db.runTransaction(async (tx) => {
    const status = (await tx.get(ref)).get('status');
    if (mode === 'run' && status === 'executing') {
      tx.update(ref, {
        status: 'proposed',
        error,
        executedBy: FieldValue.delete(),
        executedByName: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (mode === 'test' && status === 'proposed') {
      tx.update(ref, { error, updatedAt: FieldValue.serverTimestamp() });
    }
  });
}

/** Tell the assistant what an admin did (replayed before the admin's next message). Best effort. */
async function appNote(db: Firestore, threadId: string, text: string): Promise<void> {
  try {
    await appendMessage(db, threadId, { role: 'user', kind: 'app_note', content: [{ type: 'text', text }], display: { text } });
  } catch (err) {
    logger.error('assistant: could not add an app note', { threadId, error: String(err) });
  }
}

/**
 * Approve a proposal. `run` performs it once: event created or updated, email
 * job queued (onEmailJobCreated sends it), announcement or poll posted. `test`
 * (emails only) queues the email to exactly one member (`testMemberId`, default
 * the approving admin), records it in `tests` and leaves the action proposed.
 * A failure puts the action back to 'proposed' with `error`; after the effect
 * has happened the action never returns to 'proposed', so it can't run twice.
 * Either way the thread gets an app note.
 */
export async function executeAction(
  db: Firestore,
  args: ExecuteActionArgs,
): Promise<{ status: string; result: Record<string, unknown> }> {
  const now = args.now ?? new Date();
  const ref = actionsCol(db, args.threadId).doc(args.actionId);
  const claimed = await claim(db, ref, args);
  let done: { result: Json; line: string };
  try {
    done = await perform(db, claimed, args, now);
  } catch (err) {
    if (!(err instanceof HttpsError)) logger.error(`assistant action ${args.actionId} failed`, { type: claimed.type, error: String(err) });
    await recordFailure(db, ref, args.mode, err).catch((e) =>
      logger.error('assistant: could not record an action failure', { actionId: args.actionId, error: String(e) }),
    );
    throw err;
  }

  if (args.mode === 'test') {
    const testMemberId = args.testMemberId ?? args.caller.uid;
    const member = await db.collection('members').doc(testMemberId).get();
    const toName = String(member.get('displayName') ?? '').trim() || 'one member';
    await ref.update({
      input: claimed.input,
      tests: FieldValue.arrayUnion({ at: Timestamp.fromDate(now), toName, jobId: done.result.jobId }),
      error: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await appNote(db, args.threadId, `[App update] Test email sent to ${toName} only.`);
    return { status: 'proposed', result: done.result };
  }

  await ref.update({
    status: 'executed',
    input: claimed.input,
    result: done.result,
    executedAt: FieldValue.serverTimestamp(),
    error: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await appNote(
    db,
    args.threadId,
    `[App update] ${args.caller.displayName} approved action ${args.actionId} (${claimed.type}): ${done.line}`,
  );
  return { status: 'executed', result: done.result };
}

/** Reject a proposal (only while 'proposed'), and tell the assistant. */
export async function rejectAction(
  db: Firestore,
  { threadId, actionId, caller }: { threadId: string; actionId: string; caller: AdminCaller },
): Promise<{ status: 'rejected' }> {
  const ref = actionsCol(db, threadId).doc(actionId);
  const type = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound();
    if (snap.get('status') !== 'proposed') throw notProposed(snap.get('status'));
    tx.update(ref, { status: 'rejected', updatedAt: FieldValue.serverTimestamp() });
    return String(snap.get('type'));
  });
  await appNote(db, threadId, `[App update] ${caller.displayName} rejected action ${actionId} (${type}).`);
  return { status: 'rejected' };
}
