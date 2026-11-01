import { randomBytes } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { APP_URL } from '../config';
import type { RsvpAnswer } from '../email/audience';

/** Server-only collection (rules deny all client access). Doc id = the token. */
export const RSVP_INVITES = 'rsvpInvites';

/**
 * The stable RSVP token for one member's invitation to one event, created on
 * first use. The token (32 random bytes, base64url) is the doc id, so it is the
 * only thing a public RSVP link needs, and it reveals nothing by itself.
 */
export async function findOrCreateInvite(
  db: Firestore,
  { eventId, memberId, displayName }: { eventId: string; memberId: string; displayName: string },
): Promise<string> {
  const col = db.collection(RSVP_INVITES);
  const existing = col.where('eventId', '==', eventId).where('memberId', '==', memberId).limit(1);
  // A transaction so two concurrent sends for the same pair still agree on one token.
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(existing);
    if (!snap.empty) return snap.docs[0].id;
    const ref = col.doc(randomBytes(32).toString('base64url'));
    tx.create(ref, { eventId, memberId, displayName, createdAt: FieldValue.serverTimestamp(), uses: 0 });
    return ref.id;
  });
}

/** Public RSVP page link for a token, optionally preselecting an answer. */
export function rsvpUrl(token: string, answer?: RsvpAnswer): string {
  const base = `${APP_URL}/rsvp/${token}`;
  return answer ? `${base}?answer=${answer}` : base;
}
