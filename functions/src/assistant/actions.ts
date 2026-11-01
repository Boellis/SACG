import { FieldValue, Timestamp, type DocumentData, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { APP_URL } from '../config';
import type { AdminCaller } from '../lib/auth';
import { formatGardenWhen, parseGardenLocal } from '../lib/time';
import { createEmailJob, EMAIL_JOBS } from '../email/jobs';
import { appendMessage, threadRef } from './history';
import { hideContactDetails } from './redact';
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

/**
 * How long a run's claim ('executing') stands: twice assistantExecuteAction's
 * 60 s timeout, so a live run is never second-guessed. An older claim belongs
 * to a run that died, and the next approval finishes or releases it.
 */
export const EXECUTE_LEASE_MS = 120_000;

const has = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key);

const NOT_PROPOSED: Record<string, string> = {
  executing: 'This action is already in progress.',
  executed: 'This action was already approved and done.',
  rejected: 'This action was rejected.',
  failed: "This action failed and can't be run again. Ask the assistant for a new one.",
};
const notProposed = (status: unknown) =>
  new HttpsError('failed-precondition', has(NOT_PROPOSED, String(status)) ? NOT_PROPOSED[String(status)] : "This action can't be run.");
const notFound = () => new HttpsError('not-found', "That proposal doesn't exist.");

const asDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : null);
// gRPC ALREADY_EXISTS from create().
const isAlreadyExists = (err: unknown) => (err as { code?: unknown } | null)?.code === 6;

type Done = { result: Json; line: string };

/** Approved effects that create one document, keyed by the action id, so a run can create it at most once. */
type KeyedType = Exclude<ActionType, 'update_event'>;
const EFFECT_COLLECTION: Record<KeyedType, string> = {
  create_event: 'events',
  send_email: EMAIL_JOBS,
  post_announcement: 'announcements',
  create_poll: 'polls',
};
const isKeyed = (type: ActionType): type is KeyedType => type !== 'update_event';

/** The result and app-note line for an effect's document, whichever attempt wrote it. */
function describeEffect(type: KeyedType, id: string, data: DocumentData): Done {
  switch (type) {
    case 'create_event': {
      const title = String(data.title ?? '');
      const start = asDate(data.start);
      const end = asDate(data.end);
      const when = start && end ? formatGardenWhen(start, end, data.allDay === true) : '';
      return {
        result: { eventId: id, title, when, url: CALENDAR_URL },
        line: `created the calendar event "${title}" (event id ${id}) for ${when}.`,
      };
    }
    case 'send_email': {
      const total = Number(data.total ?? 0);
      const skipped = Number(data.skippedNoEmail ?? 0);
      const skippedText = skipped ? ` (${skipped} skipped: no email address)` : '';
      return {
        result: { jobId: id, total, skipped },
        line: `queued email job ${id} to ${total} member${total === 1 ? '' : 's'}${skippedText}.`,
      };
    }
    case 'post_announcement': {
      const title = String(data.title ?? '');
      return {
        result: { announcementId: id, title, url: `${APP_URL}/lounge` },
        line: `posted the announcement "${title}" (id ${id}) in the Members Lounge.`,
      };
    }
    case 'create_poll': {
      const question = String(data.question ?? '');
      return {
        result: { pollId: id, question, url: `${APP_URL}/polls` },
        line: `created the poll "${question}" (id ${id}).`,
      };
    }
  }
}

/**
 * Create `ref` once. If an earlier attempt already created it (one whose reply
 * was lost, say), that document stands and `build` isn't called: no re-checks
 * and no second write. Returns what is stored.
 */
async function createOnce(ref: DocumentReference, build: () => DocumentData): Promise<DocumentData> {
  const existing = await ref.get();
  if (existing.exists) return existing.data()!;
  const data = build();
  try {
    await ref.create(data);
    return data;
  } catch (err) {
    if (isAlreadyExists(err)) return (await ref.get()).data()!;
    throw err;
  }
}

/** Run a write, and once more after a short pause if it fails. */
export async function retryOnce(write: () => Promise<unknown>, pauseMs = 200): Promise<void> {
  try {
    await write();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, pauseMs));
    await write();
  }
}

/** The end (11:59 PM garden time) of a `YYYY-MM-DD` day, which must still be ahead. */
function lastMomentOf(date: string | undefined, now: Date, what: string): Timestamp | null {
  if (!date) return null;
  const at = parseGardenLocal(`${date}T23:59`);
  if (at.getTime() <= now.getTime()) {
    throw new HttpsError('invalid-argument', `${what} (${date}) has already passed. Ask the assistant for a later date.`);
  }
  return Timestamp.fromDate(at);
}

type Claim =
  | { kind: 'claimed'; type: ActionType; input: Json; rsvpEventId?: string }
  | { kind: 'finished'; type: ActionType; done: Done };

const claimIsFresh = (claimedAt: unknown, now: Date) =>
  claimedAt instanceof Timestamp && now.getTime() - claimedAt.toMillis() < EXECUTE_LEASE_MS;

/**
 * The transaction that guards execution: the action must still be 'proposed',
 * a test send must be an email, the input with any overrides (shallow; an
 * audience or rsvp is replaced whole) must pass its schema again, and an
 * email's RSVP event proposal must already be executed. A run then marks the
 * action 'executing' (with `claimedAt`), so a second approval is refused.
 *
 * An action left 'executing' by a run that died (claim older than
 * EXECUTE_LEASE_MS) is finished as 'executed' when its effect exists (the run
 * only lost its last write), or else released back to 'proposed', and this
 * request carries on from there.
 */
async function claim(db: Firestore, ref: DocumentReference, args: ExecuteActionArgs, now: Date): Promise<Claim> {
  return db.runTransaction(async (tx): Promise<Claim> => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound();
    const type = snap.get('type') as ActionType;
    const schema = has(ACTION_SCHEMAS, type) ? ACTION_SCHEMAS[type] : undefined;
    if (!schema) throw new HttpsError('failed-precondition', "This app can't run that kind of action.");
    const status = snap.get('status');
    const stuck = status === 'executing';
    if (stuck) {
      if (claimIsFresh(snap.get('claimedAt'), now)) throw notProposed(status);
      if (isKeyed(type)) {
        const effect = await tx.get(db.collection(EFFECT_COLLECTION[type]).doc(args.actionId));
        if (effect.exists) {
          const done = describeEffect(type, effect.id, effect.data()!);
          tx.update(ref, {
            status: 'executed',
            result: done.result,
            executedAt: FieldValue.serverTimestamp(),
            error: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { kind: 'finished', type, done };
        }
      }
    } else if (status !== 'proposed') {
      throw notProposed(status);
    }
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
        claimedAt: Timestamp.fromDate(now),
        executedBy: args.caller.uid,
        executedByName: args.caller.displayName,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (stuck) {
      // A test from a dead run's claim: release it first.
      tx.update(ref, {
        status: 'proposed',
        claimedAt: FieldValue.delete(),
        executedBy: FieldValue.delete(),
        executedByName: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { kind: 'claimed', type, input, rsvpEventId };
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

/**
 * Do what the action says, at most once per action: a run's document is keyed
 * by the action id (written with create()), so a retry or re-approve finds it
 * and reports it instead of writing again. Test sends are repeatable by
 * design and get fresh job ids. `line` is the one-line outcome for the app note.
 */
async function perform(
  db: Firestore,
  c: Extract<Claim, { kind: 'claimed' }>,
  args: ExecuteActionArgs,
  now: Date,
): Promise<Done> {
  const { caller, actionId } = args;
  const keyed = (type: KeyedType) => db.collection(EFFECT_COLLECTION[type]).doc(actionId);
  switch (c.type) {
    case 'create_event': {
      const e = c.input as CreateEventAction;
      // Shaped like the calendar page's createEvent.
      const stored = await createOnce(keyed('create_event'), () => ({
        title: e.title,
        type: e.type,
        start: Timestamp.fromDate(parseGardenLocal(e.start)),
        end: Timestamp.fromDate(parseGardenLocal(e.end)),
        allDay: e.allDay,
        ...(e.location ? { location: e.location } : {}),
        ...(e.description ? { description: e.description } : {}),
        createdBy: caller.uid,
      }));
      return describeEffect('create_event', actionId, stored);
    }
    case 'update_event':
      // A patch: applying it again changes nothing.
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
        assistantRef: { threadId: args.threadId, actionId },
        ...(args.mode === 'test' ? { testMemberId: args.testMemberId ?? caller.uid } : { jobId: actionId }),
      });
      return describeEffect('send_email', job.jobId, { total: job.total, skippedNoEmail: job.skipped });
    }
    case 'post_announcement': {
      const a = c.input as AnnouncementAction;
      // Shaped like the lounge's createAnnouncement.
      const stored = await createOnce(keyed('post_announcement'), () => ({
        title: a.title,
        body: a.body,
        pinned: a.pinned,
        expiresAt: lastMomentOf(a.expiresOn, now, "This announcement's last day"),
        createdBy: caller.uid,
        authorName: caller.displayName,
        createdAt: FieldValue.serverTimestamp(),
      }));
      return describeEffect('post_announcement', actionId, stored);
    }
    case 'create_poll': {
      const p = c.input as PollAction;
      // Shaped like the polls page's createPoll.
      const stored = await createOnce(keyed('create_poll'), () => ({
        question: p.question,
        options: p.options.map((text, i) => ({ id: String(i), text })),
        createdBy: caller.uid,
        authorName: caller.displayName,
        expiresAt: lastMomentOf(p.closesOn, now, "This poll's closing day"),
        closed: false,
        createdAt: FieldValue.serverTimestamp(),
      }));
      return describeEffect('create_poll', actionId, stored);
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
        claimedAt: FieldValue.delete(),
        executedBy: FieldValue.delete(),
        executedByName: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (mode === 'test' && status === 'proposed') {
      tx.update(ref, { error, updatedAt: FieldValue.serverTimestamp() });
    }
  });
}

/** A person's name as it goes into an app note: the model reads notes, so contact details are hidden. */
const forNote = (name: string) => hideContactDetails(name);

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
 * A failure puts the action back to 'proposed' with `error`. Effects are keyed
 * by the action id, so even a failure whose write did commit can't make a
 * re-approval do it twice; and a run that dies after its effect leaves the
 * action 'executing' until the next approval finishes it (see claim). The
 * final status write is retried once. Either way the thread gets an app note.
 */
export async function executeAction(
  db: Firestore,
  args: ExecuteActionArgs,
): Promise<{ status: string; result: Record<string, unknown> }> {
  const now = args.now ?? new Date();
  const ref = actionsCol(db, args.threadId).doc(args.actionId);
  const claimed = await claim(db, ref, args, now);
  if (claimed.kind === 'finished') {
    await appNote(
      db,
      args.threadId,
      `[App update] ${forNote(args.caller.displayName)} approved action ${args.actionId} (${claimed.type}): ${claimed.done.line}`,
    );
    return { status: 'executed', result: claimed.done.result };
  }
  let done: Done;
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
    await retryOnce(() =>
      ref.update({
        input: claimed.input,
        tests: FieldValue.arrayUnion({ at: Timestamp.fromDate(now), toName, jobId: done.result.jobId }),
        error: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
    await appNote(db, args.threadId, `[App update] Test email sent to ${forNote(toName)} only.`);
    return { status: 'proposed', result: done.result };
  }

  // If even the retry fails, the action stays 'executing' and the next
  // approval after the lease finishes it from the keyed effect.
  await retryOnce(() =>
    ref.update({
      status: 'executed',
      input: claimed.input,
      result: done.result,
      executedAt: FieldValue.serverTimestamp(),
      error: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }),
  );
  await appNote(
    db,
    args.threadId,
    `[App update] ${forNote(args.caller.displayName)} approved action ${args.actionId} (${claimed.type}): ${done.line}`,
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
  await appNote(db, threadId, `[App update] ${forNote(caller.displayName)} rejected action ${actionId} (${type}).`);
  return { status: 'rejected' };
}
