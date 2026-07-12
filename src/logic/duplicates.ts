import type { Timestamp } from 'firebase/firestore';
import type { Member, Plot } from '../lib/types';
import { plotHolderIds, isPlotHeldBy } from './plots';

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

/** One plot whose holder set changes when a stub is folded into a signup. */
export interface PlotHolderUpdate {
  id: string;                 // plot id
  holderMemberIds: string[];  // holder array with the stub id swapped for the kept id
  setPrimary: boolean;        // also move the primary `holderMemberId` to the kept id
}

/** Everything {@link mergeMembers} needs to fold a roster stub into the kept record. */
export interface MergePlan {
  keepId: string; // the signup record to keep (id === auth uid)
  absorbId: string; // the roster stub to delete
  displayName: string; // roster name wins (fuller / matches plot holderName)
  phone?: string;
  joinedAt?: Timestamp; // roster join date wins (real tenure)
  plotUpdates: PlotHolderUpdate[]; // plots to move from the stub to the kept record
}

/**
 * Keep the newer signup record; carry over the roster's name/phone/join-date, and
 * move the stub out of every plot it holds — swapping it for the kept id in the
 * holder array (and promoting the kept id to primary where the stub was primary).
 * Works for both sole holders and co-gardeners.
 */
export function buildMergePlan(pending: Member, roster: Member, plots: Plot[]): MergePlan {
  const plotUpdates: PlotHolderUpdate[] = [];
  for (const p of plots) {
    if (!isPlotHeldBy(p, roster.id)) continue;
    const swapped = plotHolderIds(p).map((id) => (id === roster.id ? pending.id : id));
    plotUpdates.push({
      id: p.id,
      holderMemberIds: Array.from(new Set(swapped)),
      setPrimary: p.holderMemberId === roster.id,
    });
  }
  return {
    keepId: pending.id,
    absorbId: roster.id,
    displayName: (roster.displayName || pending.displayName || '').trim(),
    phone: roster.phone ?? pending.phone,
    joinedAt: roster.joinedAt ?? pending.joinedAt,
    plotUpdates,
  };
}
