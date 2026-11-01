// Pure predicates behind scripts/smoke/smoke.mjs: no network, no filesystem.
//
// Remember when reading these: Firebase Hosting rewrites EVERY unknown path to
// index.html, so "200 OK" proves nothing about a sensitive path. What matters is what
// the body contains.

/** Strings that only appear in files that must never be served (.env, firebase.json, keys, ...). */
export const LEAK_MARKERS = ['VITE_FB_', 'rules_version', '"projects"', '[core]', '"private_key"', '-----BEGIN'];

/** Is this the Vite single-page-app shell? */
export const isSpaShell = (html) => typeof html === 'string' && html.includes('<div id="root">');

/** Which leak markers occur in the body? Each is listed once. */
export const leakMarkers = (body) => LEAK_MARKERS.filter((marker) => body.includes(marker));

const JS_OR_CSS = /\.(?:m?js|css)$/i;

function sameOriginAsset(ref, base) {
  const root = new URL(base.endsWith('/') ? base : `${base}/`);
  let url;
  try {
    url = new URL(ref, root);
  } catch {
    return null;
  }
  if (url.origin !== root.origin || !JS_OR_CSS.test(url.pathname)) return null;
  url.hash = '';
  return url.href;
}

function attributeValue(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

/**
 * Same-origin JS/CSS files referenced from index.html, in document order, as absolute URLs.
 * @param {string} indexHtml
 * @param {string} base - site origin, e.g. https://sacg-garden-app.web.app
 */
export function assetUrls(indexHtml, base) {
  const urls = [];
  for (const [tag, element] of indexHtml.matchAll(/<(script|link)\b[^>]*>/gi)) {
    const ref = attributeValue(tag, element.toLowerCase() === 'script' ? 'src' : 'href');
    const url = ref ? sameOriginAsset(ref, base) : null;
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

/**
 * Lazily loaded chunks a bundle points to (Vite lists them as "assets/<name>.js|css"
 * strings in its preload map). index.html does not mention them, but they are served.
 * @param {string} jsBody
 * @param {string} base
 */
export function chunkUrls(jsBody, base) {
  const origin = new URL(base).origin;
  const urls = [];
  for (const [, path] of jsBody.matchAll(/(?<![\w./-])\/?(assets\/[\w.-]+\.(?:m?js|css))(?![\w.-])/g)) {
    const url = `${origin}/${path}`;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

// Anonymous reads of Firestore and Storage must be refused BY THE SECURITY RULES.
//
// Google answers 403 PERMISSION_DENIED for two very different reasons. Either the rules said no,
// or something in front of them did (an API key limited to other referrers or APIs, a disabled
// service, a rejected credential) and the rules never ran. Only the first says anything about
// firestore.rules and storage.rules, so that status alone must never count as a pass. What
// tells the two apart:
//   - a rules denial is a bare error with the rules' fixed wording and no `details`;
//   - a refusal from in front of the rules carries an ErrorInfo in error.details[] with a
//     machine-readable `reason` (API_KEY_HTTP_REFERRER_BLOCKED, API_KEY_SERVICE_BLOCKED,
//     SERVICE_DISABLED, CREDENTIALS_MISSING, ...).

/** The rules' own wording: Cloud Firestore first, then Cloud Storage for Firebase. */
const RULES_DENIAL_MESSAGES = ['Missing or insufficient permissions.', 'Permission denied.'];

/** The `error` object of a Google JSON error body, or null when the body is anything else. */
function errorObject(body) {
  try {
    const error = JSON.parse(body)?.error;
    return error && typeof error === 'object' && !Array.isArray(error) ? error : null;
  } catch {
    return null;
  }
}

const reasonsOf = (error) =>
  Array.isArray(error?.details)
    ? error.details.map((detail) => detail?.reason).filter((reason) => typeof reason === 'string' && reason !== '')
    : [];

/** ErrorInfo reasons of a Google error body ("API_KEY_HTTP_REFERRER_BLOCKED", ...); [] when there are none. */
export const errorReasons = (body) => reasonsOf(errorObject(body));

/**
 * Did the security rules refuse an anonymous read? Only a 403 with the rules' wording and no
 * ErrorInfo reason counts. A 401 does not: that is authentication failing before the rules
 * are consulted.
 */
export function expectDenied(status, body) {
  if (status !== 403) return false;
  const error = errorObject(body);
  if (!error || reasonsOf(error).length > 0) return false;
  return RULES_DENIAL_MESSAGES.includes(error.message);
}

/** The table row for an anonymous Firestore/Storage list call: did the security rules refuse it? */
export function anonymousListResult(status, body) {
  if (expectDenied(status, body)) return { ok: true, detail: `HTTP ${status} denied by security rules` };
  const reasons = errorReasons(body);
  if (reasons.length > 0) {
    return { ok: false, detail: `HTTP ${status} ${reasons.join(', ')}: refused before the security rules ran, so they were not tested` };
  }
  if (status >= 200 && status < 300) return { ok: false, detail: `HTTP ${status}: anonymous list was not refused` };
  return { ok: false, detail: `HTTP ${status}: not a security-rules denial` };
}

/** `error.status` of a Firebase callable error body ("NOT_FOUND", ...), or '' if there is none. */
export function callableErrorStatus(body) {
  try {
    const status = JSON.parse(body)?.error?.status;
    return typeof status === 'string' ? status : '';
  } catch {
    return '';
  }
}

/** Did the callable refuse an anonymous caller? */
export const callableRejectsAnon = (status, body) =>
  status === 401 || callableErrorStatus(body) === 'UNAUTHENTICATED';

/** Is this body a JavaScript/CSS source map? */
export function isSourceMap(body) {
  try {
    const map = JSON.parse(body);
    return Boolean(map && typeof map === 'object' && 'version' in map && ('mappings' in map || 'sections' in map));
  } catch {
    return false;
  }
}

/**
 * A sensitive path (/.env, /firebase.json, ...) is fine when nothing is served (4xx) or
 * only the app shell is, and never when a leak marker shows up.
 */
export function sensitivePathOk(status, body) {
  if (leakMarkers(body).length > 0) return false;
  if (status >= 400 && status < 500) return true;
  return status === 200 && isSpaShell(body);
}
