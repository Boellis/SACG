import { z } from 'zod';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

export type RsvpAnswer = 'yes' | 'maybe' | 'no';

/**
 * Most recipients one email job may have, so also the most ids a `members`
 * audience may list. Bounded by the sender's trigger timeout: see the timing
 * budget test in jobs.test.ts. (Defined here, not in jobs.ts, which imports this module.)
 */
export const MAX_RECIPIENTS = 100;

/** A Firestore document id: non-empty, bounded, and no `/` (which would turn
 *  `doc(id)` into a different path and throw instead of a clean 4xx). */
export const DocIdSchema = z.string().min(1).max(200).regex(/^[^/]+$/, 'invalid id');

/**
 * Who an email goes to. Deliberately has no "raw addresses" kind: every
 * audience resolves to members in the members collection, server-side.
 */
export const AudienceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('all_active') }).strict(),
  z.object({ kind: z.literal('admins') }).strict(),
  z.object({ kind: z.literal('members'), memberIds: z.array(DocIdSchema).min(1).max(MAX_RECIPIENTS) }).strict(),
  z
    .object({
      kind: z.literal('event_rsvp'),
      eventId: DocIdSchema,
      statuses: z.array(z.enum(['yes', 'maybe', 'no', 'none'])).min(1),
    })
    .strict(),
]);

/** `{kind:'all_active'} | {kind:'admins'} | {kind:'members'; memberIds}
 *  | {kind:'event_rsvp'; eventId; statuses: Array<RsvpAnswer | 'none'>}` */
export type Audience = z.infer<typeof AudienceSchema>;

export interface Recipient {
  memberId: string;
  displayName: string;
  email: string;
}

interface MemberRow {
  id: string;
  displayName: string;
  email: string;
  role: string;
}

const toRow = (d: DocumentSnapshot): MemberRow => ({
  id: d.id,
  displayName: String(d.get('displayName') ?? '').trim(),
  email: String(d.get('email') ?? '').trim(),
  role: String(d.get('role') ?? ''),
});

async function activeMembers(db: Firestore): Promise<MemberRow[]> {
  const snap = await db.collection('members').where('status', '==', 'active').get();
  return snap.docs.map(toRow);
}

async function candidates(db: Firestore, audience: Audience): Promise<MemberRow[]> {
  switch (audience.kind) {
    case 'all_active':
      return activeMembers(db);
    case 'admins':
      return (await activeMembers(db)).filter((m) => m.role === 'admin');
    case 'members': {
      const ids = Array.from(new Set(audience.memberIds));
      if (ids.length === 0) return []; // getAll() throws on zero refs
      const snaps = await db.getAll(...ids.map((id) => db.collection('members').doc(id)));
      return snaps.filter((s) => s.exists && s.get('status') === 'active').map(toRow);
    }
    case 'event_rsvp': {
      const eventRef = db.collection('events').doc(audience.eventId);
      const [eventSnap, rsvps, members] = await Promise.all([
        eventRef.get(),
        eventRef.collection('rsvps').get(),
        activeMembers(db),
      ]);
      if (!eventSnap.exists) throw new HttpsError('not-found', 'That event no longer exists.');
      const answers = new Map(rsvps.docs.map((d) => [d.id, String(d.get('status'))]));
      const wanted = new Set<string>(audience.statuses);
      return members.filter((m) => wanted.has(answers.get(m.id) ?? 'none'));
    }
  }
}

/**
 * Resolve an audience to deliverable recipients: active members only, with a
 * trimmed non-empty email, de-duplicated by lowercase email (first by name
 * wins), sorted by display name. `skippedNoEmail` counts members left out for
 * having no email address.
 */
export async function resolveAudience(
  db: Firestore,
  audience: Audience,
): Promise<{ recipients: Recipient[]; skippedNoEmail: number }> {
  const rows = (await candidates(db, audience)).sort(
    (a, b) => a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id),
  );
  const seen = new Set<string>();
  const recipients: Recipient[] = [];
  let skippedNoEmail = 0;
  for (const m of rows) {
    if (!m.email) {
      skippedNoEmail += 1;
      continue;
    }
    const key = m.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push({ memberId: m.id, displayName: m.displayName, email: m.email });
  }
  return { recipients, skippedNoEmail };
}

const ANSWER_TEXT: Record<RsvpAnswer | 'none', string> = {
  yes: 'yes',
  maybe: 'maybe',
  no: 'no',
  none: "haven't responded",
};

/** Plain-English audience summary for admins (no names, no addresses). */
export function describeAudience(a: Audience): string {
  switch (a.kind) {
    case 'all_active':
      return 'All active members';
    case 'admins':
      return 'Admins';
    case 'members':
      return a.memberIds.length === 1 ? '1 selected member' : `${a.memberIds.length} selected members`;
    case 'event_rsvp': {
      const answered = a.statuses.filter((s) => s !== 'none').map((s) => ANSWER_TEXT[s]);
      const parts = answered.length ? [`answered ${answered.join(' or ')}`] : [];
      if (a.statuses.includes('none')) parts.push(ANSWER_TEXT.none);
      return `Active members who ${parts.join(' or ')}`;
    }
  }
}
