import {
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { threadsCol, threadDoc, repliesCol } from '../../data/collections';
import type { ForumThread, ForumReply } from '../../lib/types';

export function listenThreads(cb: (threads: ForumThread[]) => void): Unsubscribe {
  const q = query(threadsCol, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data())));
}

export interface CreateThreadInput {
  title: string;
  body: string;
  authorId: string;
  authorName: string;
}

export async function createThread(input: CreateThreadInput): Promise<void> {
  await addDoc(threadsCol, {
    title: input.title,
    body: input.body,
    authorId: input.authorId,
    authorName: input.authorName,
    createdAt: serverTimestamp(),
  } as any);
}

export async function deleteThread(id: string): Promise<void> {
  await deleteDoc(threadDoc(id));
}

export function listenReplies(threadId: string, cb: (replies: ForumReply[]) => void): Unsubscribe {
  const q = query(repliesCol(threadId), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data())));
}

export interface AddReplyInput {
  body: string;
  authorId: string;
  authorName: string;
}

export async function addReply(threadId: string, input: AddReplyInput): Promise<void> {
  await addDoc(repliesCol(threadId), {
    body: input.body,
    authorId: input.authorId,
    authorName: input.authorName,
    createdAt: serverTimestamp(),
  } as any);
}

export async function deleteReply(threadId: string, rid: string): Promise<void> {
  await deleteDoc(doc(db, 'threads', threadId, 'replies', rid));
}
