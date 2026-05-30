import { onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore';
import { settingsDoc } from '../../data/collections';
import type { OrgSettings } from '../../lib/types';

export function listenSettings(cb: (s: OrgSettings | null) => void): Unsubscribe {
  return onSnapshot(settingsDoc(), (snap) =>
    cb(snap.exists() ? (snap.data() as OrgSettings) : null),
  );
}

export async function saveSettings(patch: Partial<OrgSettings>): Promise<void> {
  await setDoc(settingsDoc(), patch, { merge: true });
}
