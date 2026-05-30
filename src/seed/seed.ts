/**
 * Emulator seed script — run via:
 *   firebase emulators:exec --only auth,firestore "npm run seed"
 *
 * Uses the Firebase client SDK for Auth (to create real auth users) and
 * @firebase/rules-unit-testing's withSecurityRulesDisabled for Firestore
 * writes (bypasses security rules via compat API).
 * Does NOT import src/lib/firebase.ts (which uses import.meta.env.VITE_*).
 */

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

// Timestamp is accessed via the compat namespace
const Timestamp = firebase.firestore.Timestamp;

// ── Client SDK (Auth — creates real auth users) ───────────────────────────────
import { initializeApp as initClientApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';

const clientApp = initClientApp({
  projectId: 'sacg-local',
  // Auth SDK requires a non-empty apiKey even when targeting the emulator.
  apiKey: 'fake-api-key-for-emulator',
});
const auth = getAuth(clientApp);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
async function getOrCreateUser(email: string, password: string): Promise<string> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user.uid;
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      return cred.user.uid;
    }
    throw err;
  }
}

type FS = firebase.firestore.Firestore;

async function setDocument(db: FS, path: string, id: string, data: Record<string, unknown>) {
  await db.collection(path).doc(id).set(data);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱  Seeding emulators…');

  // ── Auth users ────────────────────────────────────────────────────────────
  const users = [
    { email: 'admin@sacg.test',     password: 'password' },
    { email: 'treasurer@sacg.test', password: 'password' },
    { email: 'rosa@sacg.test',      password: 'password' },
    { email: 'sam@sacg.test',       password: 'password' },
    { email: 'pat@sacg.test',       password: 'password' },
    { email: 'quinn@sacg.test',     password: 'password' },
  ] as const;

  const uids: Record<string, string> = {};
  for (const u of users) {
    uids[u.email] = await getOrCreateUser(u.email, u.password);
    console.log(`  auth: ${u.email} → ${uids[u.email]}`);
  }

  // ── Firestore writes via security-rules-bypassed context ──────────────────
  const rulesPath = resolve(__dirname, '../../firestore.rules');
  const testEnv = await initializeTestEnvironment({
    projectId: 'sacg-local',
    firestore: {
      rules: readFileSync(rulesPath, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as FS;

    // ── Member docs ────────────────────────────────────────────────────────
    const members: Record<string, Record<string, unknown>> = {
      [uids['admin@sacg.test']]: {
        uid: uids['admin@sacg.test'],
        email: 'admin@sacg.test',
        displayName: 'Ada Admin',
        role: 'admin',
        status: 'active',
        createdAt: Timestamp.fromDate(new Date('2024-03-01T08:00:00Z')),
        joinedAt: Timestamp.fromDate(new Date('2024-03-15T08:00:00Z')),
        currentYearHours: 8,
      },
      [uids['treasurer@sacg.test']]: {
        uid: uids['treasurer@sacg.test'],
        email: 'treasurer@sacg.test',
        displayName: 'Theo Treasurer',
        role: 'admin',
        status: 'active',
        createdAt: Timestamp.fromDate(new Date('2024-03-01T08:30:00Z')),
        joinedAt: Timestamp.fromDate(new Date('2024-03-15T08:30:00Z')),
        currentYearHours: 12,
      },
      [uids['rosa@sacg.test']]: {
        uid: uids['rosa@sacg.test'],
        email: 'rosa@sacg.test',
        displayName: 'Rosa Reyes',
        role: 'member',
        status: 'active',
        createdAt: Timestamp.fromDate(new Date('2024-04-01T09:00:00Z')),
        joinedAt: Timestamp.fromDate(new Date('2024-04-15T09:00:00Z')),
        currentYearHours: 4,
      },
      [uids['sam@sacg.test']]: {
        uid: uids['sam@sacg.test'],
        email: 'sam@sacg.test',
        displayName: 'Sam Stone',
        role: 'member',
        status: 'active',
        createdAt: Timestamp.fromDate(new Date('2024-05-01T09:00:00Z')),
        joinedAt: Timestamp.fromDate(new Date('2024-05-15T09:00:00Z')),
        currentYearHours: 0,
      },
      // Pat submitted before Quinn (earlier createdAt = higher waitlist priority)
      [uids['pat@sacg.test']]: {
        uid: uids['pat@sacg.test'],
        email: 'pat@sacg.test',
        displayName: 'Pat Pending',
        role: 'member',
        status: 'pending',
        createdAt: Timestamp.fromDate(new Date('2025-11-10T10:00:00Z')),
        currentYearHours: 0,
      },
      [uids['quinn@sacg.test']]: {
        uid: uids['quinn@sacg.test'],
        email: 'quinn@sacg.test',
        displayName: 'Quinn Queue',
        role: 'member',
        status: 'pending',
        createdAt: Timestamp.fromDate(new Date('2025-12-01T10:00:00Z')),
        currentYearHours: 0,
      },
    };

    for (const [uid, data] of Object.entries(members)) {
      await setDocument(db, 'members', uid, data);
    }
    console.log(`  wrote ${Object.keys(members).length} member docs`);

    // ── org settings ───────────────────────────────────────────────────────
    await setDocument(db, 'settings', 'org', {
      requiredHours: 12,
      firstHalfHours: 6,
      firstHalfMonths: 6,
      defaultDeposit: 25,
      currentSeason: '2026',
      contactEmail: 'southatxgarden@gmail.com',
    });
    console.log('  wrote settings/org');

    // ── Plots ──────────────────────────────────────────────────────────────
    const rosaUid = uids['rosa@sacg.test'];
    const samUid  = uids['sam@sacg.test'];

    const plots: Record<string, Record<string, unknown>> = {
      '1': {
        number: 1,
        half: 'whole',
        status: 'assigned',
        holderMemberId: rosaUid,
        holderName: 'Rosa Reyes',
        duesAmount: 45,
        depositAmount: 25,
        duesPaid: true,
        depositPaid: true,
        paidDate: Timestamp.fromDate(new Date('2026-03-01T00:00:00Z')),
        season: '2026',
        crops: [{ name: 'Tomatoes' }, { name: 'Basil' }],
        mapPos: { row: 0, col: 0 },
      },
      '2': {
        number: 2,
        half: 'whole',
        status: 'available',
        duesAmount: 30,
        depositAmount: 25,
        duesPaid: false,
        depositPaid: false,
        season: '2026',
        crops: [],
        mapPos: { row: 0, col: 1 },
      },
      '3': {
        number: 3,
        half: 'whole',
        status: 'available',
        duesAmount: 24,
        depositAmount: 25,
        duesPaid: false,
        depositPaid: false,
        season: '2026',
        crops: [],
        mapPos: { row: 0, col: 2 },
      },
      '4': {
        number: 4,
        half: 'whole',
        status: 'available',
        duesAmount: 60,
        depositAmount: 25,
        duesPaid: false,
        depositPaid: false,
        season: '2026',
        crops: [],
        mapPos: { row: 1, col: 0 },
      },
      '5': {
        number: 5,
        half: 'whole',
        status: 'available',
        duesAmount: 18,
        depositAmount: 25,
        duesPaid: true,
        depositPaid: true,
        paidDate: Timestamp.fromDate(new Date('2026-02-15T00:00:00Z')),
        season: '2026',
        crops: [],
        mapPos: { row: 1, col: 1 },
      },
      '6': {
        number: 6,
        half: 'whole',
        status: 'available',
        duesAmount: 30,
        depositAmount: 25,
        duesPaid: false,
        depositPaid: false,
        season: '2026',
        crops: [],
        mapPos: { row: 1, col: 2 },
      },
      // Split pair — demonstrates half-plot UI
      '7A': {
        number: 7,
        half: 'A',
        status: 'assigned',
        holderMemberId: samUid,
        holderName: 'Sam Stone',
        duesAmount: 24,
        depositAmount: 25,
        duesPaid: false,
        depositPaid: true,
        season: '2026',
        crops: [],
        mapPos: { row: 2, col: 0 },
      },
      '7B': {
        number: 7,
        half: 'B',
        status: 'available',
        duesAmount: 24,
        depositAmount: 25,
        duesPaid: false,
        depositPaid: false,
        season: '2026',
        crops: [],
        mapPos: { row: 2, col: 1 },
      },
    };

    for (const [id, data] of Object.entries(plots)) {
      await setDocument(db, 'plots', id, data);
    }
    console.log(`  wrote ${Object.keys(plots).length} plot docs`);
  });

  await testEnv.cleanup();

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n✅  Seed complete!');
  console.log('\nLocal login credentials (emulator only):');
  console.log('  admin@sacg.test       / password  (admin)');
  console.log('  treasurer@sacg.test   / password  (admin)');
  console.log('  rosa@sacg.test        / password  (member, active, plot 1)');
  console.log('  sam@sacg.test         / password  (member, active, plot 7A)');
  console.log('  pat@sacg.test         / password  (member, pending — waitlist #1)');
  console.log('  quinn@sacg.test       / password  (member, pending — waitlist #2)');
  console.log('\nProject ID: sacg-local  |  Auth: 9099  |  Firestore: 8080');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
