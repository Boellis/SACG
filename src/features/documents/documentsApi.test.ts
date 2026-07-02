import { describe, it, expect, vi } from 'vitest';

// Stub firestore, storage, the firebase init, and the collections module so that
// importing documentsApi never touches a real backend.
vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { fromDate: (d: Date) => ({ _d: d }) },
}));
vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock('../../lib/firebase', () => ({ storage: {} }));
vi.mock('../../data/collections', () => ({ documentsCol: {}, documentDoc: () => ({}) }));

import { visibleDocuments } from './documentsApi';

const ts = (ms: number) =>
  ({ toMillis: () => ms, toDate: () => new Date(ms) }) as unknown as import('../../lib/types').Document['createdAt'];

describe('visibleDocuments', () => {
  const now = 1000;
  const items = [
    { id: 'a', title: 'Bylaws', fileName: 'bylaws.pdf', createdAt: ts(10) }, // indefinite
    { id: 'b', title: 'Old flyer', fileName: 'old.pdf', createdAt: ts(20), expiresAt: ts(500) }, // expired
    { id: 'c', title: 'Newsletter', fileName: 'news.pdf', createdAt: ts(30), expiresAt: ts(2000) }, // active temp
    { id: 'd', title: 'Newest', fileName: 'new.pdf', createdAt: ts(40) }, // indefinite, newest
  ] as unknown as import('../../lib/types').Document[];

  it('hides expired documents but keeps active temporary and indefinite ones', () => {
    const ids = visibleDocuments(items, now).map((d) => d.id);
    expect(ids).not.toContain('b'); // past its expiresAt
    expect(ids).toContain('a'); // no expiresAt
    expect(ids).toContain('c'); // expiresAt still in the future
  });

  it('keeps documents with no expiresAt indefinitely once temporary ones lapse', () => {
    const ids = visibleDocuments(items, 1_000_000).map((d) => d.id);
    expect(ids).toEqual(['d', 'a']); // both temp docs now expired; indefinite ones remain
  });

  it('sorts newest first by createdAt', () => {
    const ids = visibleDocuments(items, now).map((d) => d.id);
    expect(ids).toEqual(['d', 'c', 'a']);
  });
});
