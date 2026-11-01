// Scan every git-tracked file for secrets, member PII and forbidden paths.
//   node scripts/security/scan-repo.mjs        (npm run security:scan)
// Prints `path:line rule excerpt` per finding (excerpts are redacted) and exits 1
// if there are any. Works from any directory inside the repository.

import { execFileSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { firebaseWebKey, formatFinding, readText, scanPath, scanText } from './patterns.mjs';

const LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml']);
// Deliberately leaky sample data for the scanner's own tests would live here.
const FIXTURES_PREFIX = 'scripts/security/fixtures/';

/** Lockfiles are integrity hashes, SVGs are path data: both are noise for these rules. */
const isSkipped = (relPath) =>
  LOCKFILES.has(basename(relPath)) || relPath.toLowerCase().endsWith('.svg') || relPath.startsWith(FIXTURES_PREFIX);

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

function main() {
  let root;
  let tracked;
  try {
    root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
    tracked = git(['ls-files', '-z'], root).split('\0').filter(Boolean);
  } catch (error) {
    console.error(`✗ could not list tracked files (is this a git repository?): ${error.message}`);
    return 1;
  }

  const opts = { allowedGoogleKeys: [firebaseWebKey()] };
  const findings = [];
  let scanned = 0;
  for (const relPath of tracked) {
    // Forbidden paths are reported even for files the content scan skips.
    findings.push(...scanPath(relPath));
    if (isSkipped(relPath)) continue;
    const text = readText(join(root, relPath));
    if (text === null) continue; // binary, or deleted from the working tree
    scanned++;
    findings.push(...scanText(text, relPath, opts));
  }

  for (const finding of findings) console.log(formatFinding(finding));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (findings.length > 0) {
    console.error(`✗ ${plural(findings.length, 'finding')} in ${plural(scanned, 'file')} scanned. The repo is public: remove it, do not allowlist real data.`);
    return 1;
  }
  console.log(`✓ scanned ${plural(scanned, 'file')}, no findings`);
  return 0;
}

process.exitCode = main();
