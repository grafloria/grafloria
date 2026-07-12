// svg-renderer.reconnection-preview.spec.ts
// Wave 2 (Edges & links): the endpoint-reconnection ghost preview.
// The renderer draws a dashed ghost from the STATIONARY endpoint to the cursor
// while an endpoint is being dragged, coloured by drop validity, and only when
// a reconnection preview is set on the engine (never alongside the new-link
// connection preview).

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine } from '@grafloria/engine';
import { DiagramModel, NodeModel, PortModel, LinkModel } from '@grafloria/engine';
import type { VNode } from '../types';

describe('SVGRenderer — endpoint reconnection preview (Wave 2)', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;
  let link: LinkModel;

  /** Find the first VNode with the given key anywhere in the tree. */
  function findByKey(node: VNode | null | undefined, key: string): VNode | null {
    if (!node) return null;
    if ((node as any).key === key) return node;
    for (const child of (node.children ?? []) as VNode[]) {
      const found = findByKey(child, key);
      if (found) return found;
    }
    return null;
  }

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('reconnect-preview')!;
    renderer = new SVGRenderer(engine);

    const a = new NodeModel({ type: 'test', id: 'A', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } });
    a.addPort(new PortModel({ id: 'A-out', type: 'output', side: 'right' }));
    diagram.addNode(a);

    const b = new NodeModel({ type: 'test', id: 'B', position: { x: 300, y: 0 }, size: { width: 100, height: 50 } });
    b.addPort(new PortModel({ id: 'B-in', type: 'input', side: 'left' }));
    diagram.addNode(b);

    link = new LinkModel('A-out', 'B-in', 'orthogonal');
    diagram.addLink(link);
    const sp = { x: 100, y: 25 };
    const tp = { x: 300, y: 25 };
    link.generatePath(sp, tp, 'right', 'left');
  });

  const viewport = { x: 0, y: 0, width: 800, height: 600 };

  it('renders NO ghost when there is no reconnection preview', () => {
    const root = renderer.render(viewport, 1);
    expect(findByKey(root, 'reconnection-preview')).toBeNull();
  });

  it('renders a dashed ghost from the stationary endpoint to the cursor', () => {
    engine.setReconnectionPreview({
      linkId: link.id,
      endpoint: 'target',
      mousePoint: { x: 420, y: 120 },
      isValid: false,
    });

    const root = renderer.render(viewport, 1);
    const ghost = findByKey(root, 'reconnection-preview');

    expect(ghost).not.toBeNull();
    expect(ghost!.props?.d).toBeTruthy();
    expect(ghost!.props?.strokeDasharray).toBe('5,5');
    expect(ghost!.props?.fill).toBe('none');
  });

  it('colours the ghost with the success colour for a valid drop', () => {
    engine.setReconnectionPreview({
      linkId: link.id,
      endpoint: 'target',
      mousePoint: { x: 420, y: 120 },
      isValid: true,
    });

    const root = renderer.render(viewport, 1);
    const ghost = findByKey(root, 'reconnection-preview');

    expect(ghost!.props?.stroke).toBe((renderer.getTheme() as any).colors.success);
  });

  it('does not render a ghost for an unknown link id', () => {
    engine.setReconnectionPreview({
      linkId: 'does-not-exist',
      endpoint: 'target',
      mousePoint: { x: 10, y: 10 },
      isValid: false,
    });

    const root = renderer.render(viewport, 1);
    expect(findByKey(root, 'reconnection-preview')).toBeNull();
  });
});
