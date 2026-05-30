import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => {
  const addDoc = vi.fn().mockResolvedValue({ id: 'new-id' });
  const deleteDoc = vi.fn().mockResolvedValue(undefined);
  const updateDoc = vi.fn().mockResolvedValue(undefined);
  const onSnapshot = vi.fn(() => vi.fn());
  const query = vi.fn((...args: unknown[]) => ({ _query: args }));
  const where = vi.fn((...args: unknown[]) => ({ _where: args }));
  const serverTimestamp = vi.fn(() => ({ _type: 'serverTimestamp' }));
  const doc = vi.fn((_db: unknown, ...args: unknown[]) => ({ _path: args.join('/') }));
  const collection = vi.fn((_db: unknown, path: unknown) => ({ _path: path }));
  const Timestamp = {
    fromDate: vi.fn((d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), _isTimestamp: true })),
  };
  return { addDoc, deleteDoc, updateDoc, onSnapshot, query, where, serverTimestamp, doc, collection, Timestamp };
});

// Mock firebase lib
vi.mock('../../lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
  app: {},
}));

// Mock collections
vi.mock('../../data/collections', () => {
  const hoursCol = { _path: 'volunteerHours' };
  return { hoursCol };
});

import * as firestoreMod from 'firebase/firestore';
import { addHours, deleteHours, updateHours } from './hoursApi';

const mockedAddDoc = vi.mocked(firestoreMod.addDoc);
const mockedDeleteDoc = vi.mocked(firestoreMod.deleteDoc);
const mockedUpdateDoc = vi.mocked(firestoreMod.updateDoc);
const mockedTimestamp = vi.mocked(firestoreMod.Timestamp);

describe('hoursApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addHours', () => {
    it('calls addDoc with Timestamp date, memberId, and recordedBy', async () => {
      const date = new Date('2026-03-15T00:00:00Z');
      await addHours({
        memberId: 'member-1',
        date,
        hours: 4,
        description: 'Garden cleanup',
        recordedBy: 'member-1',
      });

      expect(mockedAddDoc).toHaveBeenCalledTimes(1);
      const [_col, data] = mockedAddDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect(data.memberId).toBe('member-1');
      expect(data.recordedBy).toBe('member-1');
      expect(data.hours).toBe(4);
      expect(data.description).toBe('Garden cleanup');
      // date should be a Timestamp (fromDate was called)
      expect(mockedTimestamp.fromDate).toHaveBeenCalledWith(date);
      // data.date should be the Timestamp object returned by fromDate
      expect((data.date as Record<string, unknown>)._isTimestamp).toBe(true);
    });

    it('includes eventId when provided', async () => {
      await addHours({
        memberId: 'member-2',
        date: new Date('2026-04-01'),
        hours: 2,
        recordedBy: 'admin-uid',
        eventId: 'event-abc',
      });

      const [_col, data] = mockedAddDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect(data.eventId).toBe('event-abc');
      expect(data.memberId).toBe('member-2');
      expect(data.recordedBy).toBe('admin-uid');
    });

    it('includes serverTimestamp as createdAt', async () => {
      await addHours({
        memberId: 'member-1',
        date: new Date(),
        hours: 1,
        recordedBy: 'member-1',
      });

      const [_col, data] = mockedAddDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect((data.createdAt as Record<string, unknown>)._type).toBe('serverTimestamp');
    });
  });

  describe('deleteHours', () => {
    it('calls deleteDoc with correct document reference', async () => {
      await deleteHours('hour-entry-123');

      expect(mockedDeleteDoc).toHaveBeenCalledTimes(1);
      const [docRef] = mockedDeleteDoc.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(docRef._path).toBe('volunteerHours/hour-entry-123');
    });
  });

  describe('updateHours', () => {
    it('calls updateDoc with patch data', async () => {
      await updateHours('hour-entry-456', { hours: 5 });

      expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
      const [docRef, patch] = mockedUpdateDoc.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
      expect(docRef._path).toBe('volunteerHours/hour-entry-456');
      expect(patch).toMatchObject({ hours: 5 });
    });
  });
});
