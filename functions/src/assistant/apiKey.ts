import type { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { SECRET_NAME } from './config';

/** How long a key read from Secret Manager is reused. */
export const API_KEY_CACHE_MS = 10 * 60 * 1000;

/** The one Secret Manager call this module makes (structural, so tests can pass a fake). */
export interface SecretVersionReader {
  accessSecretVersion(request: {
    name: string;
  }): Promise<[{ payload?: { data?: Uint8Array | string | null } | null }, ...unknown[]]>;
}

// gRPC codes for "there is no usable version": NOT_FOUND (no secret, or no
// versions yet) and FAILED_PRECONDITION (the version is disabled or destroyed).
const NO_USABLE_VERSION = new Set([5, 9]);

/** One secret version's value, trimmed; `null` when it is empty or doesn't exist. */
export async function readSecretVersion(client: SecretVersionReader, name: string): Promise<string | null> {
  try {
    const [version] = await client.accessSecretVersion({ name });
    const data = version.payload?.data;
    const text = typeof data === 'string' ? data : data ? Buffer.from(data).toString('utf8') : '';
    return text.trim() || null;
  } catch (err) {
    if (NO_USABLE_VERSION.has((err as { code?: unknown } | null)?.code as number)) return null;
    throw err;
  }
}

let client: SecretManagerServiceClient | undefined;

// Loaded on first use, so cold starts (and tests, which inject `access`) never pay for it.
async function accessSecretManager(name: string): Promise<string | null> {
  if (!client) {
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
    client = new SecretManagerServiceClient();
  }
  return readSecretVersion(client, name);
}

let cached: { key: string; at: number } | null = null;

/**
 * The Anthropic API key from Secret Manager (`ANTHROPIC_API_KEY`, latest
 * version), cached for 10 minutes. `null` means the assistant isn't set up: no
 * secret, no version, or an empty value. A missing key isn't cached, so a key
 * added later works on the next call.
 */
export async function getAnthropicApiKey(
  deps: { access?: (name: string) => Promise<string | null>; now?: () => number } = {},
): Promise<string | null> {
  const now = (deps.now ?? Date.now)();
  if (cached && now - cached.at < API_KEY_CACHE_MS) return cached.key;
  const key = ((await (deps.access ?? accessSecretManager)(SECRET_NAME)) ?? '').trim();
  cached = key ? { key, at: now } : null;
  return key || null;
}

/** Tests only: forget the cached key. */
export function __resetApiKeyCache(): void {
  cached = null;
}
