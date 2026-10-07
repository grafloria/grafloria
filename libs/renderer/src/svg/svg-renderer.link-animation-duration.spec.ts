// `LinkAnimation.duration` — in the type, documented as milliseconds, and ignored.
//
// The renderer turned `type`, `speed` and `direction` into classes and dropped
// `duration` on the floor, so `{ type: 'flow', duration: 3000 }` ran at the class's
// default speed. It is now an inline `animation-duration` on the link path: it beats
// the `speed` classes (an explicit duration is the more specific ask), while the
// reduced-motion / performance / battery rules, which are `!important`, still win.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, LinkModel, PortModel } from '@grafloria/engine';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 1200, height: 800 };

describe('SVGRenderer — LinkAnimation.duration', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;
  let link: LinkModel;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('anim')!;
    renderer = new SVGRenderer(engine, {});
    const a = new NodeModel({ id: 'a', type: 'basic', position: { x: 100, y: 100 }, size: { width: 100, height: 50 } });
    a.addPort(new PortModel({ id: 'ao', type: 'output', side: 'right' }));
    const b = new NodeModel({ id: 'b', type: 'basic', position: { x: 500, y: 100 }, size: { width: 100, height: 50 } });
    b.addPort(new PortModel({ id: 'bi', type: 'input', side: 'left' }));
    diagram.addNode(a);
    diagram.addNode(b);
    link = new LinkModel('ao', 'bi');
    diagram.addLink(link);
  });

  afterEach(() => {
    renderer.dispose();
    engine.destroy();
  });

  /** The visible link path (the hit area and markers skipped). */
  const linkPath = (): any => {
    const root = renderer.render(VIEWPORT, 1) as VNode;
    const find = (v: any): any => {
      if (!v || typeof v !== 'object') return undefined;
      if (v.key === `link-${link.id}`) return v;
      for (const c of v.children ?? []) { const f = find(c); if (f) return f; }
      return undefined;
    };
    return (find(root)?.children ?? []).find(
      (c: any) => c?.type === 'path' && String(c.props?.className ?? '').includes('diagram-link'));
  };

  it('sets the animation duration from `duration` (milliseconds)', () => {
    link.updateStyle({ animation: { type: 'flow', duration: 3000 } });
    const path = linkPath();
    expect(path.props.className).toContain('link-animated-flow');
    expect(String(path.props.style)).toContain('animation-duration: 3000ms');
  });

  it('an explicit duration wins over the speed preset', () => {
    link.updateStyle({ animation: { type: 'marching-ants', speed: 'fast', duration: 4500 } });
    expect(String(linkPath().props.style)).toContain('animation-duration: 4500ms');
  });

  it('no duration, a nonsense duration, or no animation → no inline duration', () => {
    link.updateStyle({ animation: { type: 'flow' } });
    expect(String(linkPath().props.style ?? '')).not.toContain('animation-duration');
    link.updateStyle({ animation: { type: 'flow', duration: -5 } });
    expect(String(linkPath().props.style ?? '')).not.toContain('animation-duration');
    link.updateStyle({ animation: { type: 'none', duration: 3000 } });
    expect(String(linkPath().props.style ?? '')).not.toContain('animation-duration');
  });
});
