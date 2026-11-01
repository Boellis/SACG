// Test-only helpers for the Firestore emulator. Never imported by index.ts, and
// excluded from the `lib` build (see tsconfig.json).
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export const TEST_PROJECT_ID = 'demo-sacg';
const DEFAULT_EMULATOR_HOST = '127.0.0.1:8080';

// `firebase emulators:exec` sets this; default it so a stray `vitest run` can
// only ever reach a local emulator, never a real project.
process.env.FIRESTORE_EMULATOR_HOST ??= DEFAULT_EMULATOR_HOST;

/** The default admin app's Firestore, pointed at the emulator's demo project.
 *  It is the *default* app so code that calls `getFirestore()` (the callable
 *  wrappers) talks to the same emulator database as the test. */
export function testDb(): Firestore {
  if (getApps().length === 0) initializeApp({ projectId: TEST_PROJECT_ID });
  return getFirestore();
}

/** Delete every document in the emulator's demo-sacg database. */
export async function clearFirestore(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? DEFAULT_EMULATOR_HOST;
  const url = `http://${host}/emulator/v1/projects/${TEST_PROJECT_ID}/databases/(default)/documents`;
  const res = await fetch(url, { method: 'DELETE' });
  if (!res.ok) throw new Error(`clearFirestore failed: HTTP ${res.status}`);
}
