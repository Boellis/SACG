import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp, getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { REGION } from '../config';
import { firstNameOf } from '../email/compose';
import { RSVP_INVITES } from './invites';

/** Each RSVP link accepts this many submissions before it locks. */
export const MAX_SUBMITS_PER_TOKEN = 50;

export interface InviteResponse {
  status: 'yes' | 'maybe' | 'no';
  partySize?: number;
  note?: string;
}

/** What a public RSVP link may see: the event, the invitee's first name, their own answer. */
export interface InviteView {
  event: {
    id: string;
    title: string;
    type: string;
    start: string; // ISO
    end: string; // ISO
    allDay: boolean;
    location?: string;
    description?: string;
  };
  firstName: string;
  response: InviteResponse | null;
  open: boolean;
}

export interface SubmitRsvpInput {
  token: string;
  status: InviteResponse['status'];
  partySize?: number;
  note?: string;
}

const TokenSchema = z.string().min(20).max(100).regex(/^[A-Za-z0-9_-]+$/);
const SubmitSchema = z
  .object({
    token: z.string(),
    status: z.enum(['yes', 'maybe', 'no']),
    partySize: z.number().int().min(1).max(20).optional(),
    note: z.string().max(500).optional(),
  })
  .strict();

// A garbage, unknown or orphaned token all look the same to the visitor.
const notFound = () =>
  new HttpsError('not-found', "This RSVP link isn't valid. It may be mistyped, or the event may have been removed.");

function invalidRsvp(error: z.ZodError): HttpsError {
  const field = error.issues[0]?.path[0];
  const message =
    field === 'partySize'
      ? 'Party size must be a whole number from 1 to 20.'
      : field === 'note'
        ? 'Notes can be up to 500 characters.'
        : field === 'status'
          ? 'Please choose yes, maybe, or no.'
          : "That RSVP isn't valid.";
  return new HttpsError('invalid-argument', message);
}

const asDate = (v: unknown): Date | null => (v instanceof Timestamp ? v.toDate() : v instanceof Date ? v : null);

function toResponse(d: DocumentData | undefined): InviteResponse | null {
  if (!d || !['yes', 'maybe', 'no'].includes(d.status)) return null;
  const r: InviteResponse = { status: d.status };
  if (d.status !== 'no' && typeof d.partySize === 'number') r.partySize = d.partySize;
  if (typeof d.note === 'string' && d.note) r.note = d.note;
  return r;
}

function parseToken(token: unknown): string {
  const parsed = TokenSchema.safeParse(token);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

/** Public (no sign-in): the event behind an RSVP link and the invitee's current answer. */
export async function getInvite(db: Firestore, token: unknown, now: Date = new Date()): Promise<InviteView> {
  const invite = await db.collection(RSVP_INVITES).doc(parseToken(token)).get();
  if (!invite.exists) throw notFound();
  const eventRef = db.collection('events').doc(String(invite.get('eventId')));
  const [event, rsvp] = await Promise.all([
    eventRef.get(),
    eventRef.collection('rsvps').doc(String(invite.get('memberId'))).get(),
  ]);
  if (!event.exists) throw notFound();
  const start = asDate(event.get('start'));
  const end = asDate(event.get('end'));
  if (!start || !end) throw notFound();
  const location = event.get('location');
  const description = event.get('description');
  // Fields are picked one by one: nothing else from the event, invite or member doc leaves.
  return {
    event: {
      id: event.id,
      title: String(event.get('title') ?? ''),
      type: String(event.get('type') ?? 'other'),
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: event.get('allDay') === true,
      ...(typeof location === 'string' && location ? { location } : {}),
      ...(typeof description === 'string' && description ? { description } : {}),
    },
    firstName: firstNameOf(String(invite.get('displayName') ?? '')),
    response: rsvp.exists ? toResponse(rsvp.data()) : null,
    open: end.getTime() >= now.getTime(),
  };
}

/**
 * Public (no sign-in): record the invitee's answer as
 * `events/{eventId}/rsvps/{memberId}` (`source: 'email'`). A 'no' carries no
 * party size; yes/maybe default to 1. Closed once the event has ended, and
 * each link takes at most MAX_SUBMITS_PER_TOKEN submissions.
 * `input` is untrusted callable data shaped like {@link SubmitRsvpInput}; it is validated here.
 */
export async function submitRsvp(
  db: Firestore,
  input: unknown,
  now: Date = new Date(),
): Promise<{ response: InviteResponse }> {
  const token = parseToken((input as { token?: unknown } | null)?.token);
  const parsed = SubmitSchema.safeParse(input);
  if (!parsed.success) throw invalidRsvp(parsed.error);
  const { status, partySize, note } = parsed.data;
  const response: InviteResponse = { status };
  if (status !== 'no') response.partySize = partySize ?? 1;
  const trimmedNote = note?.trim();
  if (trimmedNote) response.note = trimmedNote;

  const inviteRef = db.collection(RSVP_INVITES).doc(token);
  await db.runTransaction(async (tx) => {
    const invite = await tx.get(inviteRef);
    if (!invite.exists) throw notFound();
    const eventRef = db.collection('events').doc(String(invite.get('eventId')));
    const event = await tx.get(eventRef);
    if (!event.exists) throw notFound();
    const end = asDate(event.get('end'));
    if (!end) throw notFound();
    if (end.getTime() < now.getTime()) {
      throw new HttpsError('failed-precondition', 'This event has already happened, so RSVPs are closed.');
    }
    if (Number(invite.get('uses') ?? 0) >= MAX_SUBMITS_PER_TOKEN) {
      throw new HttpsError(
        'resource-exhausted',
        'This RSVP link has been used too many times. Please contact the organizers to update your answer.',
      );
    }
    // set() without merge, so a changed answer drops fields it no longer has.
    tx.set(eventRef.collection('rsvps').doc(String(invite.get('memberId'))), {
      ...response,
      displayName: String(invite.get('displayName') ?? ''),
      source: 'email',
      respondedAt: FieldValue.serverTimestamp(),
    });
    tx.update(inviteRef, { uses: FieldValue.increment(1), lastUsedAt: FieldValue.serverTimestamp() });
  });
  return { response };
}

export const rsvpGetInvite = onCall({ region: REGION, timeoutSeconds: 30 }, (request) =>
  getInvite(getFirestore(), (request.data as { token?: unknown } | null)?.token),
);

export const rsvpSubmit = onCall({ region: REGION, timeoutSeconds: 30 }, (request) =>
  submitRsvp(getFirestore(), request.data),
);
