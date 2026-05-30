import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => {
  const onSnapshot = vi.fn(() => vi.fn());
  const setDoc = vi.fn().mockResolvedValue(undefined);
  const doc = vi.fn((_db: unknown, ...args: unknown[]) => ({ _path: args.join('/') }));
  const collection = vi.fn((_db: unknown, path: unknown) => ({ _path: path }));
  return { onSnapshot, setDoc, doc, collection };
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
  const settingsDocRef = { _path: 'settings/org' };
  return { settingsDoc: vi.fn(() => settingsDocRef) };
});

import * as firestoreMod from 'firebase/firestore';
import { saveSettings, listenSettings } from './settingsApi';

const mockedSetDoc = vi.mocked(firestoreMod.setDoc);
const mockedOnSnapshot = vi.mocked(firestoreMod.onSnapshot);

describe('settingsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveSettings', () => {
    it('calls setDoc with the patch and { merge: true }', async () => {
      await saveSettings({ requiredHours: 15 });

      expect(mockedSetDoc).toHaveBeenCalledTimes(1);
      const [_ref, data, options] = mockedSetDoc.mock.calls[0] as unknown as [
        unknown,
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(data).toEqual({ requiredHours: 15 });
      expect(options).toEqual({ merge: true });
    });

    it('calls setDoc with settingsDoc ref', async () => {
      await saveSettings({ currentSeason: '2027' });

      const [ref] = mockedSetDoc.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(ref._path).toBe('settings/org');
    });
  });

  describe('listenSettings', () => {
    it('calls onSnapshot with settingsDoc ref', () => {
      const cb = vi.fn();
      listenSettings(cb);

      expect(mockedOnSnapshot).toHaveBeenCalledTimes(1);
      const [ref] = mockedOnSnapshot.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(ref._path).toBe('settings/org');
    });

    it('invokes callback with null when doc does not exist', () => {
      const cb = vi.fn();
      mockedOnSnapshot.mockImplementation((_ref, handler) => {
        (handler as (snap: { exists: () => boolean }) => void)({ exists: () => false });
        return vi.fn();
      });

      listenSettings(cb);
      expect(cb).toHaveBeenCalledWith(null);
    });

    it('invokes callback with OrgSettings data when doc exists', () => {
      const fixture = {
        requiredHours: 12,
        firstHalfHours: 6,
        firstHalfMonths: 6,
        defaultDeposit: 25,
        currentSeason: '2026',
        contactEmail: 'test@example.com',
      };

      const cb = vi.fn();
      mockedOnSnapshot.mockImplementation((_ref, handler) => {
        (handler as (snap: { exists: () => boolean; data: () => unknown }) => void)({
          exists: () => true,
          data: () => fixture,
        });
        return vi.fn();
      });

      listenSettings(cb);
      expect(cb).toHaveBeenCalledWith(fixture);
    });
  });
});
