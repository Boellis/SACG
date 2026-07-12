import {
  onSnapshot,
  updateDoc,
  getDoc,
  setDoc,
  serverTimestamp,
  writeBatch,
  doc,
  type Unsubscribe,
} from 'firebase/firestore';
import { membersCol, memberDoc, directoryDoc } from '../../data/collections';
import { db } from '../../lib/firebase';
import type { Member, Role, MemberStatus } from '../../lib/types';
import type { MergePlan } from '../../logic/duplicates';

export function listenMembers(cb: (members: Member[]) => void): Unsubscribe {
  return onSnapshot(membersCol, (snap) => {
    cb(snap.docs.map((d) => d.data()));
  });
}

export function listenMember(id: string, cb: (member: Member | null) => void): Unsubscribe {
  return onSnapshot(memberDoc(id), (snap) => {
    cb(snap.exists() ? snap.data() : null);
  });
}

export async function approveMember(id: string): Promise<void> {
  await updateDoc(memberDoc(id), {
    status: 'active',
    joinedAt: serverTimestamp(),
  } as Record<string, unknown>);
  // Publish a public-safe directory entry for the Members Lounge.
  const snap = await getDoc(memberDoc(id));
  const m = snap.data();
  if (m) {
    await setDoc(
      directoryDoc(id),
      { displayName: m.displayName ?? '', uid: m.uid ?? null, joinedAt: m.joinedAt ?? serverTimestamp() },
      { merge: true },
    );
  }
}

/**
 * Fold a roster stub (the imported uid:null record that holds the plot) into the
 * kept signup record, atomically: repoint the stub's plots, copy its name / phone /
 * join-date onto the kept record and activate it, (re)publish the kept record's
 * lounge directory entry, and delete the stub member doc + its stale directory
 * entry. This is the admin one-click equivalent of the server-side auto-merge and
 * replaces a plain approveMember when a duplicate is detected.
 */
export async function mergeMembers(plan: MergePlan): Promise<void> {
  const batch = writeBatch(db);
  for (const u of plan.plotUpdates) {
    const patch: Record<string, unknown> = { holderMemberIds: u.holderMemberIds };
    if (u.setPrimary) patch.holderMemberId = plan.keepId;
    batch.update(doc(db, 'plots', u.id), patch);
  }
  const joinedAt = plan.joinedAt ?? serverTimestamp();
  const memberPatch: Record<string, unknown> = {
    status: 'active',
    joinedAt,
    displayName: plan.displayName,
  };
  if (plan.phone) memberPatch.phone = plan.phone;
  batch.set(doc(db, 'members', plan.keepId), memberPatch, { merge: true });
  batch.set(
    doc(db, 'directory', plan.keepId),
    { displayName: plan.displayName, uid: plan.keepId, joinedAt },
    { merge: true },
  );
  batch.delete(doc(db, 'members', plan.absorbId));
  batch.delete(doc(db, 'directory', plan.absorbId));
  await batch.commit();
}

export async function setMemberRole(id: string, role: Role): Promise<void> {
  await updateDoc(memberDoc(id), { role });
}

export async function setMemberStatus(id: string, status: MemberStatus): Promise<void> {
  await updateDoc(memberDoc(id), { status });
}

export async function updateMemberProfile(
  id: string,
  patch: { displayName?: string; phone?: string; notes?: string },
): Promise<void> {
  await updateDoc(memberDoc(id), patch as Record<string, unknown>);
}
