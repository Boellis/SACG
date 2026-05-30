import {
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { hoursCol } from '../../data/collections';
import type { VolunteerHour } from '../../lib/types';

export function listenMemberHours(
  memberId: string,
  cb: (entries: VolunteerHour[]) => void,
): Unsubscribe {
  const q = query(hoursCol, where('memberId', '==', memberId));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data())));
}

export function listenAllHours(cb: (entries: VolunteerHour[]) => void): Unsubscribe {
  return onSnapshot(hoursCol, (snap) => cb(snap.docs.map((d) => d.data())));
}

export interface AddHoursInput {
  memberId: string;
  date: Date;
  hours: number;
  description?: string;
  recordedBy: string;
  eventId?: string;
}

export async function addHours(input: AddHoursInput): Promise<void> {
  await addDoc(hoursCol, {
    memberId: input.memberId,
    date: Timestamp.fromDate(input.date),
    hours: input.hours,
    description: input.description,
    recordedBy: input.recordedBy,
    eventId: input.eventId,
    createdAt: serverTimestamp(),
  } as any);
}

export async function updateHours(
  id: string,
  patch: Partial<Omit<VolunteerHour, 'id' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(doc(db, 'volunteerHours', id), patch as any);
}

export async function deleteHours(id: string): Promise<void> {
  await deleteDoc(doc(db, 'volunteerHours', id));
}
