import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAnthropicApiKey, readSecretVersion, __resetApiKeyCache, type SecretVersionReader } from './apiKey';
import { SECRET_NAME } from './config';

// The default accessor talks to Secret Manager. These tests inject their own,
// and this stub makes any accidental use of the real client fail loudly.
vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: class {
    constructor() {
      throw new Error('tests must never reach Secret Manager');
    }
  },
}));

const MIN = 60_000;

beforeEach(() => __resetApiKeyCache());

describe('getAnthropicApiKey', () => {
  it('reads the latest version of the ANTHROPIC_API_KEY secret', async () => {
    expect(SECRET_NAME).toBe('projects/sacg-garden-app/secrets/ANTHROPIC_API_KEY/versions/latest');
    const access = vi.fn(async () => 'test-key-1\n');
    await expect(getAnthropicApiKey({ access })).resolves.toBe('test-key-1');
    expect(access).toHaveBeenCalledWith(SECRET_NAME);
  });

  it('is null when the secret has no usable value', async () => {
    await expect(getAnthropicApiKey({ access: async () => null })).resolves.toBeNull();
    await expect(getAnthropicApiKey({ access: async () => '  \n' })).resolves.toBeNull();
  });

  it('caches the key for 10 minutes: two calls read the secret once', async () => {
    let t = 1_000_000;
    const access = vi.fn(async () => 'test-key-1');
    const deps = { access, now: () => t };
    await getAnthropicApiKey(deps);
    t += 9 * MIN;
    await expect(getAnthropicApiKey(deps)).resolves.toBe('test-key-1');
    expect(access).toHaveBeenCalledTimes(1);
  });

  it('reads the secret again once the cached key is 11 minutes old', async () => {
    let t = 1_000_000;
    const access = vi.fn().mockResolvedValueOnce('test-key-1').mockResolvedValueOnce('test-key-2');
    const deps = { access, now: () => t };
    await getAnthropicApiKey(deps);
    t += 11 * MIN;
    await expect(getAnthropicApiKey(deps)).resolves.toBe('test-key-2');
    expect(access).toHaveBeenCalledTimes(2);
  });

  it("doesn't cache a missing key, so a key added later works on the next call", async () => {
    const access = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('test-key-1');
    await expect(getAnthropicApiKey({ access })).resolves.toBeNull();
    await expect(getAnthropicApiKey({ access })).resolves.toBe('test-key-1');
  });
});

describe('readSecretVersion', () => {
  const clientReturning = (data?: Uint8Array | string): SecretVersionReader => ({
    accessSecretVersion: vi.fn(async () => [{ payload: { data } }] as [{ payload: { data?: Uint8Array | string } }]),
  });
  const clientThrowing = (code: number): SecretVersionReader => ({
    accessSecretVersion: vi.fn(async () => {
      throw Object.assign(new Error(`gRPC error ${code}`), { code });
    }),
  });

  it('decodes and trims the payload', async () => {
    await expect(readSecretVersion(clientReturning(Buffer.from('test-key-1\n')), SECRET_NAME)).resolves.toBe(
      'test-key-1',
    );
    await expect(readSecretVersion(clientReturning('test-key-1'), SECRET_NAME)).resolves.toBe('test-key-1');
  });

  it('is null for an empty payload', async () => {
    await expect(readSecretVersion(clientReturning(undefined), SECRET_NAME)).resolves.toBeNull();
  });

  it.each([
    ['NOT_FOUND (no secret, or no versions yet)', 5],
    ['FAILED_PRECONDITION (version disabled or destroyed)', 9],
  ])('is null on %s', async (_label, code) => {
    await expect(readSecretVersion(clientThrowing(code), SECRET_NAME)).resolves.toBeNull();
  });

  it('rethrows any other error, such as PERMISSION_DENIED', async () => {
    await expect(readSecretVersion(clientThrowing(7), SECRET_NAME)).rejects.toMatchObject({ code: 7 });
  });
});
