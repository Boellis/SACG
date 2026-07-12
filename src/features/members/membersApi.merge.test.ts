import { vi, describe, it, expect, beforeEach } from 'vitest';

// Shared batch recorder (hoisted so the vi.mock factory can reference it).
const h = vi.hoisted(() => ({
  batchOps: [] as Array<{ op: string; path: string; data?: unknown; opts?: unknown }>,
  commit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/firestore', () => {
  const serverTimestamp = vi.fn(() => ({ _type: 'serverTimestamp' }));
  const doc = vi.fn((_db: unknown, ...args: unknown[]) => ({ _path: args.join('/') }));
  const writeBatch = vi.fn(() => ({
    update: (ref: { _path: string }, data: unknown) => h.batchOps.push({ op: 'update', path: ref._path, data }),
    set: (ref: { _path: string }, data: unknown, opts?: unknown) => h.batchOps.push({ op: 'set', path: ref._path, data, opts }),
    delete: (ref: { _path: string }) => h.batchOps.push({ op: 'delete', path: ref._path }),
    commit: h.commit,
  }));
  const onSnapshot = vi.fn(() => vi.fn());
  const updateDoc = vi.fn().mockResolvedValue(undefined);
  const getDoc = vi.fn().mockResolvedValue({ exists: () => false, data: () => undefined });
  const setDoc = vi.fn().mockResolvedValue(undefined);
  const collection = vi.fn((_db: unknown, path: unknown) => ({ _path: path }));
  return { serverTimestamp, doc, writeBatch, onSnapshot, updateDoc, getDoc, setDoc, collection };
});

vi.mock('../../lib/firebase', () => ({ db: {}, auth: {}, googleProvider: {}, app: {} }));
vi.mock('../../data/collections', () => {
  const membersCol = { _path: 'members', withConverter: () => membersCol };
  const memberDoc = (id: string) => ({ _path: `members/${id}` });
  const directoryDoc = (id: string) => ({ _path: `directory/${id}` });
  return { membersCol, memberDoc, directoryDoc };
});

import { mergeMembers } from './membersApi';
import type { MergePlan } from '../../logic/duplicates';

describe('mergeMembers', () => {
  beforeEach(() => {
    h.batchOps.length = 0;
    vi.clearAllMocks();
    h.commit.mockResolvedValue(undefined);
  });

  it('repoints plots, activates+enriches the kept record, upserts directory, deletes the stub, commits once', async () => {
    const plan: MergePlan = {
      keepId: 'new1',
      absorbId: 'old1',
      displayName: 'Jane Roe',
      phone: '555',
      plotIds: ['7', '8'],
    };
    await mergeMembers(plan);

    expect(h.batchOps).toContainEqual({ op: 'update', path: 'plots/7', data: { holderMemberId: 'new1' } });
    expect(h.batchOps).toContainEqual({ op: 'update', path: 'plots/8', data: { holderMemberId: 'new1' } });

    const keepSet = h.batchOps.find((o) => o.op === 'set' && o.path === 'members/new1');
    expect(keepSet?.data).toMatchObject({ status: 'active', displayName: 'Jane Roe', phone: '555' });
    expect(keepSet?.opts).toEqual({ merge: true });

    const dirSet = h.batchOps.find((o) => o.op === 'set' && o.path === 'directory/new1');
    expect(dirSet?.data).toMatchObject({ displayName: 'Jane Roe', uid: 'new1' });

    expect(h.batchOps).toContainEqual({ op: 'delete', path: 'members/old1' });
    expect(h.batchOps).toContainEqual({ op: 'delete', path: 'directory/old1' });

    expect(h.commit).toHaveBeenCalledTimes(1);
  });

  it('omits phone when absent and uses a server timestamp for joinedAt', async () => {
    const plan: MergePlan = { keepId: 'n', absorbId: 'o', displayName: 'No Phone', plotIds: [] };
    await mergeMembers(plan);

    const keepSet = h.batchOps.find((o) => o.op === 'set' && o.path === 'members/n');
    expect(keepSet?.data).not.toHaveProperty('phone');
    expect((keepSet?.data as Record<string, unknown>).joinedAt).toEqual({ _type: 'serverTimestamp' });
    // no plots to repoint
    expect(h.batchOps.some((o) => o.op === 'update')).toBe(false);
  });
});
