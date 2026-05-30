import {
  onSnapshot,
  updateDoc,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { membersCol, memberDoc } from '../../data/collections';
import type { Member, Role, MemberStatus } from '../../lib/types';

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
