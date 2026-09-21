# Ghost-member cleanup

> **⚠️ SUPERSEDED — do not run `--commit` without careful review.** The duplicate problem
> this script targets was already solved in production (2026-07-11) by in-app reconciliation
> (`a311aea`): a Cloud Function auto-merges **verified** sign-ins into their roster stub, and
> the Waitlist page's **"Approve & merge"** covers unverified ones. The remaining `uid: null`
> roster-stub members are **intentional** — they hold plots via `holderMemberId` until each
> person signs in; deleting them would orphan those plots. This script also matches
> ghost → real by **email alone**, so it could hand a stub's plot to an *unverified* password
> signup — exactly the case the Cloud Function's verified-identity guard exists to block.
> Kept for reference; a dry run is harmless.

One-off admin migration to remove the Excel-imported **ghost** member profiles and hand
their plots to the **real** account each person created when they signed up (mostly July 2026).

> **Schema status:** the `CONFIG` block has been matched to this app's real schema
> (`src/lib/types.ts`, `src/data/collections.ts`) — collections `members` / `plots` /
> `directory`, name field `displayName`, and the three plot holder fields below.

## What it does
- **Ghost** = a member (`role: 'member'`) created on **2026-05-31**, excluding **Brandon Ellis**.
- **Match** ghost → real by **exact email** (case-insensitive). The real account is a
  non-ghost member doc with the same email.
- **Reassign** every plot the ghost primarily holds, keeping all three holder fields in sync:
  `holderMemberId` → real's id, `holderName` → real's `displayName`, and the ghost's id is
  swapped for the real id inside `holderMemberIds` (deduped).
- **Co-holder plots** (ghost appears only in `holderMemberIds` on someone else's plot):
  the id is swapped in place; the primary holder is untouched.
- **Delete** the ghost's Firestore profile doc **and** its Members Lounge `directory/{id}`
  mirror (Firebase **Auth is left alone**).
- **No match / ambiguous / real already primarily holds a plot →** the ghost is **skipped
  and reported**, never silently deleted and its plot never orphaned. (Co-holder swaps are
  exempt from the second-plot rule — they preserve shared access rather than grant a plot.)

## ⚠️ Safety first — it's dry-run by default
Nothing is written unless you pass `--commit`.

```bash
cd member-cleanup
npm install

# 1) authenticate (pick one)
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
#    …or drop the file here as ./serviceAccount.json  (already .gitignored)

# 2) DRY RUN — prints the full plan + writes report-dryrun.json, changes nothing
npm run dryrun

# 3) review the plan carefully, then BACK UP / EXPORT Firestore
#    gcloud firestore export gs://<your-bucket>/backups/pre-ghost-cleanup

# 4) COMMIT — performs reassignments + deletions, writes report-commit.json
npm run commit
```

## CONFIG ↔ real schema (already applied)

| CONFIG key | Value | Source |
|---|---|---|
| `membersCollection` / `plotsCollection` | `members` / `plots` | `src/data/collections.ts` |
| `directoryCollection` | `directory` | Members Lounge mirror, doc id = member id |
| `fields.name` | `displayName` | `Member.displayName` |
| `plotPrimaryHolderField` | `holderMemberId` | primary holder, drives dues attribution |
| `plotHolderArrayField` | `holderMemberIds` | all holders incl. primary (access source of truth) |
| `plotHolderNameField` | `holderName` | denormalized display name on the plot |
| `memberIdFields` | `['uid']` | Excel-import ghosts have `uid: null`; real doc id = auth uid |
| `ghostDate` / `ghostTimezone` | `2026-05-31` / `America/Chicago` | import day, Austin time |

**Sanity check:** the dry run prints `Ghost candidates: N`. If N isn't roughly the number of
accounts you imported from Excel, stop and fix the filters/field names before committing.

## Notes
- `serviceAccount.json` and `report-*.json` are git-ignored (never commit credentials).
- Idempotent-ish: once ghosts are deleted, a re-run finds nothing to do.
