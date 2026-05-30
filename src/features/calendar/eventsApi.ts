import {
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { eventsCol, rsvpsCol } from '../../data/collections';
import type { GardenEvent, Rsvp, EventType, RsvpStatus } from '../../lib/types';

export function listenEvents(cb: (events: GardenEvent[]) => void): Unsubscribe {
  const q = query(eventsCol, orderBy('start'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data())));
}

export interface CreateEventInput {
  title: string;
  type: EventType;
  start: Date;
  end: Date;
  allDay: boolean;
  location?: string;
  description?: string;
  createdBy: string;
}

export async function createEvent(input: CreateEventInput): Promise<void> {
  await addDoc(eventsCol, {
    title: input.title,
    type: input.type,
    start: Timestamp.fromDate(input.start),
    end: Timestamp.fromDate(input.end),
    allDay: input.allDay,
    location: input.location,
    description: input.description,
    createdBy: input.createdBy,
  } as any);
}

export async function updateEvent(
  id: string,
  patch: Partial<Omit<GardenEvent, 'id'>>,
): Promise<void> {
  await updateDoc(doc(db, 'events', id), patch as any);
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteDoc(doc(db, 'events', id));
}

export async function setRsvp(
  eventId: string,
  uid: string,
  status: RsvpStatus,
  displayName: string,
): Promise<void> {
  await setDoc(doc(db, 'events', eventId, 'rsvps', uid), {
    status,
    displayName,
    respondedAt: serverTimestamp(),
  });
}

export function listenRsvps(eventId: string, cb: (rsvps: Rsvp[]) => void): Unsubscribe {
  return onSnapshot(rsvpsCol(eventId), (snap) => cb(snap.docs.map((d) => d.data())));
}
