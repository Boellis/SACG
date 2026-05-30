import { collection, doc, QueryDocumentSnapshot, FirestoreDataConverter } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Member, Plot, GardenEvent, VolunteerHour, Rsvp, ForumThread, ForumReply } from '../lib/types';

const conv = <T extends { id: string }>(): FirestoreDataConverter<T> => ({
  toFirestore: ({ id: _id, ...rest }: T) => rest as any,
  fromFirestore: (snap: QueryDocumentSnapshot) => ({ id: snap.id, ...snap.data() } as T),
});

export const membersCol = collection(db, 'members').withConverter(conv<Member>());
export const plotsCol   = collection(db, 'plots').withConverter(conv<Plot>());
export const eventsCol  = collection(db, 'events').withConverter(conv<GardenEvent>());
export const hoursCol   = collection(db, 'volunteerHours').withConverter(conv<VolunteerHour>());
export const rsvpsCol = (eventId: string) => collection(db, 'events', eventId, 'rsvps').withConverter(conv<Rsvp>());
export const memberDoc = (id: string) => doc(db, 'members', id).withConverter(conv<Member>());
export const plotDoc   = (id: string) => doc(db, 'plots', id).withConverter(conv<Plot>());
export const settingsDoc = () => doc(db, 'settings', 'org');

export const threadsCol = collection(db, 'threads').withConverter(conv<ForumThread>());
export const threadDoc = (id: string) => doc(db, 'threads', id).withConverter(conv<ForumThread>());
export const repliesCol = (threadId: string) => collection(db, 'threads', threadId, 'replies').withConverter(conv<ForumReply>());

