// Enforces the dev -> test -> prod promotion flow on pull requests (CI job `promotion-guard`).
//
//   node scripts/ci/promotion-guard.mjs <base-branch> <head-branch>
//
// Exit codes: 0 allowed, 1 blocked (reason on stderr), 2 bad usage.
//
// Rules:
//   base test  -> head must be `dev`  or `hotfix/*`
//   base prod  -> head must be `test` or `hotfix/*`
//   base dev   -> head may be anything except `test` / `prod` (work never flows backwards)
// A hotfix is back-merged by opening PRs from the hotfix branch itself into test and dev.
//
// Branch names are matched exactly and case-sensitively. They are attacker-controlled
// text on PRs from forks: this script only ever compares them, and the workflow passes
// them in through environment variables, never by splicing them into a shell command.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const isHotfix = (branch) => /^hotfix\/./.test(branch);

const allow = (reason) => ({ ok: true, reason });
const block = (reason) => ({ ok: false, reason });

/**
 * @param {string} base - branch the PR merges into
 * @param {string} head - branch the PR comes from
 * @returns {{ ok: boolean, reason: string }}
 */
export function checkPromotion(base, head) {
  switch (base) {
    case 'test':
      return head === 'dev' || isHotfix(head)
        ? allow(`"${head}" -> "${base}" is an allowed promotion`)
        : block(`PRs into "${base}" must come from "dev" or "hotfix/*", not "${head}". Merge into "dev" first, then open dev -> test.`);
    case 'prod':
      return head === 'test' || isHotfix(head)
        ? allow(`"${head}" -> "${base}" is an allowed promotion`)
        : block(`PRs into "${base}" must come from "test" or "hotfix/*", not "${head}". Promote through test first, then open test -> prod.`);
    case 'dev':
      return head === 'test' || head === 'prod'
        ? block(`PRs into "${base}" must not come from "${head}": work flows dev -> test -> prod, never backwards. To back-merge a hotfix, open the PR from the hotfix/* branch itself.`)
        : allow(`"${head}" -> "${base}" is allowed`);
    default:
      return allow(`no promotion rule for base "${base}" (head "${head}")`);
  }
}

function main(argv) {
  const [base, head] = argv;
  if (!base || !head) {
    console.error('usage: node scripts/ci/promotion-guard.mjs <base-branch> <head-branch>');
    return 2;
  }
  const { ok, reason } = checkPromotion(base, head);
  if (ok) {
    console.log(`✓ ${reason}`);
    return 0;
  }
  console.error(`✗ ${reason}`);
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}
