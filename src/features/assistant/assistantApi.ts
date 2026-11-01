import { collection, limit, onSnapshot, orderBy, query, type Unsubscribe } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { callFn } from '../../lib/callables';
import type {
  AssistantAction,
  AssistantMessage,
  AssistantThread,
  ChatResult,
  ExecuteActionInput,
  ExecuteActionResult,
} from './types';

// The assistant's callables and live Firestore reads. The server owns every
// write to assistantThreads/**: the client only listens and calls.

const CHAT_TIMEOUT_MS = 300_000; // assistantChat may run up to 300 s on the server
const EXECUTE_TIMEOUT_MS = 120_000;
const THREAD_LIMIT = 30;

/**
 * Send one admin message and wait for the assistant's whole turn. With no
 * `threadId` the server starts a thread and returns its id. (The field is left
 * out rather than sent as null, which the server's strict input schema rejects.)
 */
export function sendAssistantMessage(threadId: string | null, message: string): Promise<ChatResult> {
  return callFn<{ threadId?: string; message: string }, ChatResult>(
    'assistantChat',
    threadId ? { threadId, message } : { message },
    CHAT_TIMEOUT_MS,
  );
}

/**
 * Approve (`run`) or test-send (`test`, email only) a proposed action. Optional
 * `overrides` are the admin's edits; the server validates them with the same
 * schema as the proposal.
 */
export function executeAssistantAction(input: ExecuteActionInput): Promise<ExecuteActionResult> {
  return callFn<ExecuteActionInput, ExecuteActionResult>('assistantExecuteAction', input, EXECUTE_TIMEOUT_MS);
}

export async function rejectAssistantAction(threadId: string, actionId: string): Promise<void> {
  await callFn<{ threadId: string; actionId: string }, unknown>('assistantRejectAction', { threadId, actionId });
}

type OnError = (error: Error) => void;

/** The 30 most recently active conversations, newest first. */
export function listenThreads(cb: (threads: AssistantThread[]) => void, onError?: OnError): Unsubscribe {
  const q = query(collection(db, 'assistantThreads'), orderBy('updatedAt', 'desc'), limit(THREAD_LIMIT));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as AssistantThread)), onError);
}

/** A conversation's messages in the order they were appended. */
export function listenThreadMessages(
  threadId: string,
  cb: (messages: AssistantMessage[]) => void,
  onError?: OnError,
): Unsubscribe {
  const q = query(collection(db, 'assistantThreads', threadId, 'messages'), orderBy('seq', 'asc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as AssistantMessage)), onError);
}

/** The actions the assistant proposed in a conversation, oldest first. */
export function listenThreadActions(
  threadId: string,
  cb: (actions: AssistantAction[]) => void,
  onError?: OnError,
): Unsubscribe {
  const q = query(collection(db, 'assistantThreads', threadId, 'actions'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as AssistantAction)), onError);
}
