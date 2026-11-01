// @vitest-environment node
//
// Post-deploy smoke checks. This repo is PUBLIC, so sample secrets / member emails below are
// assembled at runtime: this file must itself pass `npm run security:scan`.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isSpaShell,
  leakMarkers,
  assetUrls,
  chunkUrls,
  expectDenied,
  errorReasons,
  anonymousListResult,
  callableRejectsAnon,
  callableErrorStatus,
  isSourceMap,
  sensitivePathOk,
} from './checks.mjs';
import {
  runSmoke,
  runSmokeWithRetries,
  summarize,
  formatTable,
  parseCli,
  FIRESTORE_COLLECTIONS,
  SENSITIVE_PATHS,
  EXPECTED_HEADERS,
} from './smoke.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cat = (...parts) => parts.join('');
const at = (local, domain) => `${local}@${domain}`;

// ---------------------------------------------------------------------------
// Pure checks (checks.mjs)
// ---------------------------------------------------------------------------
describe('isSpaShell', () => {
  it('recognises the Vite app shell', () => {
    expect(isSpaShell('<div id="root"></div>')).toBe(true);
    expect(isSpaShell('<!doctype html><html><body><div id="root"></div></body></html>')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isSpaShell('')).toBe(false);
    expect(isSpaShell('Not Found')).toBe(false);
    expect(isSpaShell('{"projects":{"default":"sacg-garden-app"}}')).toBe(false);
  });
});

describe('leakMarkers', () => {
  it('finds a Vite env leak', () => {
    expect(leakMarkers('VITE_FB_API_KEY=x').length).toBe(1);
  });
  it('is quiet on the app shell', () => {
    expect(leakMarkers('<div id="root">')).toEqual([]);
  });
  it.each([
    ['VITE_FB_', 'VITE_FB_PROJECT_ID=sacg-garden-app'],
    ['rules_version', "rules_version = '2';"],
    ['"projects"', '{"projects": {"default": "x"}}'],
    ['[core]', '[core]\n\trepositoryformatversion = 0'],
    ['"private_key"', cat('{"private', '_key": "x"}')],
    ['-----BEGIN', cat('-----BEGIN ', 'PRIVATE KEY-----')],
  ])('detects %s', (marker, body) => {
    expect(leakMarkers(body)).toEqual([marker]);
  });
  it('lists each marker once, however often it appears', () => {
    expect(leakMarkers('VITE_FB_A=1 VITE_FB_B=2 rules_version')).toEqual(['VITE_FB_', 'rules_version']);
  });
});

describe('assetUrls', () => {
  it('lists the script and stylesheet URLs, resolved against the base', () => {
    expect(
      assetUrls(
        '<script src="/assets/index-abc.js"></script><link href="/assets/index-x.css" rel="stylesheet">',
        'https://s.web.app',
      ),
    ).toEqual(['https://s.web.app/assets/index-abc.js', 'https://s.web.app/assets/index-x.css']);
  });

  it('handles any attribute order, quote style and modulepreload links, in document order', () => {
    const html = `<head>
      <script type="module" crossorigin src='/assets/a.js'></script>
      <link rel="modulepreload" crossorigin href="/assets/b.js">
      <link crossorigin href=/assets/c.css rel=stylesheet>
    </head>`;
    expect(assetUrls(html, 'https://s.web.app')).toEqual([
      'https://s.web.app/assets/a.js',
      'https://s.web.app/assets/b.js',
      'https://s.web.app/assets/c.css',
    ]);
  });

  it('ignores inline scripts, icons, other origins and duplicates; keeps query strings', () => {
    const html = `
      <link rel="icon" href="/favicon.svg">
      <script>window.x = 1</script>
      <script src="https://cdn.example.com/lib.js"></script>
      <script src="/assets/a.js?v=2"></script>
      <script src="/assets/a.js?v=2"></script>`;
    expect(assetUrls(html, 'https://s.web.app/')).toEqual(['https://s.web.app/assets/a.js?v=2']);
  });
});

describe('chunkUrls', () => {
  it('finds lazily loaded chunks referenced from a bundle', () => {
    const js = 'd=m.f||(m.f=["assets/PlotLayoutCard-LKW.js","assets/Analytics-aDv.css"]);import("./x");"/assets/Other-1.js"';
    expect(chunkUrls(js, 'https://s.web.app')).toEqual([
      'https://s.web.app/assets/PlotLayoutCard-LKW.js',
      'https://s.web.app/assets/Analytics-aDv.css',
      'https://s.web.app/assets/Other-1.js',
    ]);
  });
  it('ignores other file types, look-alike directories and duplicates', () => {
    const js = '"assets/logo.png","myassets/x.js","assets/a.js","assets/a.js"';
    expect(chunkUrls(js, 'https://s.web.app')).toEqual(['https://s.web.app/assets/a.js']);
  });
});

// What Google really answers to an anonymous list call. The two security-rules denials were
// recorded from the live project (2026-11-01), and so was the shape of the 401. The refusals from
// in front of the rules follow Google's documented ErrorInfo shape, with a made-up project number.
const errorInfo = (reason, service = 'firestore.googleapis.com') => ({
  '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
  reason,
  domain: 'googleapis.com',
  metadata: { service, consumer: 'projects/000000000000' },
});
const googleError = (error) => JSON.stringify({ error });

// The security rules said no:
const FIRESTORE_RULES_DENIAL = { code: 403, message: 'Missing or insufficient permissions.', status: 'PERMISSION_DENIED' };
const STORAGE_RULES_DENIAL = { code: 403, message: 'Permission denied.' };
// Something in front of the rules said no, so the rules never ran. Google also calls these 403
// PERMISSION_DENIED, which is why that status alone proves nothing:
const REFERRER_BLOCKED = {
  code: 403,
  message: 'Requests from referer <empty> are blocked.',
  status: 'PERMISSION_DENIED',
  details: [errorInfo('API_KEY_HTTP_REFERRER_BLOCKED')],
};
const API_KEY_SERVICE_BLOCKED = {
  code: 403,
  message: 'Requests to this API firestore.googleapis.com method google.firestore.v1.Firestore.GetOrListDocuments are blocked.',
  status: 'PERMISSION_DENIED',
  details: [errorInfo('API_KEY_SERVICE_BLOCKED')],
};
const FIRESTORE_DISABLED = {
  code: 403,
  message: 'Cloud Firestore API has not been used in project 000000000000 before or it is disabled.',
  status: 'PERMISSION_DENIED',
  details: [{ '@type': 'type.googleapis.com/google.rpc.Help', links: [] }, errorInfo('SERVICE_DISABLED')], // the ErrorInfo is not always first
};
const STORAGE_DISABLED = {
  code: 403,
  message: 'Firebase Storage API has not been used in project 000000000000 before or it is disabled.',
  status: 'PERMISSION_DENIED',
  details: [errorInfo('SERVICE_DISABLED', 'firebasestorage.googleapis.com')],
};
const CREDENTIALS_MISSING = {
  code: 401,
  message: 'Request had invalid authentication credentials.',
  status: 'UNAUTHENTICATED',
  details: [errorInfo('CREDENTIALS_MISSING')],
};
// [label, HTTP status, error, ErrorInfo reason]
const NOT_BY_THE_RULES = [
  ['a referrer-restricted key', 403, REFERRER_BLOCKED, 'API_KEY_HTTP_REFERRER_BLOCKED'],
  ['an API-restricted key', 403, API_KEY_SERVICE_BLOCKED, 'API_KEY_SERVICE_BLOCKED'],
  ['a disabled Firestore API, whose ErrorInfo is not the first detail', 403, FIRESTORE_DISABLED, 'SERVICE_DISABLED'],
  ['a disabled Storage API', 403, STORAGE_DISABLED, 'SERVICE_DISABLED'],
  ['a rejected credential', 401, CREDENTIALS_MISSING, 'CREDENTIALS_MISSING'],
];

describe('expectDenied', () => {
  // Google answers 403 PERMISSION_DENIED for two very different reasons: the security rules said
  // no, or the API key or service refused the request before the rules were consulted. Only the
  // first says anything about firestore.rules and storage.rules.
  it("accepts Firestore's security-rules denial", () => {
    expect(expectDenied(403, googleError(FIRESTORE_RULES_DENIAL))).toBe(true);
  });
  it("accepts Storage's security-rules denial, which is worded differently and carries no status", () => {
    expect(expectDenied(403, googleError(STORAGE_RULES_DENIAL))).toBe(true);
  });

  it.each(NOT_BY_THE_RULES)('rejects a refusal by %s: the rules never ran', (_label, status, error) => {
    expect(expectDenied(status, googleError(error))).toBe(false);
  });
  it('rejects a bare ErrorInfo refusal', () => {
    const error = { code: 403, status: 'PERMISSION_DENIED', details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_HTTP_REFERRER_BLOCKED' }] };
    expect(expectDenied(403, googleError(error))).toBe(false);
  });
  it('rejects any error that carries a reason, whatever its message says', () => {
    expect(expectDenied(403, googleError({ ...FIRESTORE_RULES_DENIAL, details: [errorInfo('API_KEY_HTTP_REFERRER_BLOCKED')] }))).toBe(false);
    expect(expectDenied(403, googleError({ ...STORAGE_RULES_DENIAL, details: [errorInfo('SERVICE_DISABLED')] }))).toBe(false);
  });
  it('rejects a 403 that does not carry the security-rules wording', () => {
    expect(expectDenied(403, '{"error":{"status":"PERMISSION_DENIED"}}')).toBe(false); // the status alone says nothing about who refused
    expect(expectDenied(403, googleError({ code: 403, message: 'Requests from referer <empty> are blocked.', status: 'PERMISSION_DENIED' }))).toBe(false);
    expect(expectDenied(403, '<html>Forbidden</html>')).toBe(false);
    expect(expectDenied(403, 'Permission denied.')).toBe(false); // the right words, but not a Google error body
    expect(expectDenied(403, 'PERMISSION_DENIED')).toBe(false);
    expect(expectDenied(403, '')).toBe(false);
  });
  it('rejects a 401: the authentication layer answers before the security rules are consulted', () => {
    expect(expectDenied(401, '')).toBe(false);
    expect(expectDenied(401, googleError({ ...FIRESTORE_RULES_DENIAL, code: 401 }))).toBe(false);
  });
  it('rejects successful reads and unrelated errors', () => {
    expect(expectDenied(200, '{"documents":[]}')).toBe(false);
    expect(expectDenied(200, '{"documents":[{"name":"x"}]}')).toBe(false);
    expect(expectDenied(200, googleError(FIRESTORE_RULES_DENIAL))).toBe(false); // the right words, but the wrong status
    expect(expectDenied(404, '{"error":{"status":"NOT_FOUND"}}')).toBe(false);
    expect(expectDenied(500, googleError(FIRESTORE_RULES_DENIAL))).toBe(false);
    expect(expectDenied(500, 'PERMISSION_DENIED')).toBe(false);
  });
  it('does not throw on a body of an unexpected shape', () => {
    for (const body of ['null', '[]', '"x"', '{}', '{"error":null}', '{"error":"Permission denied."}', '{"error":{"message":42}}']) {
      expect(expectDenied(403, body)).toBe(false);
    }
    // junk among the details is ignored: only a reason counts against a denial
    expect(expectDenied(403, '{"error":{"message":"Permission denied.","details":[null,1,"x",{}]}}')).toBe(true);
  });
});

describe('errorReasons', () => {
  it.each(NOT_BY_THE_RULES)('finds the ErrorInfo reason of %s', (_label, _status, error, reason) => {
    expect(errorReasons(googleError(error))).toEqual([reason]);
  });
  it('finds nothing in a rules denial, or in anything that is not a Google error body', () => {
    const bodies = [
      googleError(FIRESTORE_RULES_DENIAL),
      googleError(STORAGE_RULES_DENIAL),
      '',
      'oops',
      'null',
      '{"documents":[]}',
      '{"error":{"details":"x"}}',
      '{"error":{"details":[null,1,{"reason":""},{"reason":7}]}}',
    ];
    for (const body of bodies) expect(errorReasons(body)).toEqual([]);
  });
});

describe('anonymousListResult', () => {
  it('passes a security-rules denial, and says that is what it was', () => {
    expect(anonymousListResult(403, googleError(FIRESTORE_RULES_DENIAL))).toEqual({ ok: true, detail: 'HTTP 403 denied by security rules' });
    expect(anonymousListResult(403, googleError(STORAGE_RULES_DENIAL))).toEqual({ ok: true, detail: 'HTTP 403 denied by security rules' });
  });
  it.each(NOT_BY_THE_RULES)('fails a refusal by %s, naming the reason and saying the rules were not tested', (_label, status, error, reason) => {
    const { ok, detail } = anonymousListResult(status, googleError(error));
    expect(ok).toBe(false);
    expect(detail).toContain(`HTTP ${status} ${reason}`);
    expect(detail).toContain('refused before the security rules ran');
  });
  it('fails a list that went through', () => {
    expect(anonymousListResult(200, '{"documents":[]}')).toEqual({ ok: false, detail: 'HTTP 200: anonymous list was not refused' });
  });
  it('fails any other answer', () => {
    expect(anonymousListResult(404, '{"error":{"status":"NOT_FOUND"}}')).toEqual({ ok: false, detail: 'HTTP 404: not a security-rules denial' });
    expect(anonymousListResult(403, '<html>Forbidden</html>')).toEqual({ ok: false, detail: 'HTTP 403: not a security-rules denial' });
    expect(anonymousListResult(403, '{"error":{"status":"PERMISSION_DENIED"}}')).toEqual({ ok: false, detail: 'HTTP 403: not a security-rules denial' });
  });
});

describe('callableRejectsAnon', () => {
  it('accepts the callable protocol UNAUTHENTICATED error', () => {
    expect(callableRejectsAnon(401, '{"error":{"status":"UNAUTHENTICATED"}}')).toBe(true);
    expect(callableRejectsAnon(401, '')).toBe(true);
    expect(callableRejectsAnon(400, '{"error":{"status":"UNAUTHENTICATED"}}')).toBe(true);
  });
  it('rejects a call that went through or failed some other way', () => {
    expect(callableRejectsAnon(200, '{"result":{"ok":true}}')).toBe(false);
    expect(callableRejectsAnon(404, '{"error":{"status":"NOT_FOUND"}}')).toBe(false);
    expect(callableRejectsAnon(500, 'Internal Server Error')).toBe(false);
    expect(callableRejectsAnon(403, 'not json')).toBe(false);
  });
});

describe('callableErrorStatus', () => {
  it('reads error.status from a callable error body, tolerating junk', () => {
    expect(callableErrorStatus('{"error":{"status":"NOT_FOUND","message":"x"}}')).toBe('NOT_FOUND');
    expect(callableErrorStatus('{"result":{}}')).toBe('');
    expect(callableErrorStatus('<html>')).toBe('');
    expect(callableErrorStatus('')).toBe('');
    expect(callableErrorStatus('null')).toBe('');
  });
});

describe('isSourceMap', () => {
  it('recognises a source map and nothing else', () => {
    expect(isSourceMap('{"version":3,"sources":["a.ts"],"mappings":"AAAA"}')).toBe(true);
    expect(isSourceMap('<!doctype html><div id="root"></div>')).toBe(false);
    expect(isSourceMap('{"version":3}')).toBe(false);
    expect(isSourceMap('')).toBe(false);
  });
});

describe('sensitivePathOk', () => {
  it('is fine when nothing, or only the app shell, is served', () => {
    expect(sensitivePathOk(200, '<div id="root"></div>')).toBe(true);
    expect(sensitivePathOk(404, 'Not Found')).toBe(true);
    expect(sensitivePathOk(403, 'Forbidden')).toBe(true);
  });
  it('fails on file contents, even with a 200 that looks healthy', () => {
    expect(sensitivePathOk(200, 'VITE_FB_API_KEY=x\nVITE_USE_EMULATORS=false')).toBe(false);
    expect(sensitivePathOk(200, '{"projects":{"default":"sacg-garden-app"}}')).toBe(false);
    expect(sensitivePathOk(200, "rules_version = '2';")).toBe(false);
    expect(sensitivePathOk(200, 'some other file')).toBe(false);
    expect(sensitivePathOk(200, '')).toBe(false);
  });
  it('fails on server errors and on leak markers hiding in an error page', () => {
    expect(sensitivePathOk(500, '')).toBe(false);
    expect(sensitivePathOk(404, 'VITE_FB_API_KEY=x')).toBe(false);
    expect(sensitivePathOk(200, '<div id="root"></div> VITE_FB_API_KEY=x')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Runner (smoke.mjs) against a fake site
// ---------------------------------------------------------------------------
const BASE = 'https://smoke.web.app';
const PROJECT = 'sacg-garden-app';
const WEB_KEY = cat('AIza', 'Sy', 'W'.repeat(33));
const STRANGER_KEY = cat('AIza', 'Sy', 'S'.repeat(33));
const SHELL =
  '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-abc.js"></script>' +
  '<link rel="stylesheet" crossorigin href="/assets/index-x.css"></head><body><div id="root"></div></body></html>';
const ENTRY_JS = `var f=["assets/lazy-1.js","assets/lazy-1.css"];var cfg={apiKey:"${WEB_KEY}",projectId:"${PROJECT}"};`;
const GOOD_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const text = (status, body, headers = {}) => new Response(body, { status, headers });

/** What the real site does today: Hosting rewrites every unknown path to the shell. */
function healthySite(url, init) {
  if (url.origin === BASE) {
    const body =
      {
        '/assets/index-abc.js': ENTRY_JS,
        '/assets/index-x.css': 'body{margin:0}',
        '/assets/lazy-1.js': 'export const lazy=1;',
        '/assets/lazy-1.css': '.lazy{color:red}',
      }[url.pathname] ?? SHELL;
    const type = url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html';
    return text(200, body, { 'content-type': type, ...GOOD_HEADERS });
  }
  if (url.hostname === 'firestore.googleapis.com') {
    return json(403, { error: { code: 403, message: 'Missing or insufficient permissions.', status: 'PERMISSION_DENIED' } });
  }
  if (url.hostname === 'firebasestorage.googleapis.com') {
    return json(403, { error: { code: 403, message: 'Permission denied.' } });
  }
  if (url.hostname === `us-central1-${PROJECT}.cloudfunctions.net`) {
    expect(init.method).toBe('POST');
    return url.pathname === '/rsvpGetInvite'
      ? json(404, { error: { message: 'Invite not found', status: 'NOT_FOUND' } })
      : json(401, { error: { message: 'Sign in required', status: 'UNAUTHENTICATED' } });
  }
  return undefined;
}

/** `overrides` are tried first; return a Response to take over a request, or undefined to pass. */
function fakeFetch(...overrides) {
  const requests = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url: url.href, method: (init.method ?? 'GET').toUpperCase(), headers: init.headers ?? {}, body: init.body });
    for (const handler of [...overrides, healthySite]) {
      const response = await handler(url, init);
      if (response) return response;
    }
    throw new Error(`fake site has no route for ${url.href}`);
  };
  return { fetchImpl, requests };
}

const noSleep = async () => {};
const smoke = (fetchImpl, extra = {}) =>
  runSmoke({ baseUrl: BASE, project: PROJECT, apiKey: WEB_KEY, allowedGoogleKeys: [WEB_KEY], fetchImpl, sleep: noSleep, ...extra });
const failedNames = (rows) => rows.filter((row) => row.status === 'fail').map((row) => row.name);
const row = (rows, name) => rows.find((r) => r.name === name);

describe('runSmoke: a healthy site', () => {
  it('passes every check, including the callables', async () => {
    const { fetchImpl } = fakeFetch();
    const rows = await smoke(fetchImpl);
    expect(failedNames(rows)).toEqual([]);
    expect(summarize(rows)).toMatchObject({ failed: 0, skipped: 0 });
    expect(summarize(rows).passed).toBeGreaterThan(40);
  });

  it('checks every collection, every sensitive path and the three callables', async () => {
    const { fetchImpl } = fakeFetch();
    const names = (await smoke(fetchImpl)).map((r) => r.name);
    for (const collection of FIRESTORE_COLLECTIONS) expect(names).toContain(`Firestore list ${collection} is denied`);
    for (const path of SENSITIVE_PATHS) expect(names).toContain(`GET ${path} serves no file`);
    expect(names).toEqual(expect.arrayContaining(['assistantChat rejects anonymous calls', 'queueMemberEmail rejects anonymous calls', 'rsvpGetInvite with a bogus token is NOT_FOUND']));
    expect(FIRESTORE_COLLECTIONS).toHaveLength(16);
  });

  it('reports a Firestore or Storage denial as the security rules', async () => {
    const { fetchImpl } = fakeFetch();
    const rows = await smoke(fetchImpl, { skipFunctions: true });
    expect(row(rows, 'Firestore list members is denied').detail).toBe('HTTP 403 denied by security rules');
    expect(row(rows, 'Storage list documents/ is denied').detail).toBe('HTTP 403 denied by security rules');
  });

  it('skips only the callable checks with skipFunctions', async () => {
    const { fetchImpl, requests } = fakeFetch();
    const rows = await smoke(fetchImpl, { skipFunctions: true });
    expect(failedNames(rows)).toEqual([]);
    expect(rows.filter((r) => r.status === 'skip').map((r) => r.group)).toEqual(['functions', 'functions', 'functions']);
    expect(requests.some((r) => r.url.includes('cloudfunctions.net'))).toBe(false);
  });
});

describe('runSmoke: read-only and credential-free', () => {
  it('only ever issues GET requests (apart from the three callable probes) and sends no credentials', async () => {
    const { fetchImpl, requests } = fakeFetch();
    await smoke(fetchImpl);
    const callable = requests.filter((r) => r.url.includes('cloudfunctions.net'));
    const rest = requests.filter((r) => !r.url.includes('cloudfunctions.net'));
    expect(callable.map((r) => r.method)).toEqual(['POST', 'POST', 'POST']);
    expect(rest.length).toBeGreaterThan(40);
    expect(new Set(rest.map((r) => r.method))).toEqual(new Set(['GET']));
    for (const request of requests) {
      const names = Object.keys(request.headers).map((n) => n.toLowerCase());
      expect(names).not.toContain('authorization');
      expect(names).not.toContain('cookie');
    }
  });

  it('sends nothing but GETs when the callable checks are skipped', async () => {
    const { fetchImpl, requests } = fakeFetch();
    await smoke(fetchImpl, { skipFunctions: true });
    expect(new Set(requests.map((r) => r.method))).toEqual(new Set(['GET']));
  });

  it('lists Firestore through the REST API with the project and the public key only', async () => {
    const { fetchImpl, requests } = fakeFetch();
    await smoke(fetchImpl, { skipFunctions: true });
    const urls = requests.map((r) => r.url).filter((u) => u.startsWith('https://firestore.googleapis.com/'));
    expect(urls).toHaveLength(16);
    expect(urls).toContain(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/members?pageSize=1&key=${WEB_KEY}`);
    expect(requests.map((r) => r.url)).toContain(
      'https://firebasestorage.googleapis.com/v0/b/sacg-garden-app.firebasestorage.app/o?prefix=documents%2F&maxResults=1',
    );
  });

  it('sends the site origin as the Referer on every Firestore and Storage probe, as a visitor on the site would', async () => {
    const { fetchImpl, requests } = fakeFetch();
    await smoke(fetchImpl, { skipFunctions: true });
    const probes = requests.filter((r) => ['firestore.googleapis.com', 'firebasestorage.googleapis.com'].includes(new URL(r.url).hostname));
    expect(probes).toHaveLength(FIRESTORE_COLLECTIONS.length + 1);
    for (const probe of probes) expect(new Headers(probe.headers).get('referer')).toBe(`${BASE}/`);
  });

  it('sends the bare origin as the Referer however the base URL was written', async () => {
    const { fetchImpl, requests } = fakeFetch();
    await smoke(fetchImpl, { skipFunctions: true, baseUrl: `${BASE}///` });
    const probes = requests.filter((r) => new URL(r.url).hostname.endsWith('.googleapis.com'));
    expect(probes).toHaveLength(FIRESTORE_COLLECTIONS.length + 1);
    for (const probe of probes) expect(new Headers(probe.headers).get('referer')).toBe(`${BASE}/`);
  });

  it('probes the callables with the Firebase callable protocol, anonymously', async () => {
    const { fetchImpl, requests } = fakeFetch();
    await smoke(fetchImpl);
    const byName = Object.fromEntries(
      requests.filter((r) => r.url.includes('cloudfunctions.net')).map((r) => [new URL(r.url).pathname.slice(1), r]),
    );
    expect(Object.keys(byName).sort()).toEqual(['assistantChat', 'queueMemberEmail', 'rsvpGetInvite']);
    expect(JSON.parse(byName.rsvpGetInvite.body)).toEqual({ data: { token: 'smoke-bogus-token' } });
    expect(JSON.parse(byName.assistantChat.body)).toEqual({ data: {} });
    expect(byName.assistantChat.headers['content-type']).toBe('application/json');
    expect(byName.assistantChat.url).toBe(`https://us-central1-${PROJECT}.cloudfunctions.net/assistantChat`);
  });

  it('never prints the API key', async () => {
    const { fetchImpl } = fakeFetch((url) => (url.hostname === 'firestore.googleapis.com' ? json(200, { documents: [] }) : undefined));
    const output = formatTable(await smoke(fetchImpl));
    expect(output).not.toContain(WEB_KEY);
  });
});

describe('runSmoke: it catches what it exists to catch', () => {
  it('fails a sensitive path that serves real file contents, even with status 200', async () => {
    const { fetchImpl } = fakeFetch((url) =>
      url.pathname === '/.env.production' ? text(200, 'VITE_FB_API_KEY=abc\nVITE_USE_EMULATORS=false') : undefined,
    );
    expect(failedNames(await smoke(fetchImpl))).toEqual(['GET /.env.production serves no file']);
  });

  it('fails firebase.json / rules served as files', async () => {
    const { fetchImpl } = fakeFetch(
      (url) => (url.pathname === '/firebase.json' ? json(200, { hosting: {}, projects: 1 }) : undefined),
      (url) => (url.pathname === '/firestore.rules' ? text(200, "rules_version = '2';\nservice cloud.firestore {}") : undefined),
    );
    expect(failedNames(await smoke(fetchImpl)).sort()).toEqual(['GET /firebase.json serves no file', 'GET /firestore.rules serves no file']);
  });

  it('fails when the site stops serving the app shell', async () => {
    const { fetchImpl } = fakeFetch((url) => (url.pathname === '/calendar' ? text(200, 'Site Not Found') : undefined));
    expect(failedNames(await smoke(fetchImpl))).toEqual(['GET /calendar serves the app shell']);
  });

  it('fails a collection that anonymous users can list', async () => {
    const { fetchImpl } = fakeFetch((url) =>
      url.pathname.endsWith('/documents/members') ? json(200, { documents: [{ name: 'projects/p/databases/(default)/documents/members/x' }] }) : undefined,
    );
    expect(failedNames(await smoke(fetchImpl))).toEqual(['Firestore list members is denied']);
  });

  it('fails when anonymous users can list Storage', async () => {
    const { fetchImpl } = fakeFetch((url) => (url.hostname === 'firebasestorage.googleapis.com' ? json(200, { items: [{ name: 'documents/a.pdf' }] }) : undefined));
    expect(failedNames(await smoke(fetchImpl))).toEqual(['Storage list documents/ is denied']);
  });

  describe('when something in front of the security rules refuses the request', () => {
    const everyCollection = FIRESTORE_COLLECTIONS.map((collection) => `Firestore list ${collection} is denied`);
    const firestoreOnly = (respond) => (url, init) => (url.hostname === 'firestore.googleapis.com' ? respond(url, init) : undefined);

    // A browser key limited to this site, enforced the way Google enforces it: a request that does
    // not come from this site is refused by the key before the security rules are consulted.
    const keyLimitedToTheSite = (rules) =>
      firestoreOnly((url, init) =>
        new Headers(init.headers).get('referer') === `${BASE}/` ? rules() : json(403, { error: REFERRER_BLOCKED }),
      );

    it('gets a probe that looks like a visitor through to the rules', async () => {
      const { fetchImpl } = fakeFetch(keyLimitedToTheSite(() => json(403, { error: FIRESTORE_RULES_DENIAL })));
      expect(failedNames(await smoke(fetchImpl, { skipFunctions: true }))).toEqual([]);
    });

    it('still fails every collection the rules would let anonymous users read, instead of mistaking the key for the rules', async () => {
      const readable = () => json(200, { documents: [{ name: 'projects/p/databases/(default)/documents/members/x' }] });
      const { fetchImpl } = fakeFetch(keyLimitedToTheSite(readable));
      expect(failedNames(await smoke(fetchImpl, { skipFunctions: true }))).toEqual(everyCollection);
    });

    it.each([
      ['an HTTP-referrer restriction that excludes this site', REFERRER_BLOCKED, 'API_KEY_HTTP_REFERRER_BLOCKED'],
      ['an API restriction that excludes Firestore', API_KEY_SERVICE_BLOCKED, 'API_KEY_SERVICE_BLOCKED'],
      ['a disabled Firestore API', FIRESTORE_DISABLED, 'SERVICE_DISABLED'],
    ])('fails every collection, rather than passing vacuously, under %s', async (_label, error, reason) => {
      const { fetchImpl } = fakeFetch(firestoreOnly(() => json(403, { error })));
      const rows = await smoke(fetchImpl, { skipFunctions: true });
      expect(failedNames(rows)).toEqual(everyCollection);
      const { detail } = row(rows, 'Firestore list members is denied');
      expect(detail).toContain(reason);
      expect(detail).toContain('refused before the security rules ran');
    });

    it('fails Storage the same way', async () => {
      const { fetchImpl } = fakeFetch((url) =>
        url.hostname === 'firebasestorage.googleapis.com' ? json(403, { error: STORAGE_DISABLED }) : undefined,
      );
      const rows = await smoke(fetchImpl, { skipFunctions: true });
      expect(failedNames(rows)).toEqual(['Storage list documents/ is denied']);
      expect(row(rows, 'Storage list documents/ is denied').detail).toContain('SERVICE_DISABLED');
    });
  });

  it('fails a callable that lets an anonymous call through, and a bogus token that is not NOT_FOUND', async () => {
    const { fetchImpl } = fakeFetch(
      (url) => (url.pathname === '/queueMemberEmail' ? json(200, { result: { jobId: 'x' } }) : undefined),
      (url) => (url.pathname === '/rsvpGetInvite' ? json(200, { result: { event: {} } }) : undefined),
    );
    expect(failedNames(await smoke(fetchImpl)).sort()).toEqual(['queueMemberEmail rejects anonymous calls', 'rsvpGetInvite with a bogus token is NOT_FOUND']);
  });

  it('fails a callable that has not been deployed (404 is not an auth rejection)', async () => {
    const { fetchImpl } = fakeFetch((url) => (url.pathname === '/assistantChat' ? json(404, { error: { status: 'NOT_FOUND' } }) : undefined));
    expect(failedNames(await smoke(fetchImpl))).toEqual(['assistantChat rejects anonymous calls']);
  });

  it.each(Object.keys(EXPECTED_HEADERS))('fails when the %s header is missing from the site', async (header) => {
    // the healthy site, minus one header, on every response
    const strip = async (url, init) => {
      if (url.origin !== BASE) return undefined;
      const healthy = healthySite(url, init);
      const headers = Object.fromEntries(healthy.headers.entries());
      delete headers[header];
      return new Response(await healthy.text(), { status: healthy.status, headers });
    };
    const { fetchImpl } = fakeFetch(strip);
    const failures = failedNames(await smoke(fetchImpl, { skipFunctions: true }));
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.every((name) => name.toLowerCase().startsWith(`${header} header`))).toBe(true);
  });

  it('fails a header with the wrong value', async () => {
    const { fetchImpl } = fakeFetch((url) =>
      url.pathname === '/' ? text(200, SHELL, { ...GOOD_HEADERS, 'x-content-type-options': 'sniff-away' }) : undefined,
    );
    expect(failedNames(await smoke(fetchImpl, { skipFunctions: true }))).toEqual(['X-Content-Type-Options header on /']);
  });

  it('scans every served asset, including lazy chunks only the entry bundle points to', async () => {
    const leaked = cat('sk-ant-api03-', 'z'.repeat(40));
    const { fetchImpl } = fakeFetch((url) => (url.pathname === '/assets/lazy-1.js' ? text(200, `var k="${leaked}";`) : undefined));
    const rows = await smoke(fetchImpl, { skipFunctions: true });
    expect(failedNames(rows)).toEqual(['Assets contain no secrets or member PII']);
    const detail = row(rows, 'Assets contain no secrets or member PII').detail;
    expect(detail).toContain('anthropic');
    expect(detail).toContain('/assets/lazy-1.js');
    expect(detail).not.toContain(leaked); // redacted
  });

  it('fails member PII baked into an asset', async () => {
    const { fetchImpl } = fakeFetch((url) =>
      url.pathname === '/assets/index-x.css' ? text(200, `/* ${at('jane.doe', 'gmail.com')} */`) : undefined,
    );
    expect(failedNames(await smoke(fetchImpl, { skipFunctions: true }))).toEqual(['Assets contain no secrets or member PII']);
  });

  it('allows the public Firebase web key but no other Google API key', async () => {
    const { fetchImpl } = fakeFetch((url) =>
      url.pathname === '/assets/lazy-1.js' ? text(200, `var k="${STRANGER_KEY}";`) : undefined,
    );
    const rows = await smoke(fetchImpl, { skipFunctions: true });
    expect(failedNames(rows)).toEqual(['Assets contain no secrets or member PII']);
    expect(row(rows, 'Assets contain no secrets or member PII').detail).toContain('google-api-key');
  });

  it('fails when a source map is served, or an asset advertises one', async () => {
    const map = '{"version":3,"sources":["src/App.tsx"],"mappings":"AAAA"}';
    const served = fakeFetch((url) => (url.pathname === '/assets/index-abc.js.map' ? text(200, map) : undefined));
    expect(failedNames(await smoke(served.fetchImpl, { skipFunctions: true }))).toEqual(['No source maps are served']);

    const advertised = fakeFetch((url) =>
      url.pathname === '/assets/lazy-1.js' ? text(200, 'export const a=1;\n//# sourceMappingURL=lazy-1.js.map') : undefined,
    );
    expect(failedNames(await smoke(advertised.fetchImpl, { skipFunctions: true }))).toEqual(['No source maps are served']);
  });

  it('fails, rather than passing vacuously, when no assets can be found', async () => {
    const { fetchImpl } = fakeFetch((url) => (url.pathname === '/' ? text(200, '<div id="root"></div>', GOOD_HEADERS) : undefined));
    const rows = await smoke(fetchImpl, { skipFunctions: true });
    expect(failedNames(rows)).toContain('Assets found in index.html');
  });

  it('reports a network error as a failed row and still runs the remaining checks', async () => {
    const { fetchImpl } = fakeFetch((url) => {
      if (url.hostname === 'firestore.googleapis.com') throw new TypeError('fetch failed');
      return undefined;
    });
    const rows = await smoke(fetchImpl, { skipFunctions: true });
    expect(failedNames(rows)).toHaveLength(16);
    expect(row(rows, 'Firestore list members is denied').detail).toContain('fetch failed');
    expect(rows.filter((r) => r.status === 'pass').length).toBeGreaterThan(20);
  });

  it('treats a persistent server error as a failure, not a denial', async () => {
    const { fetchImpl, requests } = fakeFetch((url) =>
      url.pathname.endsWith('/documents/plots') ? text(503, 'unavailable') : undefined,
    );
    expect(failedNames(await smoke(fetchImpl, { skipFunctions: true }))).toEqual(['Firestore list plots is denied']);
    // retried a few times before giving up
    expect(requests.filter((r) => r.url.includes('/documents/plots')).length).toBe(3);
  });
});

describe('runSmokeWithRetries', () => {
  it('re-runs the whole suite after a failure, so a deploy that is still propagating can settle', async () => {
    let calls = 0;
    const { fetchImpl } = fakeFetch((url) => {
      if (url.pathname === '/' && ++calls === 1) return text(200, SHELL, {}); // first pass: new headers not live yet
      return undefined;
    });
    const waits = [];
    const rows = await runSmokeWithRetries(
      { baseUrl: BASE, project: PROJECT, apiKey: WEB_KEY, allowedGoogleKeys: [WEB_KEY], skipFunctions: true, fetchImpl, sleep: noSleep },
      { attempts: 3, delaySeconds: 10, wait: async (seconds) => waits.push(seconds) },
    );
    expect(failedNames(rows)).toEqual([]);
    expect(waits).toEqual([10]);
  });

  it('reports the failures of the last attempt when nothing ever settles', async () => {
    const { fetchImpl } = fakeFetch((url) => (url.pathname === '/.env' ? text(200, 'VITE_FB_X=1') : undefined));
    const waits = [];
    const rows = await runSmokeWithRetries(
      { baseUrl: BASE, project: PROJECT, apiKey: WEB_KEY, allowedGoogleKeys: [WEB_KEY], skipFunctions: true, fetchImpl, sleep: noSleep },
      { attempts: 3, delaySeconds: 5, wait: async (seconds) => waits.push(seconds) },
    );
    expect(failedNames(rows)).toEqual(['GET /.env serves no file']);
    expect(waits).toEqual([5, 5]);
  });

  it('runs once by default', async () => {
    const { fetchImpl, requests } = fakeFetch((url) => (url.pathname === '/.env' ? text(200, 'VITE_FB_X=1') : undefined));
    await runSmokeWithRetries(
      { baseUrl: BASE, project: PROJECT, apiKey: WEB_KEY, allowedGoogleKeys: [WEB_KEY], skipFunctions: true, fetchImpl, sleep: noSleep },
      { wait: async () => {} },
    );
    expect(requests.filter((r) => r.url === `${BASE}/.env`)).toHaveLength(1);
  });
});

describe('summarize and formatTable', () => {
  const rows = [
    { group: 'site', name: 'GET /', status: 'pass', detail: 'app shell' },
    { group: 'headers', name: 'Referrer-Policy header on /', status: 'fail', detail: 'missing' },
    { group: 'functions', name: 'assistantChat rejects anonymous calls', status: 'skip', detail: 'skipped (--skip-functions)' },
  ];
  it('counts outcomes', () => {
    expect(summarize(rows)).toEqual({ passed: 1, failed: 1, skipped: 1 });
  });
  it('prints one marked line per check and a summary', () => {
    const table = formatTable(rows);
    const lines = table.split('\n');
    expect(lines.find((l) => l.includes('GET /') && l.includes('app shell'))).toMatch(/^✓/);
    expect(lines.find((l) => l.includes('Referrer-Policy header on /'))).toMatch(/^✗/);
    expect(lines.find((l) => l.includes('assistantChat'))).toMatch(/^-/);
    expect(table).toMatch(/1 passed, 1 failed, 1 skipped/);
  });
});

describe('parseCli', () => {
  it('reads the documented flags with sensible defaults', () => {
    expect(parseCli(['--url', 'https://sacg-garden-app.web.app/'])).toEqual({
      baseUrl: 'https://sacg-garden-app.web.app',
      project: 'sacg-garden-app',
      skipFunctions: false,
      attempts: 1,
      delaySeconds: 10,
    });
    expect(parseCli(['--url', 'https://x.web.app', '--project', 'other', '--skip-functions', '--attempts', '3', '--retry-delay', '2'])).toEqual({
      baseUrl: 'https://x.web.app',
      project: 'other',
      skipFunctions: true,
      attempts: 3,
      delaySeconds: 2,
    });
  });
  it.each([
    [[], /--url/],
    [['--url', 'not a url'], /--url/],
    [['--url', 'ftp://x.web.app'], /--url/],
    [['--url', 'https://x.web.app', '--attempts', '0'], /--attempts/],
    [['--url', 'https://x.web.app', '--attempts', 'many'], /--attempts/],
    [['--url', 'https://x.web.app', '--bogus'], /bogus/i],
  ])('rejects %j', (argv, message) => {
    expect(() => parseCli(argv)).toThrow(message);
  });
});

describe('smoke CLI', { timeout: 30_000 }, () => {
  it('prints usage and exits 2 without --url', () => {
    const result = spawnSync(process.execPath, [join(here, 'smoke.mjs')], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/usage/i);
  });
});

// ---------------------------------------------------------------------------
// Hosting config: the headers the smoke checks expect must actually be configured.
// ---------------------------------------------------------------------------
describe('firebase.json', () => {
  const config = JSON.parse(readFileSync(join(here, '..', '..', 'firebase.json'), 'utf8').replace(/^﻿/, ''));
  const headersFor = (source) =>
    Object.fromEntries(
      (config.hosting.headers.find((h) => h.source === source)?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value]),
    );

  it('serves the security headers that smoke.mjs expects, on every path', () => {
    const all = headersFor('**');
    for (const [name, value] of Object.entries(EXPECTED_HEADERS)) expect(all[name]).toBe(value);
  });

  it('keeps the existing cache rules', () => {
    expect(headersFor('**')['cache-control']).toBe('no-cache, must-revalidate');
    expect(headersFor('/assets/**')['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('does not block framing, which would break the Firebase Auth iframe', () => {
    const everything = config.hosting.headers.flatMap((h) => h.headers.map((x) => `${x.key}:${x.value}`.toLowerCase())).join('\n');
    expect(everything).not.toContain('x-frame-options');
    expect(everything).not.toContain('frame-ancestors');
  });

  it('has the Functions emulator on a fixed port next to the others', () => {
    expect(config.emulators.functions).toEqual({ port: 5001 });
    expect(config.emulators.firestore.port).toBe(8080);
  });
});
