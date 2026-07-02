import {
  onSnapshot,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { announcementsCol, announcementDoc } from '../../data/collections';
import type { Announcement } from '../../lib/types';

export function listenAnnouncements(cb: (a: Announcement[]) => void): Unsubscribe {
  return onSnapshot(query(announcementsCol, orderBy('createdAt', 'desc')), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, 'id'>) })));
  });
}

export interface NewAnnouncement {
  title: string;
  body: string;
  linkUrl?: string;
  linkLabel?: string;
  pinned?: boolean;
  expiresAt?: Date | null; // null/undefined = lives indefinitely
  createdBy: string;
  authorName?: string;
}

export async function createAnnouncement(a: NewAnnouncement): Promise<void> {
  await addDoc(announcementsCol, {
    title: a.title,
    body: a.body,
    ...(a.linkUrl ? { linkUrl: a.linkUrl, linkLabel: a.linkLabel || 'Open link' } : {}),
    pinned: !!a.pinned,
    expiresAt: a.expiresAt ? Timestamp.fromDate(a.expiresAt) : null,
    createdBy: a.createdBy,
    authorName: a.authorName ?? '',
    createdAt: serverTimestamp(),
  });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await deleteDoc(announcementDoc(id));
}

/** Non-expired announcements, pinned first then newest. Temporary posts (with an
 *  expiresAt in the past) are hidden; indefinite posts (no expiresAt) always show. */
export function visibleAnnouncements(all: Announcement[], nowMs: number): Announcement[] {
  return all
    .filter((a) => !a.expiresAt || a.expiresAt.toMillis() > nowMs)
    .sort(
      (a, b) =>
        Number(!!b.pinned) - Number(!!a.pinned) ||
        (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
    );
}
