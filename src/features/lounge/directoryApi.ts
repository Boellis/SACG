import { onSnapshot, query, orderBy, type Unsubscribe } from 'firebase/firestore';
import { directoryCol } from '../../data/collections';
import type { DirectoryEntry } from '../../lib/types';

/** Live list of public member directory entries (name + join date), A→Z. */
export function listenDirectory(cb: (entries: DirectoryEntry[]) => void): Unsubscribe {
  return onSnapshot(query(directoryCol, orderBy('displayName')), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DirectoryEntry, 'id'>) })));
  });
}
