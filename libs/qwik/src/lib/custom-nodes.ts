import type { NodeSpec } from '@grafloria/renderer';
import type { NodeTypes } from './grafloria-flow';

/**
 * The CUSTOM-NODE OPT-IN RULE, shared by the mount path and the controlled
 * `nodes` path so the two cannot drift.
 *
 * Declaring a component for a node `type` IS the opt-in: a spec of that type
 * is flagged `custom` so the core routes it to the HTML layer instead of
 * drawing it as SVG. This mirrors the Vue wrapper (where declaring the
 * `#node-<type>` slot is the opt-in) and the Angular one.
 *
 * An EXPLICIT `custom` on the spec always wins, in both directions: `false`
 * keeps a node on the SVG path even though a component exists for its type,
 * which is the only way to opt a single node back out.
 */
export function withCustomFlag(
  specs: NodeSpec[] | undefined,
  nodeTypes: NodeTypes | undefined
): NodeSpec[] | undefined {
  if (!specs) return undefined;
  if (!nodeTypes) return specs;
  return specs.map((spec) =>
    spec.custom === undefined && spec.type && nodeTypes[spec.type]
      ? { ...spec, custom: true }
      : spec
  );
}
