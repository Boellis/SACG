import { describe, it, expect, vi } from 'vitest';

// Stub firestore + collections so importing the module doesn't touch a backend.
vi.mock('firebase/firestore', () => ({
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { fromDate: (d: Date) => ({ _d: d }) },
}));
vi.mock('../../data/collections', () => ({ announcementsCol: {}, announcementDoc: () => ({}) }));

import { visibleAnnouncements } from './announcementsApi';

const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as import('../../lib/types').Announcement['createdAt'];

describe('visibleAnnouncements', () => {
  const now = 1000;
  const items = [
    { id: 'a', title: 'a', body: '', createdAt: ts(10) },
    { id: 'b', title: 'b', body: '', createdAt: ts(20), expiresAt: ts(500) }, // expired
    { id: 'c', title: 'c', body: '', createdAt: ts(30), expiresAt: ts(2000) }, // active temp
    { id: 'd', title: 'd', body: '', createdAt: ts(5), pinned: true }, // pinned
  ] as unknown as import('../../lib/types').Announcement[];

  it('hides expired posts, keeps indefinite ones', () => {
    const ids = visibleAnnouncements(items, now).map((a) => a.id);
    expect(ids).not.toContain('b');
    expect(ids).toContain('a');
  });

  it('orders pinned first, then newest by createdAt', () => {
    const ids = visibleAnnouncements(items, now).map((a) => a.id);
    expect(ids).toEqual(['d', 'c', 'a']);
  });
});
