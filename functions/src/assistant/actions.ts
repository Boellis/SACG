import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { threadRef } from './history';
import type { ActionType, SendEmailAction, UpdateEventAction } from './schemas';

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
