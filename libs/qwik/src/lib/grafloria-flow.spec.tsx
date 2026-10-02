/**
 * `<GrafloriaFlow>` — the client-side half.
 *
 * ## Why there is no full mount-and-assert-the-canvas test here
 *
 * Stated plainly, because the gap is real and worth knowing about rather than
 * papering over with a test that proves nothing.
 *
 * Driving this component's lifecycle in jsdom needs `useVisibleTask$` to fire,
 * and in a real browser that is triggered by the qwikloader script responding
 * to `qinit` / `qvisible`. There is no qwikloader in jest. Qwik's answer is
 * `createDOM()` from `@builder.io/qwik/testing`, which installs a test
 * platform — but it builds its fixture out of **domino**, while this suite
 * runs under **jsdom**, and feeding jsdom elements into domino's internals
 * fails outright (`node.isAncestor is not a function`). Switching the whole
 * suite to domino is not an option either: domino's SVG support is far too
 * thin for a renderer that patches an SVG VNode tree.
 *
 * So the client-side mount path is verified where it can be verified honestly
 * — in the conformance harness, against a real Vite build with a real browser
 * — and what is unit-tested here is the logic this wrapper actually owns:
 *
 *   - the custom-node opt-in rule (below), which is pure and shared by both
 *     the mount path and the controlled-`nodes` path, and
 *   - server rendering, in `ssr.node.spec.tsx`, which is the property that
 *     makes a Qwik binding worth having and which DOES run end to end here.
 */
import { component$ } from '@builder.io/qwik';
import type { NodeSpec } from '@grafloria/renderer';
import { withCustomFlag } from './custom-nodes';
import type { NodeProps, NodeTypes } from './grafloria-flow';

const JobCard = component$<NodeProps<{ title: string }>>((props) => (
  <div class="qwik-job">{props.data.title}</div>
));

const nodeTypes: NodeTypes = { job: JobCard as never };

describe('custom-node opt-in rule', () => {
  it('declaring a component for a type IS the opt-in', () => {
    const out = withCustomFlag(
      [
        { id: 'j1', type: 'job', position: { x: 0, y: 0 } },
        { id: 'p1', position: { x: 10, y: 0 }, label: 'Plain' },
      ] as NodeSpec[],
      nodeTypes
    );

    expect(out![0].custom).toBe(true);
    // A node with no `type` has nothing to match and stays on the SVG path.
    expect(out![1].custom).toBeUndefined();
  });

  it('a type with no component is left alone', () => {
    const out = withCustomFlag(
      [{ id: 'x', type: 'unregistered', position: { x: 0, y: 0 } }] as NodeSpec[],
      nodeTypes
    );
    expect(out![0].custom).toBeUndefined();
  });

  it('an explicit `custom` always wins — in both directions', () => {
    const out = withCustomFlag(
      [
        // opted OUT by hand even though `job` has a component
        { id: 'j1', type: 'job', position: { x: 0, y: 0 }, custom: false },
        // opted IN by hand with no component registered for the type
        { id: 'n1', type: 'nope', position: { x: 0, y: 0 }, custom: true },
      ] as NodeSpec[],
      nodeTypes
    );
    expect(out![0].custom).toBe(false);
    expect(out![1].custom).toBe(true);
  });

  it('does not mutate the caller’s specs', () => {
    const specs = [{ id: 'j1', type: 'job', position: { x: 0, y: 0 } }] as NodeSpec[];
    const out = withCustomFlag(specs, nodeTypes);

    expect(specs[0].custom).toBeUndefined();
    expect(out![0]).not.toBe(specs[0]);
  });

  it('passes specs straight through when no nodeTypes are given', () => {
    const specs = [{ id: 'j1', type: 'job', position: { x: 0, y: 0 } }] as NodeSpec[];
    expect(withCustomFlag(specs, undefined)).toBe(specs);
  });

  it('undefined in, undefined out (the uncontrolled case)', () => {
    expect(withCustomFlag(undefined, nodeTypes)).toBeUndefined();
  });
});
