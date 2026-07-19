// connectable:false — THE REPRODUCTION (live report, dashboard-builder).
//
// A dashboard widget is not a wiring endpoint: hovering a tile surfaced the
// four default side-port glyphs, advertising a connect gesture the engine's
// own connection rules (`ports/connection-rules.ts`) refuse for such a node as
// BOTH source and target. An affordance for a gesture that can never succeed
// is a ghost affordance — the same paint-and-input-agree principle the
// occlusion veto documents in `shouldRenderPort`.
//
// `behavior.connectable = false` already meant "refuse connections" to the
// engine, keyboard navigation and proximity snap. These tests pin the last
// mile: the RENDERER paints no port for such a node, in any visibility mode,
// and the interaction side (interaction-controller.spec.ts) agrees the port
// is not hoverable.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, NodeModel, PortVisibilityStrategy } from '@grafloria/engine';
import { LIGHT_THEME } from '../themes';
import type { VNode } from '../types/vnode.types';

const FULL_VIEW = { x: -2000, y: -2000, width: 8000, height: 8000 };

/** Depth-first: every VNode carrying a data-port-id under `v`. */
function portVNodes(v: VNode | undefined, out: VNode[] = []): VNode[] {
  if (!v || typeof v !== 'object') return out;
  if ((v.props as Record<string, unknown> | undefined)?.['data-port-id']) out.push(v);
  for (const c of (v.children ?? []) as VNode[]) portVNodes(c, out);
  return out;
}

describe('connectable:false nodes render NO port affordances', () => {
  let engine: DiagramEngine;
  let renderer: SVGRenderer;

  function addNode(connectable: boolean, hovered = true): NodeModel {
    const diagram = engine.getDiagram()!;
    const node = new NodeModel({
      type: 'default',
      position: { x: 40, y: 40 },
      size: { width: 120, height: 60 },
    });
    // NodeModel ships four default bi side ports — exactly what the dashboard
    // widgets had. Do not clear them; they are the reproduction.
    node.behavior.connectable = connectable;
    node.state.hovered = hovered;
    diagram.addNode(node);
    return node;
  }

  beforeEach(() => {
    engine = new DiagramEngine();
    engine.createDiagram('connectable');
    renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
  });

  it('a hovered connectable node shows its ports (the baseline the fix must not break)', () => {
    addNode(true, true);
    const root = renderer.render(FULL_VIEW, 1) as VNode;
    expect(portVNodes(root).length).toBeGreaterThan(0);
  });

  it('a hovered connectable:false node paints ZERO ports', () => {
    addNode(false, true);
    const root = renderer.render(FULL_VIEW, 1) as VNode;
    expect(portVNodes(root)).toHaveLength(0);
  });

  it('connectable:false beats even an explicit always-visible config', () => {
    // `portVisibility: 'always'` is the loudest the config can ask for ports.
    // The node-level refusal must still win: the engine will refuse the wire,
    // so the glyph would be a lie at any visibility.
    engine.setInteractionConfig({ portVisibility: PortVisibilityStrategy.ALWAYS });
    addNode(false, false);
    const root = renderer.render(FULL_VIEW, 1) as VNode;
    expect(portVNodes(root)).toHaveLength(0);
  });

  it('sibling nodes are independent — one silent widget does not hide a neighbour port', () => {
    const diagram = engine.getDiagram()!;
    addNode(false, true);
    const loud = new NodeModel({
      type: 'default',
      position: { x: 400, y: 40 },
      size: { width: 120, height: 60 },
    });
    loud.state.hovered = true;
    diagram.addNode(loud);

    const root = renderer.render(FULL_VIEW, 1) as VNode;
    const ports = portVNodes(root);
    expect(ports.length).toBeGreaterThan(0);
    const loudPortIds = new Set([...loud.getPorts().values()].map((p) => p.id));
    for (const vn of ports) {
      expect(loudPortIds.has((vn.props as Record<string, string>)['data-port-id'])).toBe(true);
    }
  });
});
