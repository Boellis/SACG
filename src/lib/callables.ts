import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

/** Copy of a payload without `undefined` object fields. The Functions SDK sends
 *  undefined as `null`, which the servers' strict input schemas reject. */
function dropUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(dropUndefined) as T;
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, dropUndefined(v)]),
    ) as T;
  }
  return value;
}

/**
 * Call a callable Cloud Function and return its result data. Errors propagate
 * unchanged: a FirebaseError (`code` like 'functions/not-found') whose
 * `message` is the server's own text, ready to show to the user.
 */
export async function callFn<I, O>(name: string, input: I, timeoutMs = 70_000): Promise<O> {
  const fn = httpsCallable<I, O>(functions, name, { timeout: timeoutMs });
  const result = await fn(dropUndefined(input));
  return result.data;
}
