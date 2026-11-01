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

/**
 * Did an anonymous read get refused? Firestore says 403 + "PERMISSION_DENIED"; Storage
 * says 403 + "Permission denied."; either way a 401 is a refusal too.
 */
export const expectDenied = (status, body) =>
  status === 401 || (status === 403 && /permission[_ ]denied/i.test(body));

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
