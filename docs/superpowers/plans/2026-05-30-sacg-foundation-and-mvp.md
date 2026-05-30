# SACG Foundation + MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable React/Vite + Firebase web app for SACG covering auth + onboarding, members + waitlist, plots (map, assignment, A/B splits, crops), and dues tracking.

**Architecture:** Lean client-side SPA (Approach A). React/Vite/TypeScript/Tailwind talks directly to Cloud Firestore, gated by Security Rules enforcing the admin/member/pending role matrix. No Cloud Functions in the MVP — role checks use Firestore `get()` in rules. Firebase Hosting serves the build. (Email extension + functions arrive in Phase 2.)

**Tech Stack:** React 18, Vite, TypeScript, Tailwind CSS, react-router-dom v6, Firebase JS SDK v10 (Auth + Firestore), Vitest + React Testing Library, `@firebase/rules-unit-testing`, Firebase emulators.

**Convention for this plan:** Pure logic, types, Firebase config, and Security Rules are given as complete code (they're precision-critical and the TDD core). UI components are specified by file, responsibility, props, key behaviors, and the tests that must pass — implementation follows the shared types in Task 3 and the patterns established in earlier tasks. Commit after every task.

---

## File Structure

```
/ (repo root)
  package.json, vite.config.ts, tsconfig.json, tailwind.config.js, postcss.config.js, index.html
  firebase.json, .firebaserc, firestore.rules, firestore.indexes.json
  .env.example                      # Firebase web config keys (committed, no secrets)
  src/
    main.tsx                        # entry, mounts <App/>
    App.tsx                         # providers + router
    index.css                       # tailwind directives
    lib/
      firebase.ts                   # init app/auth/db + emulator wiring
      types.ts                      # all shared domain types + enums
    data/
      collections.ts                # typed collection refs + Firestore converters
    logic/                          # PURE functions (TDD)
      dues.ts        dues.test.ts
      hours.ts       hours.test.ts
      waitlist.ts    waitlist.test.ts
      plots.ts       plots.test.ts
      emailAudience.ts  emailAudience.test.ts
    auth/
      AuthProvider.tsx  useAuth.ts  guards.tsx
      SignIn.tsx  SignUp.tsx  PendingApproval.tsx
    components/
      Layout.tsx                    # role-aware nav shell
      ui.tsx                        # Button, Card, Badge, Modal, Field, Table primitives
    features/
      dashboard/Dashboard.tsx
      members/ membersApi.ts  MembersPage.tsx  WaitlistPage.tsx  MemberDetail.tsx
      plots/   plotsApi.ts  PlotsPage.tsx  PlotMap.tsx  PlotDetail.tsx  AssignPlotModal.tsx  CropsEditor.tsx
      dues/    DuesPage.tsx
    seed/seed.ts                    # emulator seed data
  test/
    rules/firestore.rules.test.ts   # security-rules tests against emulator
    setup.ts                        # RTL/vitest setup
```

---

## Task 1: Scaffold project (Vite + React + TS + Tailwind)

**Files:** Create `package.json`, `vite.config.ts`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`.

- [ ] **Step 1: Scaffold and install**

Run (PowerShell, from repo root — scaffold into current dir):
```
npm create vite@latest . -- --template react-ts
npm install
npm install react-router-dom firebase
npm install -D tailwindcss@3 postcss autoprefixer vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @firebase/rules-unit-testing
npx tailwindcss init -p
```
If `npm create vite` refuses because the dir is non-empty, scaffold in a temp subdir and move files, or use `npm create vite@latest sacg-temp -- --template react-ts` then move contents up. Keep `docs/`, `.git/`, `.gitignore`.

- [ ] **Step 2: Configure Tailwind** — set `tailwind.config.js` `content: ["./index.html","./src/**/*.{ts,tsx}"]`; replace `src/index.css` with:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Add scripts to package.json**
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "emulators": "firebase emulators:start --only auth,firestore,hosting",
  "seed": "node --import tsx src/seed/seed.ts"
}
```
(Add `tsx` as a dev dependency: `npm i -D tsx`.)

- [ ] **Step 4: Configure Vitest** — in `vite.config.ts` add:
```ts
/// <reference types="vitest" />
test: { environment: 'jsdom', setupFiles: ['./test/setup.ts'], globals: true }
```
Create `test/setup.ts` with `import '@testing-library/jest-dom';`.

- [ ] **Step 5: Smoke test** — minimal `src/App.tsx` returning `<div>SACG</div>`. Run `npm run build`. Expected: build succeeds.

- [ ] **Step 6: Commit**
```
git add -A
git commit -m "chore: scaffold Vite React TS + Tailwind + Vitest"
```

---

## Task 2: Firebase config + client init

**Files:** Create `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `.env.example`, `src/lib/firebase.ts`.

- [ ] **Step 1: `firebase.json`**
```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "hosting": { "port": 5000 },
    "ui": { "enabled": true }
  }
}
```

- [ ] **Step 2: `.firebaserc`** (placeholder project id — user sets real one at deploy)
```json
{ "projects": { "default": "REPLACE_WITH_FIREBASE_PROJECT_ID" } }
```

- [ ] **Step 3: `firestore.indexes.json`**
```json
{ "indexes": [
  { "collectionGroup": "members", "queryScope": "COLLECTION", "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "ASCENDING" } ] },
  { "collectionGroup": "volunteerHours", "queryScope": "COLLECTION", "fields": [
    { "fieldPath": "memberId", "order": "ASCENDING" },
    { "fieldPath": "date", "order": "ASCENDING" } ] }
], "fieldOverrides": [] }
```

- [ ] **Step 4: `firestore.rules`** — start locked, opened up in Task 13:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }
  }
}
```

- [ ] **Step 5: `.env.example`**
```
VITE_FB_API_KEY=
VITE_FB_AUTH_DOMAIN=
VITE_FB_PROJECT_ID=
VITE_FB_STORAGE_BUCKET=
VITE_FB_MESSAGING_SENDER_ID=
VITE_FB_APP_ID=
VITE_USE_EMULATORS=true
```

- [ ] **Step 6: `src/lib/firebase.ts`**
```ts
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
}
```

- [ ] **Step 7: Commit** `git add -A && git commit -m "chore: firebase config + client init with emulator wiring"`

---

## Task 3: Shared domain types

**Files:** Create `src/lib/types.ts`.

- [ ] **Step 1: Write the types** (single source of truth for all later tasks)
```ts
import { Timestamp } from 'firebase/firestore';

export type Role = 'admin' | 'member';
export type MemberStatus = 'pending' | 'active' | 'inactive';
export type PlotHalf = 'whole' | 'A' | 'B';
export type PlotStatus = 'available' | 'assigned' | 'reserved' | 'inactive';
export type EventType = 'workday' | 'meeting' | 'other';
export type RsvpStatus = 'yes' | 'no' | 'maybe';

export interface Member {
  id: string;            // = auth uid (or auto-id for manual prospects)
  uid: string | null;
  email: string;
  displayName: string;
  phone?: string;
  role: Role;
  status: MemberStatus;
  joinedAt?: Timestamp;
  createdAt: Timestamp;
  currentYearHours: number;
  notes?: string;
}

export interface Crop { name: string; plantedOn?: Timestamp; notes?: string; }

export interface Plot {
  id: string;            // "12" | "12A" | "12B"
  number: number;
  half: PlotHalf;
  size?: string;
  status: PlotStatus;
  holderMemberId?: string;
  holderName?: string;
  duesAmount: number;
  depositAmount: number;
  duesPaid: boolean;
  depositPaid: boolean;
  paidDate?: Timestamp;
  season: string;
  crops: Crop[];
  mapPos?: { row: number; col: number };
  notes?: string;
}

export interface GardenEvent {
  id: string;
  title: string;
  type: EventType;
  start: Timestamp;
  end: Timestamp;
  allDay: boolean;
  location?: string;
  description?: string;
  createdBy: string;
}

export interface Rsvp { id: string; status: RsvpStatus; displayName: string; respondedAt: Timestamp; }

export interface VolunteerHour {
  id: string;
  memberId: string;
  date: Timestamp;
  hours: number;
  eventId?: string;
  description?: string;
  recordedBy: string;
  createdAt: Timestamp;
}

export interface OrgSettings {
  requiredHours: number;     // 12
  firstHalfHours: number;    // 6
  firstHalfMonths: number;   // 6
  defaultDeposit: number;    // 25
  currentSeason: string;     // "2026"
  duesBySize?: Record<string, number>;
  contactEmail: string;
}
```

- [ ] **Step 2: Verify it compiles** — `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3: Commit** `git add -A && git commit -m "feat: shared domain types"`

---

## Task 4: Typed Firestore collections + converters

**Files:** Create `src/data/collections.ts`.

- [ ] **Step 1:** Implement typed refs using `withConverter` for `members`, `plots`, `events`, `volunteerHours`, and helpers `rsvpsCol(eventId)`, `settingsDoc()`. Each converter maps Firestore data ↔ the Task 3 interfaces (spreading `id` from `snapshot.id`). Example pattern:
```ts
import { collection, doc, getFirestore, QueryDocumentSnapshot, FirestoreDataConverter } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Member, Plot, GardenEvent, VolunteerHour, OrgSettings, Rsvp } from '../lib/types';

const conv = <T extends { id: string }>(): FirestoreDataConverter<T> => ({
  toFirestore: ({ id, ...rest }: T) => rest as any,
  fromFirestore: (snap: QueryDocumentSnapshot) => ({ id: snap.id, ...snap.data() } as T),
});

export const membersCol = collection(db, 'members').withConverter(conv<Member>());
export const plotsCol   = collection(db, 'plots').withConverter(conv<Plot>());
export const eventsCol  = collection(db, 'events').withConverter(conv<GardenEvent>());
export const hoursCol   = collection(db, 'volunteerHours').withConverter(conv<VolunteerHour>());
export const rsvpsCol = (eventId: string) => collection(db, 'events', eventId, 'rsvps').withConverter(conv<Rsvp>());
export const memberDoc = (id: string) => doc(db, 'members', id).withConverter(conv<Member>());
export const plotDoc   = (id: string) => doc(db, 'plots', id).withConverter(conv<Plot>());
export const settingsDoc = () => doc(db, 'settings', 'org');
```

- [ ] **Step 2:** `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3: Commit** `git add -A && git commit -m "feat: typed Firestore collections + converters"`

---

## Task 5: Pure logic + unit tests (TDD)

**Files:** Create `src/logic/{dues,hours,waitlist,plots,emailAudience}.ts` and matching `.test.ts`. **Write each test first, watch it fail, implement, watch it pass, commit.**

- [ ] **Step 1 (dues): failing test** `src/logic/dues.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { computeDuesRollup } from './dues';
const p = (o: Partial<any>) => ({ status:'assigned', duesAmount:30, duesPaid:false, ...o });
describe('computeDuesRollup', () => {
  it('sums expected/collected/outstanding over assigned plots only', () => {
    const r = computeDuesRollup([
      p({ duesAmount:30, duesPaid:true }),
      p({ duesAmount:20, duesPaid:false }),
      p({ status:'available', duesAmount:50, duesPaid:false }),
    ] as any);
    expect(r.expected).toBe(50);
    expect(r.collected).toBe(30);
    expect(r.outstanding).toBe(20);
    expect(r.unpaid).toHaveLength(1);
  });
});
```
- [ ] **Step 2:** Run `npx vitest run src/logic/dues.test.ts` → FAIL (no module).
- [ ] **Step 3:** Implement `src/logic/dues.ts`
```ts
import type { Plot } from '../lib/types';
export function computeDuesRollup(plots: Plot[]) {
  const assigned = plots.filter(p => p.status === 'assigned');
  const expected = assigned.reduce((s,p)=>s+(p.duesAmount||0),0);
  const collected = assigned.filter(p=>p.duesPaid).reduce((s,p)=>s+(p.duesAmount||0),0);
  const unpaid = assigned.filter(p=>!p.duesPaid);
  return { expected, collected, outstanding: expected-collected, unpaid };
}
```
- [ ] **Step 4:** Run test → PASS.

- [ ] **Step 5 (hours): failing test** `src/logic/hours.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { yearToDateHours, firstSixMonthsHours, hoursProgress } from './hours';
const ts = (iso: string) => Timestamp.fromDate(new Date(iso));
const h = (date: string, hours: number) => ({ date: ts(date), hours } as any);
describe('hours logic', () => {
  it('yearToDateHours sums only that year', () => {
    expect(yearToDateHours([h('2026-01-01',3), h('2026-06-01',4), h('2025-12-31',9)], 2026)).toBe(7);
  });
  it('firstSixMonthsHours counts within 6 months of join', () => {
    const joined = ts('2026-01-15');
    expect(firstSixMonthsHours([h('2026-02-01',4), h('2026-08-01',5)], joined)).toBe(4);
  });
  it('hoursProgress reports met flags', () => {
    const settings = { requiredHours:12, firstHalfHours:6, firstHalfMonths:6 } as any;
    const r = hoursProgress({ joinedAt: ts('2026-01-01') } as any,
      [h('2026-02-01',6), h('2026-03-01',6)], settings, new Date('2026-04-01'));
    expect(r.ytd).toBe(12); expect(r.metAnnual).toBe(true); expect(r.metFirstHalf).toBe(true);
  });
});
```
- [ ] **Step 6:** Run → FAIL. **Step 7:** Implement `src/logic/hours.ts`
```ts
import type { VolunteerHour, Member, OrgSettings } from '../lib/types';
const yr = (t:any)=> t.toDate().getFullYear();
export function yearToDateHours(entries: VolunteerHour[], year: number) {
  return entries.filter(e=>yr(e.date)===year).reduce((s,e)=>s+e.hours,0);
}
export function firstSixMonthsHours(entries: VolunteerHour[], joinedAt: any) {
  const start = joinedAt.toDate(); const end = new Date(start); end.setMonth(end.getMonth()+6);
  return entries.filter(e=>{ const d=e.date.toDate(); return d>=start && d<end; }).reduce((s,e)=>s+e.hours,0);
}
export function hoursProgress(member: Member, entries: VolunteerHour[], settings: OrgSettings, now: Date) {
  const ytd = yearToDateHours(entries, now.getFullYear());
  const firstHalf = member.joinedAt ? firstSixMonthsHours(entries, member.joinedAt) : 0;
  return {
    ytd, required: settings.requiredHours,
    firstHalf, firstHalfRequired: settings.firstHalfHours,
    metAnnual: ytd >= settings.requiredHours,
    metFirstHalf: firstHalf >= settings.firstHalfHours,
  };
}
```
- [ ] **Step 8:** Run → PASS.

- [ ] **Step 9 (waitlist): test** `src/logic/waitlist.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { waitlistOrder } from './waitlist';
const m = (id:string, status:string, t:string) => ({ id, status, createdAt: Timestamp.fromDate(new Date(t)) } as any);
describe('waitlistOrder', () => {
  it('returns pending members oldest-first', () => {
    const r = waitlistOrder([ m('a','pending','2026-03-01'), m('b','active','2026-01-01'), m('c','pending','2026-01-15') ]);
    expect(r.map(x=>x.id)).toEqual(['c','a']);
  });
});
```
- [ ] **Step 10:** FAIL → implement `src/logic/waitlist.ts`
```ts
import type { Member } from '../lib/types';
export function waitlistOrder(members: Member[]) {
  return members.filter(m=>m.status==='pending')
    .sort((a,b)=>a.createdAt.toMillis()-b.createdAt.toMillis());
}
```
- [ ] **Step 11:** PASS.

- [ ] **Step 12 (plots): test** `src/logic/plots.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { groupByNumber, splitPlotIds, isAvailable } from './plots';
describe('plots logic', () => {
  it('splitPlotIds builds A/B ids', () => {
    expect(splitPlotIds(12)).toEqual({ a:'12A', b:'12B' });
  });
  it('isAvailable true only when available', () => {
    expect(isAvailable({ status:'available' } as any)).toBe(true);
    expect(isAvailable({ status:'assigned' } as any)).toBe(false);
  });
  it('groupByNumber groups halves under their number', () => {
    const g = groupByNumber([{ number:12, half:'A' }, { number:12, half:'B' }, { number:5, half:'whole' }] as any);
    expect(g.get(12)).toHaveLength(2);
    expect(g.get(5)).toHaveLength(1);
  });
});
```
- [ ] **Step 13:** FAIL → implement `src/logic/plots.ts`
```ts
import type { Plot } from '../lib/types';
export const splitPlotIds = (n: number) => ({ a: `${n}A`, b: `${n}B` });
export const isAvailable = (p: Plot) => p.status === 'available';
export function groupByNumber(plots: Plot[]) {
  const m = new Map<number, Plot[]>();
  for (const p of plots) { const a = m.get(p.number) ?? []; a.push(p); m.set(p.number, a); }
  return m;
}
```
- [ ] **Step 14:** PASS.

- [ ] **Step 15 (emailAudience): test** `src/logic/emailAudience.test.ts`
```ts
import { describe, it, expect } from 'vitest';
import { activeMemberEmails, customEmails, dedupeEmails } from './emailAudience';
const m = (id:string, email:string, status:string) => ({ id, email, status } as any);
describe('email audience', () => {
  const members = [ m('1','a@x.com','active'), m('2','b@x.com','pending'), m('3','c@x.com','active') ];
  it('activeMemberEmails returns only active', () => {
    expect(activeMemberEmails(members)).toEqual(['a@x.com','c@x.com']);
  });
  it('customEmails maps selected ids', () => {
    expect(customEmails(members, ['3','1'])).toEqual(['c@x.com','a@x.com']);
  });
  it('dedupeEmails removes duplicates case-insensitively', () => {
    expect(dedupeEmails(['A@x.com','a@x.com','b@x.com'])).toEqual(['A@x.com','b@x.com']);
  });
});
```
- [ ] **Step 16:** FAIL → implement `src/logic/emailAudience.ts`
```ts
import type { Member } from '../lib/types';
export const activeMemberEmails = (ms: Member[]) => ms.filter(m=>m.status==='active').map(m=>m.email);
export const customEmails = (ms: Member[], ids: string[]) =>
  ids.map(id=>ms.find(m=>m.id===id)?.email).filter((e): e is string => !!e);
export function dedupeEmails(emails: string[]) {
  const seen = new Set<string>(); const out: string[] = [];
  for (const e of emails) { const k=e.toLowerCase(); if(!seen.has(k)){ seen.add(k); out.push(e);} }
  return out;
}
```
- [ ] **Step 17:** Run full `npx vitest run` → all PASS.
- [ ] **Step 18: Commit** `git add -A && git commit -m "feat: pure logic (dues, hours, waitlist, plots, email audience) with tests"`

---

## Task 6: Auth provider, guards, sign-in/up, pending screen

**Files:** Create `src/auth/AuthProvider.tsx`, `src/auth/useAuth.ts`, `src/auth/guards.tsx`, `src/auth/SignIn.tsx`, `src/auth/SignUp.tsx`, `src/auth/PendingApproval.tsx`.

- [ ] **Step 1: AuthProvider** — subscribes to `onAuthStateChanged`; when signed in, subscribes (`onSnapshot`) to `memberDoc(uid)`. Exposes `{ user, member, role, status, loading }`. **On first sign-up only**, creates the member doc: `{ uid, email, displayName, role:'member', status:'pending', createdAt: serverTimestamp(), currentYearHours: 0 }` (use `setDoc(..., { merge:true })` guarded by an existence check so login doesn't overwrite). `useAuth()` reads the context (throws if used outside provider).

- [ ] **Step 2: guards** — `RequireAuth` (redirects to `/signin` if no user; shows `<PendingApproval/>` if `status==='pending'`); `RequireAdmin` (renders children only if `role==='admin'`, else a "Not authorized" card). Both show a spinner while `loading`.

- [ ] **Step 3: SignUp** — email/password + display name form, plus "Continue with Google" (`signInWithPopup(auth, googleProvider)`). On success the provider creates the pending member doc. **Test** `src/auth/SignUp.test.tsx`: renders fields; submitting with empty email shows validation; clicking Google calls the (mocked) `signInWithPopup`. Run `npx vitest run src/auth/SignUp.test.tsx` → PASS.

- [ ] **Step 4: SignIn** — email/password + Google; link to SignUp; surfaces auth errors (wrong password, user not found) as friendly text.

- [ ] **Step 5: PendingApproval** — static screen: "Your account is awaiting admin approval. You're on the waitlist." + sign-out button + the org `contactEmail`.

- [ ] **Step 6:** `npx tsc --noEmit` clean. **Commit** `git add -A && git commit -m "feat: auth provider, route guards, sign-in/up, pending screen"`

---

## Task 7: Layout shell + router

**Files:** Create `src/components/Layout.tsx`, `src/components/ui.tsx`; rewrite `src/App.tsx`.

- [ ] **Step 1: ui.tsx** — small Tailwind primitives exported: `Button` (variants primary/secondary/danger/ghost), `Card`, `Badge` (color by status), `Modal` (overlay + close), `Field` (label+input+error), `Table` (thin wrapper). No external UI lib.

- [ ] **Step 2: Layout** — left sidebar nav (garden-green theme), header with org name + signed-in member name + sign-out. Nav items role-aware: members see Dashboard, Plots, Calendar (Calendar route is a Phase-3 placeholder page now), My Hours (placeholder now); admins additionally see Members, Waitlist, Dues, Settings (placeholders until their tasks). Active-route highlighting via `NavLink`.

- [ ] **Step 3: App.tsx** — `BrowserRouter` + `AuthProvider`. Routes: `/signin`, `/signup` (public); everything else under `RequireAuth` + `Layout`: `/` Dashboard, `/plots`, `/plots/:id`, `/members` + `/waitlist` + `/dues` (under `RequireAdmin`). Unknown routes → redirect `/`.

- [ ] **Step 4:** `npm run build` succeeds. **Commit** `git add -A && git commit -m "feat: role-aware layout shell + routing"`

---

## Task 8: Emulator seed + rules test harness

**Files:** Create `src/seed/seed.ts`, `test/rules/firestore.rules.test.ts`.

- [ ] **Step 1: seed.ts** — uses the Firebase **Admin-less client SDK pointed at emulators** (or `@firebase/rules-unit-testing` admin context) to write: `settings/org` (the OrgSettings defaults), ~8 plots (mix of whole + one split pair `7A`/`7B`, varied dues, some paid), 2 admins, 3 active members (assigned to plots), 2 pending members (different `createdAt`). Idempotent (fixed ids).

- [ ] **Step 2: rules harness** — `test/rules/firestore.rules.test.ts` using `initializeTestEnvironment({ projectId:'sacg-test', firestore:{ rules: readFileSync('firestore.rules','utf8') } })`. Write **one passing baseline test** now against the locked rules: "unauthenticated read of /plots is denied." Run via emulator: `firebase emulators:exec --only firestore "npx vitest run test/rules"` → PASS. (Full matrix added in Task 13.)

- [ ] **Step 3: Commit** `git add -A && git commit -m "test: emulator seed data + firestore rules test harness"`

---

## Task 9: Members + Waitlist + approval/assignment

**Files:** Create `src/features/members/membersApi.ts`, `MembersPage.tsx`, `WaitlistPage.tsx`, `MemberDetail.tsx`.

- [ ] **Step 1: membersApi.ts** — typed functions:
```
listMembers(): subscribe via onSnapshot(membersCol) → Member[]
listWaitlist(): onSnapshot(query(membersCol, where('status','==','pending'), orderBy('createdAt')))
approveMember(id): updateDoc(memberDoc(id), { status:'active', joinedAt: serverTimestamp() })
setMemberRole(id, role): updateDoc(memberDoc(id), { role })
deactivateMember(id): updateDoc(memberDoc(id), { status:'inactive' })
updateMemberProfile(id, { displayName, phone }): updateDoc(...)
```
- [ ] **Step 2: WaitlistPage** (admin) — list pending members oldest-first (uses `listWaitlist`), each row showing name/email/wait-since + "Approve & Assign Plot" button (opens AssignPlotModal from Task 11) and "Approve only" (sets active, no plot). Empty state.
- [ ] **Step 3: MembersPage** (admin) — table of all members: name, email, role badge, status badge, plot(s) held (derived by querying plots where holderMemberId==id, or a denormalized join), hours-YTD placeholder (wired in Phase 2). Search box filters by name/email. Row → MemberDetail.
- [ ] **Step 4: MemberDetail** — admin view/edit: contact info, role toggle, status, admin notes, list of held plots with dues status. **Member self-view** of `/members/me`: can edit own displayName/phone only.
- [ ] **Step 5: Test** `membersApi.test.ts` against the emulator: seed a pending member, call `approveMember`, assert `status==='active'` and `joinedAt` set. Run with `firebase emulators:exec`. PASS.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: members list, waitlist, approval and profile editing"`

---

## Task 10: Plots — map, list, detail

**Files:** Create `src/features/plots/plotsApi.ts`, `PlotsPage.tsx`, `PlotMap.tsx`, `PlotDetail.tsx`.

- [ ] **Step 1: plotsApi.ts**
```
listPlots(): onSnapshot(plotsCol) → Plot[]
getPlot(id): onSnapshot(plotDoc(id))
createPlot(data): setDoc(plotDoc(id), {... defaults: half:'whole', status:'available', duesPaid:false, depositPaid:false, depositAmount: settings.defaultDeposit, crops:[] })
updatePlot(id, patch): updateDoc(plotDoc(id), patch)
toggleDuesPaid(id, paid): updateDoc(plotDoc(id), { duesPaid: paid, paidDate: paid ? serverTimestamp() : null })
```
- [ ] **Step 2: PlotMap** — renders the grid using `groupByNumber` (Task 5). Each plot cell shows number (+A/B), holder name, color-coded: gray=available, green=assigned+paid, amber=assigned+unpaid. Click → navigate `/plots/:id`. Uses `mapPos` if present, else lays out in numeric order in a responsive grid.
- [ ] **Step 3: PlotsPage** — toggle between Map view and Table view (table: id, holder, dues amount, paid, season). Admin sees "Add plot" button.
- [ ] **Step 4: PlotDetail** — shows plot fields; admin can edit size/dues/notes, toggle dues/deposit paid, and (Task 11) assign/split; holder + admin can edit crops (Task 12). Members see read-only except own crops.
- [ ] **Step 5: Test** `plotsApi.test.ts` (emulator): create plot, toggleDuesPaid true → assert duesPaid true + paidDate set. PASS.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: plots map, list, and detail views"`

---

## Task 11: Assign + split plots

**Files:** Create `src/features/plots/AssignPlotModal.tsx`; extend `plotsApi.ts`.

- [ ] **Step 1: extend plotsApi**
```
assignPlot(plotId, member): updateDoc(plotDoc(plotId), { holderMemberId: member.id, holderName: member.displayName, status:'assigned' }); if member.status==='pending' also approveMember(member.id)
unassignPlot(plotId): updateDoc(..., { holderMemberId:null, holderName:null, status:'available' })
splitPlot(number): batch — read plot `${number}`; create `${number}A` and `${number}B` (copy size/mapPos, status available, crops [], dues defaults); delete/inactivate the whole `${number}`. Use writeBatch.
```
- [ ] **Step 2: AssignPlotModal** — pick an active-or-pending member (searchable select), confirm; calls `assignPlot`. Reachable from WaitlistPage ("Approve & Assign") and PlotDetail ("Assign holder").
- [ ] **Step 3: "Split plot" button** on PlotDetail (admin, only when `half==='whole'`) → confirm → `splitPlot(number)` → navigate to `/plots/{number}A`.
- [ ] **Step 4: Test** `assign.test.ts` (emulator): assign a pending member to a plot → plot.holderMemberId set, plot.status assigned, member.status active. splitPlot('7') from a whole plot → `7A` and `7B` exist, `7` gone. PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: assign plots to members + split into A/B halves"`

---

## Task 12: Crops editor ("what I'm growing")

**Files:** Create `src/features/plots/CropsEditor.tsx`; extend `plotsApi.ts`.

- [ ] **Step 1: extend plotsApi** — `setCrops(plotId, crops: Crop[]): updateDoc(plotDoc(plotId), { crops })`.
- [ ] **Step 2: CropsEditor** — embedded in PlotDetail. Shows crop chips (name + optional plantedOn + notes). Add/edit/remove rows; Save calls `setCrops`. Visible & editable only to the plot's `holderMemberId` or an admin (others see read-only list).
- [ ] **Step 3: Test** `CropsEditor.test.tsx` (RTL): given a holder, adding a crop and saving calls `setCrops` with the new array; given a non-holder member, inputs are not rendered (read-only). PASS.
- [ ] **Step 4: Commit** `git add -A && git commit -m "feat: per-plot crops editor with holder/admin permissions"`

---

## Task 13: Security rules (members + plots) + rules tests

**Files:** Rewrite `firestore.rules`; expand `test/rules/firestore.rules.test.ts`.

- [ ] **Step 1: Write the rules**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function me() { return get(/databases/$(database)/documents/members/$(request.auth.uid)).data; }
    function isAdmin() { return signedIn() && me().role == 'admin'; }
    function isActive() { return signedIn() && me().status == 'active'; }

    match /settings/{doc} {
      allow read: if isActive() || isAdmin();
      allow write: if isAdmin();
    }

    match /members/{uid} {
      allow read: if isAdmin() || (signedIn() && request.auth.uid == uid) || isActive();
      // self-create own pending doc on sign-up; cannot self-assign role/status
      allow create: if signedIn() && request.auth.uid == uid
        && request.resource.data.role == 'member'
        && request.resource.data.status == 'pending';
      // self-update limited to contact fields; admins update anything
      allow update: if isAdmin() || (signedIn() && request.auth.uid == uid
        && request.resource.data.role == resource.data.role
        && request.resource.data.status == resource.data.status
        && request.resource.data.diff(resource.data).affectedKeys()
             .hasOnly(['displayName','phone']));
      allow delete: if isAdmin();
    }

    match /plots/{id} {
      allow read: if isActive() || isAdmin();
      allow create, delete: if isAdmin();
      // admin full update; holder may change ONLY crops
      allow update: if isAdmin() || (isActive()
        && resource.data.holderMemberId == request.auth.uid
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['crops']));
    }

    match /events/{id} {
      allow read: if isActive() || isAdmin();
      allow write: if isAdmin();
      match /rsvps/{uid} {
        allow read: if isActive() || isAdmin();
        allow write: if isAdmin() || (signedIn() && request.auth.uid == uid);
      }
    }

    match /volunteerHours/{id} {
      allow read: if isAdmin() || (signedIn() && resource.data.memberId == request.auth.uid);
      allow write: if isAdmin();
    }

    match /mail/{id} {
      allow read, delete: if isAdmin();
      allow create: if isAdmin();
    }
  }
}
```
- [ ] **Step 2: Rules tests** — cover: pending user cannot read plots; active member can read plots; member can update only own plot's `crops` (and is denied changing `duesPaid`); non-admin cannot write another member's doc; member cannot self-escalate role to admin (update denied); admin can do all; member can write own rsvp but not another's. Use `assertSucceeds`/`assertFails`.
- [ ] **Step 3:** Run `firebase emulators:exec --only firestore "npx vitest run test/rules"` → all PASS.
- [ ] **Step 4: Commit** `git add -A && git commit -m "feat: firestore security rules for members/plots/events + rules tests"`

---

## Task 14: Dues page (Treasurer view)

**Files:** Create `src/features/dues/DuesPage.tsx`.

- [ ] **Step 1: DuesPage** (admin) — subscribes to plots; uses `computeDuesRollup` (Task 5) for summary cards (Expected / Collected / Outstanding). Table of assigned plots: plot id, holder, dues amount (inline editable), deposit paid, dues paid toggle (`toggleDuesPaid`), paid date. Filter: "show unpaid only." 
- [ ] **Step 2: Test** `DuesPage.test.tsx` (RTL with mocked api): renders rollup numbers from a fixture set of plots; toggling a row calls `toggleDuesPaid(id, true)`. PASS.
- [ ] **Step 3: Commit** `git add -A && git commit -m "feat: dues treasurer view with rollups and paid toggles"`

---

## Task 15: Dashboard

**Files:** Rewrite `src/features/dashboard/Dashboard.tsx`.

- [ ] **Step 1: Admin dashboard** — cards: plots occupied/total, dues outstanding (from `computeDuesRollup`), member count, pending/waitlist count. Quick links to Waitlist, Plots, Dues.
- [ ] **Step 2: Member dashboard** — their plot(s) summary, own dues status, hours placeholder (Phase 2), link to plot detail. If no plot yet, friendly "you'll be assigned soon" note.
- [ ] **Step 3:** `npm run build` succeeds. **Commit** `git add -A && git commit -m "feat: role-aware dashboard"`

---

## Task 16: Build verification + deploy readiness

**Files:** Update `README.md` (create) with run/deploy instructions.

- [ ] **Step 1:** Full check — `npx tsc --noEmit`, `npx vitest run` (all unit/component pass), `firebase emulators:exec --only firestore "npx vitest run test/rules"` (rules pass), `npm run build` (clean).
- [ ] **Step 2:** Manual emulator smoke: `npm run emulators`, seed (`npm run seed`), run `npm run dev`, verify sign-up→pending, admin approve+assign, dues toggle, crops edit, plot split. Document results.
- [ ] **Step 3: README** — local dev (emulators + seed), env vars (`.env.local` from `.env.example`), and the **deploy handoff**: `firebase login`, set project in `.firebaserc`, enable Email/Password + Google providers, `firebase deploy --only firestore:rules,firestore:indexes,hosting`.
- [ ] **Step 4: Commit** `git add -A && git commit -m "docs: README with local dev and deploy instructions"`

---

## Self-Review

**Spec coverage:** Auth/roles (T6,13), onboarding/waitlist (T6,9,11), members (T9), plots+map+A/B split (T10,11), crops (T12), dues track-only (T10,14), security rules matrix (T13), seed/testing (T5,8,13), Hosting/deploy config (T2,16). Phase-2/3 items (volunteer hours UI, email send, calendar) are intentionally deferred to follow-on plans; types/collections/rules for them are already in place (T3,4,13) so they slot in cleanly. ✅ MVP scope covered.

**Placeholder scan:** UI tasks specify file/responsibility/behavior/tests rather than full JSX by the stated convention; all logic, types, config, and rules are complete code. No TBD/TODO in critical paths.

**Type consistency:** `Member`, `Plot`, `Crop`, `OrgSettings` field names used in T9–15 match T3. API names (`approveMember`, `assignPlot`, `splitPlot`, `toggleDuesPaid`, `setCrops`, `computeDuesRollup`, `hoursProgress`, `waitlistOrder`, `groupByNumber`) are consistent across tasks. ✅
