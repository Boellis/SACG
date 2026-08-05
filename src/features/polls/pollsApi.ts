import {
  onSnapshot,
  getDocs,
  addDoc,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { pollsCol, pollDoc, votesCol, votesDoc } from '../../data/collections';
import type { Poll, PollOption, PollVote } from '../../lib/types';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function listenPolls(cb: (polls: Poll[]) => void): Unsubscribe {
  return onSnapshot(query(pollsCol, orderBy('createdAt', 'desc')), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Poll, 'id'>) })));
  });
}

export function listenVotes(pollId: string, cb: (votes: PollVote[]) => void): Unsubscribe {
  return onSnapshot(votesCol(pollId), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PollVote, 'id'>) })));
  });
}

/** One-shot read of a poll's votes (bounded, for analytics reads). */
export async function fetchVotes(pollId: string): Promise<PollVote[]> {
  const snap = await getDocs(votesCol(pollId));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PollVote, 'id'>) }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreatePollInput {
  question: string;
  options: string[];
  expiresAt?: Date | null; // null/undefined = no close date
  createdBy: string;
  authorName: string;
}

export async function createPoll(input: CreatePollInput): Promise<void> {
  const options: PollOption[] = input.options
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .map((text, i) => ({ id: String(i), text }));
  await addDoc(pollsCol, {
    question: input.question.trim(),
    options,
    createdBy: input.createdBy,
    authorName: input.authorName,
    expiresAt: input.expiresAt ? Timestamp.fromDate(input.expiresAt) : null,
    closed: false,
    createdAt: serverTimestamp(),
  });
}

export async function deletePoll(id: string): Promise<void> {
  await deleteDoc(pollDoc(id));
}

/**
 * Record (or change) a member's vote. The vote doc id is the voter's auth uid,
 * so setDoc overwrites any previous choice — one vote per member, changeable
 * while the poll is open.
 */
export async function castVote(pollId: string, uid: string, optionId: string): Promise<void> {
  await setDoc(votesDoc(pollId, uid), {
    optionId,
    memberId: uid,
    createdAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested)
// ---------------------------------------------------------------------------

export interface OptionTally {
  id: string;
  text: string;
  count: number;
  pct: number; // whole-number percentage of total votes (0 when no votes)
}

export interface PollTally {
  results: OptionTally[];
  total: number;
}

/** Count votes per option and derive each option's share of the total. */
export function tally(options: PollOption[], votes: PollVote[]): PollTally {
  const total = votes.length;
  const results = options.map((opt) => {
    const count = votes.reduce((n, v) => (v.optionId === opt.id ? n + 1 : n), 0);
    const pct = total === 0 ? 0 : Math.round((count / total) * 100);
    return { id: opt.id, text: opt.text, count, pct };
  });
  return { results, total };
}

/** A poll accepts votes when it isn't closed and its close date (if any) is in the future. */
export function isPollOpen(poll: Poll, nowMs: number): boolean {
  if (poll.closed) return false;
  if (!poll.expiresAt) return true;
  return poll.expiresAt.toMillis() > nowMs;
}
