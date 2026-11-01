## What and why

<!-- One or two sentences. Link the request or issue if there is one. -->

## How it was tested

<!-- For example: `npm test`, tried it against the emulators, opened the test preview URL. -->

## Checklist

- [ ] No member data (names, emails, phone numbers, rosters) and no secrets in this PR. **This repository is public.**
- [ ] `npm test` and `npm run build` pass locally (CI runs them again)
- [ ] Changes to `firestore.rules` or `storage.rules` come with a rules test (`npm run test:rules`)
- [ ] Docs updated if behavior or the dev workflow changed (`docs/DEVELOPMENT.md`)

### Promotion PRs only (`dev` to `test`, then `test` to `prod`)

- [ ] Opened from the right branch (the `promotion-guard` check enforces this)
- [ ] `test` to `prod`: I opened the preview URL from the latest test deploy and clicked through the change
