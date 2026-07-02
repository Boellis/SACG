import {
  onSnapshot,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { conversationsCol, conversationDoc, messagesCol } from '../../data/collections';
import type { Conversation, ChatMessage } from '../../lib/types';

/** Deterministic conversation id for a pair of members (order-independent). */
export function conversationId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

/** Create the conversation doc if it doesn't exist; returns its id. */
export async function startConversation(
  me: { uid: string; name: string },
  other: { uid: string; name: string },
): Promise<string> {
  const cid = conversationId(me.uid, other.uid);
  await setDoc(
    conversationDoc(cid),
    {
      participants: [me.uid, other.uid].sort(),
      participantNames: { [me.uid]: me.name, [other.uid]: other.name },
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
  return cid;
}

/** My conversations, most-recently-active first (sorted client-side). */
export function listenConversations(uid: string, cb: (c: Conversation[]) => void): Unsubscribe {
  return onSnapshot(query(conversationsCol, where('participants', 'array-contains', uid)), (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Conversation, 'id'>) }));
    items.sort((a, b) => (b.lastAt?.toMillis?.() ?? 0) - (a.lastAt?.toMillis?.() ?? 0));
    cb(items);
  });
}

export function listenConversation(cid: string, cb: (c: Conversation | null) => void): Unsubscribe {
  return onSnapshot(conversationDoc(cid), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Conversation, 'id'>) } : null);
  });
}

export function listenMessages(cid: string, cb: (m: ChatMessage[]) => void): Unsubscribe {
  return onSnapshot(query(messagesCol(cid), orderBy('createdAt', 'asc')), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatMessage, 'id'>) })));
  });
}

export async function sendMessage(cid: string, senderId: string, text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  await addDoc(messagesCol(cid), { senderId, text: t, createdAt: serverTimestamp() });
  await updateDoc(conversationDoc(cid), { lastMessage: t.slice(0, 140), lastAt: serverTimestamp() });
}
