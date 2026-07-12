import type { Timestamp } from 'firebase/firestore';
import type { Member, Plot } from '../lib/types';

export const normalizeEmail = (e?: string | null): string => (e ?? '').trim().toLowerCase();

/**
 * A roster "stub" is a member imported from the paper roster: `uid == null`, and
 * it's what holds the plot. When the real person signs in they get a *new* record
 * keyed by their auth uid, producing a duplicate. Given a pending signup, find the
 * roster stub (if any) that shares its email so an admin can merge the two.
 */
export function findRosterDuplicate(members: Member[], pending: Member): Member | null {
  const email = normalizeEmail(pending.email);
  if (!email) return null;
  return (
    members.find(
      (m) => m.id !== pending.id && m.uid == null && normalizeEmail(m.email) === email,
    ) ?? null
  );
}

/** Everything {@link mergeMembers} needs to fold a roster stub into the kept record. */
export interface MergePlan {
  keepId: string; // the signup record to keep (id === auth uid)
  absorbId: string; // the roster stub to delete
  displayName: string; // roster name wins (fuller / matches plot holderName)
  phone?: string;
  joinedAt?: Timestamp; // roster join date wins (real tenure)
  plotIds: string[]; // plots to repoint from the stub to the kept record
}

/** Keep the newer signup record; carry over the roster's name/phone/join-date/plots. */
export function buildMergePlan(pending: Member, roster: Member, plots: Plot[]): MergePlan {
  return {
    keepId: pending.id,
    absorbId: roster.id,
    displayName: (roster.displayName || pending.displayName || '').trim(),
    phone: roster.phone ?? pending.phone,
    joinedAt: roster.joinedAt ?? pending.joinedAt,
    plotIds: plots.filter((p) => p.holderMemberId === roster.id).map((p) => p.id),
  };
}
