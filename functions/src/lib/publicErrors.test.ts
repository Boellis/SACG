import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { withPublicErrors, TRY_AGAIN_MESSAGE } from './publicErrors';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withPublicErrors', () => {
  it("passes the work's result through", async () => {
    await expect(withPublicErrors('test', async () => ({ ok: true }))).resolves.toEqual({ ok: true });
  });

  it('passes a deliberate HttpsError through untouched, without logging it', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const answer = new HttpsError('not-found', "This RSVP link isn't valid.");
    await expect(
      withPublicErrors('test', async () => {
        throw answer;
      }),
    ).rejects.toBe(answer);
    expect(logged).not.toHaveBeenCalled();
  });

  it('logs any other error and answers unavailable with a friendly retry message', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
    // What Firestore threw for a reserved `__…__` document id: a raw gRPC error.
    const raw = Object.assign(new Error('3 INVALID_ARGUMENT: Resource id "__x__" is invalid because it is reserved.'), {
      code: 3,
    });
    const result = withPublicErrors('rsvpGetInvite', async () => {
      throw raw;
    });
    await expect(result).rejects.toBeInstanceOf(HttpsError);
    await expect(result).rejects.toMatchObject({ code: 'unavailable', message: TRY_AGAIN_MESSAGE });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0][0]).toContain('rsvpGetInvite');
    expect(logged.mock.calls[0]).toContain(raw);
  });

  it('maps an error thrown synchronously by the work, too', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    const work = (): Promise<never> => {
      throw new TypeError('boom');
    };
    await expect(withPublicErrors('test', work)).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('the retry message is friendly and leaks nothing technical', () => {
    expect(TRY_AGAIN_MESSAGE).toMatch(/try again/i);
    expect(TRY_AGAIN_MESSAGE).not.toMatch(/internal|INVALID_ARGUMENT|firestore|error/i);
  });
});
