# Ghost-member cleanup

One-off admin migration to remove the Excel-imported **ghost** member profiles and hand
their plots to the **real** account each person created when they signed up (mostly July 2026).

## What it does
- **Ghost** = a member (`role: 'member'`) created on **2026-05-31**, excluding **Brandon Ellis**.
- **Match** ghost → real by **exact email** (case-insensitive). The real account is a
  non-ghost member doc with the same email.
- **Reassign** every plot the ghost holds to the matched real account.
- **Delete** the ghost's Firestore profile doc (Firebase **Auth is left alone**).
- **No match / ambiguous / real already has a plot →** the ghost is **skipped and reported**,
  never silently deleted and its plot never orphaned.

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

## Before you `--commit`: confirm the schema
The script can't know your field names, so check the `CONFIG` block at the top of
`cleanup-ghost-members.mjs` against the real app:

| CONFIG key | Confirm it matches |
|---|---|
| `membersCollection` | the members/users/profiles collection name |
| `plotsCollection` | the plots collection name |
| `fields.email / name / role / createdAt` | the member field names |
| `plotHolderFields` | the field a **plot** uses to reference its holder (uid vs member-id) |
| `memberIdFields` | any id besides the doc id a plot's holder value could equal (`uid`, `authUid`) |
| `ghostDate` / `ghostTimezone` | 2026-05-31 in the right timezone (default America/Chicago) |

**Sanity check:** the dry run prints `Ghost candidates: N`. If N isn't roughly the number of
accounts you imported from Excel, stop and fix the filters/field names before committing.

## Notes
- If plots are tracked on the **member** side (e.g. `member.plotId`) rather than a `plots`
  collection, tell Claude to adapt the reassignment (copy the plot field ghost→real) — the
  current script reassigns via the `plots` collection.
- `serviceAccount.json` and `report-*.json` are git-ignored (never commit credentials).
- Idempotent-ish: once ghosts are deleted, a re-run finds nothing to do.
