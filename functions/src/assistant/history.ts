import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { BetaMessageParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AdminCaller } from '../lib/auth';
import { ASSISTANT_THREADS, MAX_THREAD_MESSAGES } from './config';

export type MessageRole = 'user' | 'assistant';
export type MessageKind = 'user_text' | 'assistant' | 'tool_results' | 'app_note';

/** What the chat UI shows for a message (it never parses `raw`'s text). */
export interface MessageDisplay {
  text: string;
  tools?: Array<{ name: string; label: string }>;
}

export interface NewMessage {
  role: MessageRole;
  kind: MessageKind;
  /** Anthropic content blocks, stored verbatim (as JSON text in `raw`). */
  content: unknown;
  display: MessageDisplay;
  authorUid?: string;
  authorName?: string;
}

/** A stored message as the history replay needs it. */
export interface StoredEntry {
  role: MessageRole;
  kind: MessageKind;
  content: unknown;
}

/**
 * A turn's claim on its thread. Longer than assistantChat's 300 s timeout, so
 * it can't lapse while a turn runs; a turn that died frees the thread once it does.
 */
export const TURN_LEASE_MS = 330_000;

export const threadRef = (db: Firestore, threadId: string) => db.collection(ASSISTANT_THREADS).doc(threadId);
const messageId = (seq: number) => String(seq).padStart(6, '0');

/**
 * Append one message to a thread's history: `messages/{seq}` with seq = the
 * number of messages so far (zero-padded to 6 for the doc id). The thread's
 * `messageCount` is read and bumped in the same transaction, so concurrent
 * appends (an approval landing during a turn) never collide. History is
 * append-only: nothing ever edits or deletes a stored message.
 */
export async function appendMessage(db: Firestore, threadId: string, entry: NewMessage): Promise<number> {
  const thread = threadRef(db, threadId);
  const display: MessageDisplay = { text: entry.display.text };
  if (entry.display.tools?.length) display.tools = entry.display.tools;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(thread);
    if (!snap.exists) throw new Error(`assistant thread ${threadId} does not exist`);
    const seq = Number(snap.get('messageCount') ?? 0);
    tx.create(thread.collection('messages').doc(messageId(seq)), {
      seq,
      role: entry.role,
      kind: entry.kind,
      raw: JSON.stringify(entry.content),
      display,
      ...(entry.authorUid ? { authorUid: entry.authorUid } : {}),
      ...(entry.authorName ? { authorName: entry.authorName } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(thread, { messageCount: seq + 1 });
    return seq;
  });
}

const toolUseIds = (content: unknown): string[] =>
  Array.isArray(content)
    ? content.filter((b) => b?.type === 'tool_use' && typeof b.id === 'string').map((b) => b.id as string)
    : [];

const unfinishedResult = (id: string) => ({
  type: 'tool_result',
  tool_use_id: id,
  is_error: true,
  content: "This call didn't finish (the app stopped before it could answer), so nothing was done.",
});

/**
 * Build the API `messages` from the stored history, in seq order. It is a pure
 * function of what's stored, so every request replays an identical prefix
 * (thinking blocks and prompt caching both depend on that). Two adjustments:
 *
 * - App notes are written whenever an admin acts, possibly while a turn is
 *   running, so their seq can fall between a tool call and its results, or
 *   ahead of a reply the model produced without seeing them. Each note is
 *   replayed just before the next admin message instead, and held back until
 *   one exists.
 * - An assistant tool call whose results were never stored (the function died
 *   between the two appends) gets an error result, so the thread stays usable.
 */
export function toApiMessages(entries: StoredEntry[]): BetaMessageParam[] {
  const out: BetaMessageParam[] = [];
  let notes: BetaMessageParam[] = [];
  let pendingToolUses: string[] = [];
  const answerPending = () => {
    if (pendingToolUses.length) out.push({ role: 'user', content: pendingToolUses.map(unfinishedResult) } as BetaMessageParam);
    pendingToolUses = [];
  };
  for (const e of entries) {
    const msg = { role: e.role, content: e.content } as BetaMessageParam;
    if (e.kind === 'app_note') {
      notes.push(msg);
      continue;
    }
    if (e.kind === 'tool_results') {
      pendingToolUses = [];
      out.push(msg);
      continue;
    }
    answerPending();
    if (e.kind === 'user_text') {
      out.push(...notes);
      notes = [];
    }
    out.push(msg);
    if (e.kind === 'assistant') pendingToolUses = toolUseIds(e.content);
  }
  answerPending();
  return out;
}

/** The thread's history as Anthropic `messages`, ready to send. */
export async function loadHistory(db: Firestore, threadId: string): Promise<BetaMessageParam[]> {
  const snap = await threadRef(db, threadId).collection('messages').orderBy('seq').get();
  return toApiMessages(
    snap.docs.map((d) => ({ role: d.get('role'), kind: d.get('kind'), content: JSON.parse(String(d.get('raw'))) })),
  );
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Begin an admin turn: create the thread (titled from the message's first 60
 * characters, `updatedAt` = `createdAt`) or continue an existing one, and claim
 * it so a second message can't run alongside (two interleaved turns would
 * corrupt the history). A full thread takes no more turns.
 */
export async function startTurn(
  db: Firestore,
  { threadId, caller, message, now }: { threadId?: string; caller: AdminCaller; message: string; now: Date },
): Promise<string> {
  const ref = threadId ? threadRef(db, threadId) : db.collection(ASSISTANT_THREADS).doc();
  const lease = Timestamp.fromDate(now);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      if (threadId) throw new HttpsError('not-found', "That conversation doesn't exist anymore. Start a new one.");
      tx.create(ref, {
        title: oneLine(message).slice(0, 60).trim(),
        createdBy: caller.uid,
        createdByName: caller.displayName,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        messageCount: 0,
        turnStartedAt: lease,
      });
      return;
    }
    if (Number(snap.get('messageCount') ?? 0) >= MAX_THREAD_MESSAGES) {
      throw new HttpsError('failed-precondition', 'This conversation is full. Start a new one.');
    }
    const started = snap.get('turnStartedAt');
    if (started instanceof Timestamp && now.getTime() - started.toMillis() < TURN_LEASE_MS) {
      throw new HttpsError(
        'failed-precondition',
        "I'm still working on the last message in this conversation. Wait for that reply, then send again.",
      );
    }
    tx.update(ref, { turnStartedAt: lease });
  });
  return ref.id;
}

/** End a turn: bump `updatedAt`, record the reply preview (when there is one) and free the thread. */
export async function finishTurn(db: Firestore, threadId: string, reply?: string): Promise<void> {
  const preview = reply ? oneLine(reply) : '';
  await threadRef(db, threadId).update({
    updatedAt: FieldValue.serverTimestamp(),
    turnStartedAt: FieldValue.delete(),
    ...(preview ? { lastReplyPreview: preview.length > 160 ? `${preview.slice(0, 159)}…` : preview } : {}),
  });
}
