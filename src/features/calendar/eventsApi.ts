import {
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
  onSnapshot,
  getDocs,
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

/**
 * Record the signed-in member's own RSVP (`source: 'app'`). Replaces the whole
 * doc, so switching to 'no' drops a party size. `partySize` is kept for
 * yes/maybe only; an empty note is left out. Rules validate the fields.
 */
export async function setRsvp(
  eventId: string,
  uid: string,
  status: RsvpStatus,
  displayName: string,
  extra: { partySize?: number; note?: string } = {},
): Promise<void> {
  const data: Record<string, unknown> = {
    status,
    displayName,
    respondedAt: serverTimestamp(),
    source: 'app',
  };
  if (status !== 'no' && extra.partySize !== undefined) data.partySize = extra.partySize;
  const note = extra.note?.trim();
  if (note) data.note = note;
  await setDoc(doc(db, 'events', eventId, 'rsvps', uid), data);
}

export function listenRsvps(eventId: string, cb: (rsvps: Rsvp[]) => void): Unsubscribe {
  return onSnapshot(rsvpsCol(eventId), (snap) => cb(snap.docs.map((d) => d.data())));
}

/** One-shot read of an event's RSVPs (bounded, for analytics reads). */
export async function fetchRsvps(eventId: string): Promise<Rsvp[]> {
  const snap = await getDocs(rsvpsCol(eventId));
  return snap.docs.map((d) => d.data());
}
