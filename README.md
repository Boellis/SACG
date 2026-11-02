# South Austin Community Garden — Management App

The web app that runs the South Austin Community Garden (SACG): plots, members and the waitlist, dues tracking, volunteer hours, a shared calendar with email-link RSVPs, member email, a message board, the Members Lounge, documents, polls, an analytics dashboard, and an admin-only AI assistant.

**Live at https://sacg-garden-app.web.app.** Changes reach it only through the GitHub **`dev` → `test` → `prod`** pipeline. See [How the GitHub pipeline works](#how-the-github-pipeline-works).

> **This repository is public.** Never commit member data (names, emails, phone numbers, rosters) or credentials. CI scans every push for them. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#never-commit-roster-data-or-secrets).

## What's in the app

| Area | Who | What it does |
|------|-----|--------------|
| Plots and Whole Garden | all members | Plot map colored by occupancy, A/B half-plots, co-gardeners, crops, and 2D and 3D plot layouts. |
| Calendar and RSVPs | all members | Meetings and workdays. Members answer **Yes, Maybe or No** with a party size and an optional note. |
| My Hours | all members | Self-logged volunteer hours. |
| Message Board, Lounge, Messages | all members | Forum threads; member directory and profiles; 1:1 chat; the announcements billboard. |
| Documents, Polls | all members | Files that admins upload for everyone; polls where each member votes once. |
| `/rsvp/<link>` | anyone with the link | Personal RSVP page from an email. No sign-in needed, so the many members who never log in can still respond. |
| Members, Waitlist, Dues, Settings | admins | Roster, approvals and duplicate merging, per-plot dues tracking (**track-only, no online payments**), and garden settings. |
| Email | admins | Personalized emails sent one per member, with a delivery log under **Recent emails**. |
| Analytics | admins | Executive dashboard with Overview, Finance, Operations and Engagement tabs, plus a printable committee report. |
| **AI Assistant** | **admins only** | Paste a member's request; it drafts the calendar event, email, announcement or poll for you to approve. |

### RSVPs by email (headcounts)

On a calendar event, admins see the **expected headcount** (total people, counting party sizes), each answer, and an `email` badge for answers that came from an email link.

To send invitations:
1. Click **Send RSVP invitations…**.
2. Choose who gets it: all active members, only those who haven't responded, or one person.
3. Click **Send test** to send it to yourself first.
4. Click **Send to N members**.

What each member gets:
- An email with **their own link**.
- Answers can be changed with the same link until the event ends.
- Each link accepts at most 50 submissions, and garbage or expired links get a friendly message.

How sending works: emails go through a server-side queue, about one every 4 seconds, with at most 100 recipients per send. A crashed or retried send resumes without emailing anyone twice. Delivery goes through the Firebase **Trigger Email** extension and Gmail SMTP, from `southatxgarden@gmail.com`.

### The AI assistant (admins only)

Open **AI Assistant** in the admin menu, or use the card on the dashboard. Paste a request in plain words, for example "Denny wants an RSVP for the Nov 7 meeting, 9–10, then the workday 10–12."

**What it can read:**
- the calendar and its RSVP headcounts;
- member names (never their emails or phone numbers);
- how many people an email would reach;
- recent emails.

**What it can propose:**
- a calendar event, or a change to one;
- an email;
- an announcement;
- a poll.

**Nothing happens until an admin clicks Approve** on the proposal's card. Each card can be edited first, and email cards have **Send test** (send to one person) and **Approve & send** (with a confirmation). A double click or a retry still runs the action exactly once. If an approval stalls, the card offers **Finish** after two minutes.

**Admins only, enforced in three places:**
- every assistant function rejects non-admins;
- Firestore rules let only admins read conversations, and nobody can write them from the browser;
- the page and menu item are admin-only.

All admins see the same conversations.

**Limits:**
- 60 messages per admin per day;
- 20,000 characters per message;
- up to 10 steps per turn (it pauses with "say *continue*");
- 200 messages per conversation.

**Privacy:** emails and phone numbers in text you paste are hidden from the model. You still see your text as typed, and contact details can be added on the card. The assistant can't email anyone outside the members list, and it can't change plots, dues, members, documents or settings.

**Models:** it uses Anthropic's `claude-opus-5-5`. The API key lives in Google Cloud Secret Manager as `ANTHROPIC_API_KEY` and is read at run time; it is never in the code or the browser.

## How the GitHub pipeline works

The whole flow is code, in `.github/workflows/`. The full guide, including what each check does and how to fix it, is **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.

### Branches

| Branch | What it is | When it changes |
|--------|------------|-----------------|
| `dev` | Integration, and the repository's default branch | CI runs; nothing deploys |
| `test` | Pre-production | CI, then a Hosting **preview** (the `test` channel) plus smoke checks |
| `prod` | **Live site** | CI, then a full deploy (Hosting, Firestore rules and indexes, Storage rules, Cloud Functions) plus smoke checks |

`test` and `prod` accept changes only through a pull request with **1 approval** and all required checks green. Force-pushes and deleting those branches are blocked. Always merge with a **merge commit**. `main` is retired.

### Step by step: shipping a change

1. **Branch from `dev`:** `git switch dev && git pull && git switch -c feature/short-name`.
2. **Build it with tests.** Before pushing, run `npm test`, `npm run build`, and, if you touched them, `npm run test:rules` and `cd functions && npm test`.
3. **Open a PR into `dev`.** Small changes can be pushed straight to `dev`. CI runs either way.
4. **Promote to test:** open a PR **`dev` → `test`**, get an approval, and merge.
   - The *Deploy test* workflow publishes the preview and prints its URL in the run summary.
   - The preview uses the **real production data**, so don't create junk records.
5. **Click through the preview.**
6. **Release:** open a PR **`test` → `prod`**, get an approval, and merge. The *Deploy prod* workflow then:
   - runs CI;
   - records the live Hosting version;
   - deploys;
   - smoke-checks the live site;
   - **rolls Hosting back automatically** if the deploy or the checks fail, or the run is cancelled.
7. **Watch the run** in the Actions tab until it's green.

The `promotion-guard` check rejects PRs that skip a stage. A PR into `test` must come from `dev`, and a PR into `prod` must come from `test`; `hotfix/*` branches are allowed for both.

> **Approvals today:** until a second developer joins the repo, the owner can merge past the 1-approval rule as an admin. All other required checks still apply. Turn that bypass off once a second reviewer exists (`enforce_admins` on `test`/`prod`).

### What CI checks on every PR and push

These six checks are **required** to merge into `test` or `prod`:
- `build-and-test`: the build and type-check, plus the app's tests.
- `functions`: the Cloud Functions build and tests, against the Firestore emulator.
- `firestore-rules`: the security-rules test matrix.
- `security-scan`: gitleaks over the entire git history; the repo scanner for secrets, member emails and phones, and forbidden files such as rosters and keys; and `npm audit` for the app and the functions.
- `bundle-scan`: the same scans on the built site, which also fail on any source map.
- `promotion-guard`: the branch order above.

**CodeQL** static analysis runs too, and Dependabot opens weekly dependency-update PRs against `dev`.

### What the post-deploy smoke checks prove

`scripts/smoke/smoke.mjs` checks the live site after every deploy:
- the app shell loads, and sensitive paths (`.env`, rosters, `firebase.json`, …) serve nothing;
- no secret or member data appears in any served file, and no source maps are served;
- the security headers are present;
- anonymous visitors are refused by the **security rules** on every Firestore collection and on Storage;
- the admin functions reject anonymous calls;
- a bogus RSVP link returns a clean "not found".

Run them yourself any time:

```bash
node scripts/smoke/smoke.mjs --url https://sacg-garden-app.web.app
```

### Hotfixes, rollbacks, and forced deploys

- **Hotfix:**
  1. Branch `hotfix/short-name` from `prod`.
  2. Open a PR straight into `prod`.
  3. After it deploys, open PRs from the **same** branch into `test` and `dev` so they don't fall behind.
- **Hosting rollback** is automatic on a failed prod deploy. To roll back by hand: Firebase console → Hosting → release history → Rollback.
- **Rules and functions are not rolled back automatically.** `git revert` the change and send the revert through the flow, as a hotfix if it's urgent.
- **A deploy that stops at a firebase-tools prompt** (for example a function's new retry policy, or deleting a function) fails safely, before Hosting is released.
  1. Read the log first.
  2. Check `firebase firestore:indexes --project sacg-garden-app` against `firestore.indexes.json`, because `--force` deletes live indexes that aren't in the file.
  3. If the change is intended, run **Actions → Deploy prod → Run workflow** on `prod` with **force** ticked.

  Pushes never pass `--force`.

### Credentials and other one-time setup (already done for this project)

- **Credentials:** GitHub Actions signs in to Google Cloud with **Workload Identity Federation**, so no keys are stored in GitHub.
  - `vars.GCP_WIF_PROVIDER` is set at the repo level.
  - Each GitHub environment (`test`, `production`) has its own `vars.GCP_DEPLOY_SA` and accepts deploys only from its own branch.
- **Deploy targets** are exactly `hosting,firestore:rules,firestore:indexes,storage,functions`. **Never deploy `extensions`** from CI or by hand; that breaks the email extension's password wiring. A test fails if `extensions` appears in the prod workflow.
- **Cloud Billing API** is enabled so firebase-tools can confirm the Blaze plan when deploying functions.
- **Old images:** an Artifact Registry policy deletes function images older than 7 days but always **keeps the 2 newest per function**. Without that keep rule, the email extension's live image gets deleted.

## Operations

### Rotating the email (SMTP) password

Email goes out through Gmail as `southatxgarden@gmail.com`, using a Gmail **app password** stored in Secret Manager as `sacg-smtp-password`. If delivery fails with `535 BadCredentials`:

1. Signed in as southatxgarden@gmail.com, create a new app password at https://myaccount.google.com/apppasswords.
2. Add it as a **new version** of `sacg-smtp-password` in Secret Manager.
3. Roll the email function onto the new version. A new revision is needed because secrets are read when an instance starts:
   ```bash
   gcloud run services update ext-firestore-send-email-processqueue --region=us-central1 \
     --update-secrets=SMTP_PASSWORD=sacg-smtp-password:latest --revision-suffix=smtp-$(date +%Y%m%d%H%M) \
     --project=sacg-garden-app
   ```
4. Send yourself a test from the calendar's **Send RSVP invitations… → Send test**. Then check **Email → Recent emails**, or the `mail` document's `delivery.state`.

### The AI assistant's API key

The key is stored in Secret Manager as `ANTHROPIC_API_KEY`. Add a new version to rotate it; the functions pick it up within 10 minutes. If the assistant says it isn't set up, the secret has no enabled version.

## Local development

**Prerequisites:**
- Node 20+ (CI and the functions runtime use Node 22).
- Java 11+, for the Firestore emulator (CI uses 21).
- Firebase CLI: `npm i -g firebase-tools`.

```bash
npm install
cd functions && npm install && cd ..
cp .env.example .env.local      # PowerShell: Copy-Item .env.example .env.local
```

For local work, the placeholder `VITE_FB_*` values are fine, because the emulators don't validate them. Keep `VITE_USE_EMULATORS=true`.

```bash
npm run emulators   # terminal 1: Auth + Firestore + Hosting emulators
npm run dev         # terminal 2: Vite dev server
```

### Seed local data

With the emulators running, or wrapped as below:

```bash
firebase emulators:exec --only auth,firestore "npm run seed"
```

This creates sample accounts, all with the password `password`:

| Email | Role | Status |
|-------|------|--------|
| `admin@sacg.test` | admin | active |
| `treasurer@sacg.test` | admin | active |
| `rosa@sacg.test` | member | active (holds a plot) |
| `sam@sacg.test` | member | active (holds 7A) |
| `pat@sacg.test` | member | pending (waitlist) |
| `quinn@sacg.test` | member | pending (waitlist) |

### Tests and checks

```bash
npm test                  # app unit + component tests (jsdom, no emulator)
npm run test:rules        # Firestore security-rules tests (starts the emulator)
cd functions && npm test  # Cloud Functions tests (starts the emulator)
npm run build             # type-check + production build
npm run security:scan     # secrets / member PII / forbidden files in tracked files
npm run security:dist     # the same for the built bundle (after npm run build)
```

## Setting up a brand-new Firebase project (one time only)

These steps were done for `sacg-garden-app`. You only need them to stand up a separate copy.

1. Run `firebase login`, then `firebase use --add` to pick your project.
2. In the console, enable **Email/Password** and **Google** sign-in.
3. Add a Web App, and put its config in `.env.production` (`VITE_FB_*`, with `VITE_USE_EMULATORS=false`). The Firebase web API key is public by design.
4. Switch the project to the Blaze plan. Install the **Trigger Email** extension (`firebase/firestore-send-email`, mail collection `mail`), and store its SMTP password in Secret Manager. Add `ANTHROPIC_API_KEY` too, if you want the assistant.
5. Make the first deploy by hand (`npm run build` then `firebase deploy --only "hosting,firestore:rules,firestore:indexes,storage,functions"`). After that, wire up the pipeline credentials described above, and deploy only through the pipeline.
6. **Bootstrap the first admin:**
   1. Sign up on the deployed site.
   2. In Firestore, set your `members/{uid}` doc to `role: admin`, `status: active`.
   3. Reload. You can now approve everyone else from inside the app.

## Project structure

```
src/
  auth/            AuthProvider, guards (RequireAuth / RequireAdmin), sign-in/up
  components/      UI primitives, role-aware Layout, MemberPicker, EmailJobProgress
  features/        dashboard, plots, members, dues, calendar, rsvp, email, assistant,
                   analytics, forum, lounge, documents, polls, settings, …
  lib/             firebase init, callable helper, shared types, garden time (America/Chicago)
  logic/           pure functions (dues, hours, rsvp headcounts, analytics, …), unit tested
functions/src/
  email/           email job queue + throttled, resumable sender + audiences
  rsvp/            RSVP invite tokens + public RSVP callables
  assistant/       Claude tool loop, history, proposals, approve/test/reject execution
  lib/             admin guard, garden time
  index.ts         exported Cloud Functions (incl. waitlist alerts + duplicate auto-merge)
scripts/
  security/        repo + bundle scanners (secrets, member PII, forbidden files)
  smoke/           post-deploy smoke checks
  ci/              promotion guard + workflow guard tests
.github/           CI, CodeQL, deploy-test, deploy-prod workflows; Dependabot; PR template
test/rules/        Firestore security-rules tests
docs/              DEVELOPMENT.md (pipeline guide), design specs + implementation plans
```
