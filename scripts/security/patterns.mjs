// Shared rules for the repo and bundle scanners (scan-repo.mjs, scan-dist.mjs).
//
// The GitHub repo is PUBLIC and the deployed bundle is world-readable, so these
// rules guard two kinds of leak: credentials, and member PII (the roster).
// Everything here is plain regex + allowlists: no dependencies, runs on bare Node.
//
// Reviewing a change to this file? Widening an allowlist is a security decision.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @typedef {{ path: string, line: number, rule: string, excerpt: string }} Finding
 *   `line` is 1-based, or 0 for findings about a path rather than file content.
 *   `excerpt` is redacted to the first 4 characters + an ellipsis; never the full match.
 */

// The rule regexes deliberately have no `g` flag so callers can .test() them
// repeatedly without lastIndex surprises. The scanner makes global clones.

/** @type {Array<{ id: string, re: RegExp }>} */
export const SECRET_RULES = [
  { id: 'anthropic', re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: 'private-key-block', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'service-account-private-key', re: /"private_key"\s*:/ },
  { id: 'service-account-type', re: /"type"\s*:\s*"service_account"/ },
  { id: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { id: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/ },
  { id: 'slack-token', re: /xox[abpr]-/ },
  // The only Google API key allowed anywhere is the public Firebase web key (see firebaseWebKey()).
  { id: 'google-api-key', re: /AIza[0-9A-Za-z_-]{35}/ },
];

/** @type {Array<{ id: string, re: RegExp }>} */
export const PII_RULES = [
  // The lookbehind pins matches to the start of an address-looking run, which keeps
  // scanning linear on multi-megabyte minified lines (no quadratic backtracking).
  {
    id: 'email',
    re: /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/,
  },
  // North American numbers written with separators or parentheses. Bare 10-digit
  // runs (ids, timestamps) are not flagged, and area codes / exchanges must be
  // valid NANP (2-9 first digit), so placeholders like 123-456-7890 are ignored.
  {
    id: 'phone',
    re: /(?<![\d-])(?:\+?1[ .-])?(?:\([2-9]\d{2}\)[ .-]?|[2-9]\d{2}[ .-])[2-9]\d{2}[ .-]?\d{4}(?!\d)/,
  },
];

/** Email domains that are fake or ours. A subdomain of an entry is allowed too. */
export const ALLOWED_EMAIL_DOMAINS = [
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'x.com',
  'sacg.test',
  'test',
  'sacg-garden-app.web.app',
];

/** Individual real addresses that may appear in the repo: the garden's and the maintainer's. */
export const ALLOWED_EMAILS = [
  'southatxgarden@gmail.com',
  'bellis.swe@gmail.com',
  'noreply@anthropic.com',
];

// Paths that must never be tracked or deployed. Tested against forward-slash paths.
// Keep these flag-free apart from `i` (no `g`) so .test() is stateless.
/** @type {RegExp[]} */
export const FORBIDDEN_PATHS = [
  /members_list/i,
  /^(?!scripts\/security\/fixtures\/).*\.csv$/i,
  /serviceAccount.*\.json$/i,
  /-firebase-adminsdk-.*\.json$/i,
  /\.(pem|p12|key)$/i,
  /(^|\/)\.env$/i,
  /\.env\.local$/i,
  /\.env\.[\w-]+\.local$/i, // .env.production.local, .env.development.local, ...
  /\.secret\.local$/i,
  /backup-.*\.json$/i,
  /report-.*\.json$/i,
];

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * The public Firebase web API key from `.env.production`. It is a client
 * identifier (access is enforced by Auth + security rules), so it is the one
 * Google API key the scanners tolerate. Returns '' when it can't be read, in
 * which case no key is allowed.
 * @param {string} [envPath]
 */
export function firebaseWebKey(envPath = join(REPO_ROOT, '.env.production')) {
  let text;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    return '';
  }
  const match = text.match(/^[ \t]*VITE_FB_API_KEY[ \t]*=[ \t]*(.*?)[ \t]*\r?$/m);
  if (!match) return '';
  return match[1].replace(/^(["'])(.*)\1$/, '$2');
}

const globalClone = (re) => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
const SECRET_SCANNERS = SECRET_RULES.map(({ id, re }) => ({ id, re: globalClone(re) }));
const PII_SCANNERS = PII_RULES.map(({ id, re }) => ({ id, re: globalClone(re) }));

const redact = (match) => `${match.slice(0, 4)}…`;

function isAllowedEmail(address) {
  const lower = address.toLowerCase();
  if (ALLOWED_EMAILS.includes(lower)) return true;
  const domain = lower.slice(lower.lastIndexOf('@') + 1);
  return ALLOWED_EMAIL_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

// 555 is the reserved fictional prefix: 555-xxx-xxxx as the leading group, or xxx-555-xxxx.
function isAllowedPhone(number) {
  let digits = number.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return digits.slice(0, 3) === '555' || digits.slice(3, 6) === '555';
}

const PII_ALLOWED = { email: isAllowedEmail, phone: isAllowedPhone };

/**
 * Scan file contents for secrets and member PII.
 * @param {string} text
 * @param {string} path - reported in findings only
 * @param {{ allowedGoogleKeys?: string[] }} [opts]
 * @returns {Finding[]}
 */
export function scanText(text, path, opts = {}) {
  const allowedKeys = new Set(opts.allowedGoogleKeys ?? []);
  const findings = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    for (const { id, re } of SECRET_SCANNERS) {
      for (const m of line.matchAll(re)) {
        if (id === 'google-api-key') {
          // Allowed only as an exact token: not as the prefix of a longer one.
          const next = line[m.index + m[0].length];
          const exact = next === undefined || !/[0-9A-Za-z_-]/.test(next);
          if (exact && allowedKeys.has(m[0])) continue;
        }
        findings.push({ path, line: lineNo, rule: id, excerpt: redact(m[0]) });
      }
    }

    // Percent-encoded "@" (mailto:jane%40..., SMTP URIs) must not hide an address.
    const decoded = line.includes('%') ? line.replace(/%40/gi, '@') : line;
    for (const { id, re } of PII_SCANNERS) {
      for (const m of decoded.matchAll(re)) {
        if (PII_ALLOWED[id](m[0])) continue;
        findings.push({ path, line: lineNo, rule: id, excerpt: redact(m[0]) });
      }
    }
  }
  return findings;
}

/**
 * Check a repo- or dist-relative path against FORBIDDEN_PATHS.
 * @param {string} path
 * @returns {Finding[]}
 */
export function scanPath(path) {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  return FORBIDDEN_PATHS.some((re) => re.test(normalized))
    ? [{ path, line: 0, rule: 'forbidden-path', excerpt: '' }]
    : [];
}

/**
 * Read a file for scanning. Returns null for binary files (a NUL byte in the
 * first 8 KB, like git's own heuristic) and for files that vanished since they
 * were listed, so callers only count and scan real text.
 * @param {string} absPath
 * @returns {string | null}
 */
export function readText(absPath) {
  let buffer;
  try {
    buffer = readFileSync(absPath);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  return buffer.subarray(0, 8000).includes(0) ? null : buffer.toString('utf8');
}

/** `path:line rule excerpt`, the line format both CLIs print. */
export const formatFinding = ({ path, line, rule, excerpt }) =>
  `${path}:${line} ${rule}${excerpt ? ` ${excerpt}` : ''}`;
