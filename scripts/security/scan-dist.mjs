// Scan the built bundle before (or after) it ships.
//   node scripts/security/scan-dist.mjs dist   (npm run security:dist)
// Fails on secrets, member PII, forbidden files, any Google API key other than the
// public Firebase web key, and on ANY source map (maps republish our source).
// Prints `path:line rule excerpt` per finding (excerpts are redacted); exits 1 on findings.

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { firebaseWebKey, formatFinding, readText, scanPath, scanText } from './patterns.mjs';

function* walk(dir, prefix = '') {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) yield* walk(join(dir, entry.name), rel);
    else yield rel;
  }
}

function main() {
  const dir = (process.argv[2] ?? 'dist').replace(/[\\/]+$/, '');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`✗ ${dir}/ not found. Run "npm run build" first.`);
    return 1;
  }

  const opts = { allowedGoogleKeys: [firebaseWebKey()] };
  const findings = [];
  let scanned = 0;
  for (const rel of walk(dir)) {
    const shown = `${dir}/${rel}`;
    findings.push(...scanPath(rel).map((finding) => ({ ...finding, path: shown })));
    if (rel.endsWith('.map')) {
      findings.push({ path: shown, line: 0, rule: 'source-map', excerpt: '' });
      continue;
    }
    if (rel.toLowerCase().endsWith('.svg')) continue;
    const text = readText(join(dir, rel));
    if (text === null) continue; // binary (fonts, images, ...)
    scanned++;
    findings.push(...scanText(text, shown, opts));
  }

  for (const finding of findings) console.log(formatFinding(finding));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (findings.length > 0) {
    console.error(`✗ ${plural(findings.length, 'finding')} in ${dir}/ (${plural(scanned, 'file')} scanned). Do not deploy this build.`);
    return 1;
  }
  console.log(`✓ ${dir}/: scanned ${plural(scanned, 'file')}, no findings`);
  return 0;
}

process.exitCode = main();
