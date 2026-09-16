/**
 * Helpers for deriving `returns` validators from `schema.tables.<t>.validator.fields`
 * instead of re-typing table shapes by hand.
 *
 * `const K` keeps the key list literal even when the call sits inside a
 * contextually typed position such as `returns: v.object({ ...pick(...) })`.
 */
export function omit<T extends Record<string, unknown>, const K extends keyof T>(
  fields: T,
  keys: readonly K[],
): Omit<T, K> {
  const out = { ...fields };
  for (const k of keys) delete out[k];
  return out;
}

export function pick<T extends Record<string, unknown>, const K extends keyof T>(
  fields: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = fields[k];
  return out;
}
