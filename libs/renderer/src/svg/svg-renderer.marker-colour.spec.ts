// A link that brings its OWN arrowHead/arrowTail (the ER and UML kits do, for their
// notations) but no marker colour painted its markers BLACK — ArrowRenderer's default —
// on a #64748b line. A marker without a colour of its own takes its line's colour, the
// same as the default head always did.
import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, LinkModel, NodeModel, PortModel } from '@grafloria/engine';
import { LIGHT_THEME } from '../themes';
import type { VNode } from '../types';

const VIEWPORT = { x: 0, y: 0, width: 800, height: 600 };

function findByKey(vnode: any, key: string): any {
  if (!vnode) return undefined;
  if (vnode.key === key) return vnode;
  for (const child of vnode.children ?? []) {
    const found = findByKey(child, key);
    if (found) return found;
  }
  return undefined;
}

/** Every stroke/fill painted inside the link's arrow markers (class `arrow`), attribute or inline style. */
function markerPaints(group: any): string[] {
  const out: string[] = [];
  const read = (v: any) => {
    for (const k of ['stroke', 'fill']) if (typeof v.props?.[k] === 'string') out.push(v.props[k]);
    const s = v.props?.style;
    if (s && typeof s === 'object') for (const k of ['stroke', 'fill']) if (typeof s[k] === 'string') out.push(s[k]);
    if (typeof s === 'string') for (const d of s.split(';')) { const [k, val] = d.split(':'); if (/^\s*(stroke|fill)\s*$/.test(k ?? '')) out.push(val.trim()); }
  };
  const walk = (v: any, inArrow: boolean) => {
    if (!v) return;
    const cls = typeof v.props?.className === 'string' ? v.props.className.split(/\s+/) : [];
    const here = inArrow || cls.includes('arrow');
    if (here) read(v);
    for (const c of v.children ?? []) walk(c, here);
  };
  walk(group, false);
  return out;
}

describe('a marker without a colour takes its line colour', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;
  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('t')!;
  });
  afterEach(() => { renderer?.dispose(); engine.destroy(); });

  function addLink(style: Record<string, unknown>): LinkModel {
    const s = new NodeModel({ type: 'basic', position: { x: 50, y: 50 }, size: { width: 80, height: 40 } });
    const t = new NodeModel({ type: 'basic', position: { x: 300, y: 200 }, size: { width: 80, height: 40 } });
    s.addPort(new PortModel({ id: 'p-out', type: 'output', side: 'right' }));
    t.addPort(new PortModel({ id: 'p-in', type: 'input', side: 'left' }));
    diagram.addNode(s);
    diagram.addNode(t);
    const link = new LinkModel('p-out', 'p-in');
    link.updateStyle(style as any);
    diagram.addLink(link);
    return link;
  }

  it.each([[true], [false]])('ER crow-foot head and one tail are #64748b, not black (CSS mode %s)', (useCSSMode) => {
    renderer = new SVGRenderer(engine, { useCSSMode }, LIGHT_THEME);
    const link = addLink({
      stroke: '#64748b', strokeWidth: 1.5,
      arrowTail: { type: 'one', size: 8, filled: false },
      arrowHead: { type: 'crow-foot', size: 9, filled: false },
    });
    const paints = markerPaints(findByKey(renderer.render(VIEWPORT, 1) as VNode, `link-${link.id}`));
    expect(paints.length).toBeGreaterThan(0);
    expect(paints).not.toContain('#000000');
    expect(paints).toContain('#64748b');
  });

  it("a marker's own colour still wins", () => {
    renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
    const link = addLink({ stroke: '#64748b', arrowHead: { type: 'crow-foot', size: 9, filled: false, color: '#dc2626' } });
    const paints = markerPaints(findByKey(renderer.render(VIEWPORT, 1) as VNode, `link-${link.id}`));
    expect(paints).toContain('#dc2626');
    expect(paints).not.toContain('#64748b');
  });
});
