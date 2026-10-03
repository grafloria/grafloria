/**
 * A VALUE key for a render spec and its options, so a kit host remounts when
 * the CONTENT changes — not each time a parent builds an equal object again
 * (`spec={erDiagram({ … })}` written inline). Functions (a kit's painter) are
 * left out: a kit's data lives in its nodes/edges records. The live models of
 * a loaded document can point at each other, so a repeat becomes a marker.
 */
export function specKey(spec: unknown, options: unknown): string {
  const seen = new WeakSet<object>();
  return (
    JSON.stringify([spec, options ?? null], (_key, value) => {
      if (typeof value === 'function') return undefined;
      if (value && typeof value === 'object') {
        if (seen.has(value)) return '[seen]';
        seen.add(value);
      }
      return value;
    }) ?? ''
  );
}
