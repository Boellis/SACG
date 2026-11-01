# Development workflow

How code gets from your laptop to the live garden app, and what protects it on the way.
Read this before your first PR. The short version: **work lands on `dev`, is promoted to `test`, then to `prod`, and `prod` deploys itself.**

> **This repository is public.** Everything committed, including history, is readable by anyone. Never commit member data or credentials. See [Never commit roster data or secrets](#never-commit-roster-data-or-secrets).

## Branches

| Branch | Purpose | What happens when it changes |
|--------|---------|------------------------------|
| `dev` | Integration. The default branch; both developers push or merge feature branches here. | CI runs. Nothing deploys. |
| `test` | Pre-production. | CI, then the Hosting build is published to the **preview channel** `test` and smoke-checked. |
| `prod` | Live at https://sacg-garden-app.web.app. | CI, then **everything** is deployed (Hosting, Firestore rules and indexes, Storage rules, Functions) and smoke-checked. |

`main` is retired. Don't use it.

`test` and `prod` are protected: changes arrive only through a pull request with **1 approving review** and green required checks, and no force-pushes. `dev` accepts direct pushes (CI still runs on every push).

Merge pull requests with a **merge commit** so the three branches keep identical commits.

## The daily flow

1. **Branch from `dev`:** `git switch dev && git pull && git switch -c feature/short-name`.
2. **Build it, with tests.** Run the [local commands](#local-commands) below before you push.
3. **Land it on `dev`:** open a PR into `dev` (or, for something small, push straight to `dev`). CI runs either way.
4. **Promote to `test`:** when `dev` has something worth sharing, open a PR **`dev` → `test`**. It needs an approval and green checks. After the merge, the *Deploy test* workflow publishes a preview and prints its URL in the run summary.
5. **Check the preview.** Open the URL and click through your change. **The preview uses the production Firebase project and its real data**, so don't create junk records.
6. **Promote to `prod`:** open a PR **`test` → `prod`**, get it approved, merge. The *Deploy prod* workflow runs CI, deploys, runs the smoke checks against the live site, and rolls Hosting back if they fail.
7. **Watch the run** in the Actions tab until it is green.

The `promotion-guard` check enforces the order: a PR into `test` must come from `dev` (or a `hotfix/*` branch), and a PR into `prod` must come from `test` (or a `hotfix/*` branch). If it fails, you opened the PR from the wrong branch.

## What the checks do, and how to fix a failure

These run on every PR and every push to `dev`, `test` and `prod`. The first six are **required** for merging into `test` and `prod`.

| Check | What it does | If it fails |
|-------|--------------|-------------|
| `build-and-test` | `npm ci`, `npm run build` (type-check + production build), `npm test`. | Run `npm run build` and `npm test` locally and fix what they report. |
| `functions` | Builds the Cloud Functions and runs their tests against the emulators. | `cd functions && npm ci && npm run build && npm test`. Needs Java 21 and `npm i -g firebase-tools@14.9.0`. |
| `firestore-rules` | `npm run test:rules`: the security-rules matrix against the Firestore emulator. | Run it locally. Any change to `firestore.rules` needs a rules test. |
| `security-scan` | (1) gitleaks over the **entire git history**. (2) `npm run security:scan`: secrets, member emails and phone numbers, and forbidden files (rosters, keys) in every tracked file. (3) `npm audit --omit=dev --audit-level=high` for the app and for `functions/`. | A *finding*: remove it, then read the next section. An *audit* failure: run `npm audit fix` (never `--force`) and upgrade within the pinned majors (React 18, Firebase 10, Recharts 2, react-three-fiber 8). |
| `bundle-scan` | Scans the built `dist/` bundle for the same things, and fails on any source map. | `npm run build && npm run security:dist` shows which file and rule. |
| `promotion-guard` | Pull requests only. Enforces `dev` → `test` → `prod`. | Re-open the PR from the right branch. |
| *CodeQL* | Static analysis of the JS/TS code (PRs, pushes, weekly). Results appear under Security → Code scanning. | Fix the alert, or dismiss it with a reason if it is a false positive. |

Dependabot opens weekly update PRs against `dev`.

After a deploy, `scripts/smoke/smoke.mjs` checks the live site: sensitive paths return only the app shell, every served script and stylesheet is clean, no source maps, the security headers are present, anonymous users cannot list any Firestore collection or Storage, and the callable functions reject anonymous callers. Run it yourself any time:

```bash
node scripts/smoke/smoke.mjs --url https://sacg-garden-app.web.app
```

## Emergency hotfix

When production is broken and the normal flow is too slow:

1. Branch from `prod`: `git switch prod && git pull && git switch -c hotfix/short-name`.
2. Fix it, push, and open a PR **into `prod`**. It still needs an approval and green checks.
3. After it deploys, **back-merge** by opening PRs from the *same* `hotfix/short-name` branch into `test` and into `dev`. (Don't merge `prod` into them; the guard allows hotfix branches for exactly this reason.) If there are conflicts, merge `test` or `dev` into the hotfix branch first.

## Rollback

- **Hosting** rolls back automatically when the smoke checks fail after a production deploy: the previously live version is released again and the run fails. To roll back by hand: Firebase console → Hosting → release history → *Rollback*.
- **Firestore rules and indexes, Storage rules, Functions** are *not* rolled back automatically. `git revert` the offending change on a branch and send it through the normal flow (as a hotfix if it is urgent).

## Never commit roster data or secrets

The garden's roster is real people's names, emails and phone numbers. Real member data lives **only in Firestore**.

- Never commit rosters or exports (`members_list*.txt`, CSV/XLSX, backups, generated reports), service-account JSON, `.env.local`, API keys or private keys. They are gitignored, and `npm run security:scan` and gitleaks reject them if one slips through.
- In tests, docs and seed data use obviously fake values: `@example.com` addresses, `555-` phone numbers, invented names.
- The scanners allow only: the garden's own address, the public Firebase web API key, and fake or test values. **If a check flags something, treat it as real.** Don't widen an allowlist (`scripts/security/patterns.mjs`, `.gitleaks.toml`) to make a failure go away; ask Brandon.
- **If you already pushed something sensitive**, tell Brandon right away. Deleting it in a later commit does not remove it from history; credentials must be rotated and history rewritten.

## Local commands

```bash
npm test                  # unit and component tests (no emulator needed)
npm run test:rules        # Firestore security-rules tests (needs Java + firebase-tools)
cd functions && npm test  # Cloud Functions tests (needs Java + firebase-tools)
npm run build             # type-check + production build
npm run security:scan     # secrets, member PII and forbidden files in tracked files
npm run security:dist     # the same for the built bundle (run after npm run build)
npm run emulators         # Auth + Firestore + Hosting emulators (see README)
```

## Maintainer notes

- **Credentials are keyless.** GitHub Actions authenticates to Google Cloud through Workload Identity Federation; no key is stored anywhere. Each GitHub environment (`test`, `production`) has its own variables `GCP_WIF_PROVIDER` and `GCP_DEPLOY_SA` (a different service account per environment), and each environment only accepts deploys from its own branch.
- **First rollout only.** The preview is deployed before the callable functions exist in production. Until the first `prod` deploy has gone out, set the repository variable `SMOKE_SKIP_FUNCTIONS` to `true` so the preview's smoke checks skip the callable probes, then **delete the variable**. `prod` always checks them.
- **Never deploy `extensions` from CI.** It would drop the SMTP secret wiring of the Trigger Email extension. The deploy target list in `deploy-prod.yml` is deliberate, and a test (`scripts/ci/workflows.test.mjs`) fails if `extensions` appears.
- **Dependency overrides.** `package.json` pins `undici` and `@grpc/grpc-js` through `overrides`. Firebase 10.14.1 (the last v10 release) pins vulnerable versions of both, and `npm audit` gates CI. Neither ships to browsers (they only run under Node: the seed script and the rules tests). Remove the overrides when the app moves to a newer Firebase SDK.
- **The required checks are matched by name.** If you rename a job in `.github/workflows/ci.yml`, update the branch-protection rules at the same time.
