import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => {
  const serverTimestamp = vi.fn(() => ({ _type: 'serverTimestamp' }));
  const updateDoc = vi.fn().mockResolvedValue(undefined);
  const setDoc = vi.fn().mockResolvedValue(undefined);
  const getDoc = vi.fn().mockResolvedValue({
    exists: () => true,
    data: () => ({ displayName: 'Member One', uid: 'member-1' }),
  });
  const onSnapshot = vi.fn(() => vi.fn());
  const doc = vi.fn((_db: unknown, ...args: unknown[]) => ({ _path: args.join('/') }));
  const collection = vi.fn((_db: unknown, path: unknown) => ({ _path: path }));
  return { serverTimestamp, updateDoc, setDoc, getDoc, onSnapshot, doc, collection };
});

vi.mock('../../lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
  app: {},
}));

vi.mock('../../data/collections', () => {
  const fakeConverter = { toFirestore: (x: unknown) => x, fromFirestore: (x: unknown) => x };
  const membersCol = { _path: 'members', withConverter: () => membersCol, converter: fakeConverter };
  const memberDoc = (id: string) => ({
    _path: `members/${id}`,
    withConverter: function () { return this; },
  });
  const directoryDoc = (id: string) => ({ _path: `directory/${id}` });
  return { membersCol, memberDoc, directoryDoc };
});

import * as firestoreMod from 'firebase/firestore';
import { approveMember, setMemberRole, setMemberStatus } from './membersApi';

const mockedUpdateDoc = vi.mocked(firestoreMod.updateDoc);
const mockedServerTimestamp = vi.mocked(firestoreMod.serverTimestamp);

describe('membersApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('approveMember', () => {
    it('calls updateDoc with status:active and a joinedAt serverTimestamp', async () => {
      const fakeTs = { _type: 'serverTimestamp' };
      mockedServerTimestamp.mockReturnValue(fakeTs as unknown as ReturnType<typeof firestoreMod.serverTimestamp>);

      await approveMember('member-1');

      expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
      const callArgs = mockedUpdateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      const patch = callArgs[1];
      expect(patch).toMatchObject({ status: 'active' });
      expect(patch.joinedAt).toBe(fakeTs);
    });
  });

  describe('setMemberRole', () => {
    it('calls updateDoc with role:admin', async () => {
      await setMemberRole('member-1', 'admin');

      expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
      const callArgs = mockedUpdateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect(callArgs[1]).toEqual({ role: 'admin' });
    });

    it('calls updateDoc with role:member', async () => {
      await setMemberRole('member-2', 'member');

      expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
      const callArgs = mockedUpdateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect(callArgs[1]).toEqual({ role: 'member' });
    });
  });

  describe('setMemberStatus', () => {
    it('calls updateDoc with status:inactive', async () => {
      await setMemberStatus('member-1', 'inactive');

      expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
      const callArgs = mockedUpdateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect(callArgs[1]).toEqual({ status: 'inactive' });
    });

    it('calls updateDoc with status:pending', async () => {
      await setMemberStatus('member-3', 'pending');

      expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
      const callArgs = mockedUpdateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      expect(callArgs[1]).toEqual({ status: 'pending' });
    });
  });
});
