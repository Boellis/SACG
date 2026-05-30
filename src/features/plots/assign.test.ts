import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => {
  const updateDoc = vi.fn().mockResolvedValue(undefined);
  const setDoc = vi.fn().mockResolvedValue(undefined);
  const onSnapshot = vi.fn(() => vi.fn());
  const serverTimestamp = vi.fn(() => ({ _type: 'serverTimestamp' }));
  const doc = vi.fn((_db: unknown, ...args: unknown[]) => ({ _path: args.join('/') }));
  const collection = vi.fn((_db: unknown, path: unknown) => ({ _path: path }));
  const getDoc = vi.fn();

  // writeBatch mock: returns object with set/update/delete/commit vi.fns
  const mockBatch = {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
  const writeBatch = vi.fn(() => mockBatch);

  return { updateDoc, setDoc, onSnapshot, serverTimestamp, doc, collection, getDoc, writeBatch };
});

// Mock ../../lib/firebase
vi.mock('../../lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
  app: {},
}));

// Mock ../../data/collections
vi.mock('../../data/collections', () => {
  const plotsCol = { _path: 'plots' };
  const plotDoc = (id: string) => ({
    _path: `plots/${id}`,
    withConverter: function () { return this; },
  });
  const membersCol = { _path: 'members' };
  const memberDoc = (id: string) => ({
    _path: `members/${id}`,
    withConverter: function () { return this; },
  });
  return { plotsCol, plotDoc, membersCol, memberDoc };
});

// Mock ../members/membersApi so we can assert approveMember calls
vi.mock('../members/membersApi', () => ({
  approveMember: vi.fn().mockResolvedValue(undefined),
  listenMembers: vi.fn(() => vi.fn()),
}));

import * as firestoreMod from 'firebase/firestore';
import * as membersApi from '../members/membersApi';
import { assignPlot, unassignPlot, splitPlot, setCrops } from './plotsApi';
import type { Plot, Member } from '../../lib/types';

const mockedUpdateDoc = vi.mocked(firestoreMod.updateDoc);
const mockedWriteBatch = vi.mocked(firestoreMod.writeBatch);
const mockedApproveMember = vi.mocked(membersApi.approveMember);

const basePlot: Plot = {
  id: '7',
  number: 7,
  half: 'whole',
  size: '10x20',
  status: 'available',
  holderMemberId: undefined,
  holderName: undefined,
  duesAmount: 100,
  depositAmount: 25,
  duesPaid: false,
  depositPaid: false,
  season: '2026',
  crops: [],
  notes: '',
};

const activeMember: Member = {
  id: 'member-active',
  uid: 'member-active',
  email: 'active@example.com',
  displayName: 'Alice Active',
  role: 'member',
  status: 'active',
  currentYearHours: 0,
  createdAt: { toDate: () => new Date() } as unknown as import('firebase/firestore').Timestamp,
};

const pendingMember: Member = {
  id: 'member-pending',
  uid: 'member-pending',
  email: 'pending@example.com',
  displayName: 'Bob Pending',
  role: 'member',
  status: 'pending',
  currentYearHours: 0,
  createdAt: { toDate: () => new Date() } as unknown as import('firebase/firestore').Timestamp,
};

describe('assignPlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses writeBatch and calls batch.update once (plot only) for an active member', async () => {
    await assignPlot(basePlot, activeMember);

    expect(mockedWriteBatch).toHaveBeenCalledTimes(1);
    const batch = mockedWriteBatch.mock.results[0].value as {
      update: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
    };

    expect(batch.update).toHaveBeenCalledTimes(1);
    const [, patch] = batch.update.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(patch).toMatchObject({
      holderMemberId: 'member-active',
      holderName: 'Alice Active',
      status: 'assigned',
    });
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  it('does NOT call approveMember when member is active', async () => {
    await assignPlot(basePlot, activeMember);
    expect(mockedApproveMember).not.toHaveBeenCalled();
  });

  it('calls batch.update twice (plot + member approval) when assigning a pending member', async () => {
    await assignPlot(basePlot, pendingMember);

    expect(mockedWriteBatch).toHaveBeenCalledTimes(1);
    const batch = mockedWriteBatch.mock.results[0].value as {
      update: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
    };

    expect(batch.update).toHaveBeenCalledTimes(2);

    // First update: plot assignment
    const [, plotPatch] = batch.update.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(plotPatch).toMatchObject({
      holderMemberId: 'member-pending',
      holderName: 'Bob Pending',
      status: 'assigned',
    });

    // Second update: member approval
    const [, memberPatch] = batch.update.mock.calls[1] as [unknown, Record<string, unknown>];
    expect(memberPatch).toMatchObject({ status: 'active' });
    expect(memberPatch).toHaveProperty('joinedAt');

    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe('unassignPlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls updateDoc with holderMemberId:null, holderName:null, status:available', async () => {
    await unassignPlot('7');
    expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
    const patch = (mockedUpdateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
    expect(patch).toMatchObject({ holderMemberId: null, holderName: null, status: 'available' });
  });
});

describe('splitPlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls writeBatch, batch.set for aId and bId, batch.delete for original id, then batch.commit', async () => {
    await splitPlot(basePlot);

    // writeBatch was called once
    expect(mockedWriteBatch).toHaveBeenCalledTimes(1);

    const batch = mockedWriteBatch.mock.results[0].value as {
      set: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      commit: ReturnType<typeof vi.fn>;
    };

    // Two set calls — one for each half
    expect(batch.set).toHaveBeenCalledTimes(2);

    const setCalls = batch.set.mock.calls as Array<[{ _path: string }, Record<string, unknown>]>;
    const paths = setCalls.map((c) => c[0]._path);
    expect(paths).toContain('plots/7A');
    expect(paths).toContain('plots/7B');

    // Check the A half data
    const aCall = setCalls.find((c) => c[0]._path === 'plots/7A')!;
    expect(aCall[1]).toMatchObject({ half: 'A', status: 'available', duesPaid: false, crops: [] });

    // Check the B half data
    const bCall = setCalls.find((c) => c[0]._path === 'plots/7B')!;
    expect(bCall[1]).toMatchObject({ half: 'B', status: 'available', duesPaid: false, crops: [] });

    // Delete called with the original plot id
    expect(batch.delete).toHaveBeenCalledTimes(1);
    const deleteArg = (batch.delete.mock.calls[0] as [{ _path: string }])[0];
    expect(deleteArg._path).toBe('plots/7');

    // commit called
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe('setCrops', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls updateDoc with crops array', async () => {
    const crops = [{ name: 'Tomato', notes: 'cherry variety' }];
    await setCrops('7', crops);
    expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
    const patch = (mockedUpdateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>])[1];
    expect(patch).toMatchObject({ crops });
  });
});
