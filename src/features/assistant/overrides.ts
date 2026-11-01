const isList = (v: unknown): v is unknown[] => Array.isArray(v);

/** Missing optional text and empty text are the same thing; lists compare by value. */
function same(a: unknown, b: unknown): boolean {
  if (isList(a) || isList(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? []);
  return (a ?? '') === (b ?? '');
}

/**
 * The fields of `edited` that differ from the proposal (`original`), limited to
 * `keys`. These are what an admin's edits send as `overrides`: a field they
 * didn't touch stays exactly as the assistant proposed it.
 */
export function changedFields<T extends object>(original: T, edited: T, keys: ReadonlyArray<keyof T>): Partial<T> {
  const out: Partial<T> = {};
  for (const key of keys) {
    if (!same(original[key], edited[key])) out[key] = edited[key];
  }
  return out;
}
