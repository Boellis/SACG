import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => {
  const addDoc = vi.fn().mockResolvedValue({ id: 'new-event-id' });
  const deleteDoc = vi.fn().mockResolvedValue(undefined);
  const updateDoc = vi.fn().mockResolvedValue(undefined);
  const setDoc = vi.fn().mockResolvedValue(undefined);
  const onSnapshot = vi.fn(() => vi.fn());
  const query = vi.fn((...args: unknown[]) => ({ _query: args }));
  const orderBy = vi.fn((...args: unknown[]) => ({ _orderBy: args }));
  const doc = vi.fn((_db: unknown, ...args: unknown[]) => ({ _path: args.join('/') }));
  const collection = vi.fn((_db: unknown, path: unknown) => ({ _path: path }));
  const serverTimestamp = vi.fn(() => ({ _type: 'serverTimestamp' }));
  const Timestamp = {
    fromDate: vi.fn((d: Date) => ({ seconds: Math.floor(d.getTime() / 1000), _isTimestamp: true })),
  };
  return { addDoc, deleteDoc, updateDoc, setDoc, onSnapshot, query, orderBy, doc, collection, serverTimestamp, Timestamp };
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
  const eventsCol = { _path: 'events' };
  const rsvpsCol = (eventId: string) => ({ _path: `events/${eventId}/rsvps` });
  return { eventsCol, rsvpsCol };
});

import * as firestoreMod from 'firebase/firestore';
import { createEvent, setRsvp, deleteEvent, updateEvent } from './eventsApi';

const mockedAddDoc = vi.mocked(firestoreMod.addDoc);
const mockedDeleteDoc = vi.mocked(firestoreMod.deleteDoc);
const mockedSetDoc = vi.mocked(firestoreMod.setDoc);
const mockedUpdateDoc = vi.mocked(firestoreMod.updateDoc);
const mockedTimestamp = vi.mocked(firestoreMod.Timestamp);
const mockedServerTimestamp = vi.mocked(firestoreMod.serverTimestamp);

describe('eventsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createEvent', () => {
    it('calls addDoc with Timestamp start/end, title, and type', async () => {
      const start = new Date('2026-06-15T09:00:00');
      const end = new Date('2026-06-15T12:00:00');

      await createEvent({
        title: 'Summer Workday',
        type: 'workday',
        start,
        end,
        allDay: false,
        location: 'Main Garden',
        createdBy: 'admin-uid',
      });

      expect(mockedAddDoc).toHaveBeenCalledTimes(1);
      const [_col, data] = mockedAddDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect(data.title).toBe('Summer Workday');
      expect(data.type).toBe('workday');
      expect(data.allDay).toBe(false);
      expect(data.location).toBe('Main Garden');
      expect(data.createdBy).toBe('admin-uid');
      // start/end must be Timestamp objects
      expect(mockedTimestamp.fromDate).toHaveBeenCalledWith(start);
      expect(mockedTimestamp.fromDate).toHaveBeenCalledWith(end);
      expect((data.start as Record<string, unknown>)._isTimestamp).toBe(true);
      expect((data.end as Record<string, unknown>)._isTimestamp).toBe(true);
    });

    it('includes description when provided', async () => {
      const start = new Date('2026-07-01T10:00:00');
      const end = new Date('2026-07-01T11:00:00');

      await createEvent({
        title: 'Monthly Meeting',
        type: 'meeting',
        start,
        end,
        allDay: false,
        description: 'Board updates',
        createdBy: 'admin-uid',
      });

      const [_col, data] = mockedAddDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect(data.description).toBe('Board updates');
      expect(data.type).toBe('meeting');
    });
  });

  describe('setRsvp', () => {
    it('calls setDoc with status, displayName, and respondedAt serverTimestamp', async () => {
      const fakeTs = { _type: 'serverTimestamp' };
      mockedServerTimestamp.mockReturnValue(fakeTs as unknown as ReturnType<typeof firestoreMod.serverTimestamp>);

      await setRsvp('event-123', 'member-uid', 'yes', 'Alice Smith');

      expect(mockedSetDoc).toHaveBeenCalledTimes(1);
      const [_ref, data] = mockedSetDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect(data.status).toBe('yes');
      expect(data.displayName).toBe('Alice Smith');
      expect(data.respondedAt).toBe(fakeTs);
    });

    it('calls setDoc with maybe status', async () => {
      await setRsvp('event-456', 'user-99', 'maybe', 'Bob Jones');

      const [_ref, data] = mockedSetDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect(data.status).toBe('maybe');
      expect(data.displayName).toBe('Bob Jones');
    });
  });

  describe('deleteEvent', () => {
    it('calls deleteDoc with the correct document reference', async () => {
      await deleteEvent('event-abc');

      expect(mockedDeleteDoc).toHaveBeenCalledTimes(1);
      const [docRef] = mockedDeleteDoc.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(docRef._path).toBe('events/event-abc');
    });
  });

  describe('updateEvent', () => {
    it('calls updateDoc with the correct document reference and patch', async () => {
      await updateEvent('event-xyz', { title: 'Updated Title' });

      expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
      const [docRef, patch] = mockedUpdateDoc.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
      expect(docRef._path).toBe('events/event-xyz');
      expect(patch).toMatchObject({ title: 'Updated Title' });
    });
  });
});
