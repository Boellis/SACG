import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => {
  const addDoc = vi.fn().mockResolvedValue({ id: 'new-doc-id' });
  const deleteDoc = vi.fn().mockResolvedValue(undefined);
  const onSnapshot = vi.fn(() => vi.fn());
  const query = vi.fn((...args: unknown[]) => ({ _query: args }));
  const orderBy = vi.fn((...args: unknown[]) => ({ _orderBy: args }));
  const doc = vi.fn((_db: unknown, ...args: unknown[]) => ({ _path: args.join('/') }));
  const collection = vi.fn((_db: unknown, path: unknown) => ({ _path: path }));
  const serverTimestamp = vi.fn(() => ({ _type: 'serverTimestamp' }));
  return { addDoc, deleteDoc, onSnapshot, query, orderBy, doc, collection, serverTimestamp };
});

// Mock firebase lib
vi.mock('../../lib/firebase', () => ({
  auth: {},
  db: {},
  app: {},
}));

// Mock collections
vi.mock('../../data/collections', () => {
  const threadsCol = { _path: 'threads' };
  const threadDoc = (id: string) => ({ _path: `threads/${id}` });
  const repliesCol = (threadId: string) => ({ _path: `threads/${threadId}/replies` });
  return { threadsCol, threadDoc, repliesCol };
});

import * as firestoreMod from 'firebase/firestore';
import { createThread, deleteThread, addReply, deleteReply, listenThreads, listenReplies } from './forumApi';

const mockedAddDoc = vi.mocked(firestoreMod.addDoc);
const mockedDeleteDoc = vi.mocked(firestoreMod.deleteDoc);
const mockedOnSnapshot = vi.mocked(firestoreMod.onSnapshot);
const mockedServerTimestamp = vi.mocked(firestoreMod.serverTimestamp);

describe('forumApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createThread', () => {
    it('calls addDoc with title, body, authorId, authorName, and createdAt', async () => {
      const fakeTs = { _type: 'serverTimestamp' };
      mockedServerTimestamp.mockReturnValue(fakeTs as any);

      await createThread({
        title: 'Garden Tips',
        body: 'Anyone know about composting?',
        authorId: 'user-1',
        authorName: 'Alice',
      });

      expect(mockedAddDoc).toHaveBeenCalledTimes(1);
      const [col, data] = mockedAddDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect((col as Record<string, unknown>)._path).toBe('threads');
      expect(data.title).toBe('Garden Tips');
      expect(data.body).toBe('Anyone know about composting?');
      expect(data.authorId).toBe('user-1');
      expect(data.authorName).toBe('Alice');
      expect(data.createdAt).toBe(fakeTs);
    });
  });

  describe('deleteThread', () => {
    it('calls deleteDoc with the thread document reference', async () => {
      await deleteThread('thread-abc');

      expect(mockedDeleteDoc).toHaveBeenCalledTimes(1);
      const [docRef] = mockedDeleteDoc.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(docRef._path).toBe('threads/thread-abc');
    });
  });

  describe('addReply', () => {
    it('calls addDoc on the replies collection with body, authorId, authorName, and createdAt', async () => {
      const fakeTs = { _type: 'serverTimestamp' };
      mockedServerTimestamp.mockReturnValue(fakeTs as any);

      await addReply('thread-xyz', {
        body: 'Great point!',
        authorId: 'user-2',
        authorName: 'Bob',
      });

      expect(mockedAddDoc).toHaveBeenCalledTimes(1);
      const [col, data] = mockedAddDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect((col as Record<string, unknown>)._path).toBe('threads/thread-xyz/replies');
      expect(data.body).toBe('Great point!');
      expect(data.authorId).toBe('user-2');
      expect(data.authorName).toBe('Bob');
      expect(data.createdAt).toBe(fakeTs);
    });
  });

  describe('deleteReply', () => {
    it('calls deleteDoc with the reply document reference', async () => {
      await deleteReply('thread-1', 'reply-99');

      expect(mockedDeleteDoc).toHaveBeenCalledTimes(1);
      const [docRef] = mockedDeleteDoc.mock.calls[0] as unknown as [Record<string, unknown>];
      expect((docRef as Record<string, unknown>)._path).toBe('threads/thread-1/replies/reply-99');
    });
  });

  describe('listenThreads', () => {
    it('calls onSnapshot and returns unsubscribe function', () => {
      const mockUnsub = vi.fn();
      mockedOnSnapshot.mockReturnValue(mockUnsub as any);

      const cb = vi.fn();
      const unsub = listenThreads(cb);

      expect(mockedOnSnapshot).toHaveBeenCalledTimes(1);
      expect(unsub).toBe(mockUnsub);
    });
  });

  describe('listenReplies', () => {
    it('calls onSnapshot and returns unsubscribe function', () => {
      const mockUnsub = vi.fn();
      mockedOnSnapshot.mockReturnValue(mockUnsub as any);

      const cb = vi.fn();
      const unsub = listenReplies('thread-1', cb);

      expect(mockedOnSnapshot).toHaveBeenCalledTimes(1);
      expect(unsub).toBe(mockUnsub);
    });
  });
});
