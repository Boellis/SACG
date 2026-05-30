# SACG Community Garden App — Design Spec

**Date:** 2026-05-30
**Status:** Approved (user authorized full autonomous build & deploy)

## 1. Overview

An all-in-one web app for the **South Austin Community Garden (SACG)** to manage garden plots, members, dues, volunteers/volunteer-hours, and a shared events calendar — replacing today's manual mix of a Gmail inbox, a static plot-map document, a private Facebook group, and spreadsheets.

**Primary goals**
- Admins (coordinators) manage plots, assign them to members, and track dues.
- Members log in to see their plot, see what they owe, update what they're growing, RSVP to workdays, and track their volunteer hours.
- One shared calendar of workdays and meetings.
- Email some or all members/volunteers from inside the app.

## 2. Organizational context (research)

- **SACG** — "Gardening Organic in South Austin Since 1994," 2800 S. 5th St, Austin TX 78704. Sponsored by the **Sustainable Food Center** (not its own 501c3).
- **~30–33 plots**, 6ft × 20–30ft. Plots **can be split between two people**. No published A/B convention — we define one. Communal areas exist (co-op garden, orchard, compost) but are out of scope for plot management v1.
- **Dues vary by plot size**, roughly **$18–$60/yr**, plus a **$25 deposit**.
- **Members owe 12 volunteer hours/year** (≥6 in the first 6 months). A "Community Hours" coordinator tracks this today. Volunteers and members heavily overlap, so the app treats them as **one people list with hour tracking**.
- **Intake**: prospective members email and join a **date-ordered waitlist**.

## 3. Users & roles

| Role | Who | Can do |
|------|-----|--------|
| **pending** | Just self-registered, not yet approved | See only a "pending approval" screen + edit own profile. This is the **waitlist**. |
| **member** | Approved gardener | View plot map & directory; edit **own** plot's crops; view **own** dues; view/RSVP calendar; view **own** volunteer-hour progress. |
| **admin** | Coordinators | Full CRUD on everything: approve members, assign/split plots, set & mark dues, log hours, create events, send email, edit settings. |

**Onboarding flow (self-register → admin approves):**
1. Person signs up (email/password or Google) → a `members` doc is created with `role: member`, `status: pending`.
2. They land on a "pending approval" screen.
3. Admin sees pending members (the waitlist, ordered by `createdAt`), and when a plot is available, **assigns a plot** and sets `status: active`.
4. Member now has full member access.
5. Admins may also create a pending `members` record manually (for someone who only emailed); it links to an auth account when that person later registers with the same email.

## 4. Architecture (Approach A — lean client-side)

- **Frontend:** React + Vite SPA, **TypeScript**, **Tailwind CSS**, **react-router**. Served by **Firebase Hosting** (SPA rewrite to `index.html`).
- **Auth:** Firebase Auth — **email/password + Google** sign-in.
- **Database:** Cloud Firestore. The SPA reads/writes Firestore **directly**, gated by **Security Rules** that enforce the role matrix above.
- **Server-side (minimal):**
  - **Trigger Email extension** (`firestore-send-email`) watches the `mail` collection and sends via SMTP (their Gmail/Workspace).
  - **1–2 Callable Cloud Functions** for actions that must not be client-trusted: (a) `setMemberRole`/approve (writes role + custom claim), (b) `sendBulkEmail` (validates admin, fans out `mail` docs). If we lean on Security Rules + client writes for approval, Functions may reduce to just the bulk-email helper. Custom claims mirror `role` for fast rule checks.
- **All on the user's existing GCP project.**

## 5. Data model (Firestore)

Six top-level collections. Small and flat — appropriate for ~30 plots / a few dozen members.

### `members/{uid}`  (doc id = Firebase Auth uid; manual prospects use an auto-id with `uid: null`)
- `email: string`
- `displayName: string`
- `phone?: string`
- `role: 'admin' | 'member'`
- `status: 'pending' | 'active' | 'inactive'`
- `joinedAt?: timestamp` (when approved — basis for the "6 hrs in first 6 months" rule)
- `createdAt: timestamp` (waitlist ordering)
- `currentYearHours: number` (cached sum; recomputed on hour writes)
- `notes?: string` (admin-only)

### `plots/{plotId}`  (plotId = `"12"` whole, or `"12A"` / `"12B"` split)
- `number: number` (e.g., 12)
- `half: 'whole' | 'A' | 'B'`
- `size?: string` (e.g., "6x20")
- `status: 'available' | 'assigned' | 'reserved' | 'inactive'`
- `holderMemberId?: string` (→ members)
- `holderName?: string` (denormalized for map display)
- `duesAmount: number`
- `depositAmount: number` (default 25)
- `duesPaid: boolean`
- `depositPaid: boolean`
- `paidDate?: timestamp`
- `season: string` (e.g., "2026")
- `crops: Array<{ name: string; plantedOn?: timestamp; notes?: string }>`
- `mapPos?: { row: number; col: number }` (grid layout)
- `notes?: string`

### `events/{eventId}`
- `title: string`
- `type: 'workday' | 'meeting' | 'other'`
- `start: timestamp`, `end: timestamp`, `allDay: boolean`
- `location?: string`, `description?: string`
- `createdBy: string`
- **Subcollection** `events/{eventId}/rsvps/{uid}`: `{ status: 'yes' | 'no' | 'maybe'; displayName: string; respondedAt: timestamp }`

### `volunteerHours/{id}`
- `memberId: string` (→ members)
- `date: timestamp`
- `hours: number`
- `eventId?: string` (→ events, when logged from a workday)
- `description?: string`
- `recordedBy: string` (admin uid)
- `createdAt: timestamp`

### `mail/{id}`  (watched by Trigger Email extension)
- `to: string[]`
- `message: { subject: string; html: string; text?: string }`
- `delivery?: {...}` (written back by the extension)
- `meta?: { sentBy: string; audience: string }` (our record-keeping for the "sent email" view)

### `settings/org`  (singleton)
- `requiredHours: number` (12)
- `firstHalfHours: number` (6)
- `firstHalfMonths: number` (6)
- `defaultDeposit: number` (25)
- `currentSeason: string` ("2026")
- `duesBySize?: Record<string, number>` (optional defaults by size label)
- `contactEmail: string`

## 6. Features by module

### Dashboard
- Admin: counts (plots occupied/available, dues outstanding total, members, next workday + RSVP count) and quick links.
- Member: their plot summary, dues status, hour progress, next event.

### Plots & Map
- **Grid/map view** color-coded by status (available vs assigned) and dues (paid vs unpaid). Split plots render as two halves under one number.
- **Plot detail**: owner, dues amount + paid toggle (admin), deposit, season, crops.
- **Assign**: admin assigns an available plot to an active member (or to a pending member, which also approves them). **Split** action turns plot `"12"` into `"12A"`/`"12B"`.
- **Crops ("what I'm growing")**: the plot's holder (or admin) adds/edits/removes crop entries.

### Members & Waitlist
- Member list with role/status, plot(s), dues status, hour progress; search/filter.
- **Waitlist** = pending members ordered by `createdAt`; admin approves + assigns.
- Member profile (self-editable contact info; admin notes hidden from members).

### Dues (Treasurer view)
- Per-plot tracking (amount, deposit, paid flags). Admin toggles paid/unpaid, sets amounts.
- Rollup: total expected, total collected, outstanding, and a list of unpaid plots/members. Track-only (no payment processing).

### Volunteers & Hours
- Unified with members. Each member shows **hours YTD vs 12** and **first-6-months vs 6** progress.
- Admin logs hours (manual entry or bulk from a workday's RSVP/attendee list). Members view their own history.

### Email
- Admin picks audience: **all active members**, a **workday's RSVPs**, or a **custom selection**; composes subject + body → writes `mail` doc(s) → extension sends. A "sent" view reads the `mail` collection.

### Calendar
- Month grid + upcoming list. Event types workday/meeting/other. Admin creates/edits/deletes; members **RSVP** (yes/no/maybe). From a workday, admin can **log hours** for attendees in one step.

### Settings (admin)
- Edit org config (required hours, deposit, current season, contact email, dues-by-size defaults).

## 7. Security rules (intent)

- `members/{uid}`: a user reads/writes **own** doc's safe fields (contact info), but **cannot** change own `role`/`status`/`notes`. Admins read/write all. List readable by active members (directory) minus sensitive fields handled in the client (sensitive fields kept in admin-only views; truly private data not stored on member docs).
- `plots`: read by any active member; write by admin **except** the holder may edit only the `crops` field of their own plot.
- `events`: read by active members; write by admin. `events/*/rsvps/{uid}`: a member writes only their own rsvp doc.
- `volunteerHours`: read own by member, all by admin; write by admin only.
- `mail`: create by admin only; no client reads of others'. `settings`: read by active members, write by admin.
- Role checks use **custom claims** (set by a Function on approval) to avoid per-request `get()` where practical, with a Firestore-`get` fallback.

## 8. Non-goals (YAGNI for v1)

Online/card payments (Stripe); multi-garden/multi-tenant; native mobile apps; public marketing pages; automated dues invoicing/reminders; member self-logging of hours (admin-logged in v1); Google Calendar sync; photo/file uploads; communal-area/orchard management; SMS.

Several of these (Google Calendar sync, self-logged hours, payment processing, photo uploads) are natural **later phases**, not rejected forever.

## 9. Build phasing

- **Phase 0 — Foundation:** Vite/React/TS scaffold, Tailwind, routing, Firebase init (Hosting + Firestore + emulators), Auth context, shared types, base layout/nav, seed script, security-rules skeleton + rules tests harness.
- **Phase 1 — MVP:** Auth + onboarding/approval, Members + waitlist, Plots + map + assignment + split + crops, Dues tracking. **Deployable.**
- **Phase 2 — Volunteers/Hours + Email:** hour logging, YTD/first-6-month progress, audience-based email via extension.
- **Phase 3 — Calendar:** events CRUD, month/list, RSVP, workday→hours.
- **Phase 4 — Polish:** dashboards, settings UI, empty/error states, accessibility pass.

## 10. Testing

- **Vitest** unit tests for pure logic: dues rollups, hours-YTD + first-6-month calculation, waitlist ordering, split-plot grouping, email-audience builder. (TDD — tests first for this logic.)
- **`@firebase/rules-unit-testing`** against the Firestore emulator for the security-rules matrix (member vs admin vs pending).
- **React Testing Library** component tests for key flows (assign plot, toggle dues, RSVP, compose email).
- Local end-to-end against the **Firebase emulator suite** with a seed dataset.

## 11. Deployment

- **Firebase Hosting**: `dist/` with SPA rewrite. `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json` committed.
- **What needs the user (interactive / secrets):**
  - `firebase login` (interactive OAuth).
  - The Firebase **project ID** (sets `.firebaserc`).
  - Installing the **Trigger Email extension** + providing **SMTP credentials** (Gmail app password or SendGrid SMTP) — a secret only they can supply.
  - Enabling **Email/Password + Google** sign-in providers in the Auth console.
- Everything else is configured so a single `firebase deploy` (after login + project select) ships hosting, rules, and indexes.

## 12. Key assumptions (decided autonomously, reversible)

- Auth = email/password **and** Google.
- Crops = simple list on the plot doc.
- Plot map = configurable grid keyed by `mapPos`; defaults to numeric order.
- Dues are per-plot, per-season, track-only.
- Hours are admin-logged in v1; members can view.
- Working on `main` in a fresh local git repo (no remote yet).
