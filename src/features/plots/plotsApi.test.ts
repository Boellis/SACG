import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock firebase/firestore so no real backend is hit
vi.mock('firebase/firestore', () => {
  const serverTimestamp = vi.fn(() => ({ _type: 'serverTimestamp' }));
  const updateDoc = vi.fn().mockResolvedValue(undefined);
  const setDoc = vi.fn().mockResolvedValue(undefined);
  const onSnapshot = vi.fn(() => vi.fn()); // returns unsubscribe
  const doc = vi.fn((_db: unknown, ...args: unknown[]) => ({ _path: args.join('/') }));
  const collection = vi.fn((_db: unknown, path: unknown) => ({ _path: path }));
  const getDoc = vi.fn();
  return { serverTimestamp, updateDoc, setDoc, onSnapshot, doc, collection, getDoc };
});

// Mock ../../lib/firebase
vi.mock('../../lib/firebase', () => ({
  auth: {},
  googleProvider: {},
  db: {},
  app: {},
}));

// collections uses withConverter which we need to handle
vi.mock('../../data/collections', () => {
  const fakeConverter = { toFirestore: (x: unknown) => x, fromFirestore: (x: unknown) => x };
  const plotsCol = { _path: 'plots', withConverter: () => plotsCol, converter: fakeConverter };
  const plotDoc = (id: string) => ({
    _path: `plots/${id}`,
    withConverter: function () { return this; },
  });
  return { plotsCol, plotDoc };
});

import * as firestoreMod from 'firebase/firestore';
import { toggleDuesPaid, createPlot, toggleDepositPaid } from './plotsApi';

const mockedUpdateDoc = vi.mocked(firestoreMod.updateDoc);
const mockedSetDoc = vi.mocked(firestoreMod.setDoc);
const mockedServerTimestamp = vi.mocked(firestoreMod.serverTimestamp);

describe('plotsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toggleDuesPaid', () => {
    it('calls updateDoc with duesPaid:true and a paidDate when paid=true', async () => {
      const fakeTs = { _type: 'serverTimestamp' };
      mockedServerTimestamp.mockReturnValue(fakeTs as unknown as ReturnType<typeof firestoreMod.serverTimestamp>);

      await toggleDuesPaid('1', true);

      expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
      const callArgs = mockedUpdateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      const patch = callArgs[1];
      expect(patch).toMatchObject({ duesPaid: true });
      expect(patch.paidDate).toBe(fakeTs);
    });

    it('calls updateDoc with duesPaid:false and paidDate:null when paid=false', async () => {
      await toggleDuesPaid('1', false);

      expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
      const callArgs = mockedUpdateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      const patch = callArgs[1];
      expect(patch).toMatchObject({ duesPaid: false, paidDate: null });
    });
  });

  describe('toggleDepositPaid', () => {
    it('calls updateDoc with depositPaid:true when paid=true', async () => {
      await toggleDepositPaid('5', true);

      expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
      const callArgs = mockedUpdateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      const patch = callArgs[1];
      expect(patch).toMatchObject({ depositPaid: true });
    });
  });

  describe('createPlot', () => {
    it('calls setDoc with status:available, duesPaid:false, crops:[], depositAmount:25 when depositAmount not provided', async () => {
      await createPlot({
        id: 'testPlot',
        number: 42,
        season: '2026',
      });

      expect(mockedSetDoc).toHaveBeenCalledTimes(1);
      const callArgs = mockedSetDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      const data = callArgs[1];
      expect(data).toMatchObject({
        status: 'available',
        duesPaid: false,
        crops: [],
        depositAmount: 25,
      });
    });

    it('uses provided depositAmount when given', async () => {
      await createPlot({
        id: 'testPlot2',
        number: 5,
        depositAmount: 50,
        season: '2026',
      });

      expect(mockedSetDoc).toHaveBeenCalledTimes(1);
      const callArgs = mockedSetDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      const data = callArgs[1];
      expect(data).toMatchObject({ depositAmount: 50 });
    });

    it('defaults half to "whole" when not provided', async () => {
      await createPlot({ id: '10', number: 10, season: '2026' });

      const callArgs = mockedSetDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
      const data = callArgs[1];
      expect(data).toMatchObject({ half: 'whole' });
    });
  });
});
