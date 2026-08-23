// Three ways the picture could go stale, and the invalidations that stop them.
//
// Each of these is the same shape of bug: something changed that no existing
// channel could see. The mutation epoch watches ENTITIES, the dirty flags watch
// ENTITIES, and the caches are keyed by entity id — so a change to a POLICY, to
// a NEIGHBOUR's name, or a render that was never meant for the screen at all,
// all slipped through and left the wrong thing drawn.

import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import { SVGRenderer } from './svg-renderer';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };

function scene(): { engine: DiagramEngine; diagram: DiagramModel; renderer: SVGRenderer } {
  const engine = new DiagramEngine();
  const diagram = engine.createDiagram('stale')!;

  for (const [id, x, label] of [
    ['a', 0, 'Start'],
    ['b', 300, 'End'],
  ] as Array<[string, number, string]>) {
    const node = new NodeModel({ type: 'basic', position: { x, y: 100 }, size: { width: 120, height: 60 } });
    (node as unknown as { id: string }).id = id;
    node.addPort(new PortModel({ id: `${id}-out`, type: 'output', side: 'right' }));
    node.addPort(new PortModel({ id: `${id}-in`, type: 'input', side: 'left' }));
    node.setMetadata('label', label);
    diagram.addNode(node);
  }

  const link = new LinkModel('a-out', 'b-in', 'orthogonal');
  (link as unknown as { id: string }).id = 'ab';
  diagram.addLink(link);

  return { engine, diagram, renderer: new SVGRenderer(engine, {}) };
}

/** Every aria-label in a rendered tree. */
function ariaLabels(vnode: VNode, out: string[] = []): string[] {
  const label = (vnode.props as Record<string, unknown> | undefined)?.['aria-label'];
  if (typeof label === 'string') out.push(label);
  for (const child of vnode.children ?? []) {
    if (child && typeof child === 'object') ariaLabels(child as VNode, out);
  }
  return out;
}

describe('SVGRenderer — the picture must not go stale', () => {
  describe('renaming a node', () => {
    it("updates every attached edge's accessible name", () => {
      const { diagram, renderer } = scene();

      const before = ariaLabels(renderer.render(VIEWPORT, 1));
      expect(before).toContain('Edge from Start to End');

      // The consumer-facing rename. Nothing about the LINK changes here, which
      // is exactly why the cached edge kept announcing the old name forever.
      diagram.getNode('a')!.setMetadata('label', 'Renamed Start');

      const after = ariaLabels(renderer.render(VIEWPORT, 1));
      expect(after).toContain('Edge from Renamed Start to End');
      expect(after).not.toContain('Edge from Start to End');

      renderer.dispose();
    });

    it('still serves the cache when nothing was renamed', () => {
      const { renderer } = scene();
      renderer.render(VIEWPORT, 1);
      const first = renderer.render(VIEWPORT, 1);
      const second = renderer.render(VIEWPORT, 1);
      // The frame gate still returns the same object — the wider key must not
      // have turned every frame into a rebuild.
      expect(second).toBe(first);
      renderer.dispose();
    });
  });

  describe('an export pass', () => {
    it('does not teach the quality governor, which judges only what it painted', () => {
      const { renderer } = scene();
      renderer.render(VIEWPORT, 1);
      const before = renderer.getQualityState().governor?.samples ?? 0;

      // An export renders the whole diagram at zoom 1 regardless of the viewport,
      // so on a big scene it is legitimately slow — and the governor used to read
      // that as "this machine cannot cope" and drop the tier under the user.
      //
      // Asserted on the SAMPLE COUNT, not on the resulting tier: a small scene
      // exports quickly enough that the tier would not move, so a tier assertion
      // passes whether or not the export was counted. The sample count is the
      // thing that is actually wrong — a frame nobody painted got a vote.
      renderer.exportSvgString();
      renderer.exportSvgString();

      expect(renderer.getQualityState().governor?.samples ?? 0).toBe(before);
      renderer.dispose();
    });

    it('leaves the on-screen frame gate armed with the on-screen frame', () => {
      const { renderer } = scene();
      renderer.render(VIEWPORT, 1);
      const onScreen = renderer.render(VIEWPORT, 1);

      renderer.exportSvgString();

      // Still the identical frame: the export neither replaced the gate's tree
      // with its own nor forced the next screen frame into a rebuild.
      expect(renderer.render(VIEWPORT, 1)).toBe(onScreen);
      renderer.dispose();
    });
  });

  describe('changing the LOD policy', () => {
    it('takes effect on the very next render', () => {
      const { diagram, renderer } = scene();
      const before = renderer.render(VIEWPORT, 1);

      // No entity moved, so neither the mutation epoch nor any dirty flag can
      // see this. Without an explicit announcement the next render was simply
      // skipped and the call appeared to do nothing at all.
      diagram.setLODConfig({
        tiers: [{ name: 'bare', minZoom: 0, features: new Set() }],
      } as never);

      const after = renderer.render(VIEWPORT, 1);
      expect(after).not.toBe(before);
      renderer.dispose();
    });

    it('redefining a tier under its existing name still repaints everything', () => {
      const { diagram, renderer } = scene();
      renderer.render(VIEWPORT, 1);
      const before = renderer.render(VIEWPORT, 1);

      // The nastier half: the per-entity cache keys carry the tier NAME, and a
      // redefinition keeps the name — so entities drawn before the change stayed
      // drawn under the old policy while new ones used the new one.
      diagram.registerLODTier({ name: 'high', minZoom: 0, features: new Set() } as never);

      expect(renderer.render(VIEWPORT, 1)).not.toBe(before);
      renderer.dispose();
    });
  });
});
