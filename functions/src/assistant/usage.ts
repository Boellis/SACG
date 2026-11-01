import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { gardenToday } from '../lib/time';
import { ASSISTANT_USAGE, DAILY_TURN_LIMIT } from './config';

/**
 * Count one assistant turn for an admin against today's limit, in garden time:
 * `assistantUsage/{uid}_{YYYY-MM-DD}` (server-only; rules deny all clients).
 * The turn past the limit is refused and not counted.
 */
export async function consumeTurn(db: Firestore, uid: string, now: Date): Promise<{ turnsToday: number; limit: number }> {
  const day = gardenToday(now);
  const ref = db.collection(ASSISTANT_USAGE).doc(`${uid}_${day}`);
  return db.runTransaction(async (tx) => {
    const turns = Number((await tx.get(ref)).get('turns') ?? 0) + 1;
    if (turns > DAILY_TURN_LIMIT) {
      throw new HttpsError(
        'resource-exhausted',
        `Daily assistant limit reached (${DAILY_TURN_LIMIT}). It resets at midnight.`,
      );
    }
    tx.set(ref, { uid, day, turns, updatedAt: FieldValue.serverTimestamp() });
    return { turnsToday: turns, limit: DAILY_TURN_LIMIT };
  });
}
