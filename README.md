# South Austin Community Garden — Management App

An all-in-one web app for the South Austin Community Garden (SACG) to manage **plots**, **members & a waitlist**, **dues**, and (in later phases) **volunteer hours, email, and a shared calendar**.

Built with **React + Vite + TypeScript + Tailwind** on **Firebase** (Hosting + Firestore + Auth). Lean client-side architecture: the SPA talks to Firestore directly, gated by security rules.

> **Status:** MVP (Phase 0–1) complete — auth & onboarding, members + waitlist, plots (map, assignment, A/B splits, crops), and dues tracking. Phases 2–4 (volunteer hours + email, calendar, polish) are planned next. See `docs/superpowers/specs/` and `docs/superpowers/plans/`.

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | React 18, Vite 5, TypeScript, Tailwind 3, react-router v6 |
| Backend | Cloud Firestore (client SDK + security rules) |
| Auth | Firebase Auth — email/password + Google |
| Hosting | Firebase Hosting (SPA) |
| Tests | Vitest + Testing Library (unit/component); `@firebase/rules-unit-testing` + emulator (rules) |

## Prerequisites

- **Node 20+** and npm
- **Java 11+** (required by the Firestore emulator)
- **Firebase CLI**: `npm i -g firebase-tools`

## Local development

```bash
npm install

# create your local env file (emulator mode by default)
cp .env.example .env.local      # PowerShell: Copy-Item .env.example .env.local
```

For purely local work the placeholder `VITE_FB_*` values are fine (the emulators don't validate them). Keep `VITE_USE_EMULATORS=true`.

```bash
# Terminal 1 — start the Auth + Firestore + Hosting emulators
npm run emulators

# Terminal 2 — start the Vite dev server
npm run dev
```

### Seed local data

With the emulators running (or via the wrapper below), load sample plots/members/settings:

```bash
firebase emulators:exec --only auth,firestore "npm run seed"
```

This creates sample login accounts (all password `password`):

| Email | Role | Status |
|-------|------|--------|
| `admin@sacg.test` | admin | active |
| `treasurer@sacg.test` | admin | active |
| `rosa@sacg.test` | member | active (holds a plot) |
| `sam@sacg.test` | member | active (holds 7A) |
| `pat@sacg.test` | member | pending (waitlist) |
| `quinn@sacg.test` | member | pending (waitlist) |

### Tests

```bash
npm test           # unit + component tests (jsdom, no emulator needed)
npm run test:rules # Firestore security-rules matrix (boots the firestore emulator)
npm run build      # type-check + production build
```

## Deploying to Firebase

These steps need **your** Firebase account and project (interactive login / secrets that can't be automated):

1. **Log in:** `firebase login`
2. **Point at your project:** `firebase use --add` and pick your Firebase project (this replaces the `sacg-local` placeholder in `.firebaserc`). *(`sacg-local` is only for local emulator use.)*
3. **Enable auth providers:** in the Firebase console → Authentication → Sign-in method, enable **Email/Password** and **Google**.
4. **Add a Web App** in the console (Project settings → Your apps) and copy its config. Create **`.env.production`** (or set these in `.env.local`) with the real values and emulators OFF:
   ```
   VITE_FB_API_KEY=...
   VITE_FB_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FB_PROJECT_ID=your-project
   VITE_FB_STORAGE_BUCKET=your-project.appspot.com
   VITE_FB_MESSAGING_SENDER_ID=...
   VITE_FB_APP_ID=...
   VITE_USE_EMULATORS=false
   ```
   (A production build never connects to emulators regardless, but set this for clarity.)
5. **Build & deploy:**
   ```bash
   npm run build
   firebase deploy --only firestore:rules,firestore:indexes,hosting
   ```

### ⚠️ Bootstrap the first admin (important)

The app's approval flow requires an existing **admin**, but a fresh production database has none. To create the first one:

1. Open the deployed site and **sign up** (this creates a `members/{uid}` doc with `role: member`, `status: pending`).
2. In the **Firebase console → Firestore → `members` → your doc**, set `role` to `admin` and `status` to `active`.
3. Reload — you now have full admin access and can approve/assign everyone else from inside the app.

## How it works (MVP)

- **Onboarding:** anyone can sign up; they land in a *pending* state (the waitlist, ordered by signup date). An admin approves them — assigning a pending member to a plot approves them in one step.
- **Plots:** a map/grid color-coded by status & dues; whole plots can be **split into A/B halves**, each with its own holder, dues, and crops. Holders edit "what I'm growing"; admins manage everything.
- **Dues:** tracked per plot (amounts vary by size) with a treasurer rollup (expected/collected/outstanding). Track-only — no online payments.
- **Security:** Firestore rules enforce roles — members read plots and edit only their own plot's crops and their own profile; admins manage all data. (See `firestore.rules`; covered by `npm run test:rules`.)

## Project structure

```
src/
  lib/          firebase init, shared types
  data/         typed Firestore collection refs
  logic/        pure functions (dues, hours, waitlist, plots, email) — unit tested
  auth/         AuthProvider, guards, sign-in/up, pending screen
  components/    UI primitives + role-aware Layout
  features/      dashboard, plots, members, dues
  seed/         emulator seed script
test/rules/     security-rules tests
docs/superpowers/  design spec + implementation plan(s)
```
