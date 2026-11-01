import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { setGlobalOptions, logger } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Match the region of the Trigger Email extension / Firestore (nam5 → us-central1).
setGlobalOptions({ region: 'us-central1' });

// Member email service: admin-queued jobs, delivered by a Firestore trigger.
export { queueMemberEmail, onEmailJobCreated } from './email/callables';
// Public, token-gated RSVP links (no sign-in).
export { rsvpGetInvite, rsvpSubmit } from './rsvp/callables';

/**
 * Who gets waitlist / duplicate alerts. Add or change addresses here and
 * redeploy (`firebase deploy --only functions`). Each address is emailed.
 */
const NOTIFY_TO = ['southatxgarden@gmail.com'];

const APP_URL = 'https://sacg-garden-app.web.app';

const normEmail = (e?: string | null): string => (e ?? '').trim().toLowerCase();

/** Queue one email in the `mail` collection for the Trigger Email extension. */
async function queueMail(subject: string, text: string): Promise<void> {
  await admin.firestore().collection('mail').add({
    to: NOTIFY_TO,
    message: { subject, text },
    toName: 'SACG Organizers',
    createdBy: 'system:waitlist-notify',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * An existing roster record is a stub imported from the paper roster: it has
 * `uid: null` and holds the plot. When the real person signs in they get a
 * brand-new record keyed by their auth uid, which is why duplicates appear.
 * Find the roster stub (if any) that shares this signup's email.
 */
async function findRosterStub(
  email: string,
  excludeId: string,
): Promise<admin.firestore.QueryDocumentSnapshot | null> {
  const target = normEmail(email);
  if (!target) return null;
  const snap = await admin.firestore().collection('members').where('uid', '==', null).get();
  return snap.docs.find((d) => d.id !== excludeId && normEmail(d.get('email')) === target) ?? null;
}

/**
 * Only auto-claim a roster record for a login whose identity is proven — a
 * Google sign-in, or an email/password account that has verified its address.
 * Anyone can *type* someone else's email into the password form, so an
 * unverified match must be confirmed by an admin, never auto-merged.
 */
async function isVerifiedIdentity(uid: string): Promise<boolean> {
  try {
    const u = await admin.auth().getUser(uid);
    if (u.emailVerified) return true;
    return (u.providerData ?? []).some((p) => p.providerId === 'google.com');
  } catch {
    return false; // no auth user / lookup failed → treat as unverified
  }
}

/** Plots this member holds — primary (`holderMemberId`) or co-gardener (in
 *  `holderMemberIds`). Unions both queries so pre- and post-migration plots match. */
async function plotsHeldBy(memberId: string): Promise<admin.firestore.QueryDocumentSnapshot[]> {
  const db = admin.firestore();
  const [byPrimary, byArray] = await Promise.all([
    db.collection('plots').where('holderMemberId', '==', memberId).get(),
    db.collection('plots').where('holderMemberIds', 'array-contains', memberId).get(),
  ]);
  const found = new Map<string, admin.firestore.QueryDocumentSnapshot>();
  byPrimary.forEach((d) => found.set(d.id, d));
  byArray.forEach((d) => found.set(d.id, d));
  return Array.from(found.values());
}

/**
 * Fold a roster stub into the real signup record, in one atomic batch:
 *  - repoint every plot the stub holds to the new record,
 *  - copy the roster name / phone / join-date onto the kept record and activate it,
 *  - (re)publish the kept record's lounge directory entry with its real uid,
 *  - delete the stub member doc + its stale directory entry.
 * Mirrors the manual 2026-07-11 de-dup. Returns the repointed plot ids.
 */
async function mergeStubInto(
  stub: admin.firestore.QueryDocumentSnapshot,
  keepId: string,
  keepData: admin.firestore.DocumentData,
): Promise<string[]> {
  const db = admin.firestore();
  const old = stub.data();
  const heldPlots = await plotsHeldBy(stub.id);
  const batch = db.batch();

  for (const p of heldPlots) {
    const ids =
      (p.get('holderMemberIds') as string[] | undefined) ??
      (p.get('holderMemberId') ? [p.get('holderMemberId')] : []);
    const swapped = Array.from(new Set(ids.map((x) => (x === stub.id ? keepId : x))));
    const patch: admin.firestore.DocumentData = { holderMemberIds: swapped };
    if (p.get('holderMemberId') === stub.id) patch.holderMemberId = keepId;
    batch.update(p.ref, patch);
  }

  const name = old.displayName ?? keepData.displayName ?? '';
  const joinedAt = old.joinedAt ?? keepData.joinedAt ?? admin.firestore.FieldValue.serverTimestamp();
  const patch: admin.firestore.DocumentData = { status: 'active', joinedAt, displayName: name };
  if (old.phone) patch.phone = old.phone;
  batch.set(db.collection('members').doc(keepId), patch, { merge: true });

  batch.set(
    db.collection('directory').doc(keepId),
    { displayName: name, uid: keepId, joinedAt },
    { merge: true },
  );

  batch.delete(stub.ref);
  batch.delete(db.collection('directory').doc(stub.id));

  await batch.commit();
  return heldPlots.map((p) => p.id);
}

/**
 * Fires when a member document is created. Genuine self-signups arrive with
 * `status: 'pending'`; admin-imported members are written straight to 'active'
 * and are skipped. Three outcomes:
 *   1. matches a roster stub + verified identity → auto-merge, email "linked".
 *   2. matches a roster stub + unverified        → email "possible duplicate".
 *   3. no roster match                           → email "new signup".
 */
export const notifyOnWaitlistSignup = onDocumentCreated('members/{memberId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const m = snap.data();
  if (!m || m.status !== 'pending') return;

  const memberId = event.params.memberId;
  const name = (m.displayName ?? '').trim() || '(no name given)';
  const email = (m.email ?? '').trim() || '(no email given)';

  const stub = await findRosterStub(m.email ?? '', memberId);

  if (stub) {
    if (await isVerifiedIdentity(memberId)) {
      const plotIds = await mergeStubInto(stub, memberId, m);
      const plotTxt = plotIds.length ? `plot ${plotIds.join(', ')}` : 'no plot on file';
      logger.info(`Auto-merged ${email} into roster stub ${stub.id}; repointed [${plotIds.join(', ')}]`);
      await queueMail(
        `✅ ${name} linked to their garden record`,
        `${name} (${email}) signed in with a verified account and was automatically ` +
          `linked to their existing member record (${plotTxt}). ` +
          `They now have full access — no action needed.\n`,
      );
      return;
    }

    const plotIds = (await plotsHeldBy(stub.id)).map((p) => p.id);
    const plotTxt = plotIds.length ? `plot ${plotIds.join(', ')}` : 'no plot on file';
    logger.info(`Unverified signup ${email} matches roster stub ${stub.id}; awaiting admin merge`);
    await queueMail(
      `🌱 Waitlist signup (possible duplicate): ${name}`,
      `${name} (${email}) just signed up, and it looks like a match for existing ` +
        `roster member "${stub.get('displayName')}" (${plotTxt}).\n\n` +
        `They used an unverified email/password, so I did NOT auto-merge. Confirm it's ` +
        `really them, then use "Approve & merge" on the waitlist:\n${APP_URL}/waitlist\n`,
    );
    return;
  }

  logger.info(`New waitlist signup ${email} (${memberId})`);
  await queueMail(
    `🌱 New waitlist signup: ${name}`,
    `${name} just requested access to the South Austin Community Garden member ` +
      `portal and is waiting for approval.\n\n  Name:  ${name}\n  Email: ${email}\n\n` +
      `Review & approve: ${APP_URL}/waitlist\n`,
  );
});
