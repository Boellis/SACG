import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';

/** What an anonymous caller is told when something unexpected breaks. */
export const TRY_AGAIN_MESSAGE = 'Something went wrong on our side. Please try again in a minute.';

/**
 * Run the work behind a public (no sign-in) callable. An HttpsError is a
 * deliberate answer and passes through untouched. Anything else (a raw
 * Firestore/gRPC error, a bug) is logged and becomes `unavailable` with a
 * friendly retry message, so `onCall` never answers a visitor with `internal`.
 */
export async function withPublicErrors<T>(name: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    logger.error(`${name}: unexpected error`, err);
    throw new HttpsError('unavailable', TRY_AGAIN_MESSAGE);
  }
}
