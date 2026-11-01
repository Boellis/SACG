// Post-deploy smoke checks (spec section 3). They prove the live site serves no secrets or
// member data, and that anonymous visitors cannot read anything they should not.
//
//   node scripts/smoke/smoke.mjs --url <base> [--project sacg-garden-app] [--skip-functions]
//                                [--attempts 1] [--retry-delay 10]
//
// Read-only: GET requests, anonymous Firestore/Storage list requests (which must be
// refused), and three callable probes that must be refused or find nothing. No
// credentials are sent. Prints a table and exits 1 if any check fails.
//
//   --skip-functions   skip the callable checks (first rollout only: the test preview is
//                      deployed before the functions exist)
//   --attempts N       re-run the whole suite up to N times while anything fails, to ride
//                      out a deploy that is still propagating. A check that never turns
//                      green still fails the run.

import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firebaseWebKey, formatFinding, scanText } from '../security/patterns.mjs';
import {
  assetUrls,
  callableErrorStatus,
  callableRejectsAnon,
  chunkUrls,
  expectDenied,
  isSourceMap,
  isSpaShell,
  leakMarkers,
  sensitivePathOk,
} from './checks.mjs';

export const FIRESTORE_COLLECTIONS = [
  'members', 'mail', 'settings', 'events', 'plots', 'directory', 'announcements', 'documents',
  'polls', 'threads', 'conversations', 'volunteerHours', 'rsvpInvites', 'emailJobs',
  'assistantThreads', 'assistantUsage',
];

export const SENSITIVE_PATHS = [
  '/.env', '/.env.production', '/.env.local', '/members_list.txt', '/firebase.json',
  '/firestore.rules', '/.firebaserc', '/package.json', '/functions/src/index.ts',
  '/.git/config', '/serviceAccount.json',
];

// Client-side routes: Hosting must answer all of them with the app shell.
export const SPA_ROUTES = ['/', '/signin', '/signup', '/calendar', '/rsvp/smoke-bogus-token'];

// Must match the `**` headers in firebase.json (a test keeps the two in sync).
export const EXPECTED_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};
const HEADER_LABELS = {
  'x-content-type-options': 'X-Content-Type-Options',
  'referrer-policy': 'Referrer-Policy',
  'permissions-policy': 'Permissions-Policy',
};

const FUNCTIONS_REGION = 'us-central1';
const BOGUS_INVITE_TOKEN = 'smoke-bogus-token';
const MAX_ASSETS = 100; // safety net against a crawl that never ends
const REQUEST_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 20_000;

const defaultSleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function http(fetchImpl, sleep, url, init = {}) {
  let lastError;
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt++) {
    try {
      const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), ...init });
      const body = await response.text();
      if (response.status >= 500 && attempt < REQUEST_ATTEMPTS) {
        await sleep(1000 * attempt); // transient, try again
        continue;
      }
      return { status: response.status, headers: response.headers, body };
    } catch (error) {
      lastError = error;
      if (attempt < REQUEST_ATTEMPTS) await sleep(1000 * attempt);
    }
  }
  throw lastError;
}

/**
 * Run every check once.
 * @returns {Promise<Array<{ group: string, name: string, status: 'pass'|'fail'|'skip', detail: string }>>}
 */
export async function runSmoke({
  baseUrl,
  project = 'sacg-garden-app',
  apiKey,
  allowedGoogleKeys = [apiKey],
  skipFunctions = false,
  fetchImpl = globalThis.fetch,
  sleep = defaultSleep,
}) {
  const base = baseUrl.replace(/\/+$/, '');
  const rows = [];
  const getCache = new Map();

  // GETs are memoized for the run: each page and asset is fetched once however many checks read it.
  const get = (url) => {
    if (!getCache.has(url)) getCache.set(url, http(fetchImpl, sleep, url));
    return getCache.get(url);
  };
  const post = (url, data) =>
    http(fetchImpl, sleep, url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data }),
    });

  const check = async (group, name, run) => {
    try {
      const { ok, detail = '' } = await run();
      rows.push({ group, name, status: ok ? 'pass' : 'fail', detail });
    } catch (error) {
      rows.push({ group, name, status: 'fail', detail: `error: ${error.message}` });
    }
  };
  const skip = (group, name, detail) => rows.push({ group, name, status: 'skip', detail });

  // --- the app and its client-side routes -------------------------------------------------
  for (const route of SPA_ROUTES) {
    await check('site', `GET ${route} serves the app shell`, async () => {
      const { status, body } = await get(`${base}${route}`);
      const markers = leakMarkers(body);
      const ok = status === 200 && isSpaShell(body) && markers.length === 0;
      if (ok) return { ok, detail: 'app shell' };
      return { ok, detail: `HTTP ${status}${isSpaShell(body) ? '' : ', not the app shell'}${markers.length ? `, contains ${markers.join(' ')}` : ''}` };
    });
  }

  // --- files that must never be served ----------------------------------------------------
  for (const path of SENSITIVE_PATHS) {
    await check('paths', `GET ${path} serves no file`, async () => {
      const { status, body } = await get(`${base}${path}`);
      const markers = leakMarkers(body);
      const ok = sensitivePathOk(status, body);
      if (ok) return { ok, detail: isSpaShell(body) ? 'app shell only' : `HTTP ${status}` };
      return { ok, detail: `HTTP ${status}${markers.length ? `, contains ${markers.join(' ')}` : ', not the app shell'}` };
    });
  }

  // --- every served script and stylesheet, including lazily loaded chunks -----------------
  const assets = await discoverAssets(base, get);
  await check('assets', 'Assets found in index.html', async () => ({
    ok: assets.initial.length > 0,
    detail: assets.initial.length
      ? `${assets.initial.length} referenced, ${assets.all.length - assets.initial.length} lazy chunks`
      : 'index.html references no scripts or stylesheets, so the bundle cannot be verified',
  }));
  if (assets.initial.length === 0) {
    skip('assets', 'Assets contain no secrets or member PII', 'no assets found');
    skip('assets', 'No source maps are served', 'no assets found');
  } else {
    await check('assets', 'Assets contain no secrets or member PII', async () => {
      const findings = [];
      const unavailable = [];
      for (const url of assets.all) {
        const { status, body } = await get(url);
        const path = new URL(url).pathname;
        if (status !== 200 || isSpaShell(body)) unavailable.push(`${path} (HTTP ${status}${isSpaShell(body) ? ', served the app shell' : ''})`);
        else findings.push(...scanText(body, path, { allowedGoogleKeys }));
      }
      const problems = [...unavailable.map((u) => `unavailable: ${u}`), ...findings.map(formatFinding)];
      if (problems.length === 0) return { ok: true, detail: `scanned ${assets.all.length} assets` };
      const shown = problems.slice(0, 5).join('; ');
      return { ok: false, detail: problems.length > 5 ? `${shown}; +${problems.length - 5} more` : shown };
    });

    await check('assets', 'No source maps are served', async () => {
      const offenders = [];
      for (const url of assets.all) {
        const path = new URL(url).pathname;
        const { body } = await get(url);
        if (/\/[/*][#@]\s*sourceMappingURL=/.test(body)) offenders.push(`${path} advertises a source map`);
        const map = await get(`${url}.map`);
        if (map.status === 200 && isSourceMap(map.body)) offenders.push(`${path}.map is served`);
      }
      return { ok: offenders.length === 0, detail: offenders.length ? offenders.join('; ') : `checked ${assets.all.length} assets` };
    });
  }

  // --- response headers -------------------------------------------------------------------
  const headerCheck = async (path, name) => {
    const expected = EXPECTED_HEADERS[name];
    await check('headers', `${HEADER_LABELS[name]} header on ${path}`, async () => {
      const { headers } = await get(`${base}${path}`);
      const actual = (headers.get(name) ?? '').trim();
      if (actual.toLowerCase() === expected.toLowerCase()) return { ok: true, detail: actual };
      return { ok: false, detail: actual ? `got "${actual}", expected "${expected}"` : `missing (expected "${expected}")` };
    });
  };
  for (const name of Object.keys(EXPECTED_HEADERS)) await headerCheck('/', name);
  const entryScript = assets.initial.find((url) => /\.m?js$/i.test(new URL(url).pathname));
  if (entryScript) await headerCheck(new URL(entryScript).pathname, 'x-content-type-options');

  // --- anonymous data access --------------------------------------------------------------
  for (const collection of FIRESTORE_COLLECTIONS) {
    await check('firestore', `Firestore list ${collection} is denied`, async () => {
      const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collection}?pageSize=1&key=${apiKey}`;
      const { status, body } = await get(url);
      const ok = expectDenied(status, body);
      return { ok, detail: ok ? `HTTP ${status} permission denied` : `HTTP ${status}: anonymous list was not refused` };
    });
  }

  await check('storage', 'Storage list documents/ is denied', async () => {
    const url = `https://firebasestorage.googleapis.com/v0/b/${project}.firebasestorage.app/o?prefix=documents%2F&maxResults=1`;
    const { status, body } = await get(url);
    const ok = expectDenied(status, body);
    return { ok, detail: ok ? `HTTP ${status} permission denied` : `HTTP ${status}: anonymous list was not refused` };
  });

  // --- callable functions -----------------------------------------------------------------
  const callableUrl = (name) => `https://${FUNCTIONS_REGION}-${project}.cloudfunctions.net/${name}`;
  const anonymousChecks = ['assistantChat', 'queueMemberEmail'];
  const functionsSkipped = 'skipped (--skip-functions)';

  for (const name of anonymousChecks) {
    const label = `${name} rejects anonymous calls`;
    if (skipFunctions) {
      skip('functions', label, functionsSkipped);
      continue;
    }
    await check('functions', label, async () => {
      const { status, body } = await post(callableUrl(name), {});
      const ok = callableRejectsAnon(status, body);
      return { ok, detail: `HTTP ${status}${callableErrorStatus(body) ? ` ${callableErrorStatus(body)}` : ''}` };
    });
  }

  const inviteLabel = 'rsvpGetInvite with a bogus token is NOT_FOUND';
  if (skipFunctions) {
    skip('functions', inviteLabel, functionsSkipped);
  } else {
    await check('functions', inviteLabel, async () => {
      const { status, body } = await post(callableUrl('rsvpGetInvite'), { token: BOGUS_INVITE_TOKEN });
      const error = callableErrorStatus(body);
      return { ok: error === 'NOT_FOUND', detail: `HTTP ${status}${error ? ` ${error}` : ''}` };
    });
  }

  return rows;
}

/** Breadth-first crawl: index.html's assets first, then any chunks their code points to. */
async function discoverAssets(base, get) {
  const home = await get(`${base}/`).catch(() => null);
  const initial = home ? assetUrls(home.body, base) : [];
  const all = [...initial];
  for (let i = 0; i < all.length && all.length < MAX_ASSETS; i++) {
    if (!/\.m?js$/i.test(new URL(all[i]).pathname)) continue;
    const { body } = await get(all[i]).catch(() => ({ body: '' }));
    for (const url of chunkUrls(body, base)) if (!all.includes(url) && all.length < MAX_ASSETS) all.push(url);
  }
  return { initial, all };
}

/** Run the suite, re-running it while anything fails, up to `attempts` times. */
export async function runSmokeWithRetries(options, { attempts = 1, delaySeconds = 10, wait = (s) => defaultSleep(s * 1000), onRetry } = {}) {
  let rows;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    rows = await runSmoke(options);
    const { failed } = summarize(rows);
    if (failed === 0 || attempt === attempts) break;
    onRetry?.({ attempt, attempts, failed, delaySeconds });
    await wait(delaySeconds);
  }
  return rows;
}

export function summarize(rows) {
  const count = (status) => rows.filter((row) => row.status === status).length;
  return { passed: count('pass'), failed: count('fail'), skipped: count('skip') };
}

export function formatTable(rows) {
  const marks = { pass: '✓', fail: '✗', skip: '-' };
  const width = Math.max(0, ...rows.map((row) => row.name.length));
  const lines = rows.map((row) => `${marks[row.status]}  ${row.name.padEnd(width)}  ${row.detail}`.trimEnd());
  const { passed, failed, skipped } = summarize(rows);
  return [...lines, '', `${passed} passed, ${failed} failed, ${skipped} skipped`].join('\n');
}

/** Parse command-line flags. Throws a readable Error for anything invalid. */
export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    options: {
      url: { type: 'string' },
      project: { type: 'string', default: 'sacg-garden-app' },
      'skip-functions': { type: 'boolean', default: false },
      attempts: { type: 'string', default: '1' },
      'retry-delay': { type: 'string', default: '10' },
    },
  });
  if (!values.url) throw new Error('--url <base url> is required');
  let url;
  try {
    url = new URL(values.url);
  } catch {
    throw new Error(`--url "${values.url}" is not a valid URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname.replace(/\/+$/, '') !== '') {
    throw new Error(`--url must be a site root such as https://sacg-garden-app.web.app, got "${values.url}"`);
  }
  const attempts = Number(values.attempts);
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error('--attempts must be a whole number, 1 or more');
  const delaySeconds = Number(values['retry-delay']);
  if (!Number.isFinite(delaySeconds) || delaySeconds < 0) throw new Error('--retry-delay must be a number of seconds, 0 or more');
  return { baseUrl: url.origin, project: values.project, skipFunctions: values['skip-functions'], attempts, delaySeconds };
}

async function main(argv) {
  let options;
  try {
    options = parseCli(argv);
  } catch (error) {
    console.error(`${error.message}\nusage: node scripts/smoke/smoke.mjs --url <base> [--project sacg-garden-app] [--skip-functions] [--attempts 1] [--retry-delay 10]`);
    return 2;
  }
  const apiKey = firebaseWebKey();
  if (!apiKey) {
    console.error('Could not read VITE_FB_API_KEY from .env.production, which the Firestore checks need.');
    return 2;
  }

  console.log(`Smoke checks against ${options.baseUrl} (project ${options.project})${options.skipFunctions ? ', callable checks skipped' : ''}\n`);
  const rows = await runSmokeWithRetries(
    { baseUrl: options.baseUrl, project: options.project, apiKey, allowedGoogleKeys: [apiKey], skipFunctions: options.skipFunctions },
    {
      attempts: options.attempts,
      delaySeconds: options.delaySeconds,
      onRetry: ({ attempt, attempts, failed, delaySeconds }) =>
        console.error(`attempt ${attempt}/${attempts}: ${failed} check(s) failed, trying again in ${delaySeconds}s`),
    },
  );
  console.log(formatTable(rows));
  return summarize(rows).failed > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
