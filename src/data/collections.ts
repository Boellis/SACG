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

// `mail` docs don't follow the {id}-in-data convention (the Trigger Email
// extension owns their shape), so this ref intentionally has no converter.
export const mailCol = collection(db, 'mail');

// Members Lounge directory + 1:1 chat. Raw refs (no converter); readers map ids.
export const directoryCol = collection(db, 'directory');
export const directoryDoc = (id: string) => doc(db, 'directory', id);
export const conversationsCol = collection(db, 'conversations');
export const conversationDoc = (id: string) => doc(db, 'conversations', id);
export const messagesCol = (cid: string) => collection(db, 'conversations', cid, 'messages');
export const announcementsCol = collection(db, 'announcements');
export const announcementDoc = (id: string) => doc(db, 'announcements', id);

// Shared documents (admin uploads → Cloud Storage). Raw refs; readers map ids.
export const documentsCol = collection(db, 'documents');
export const documentDoc = (id: string) => doc(db, 'documents', id);

// Polls / surveys. Votes live in a subcollection keyed by the voter's uid.
export const pollsCol = collection(db, 'polls');
export const pollDoc = (id: string) => doc(db, 'polls', id);
export const votesCol = (pollId: string) => collection(db, 'polls', pollId, 'votes');
export const votesDoc = (pollId: string, uid: string) => doc(db, 'polls', pollId, 'votes', uid);

export const threadsCol = collection(db, 'threads').withConverter(conv<ForumThread>());
export const threadDoc = (id: string) => doc(db, 'threads', id).withConverter(conv<ForumThread>());
export const repliesCol = (threadId: string) => collection(db, 'threads', threadId, 'replies').withConverter(conv<ForumReply>());

