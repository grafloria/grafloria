// wave12/group-visuals — THE REPRODUCTION.
//
// Groups have been model-complete since Wave 7: they drive layout, membership,
// collapse and routing. But the SVG renderer never drew a FRAME for one. A
// grouped/subflow container — the whole point of grouping — was invisible.
//
// These tests drive the real SVGRenderer, add a real GroupModel, render, and
// assert the DOM (VNode tree) carries a themed frame at the group's bounds with
// its name and an accessible container role. Every one of them FAILED before the
// groups layer existed — that is what makes this a reproduction and not theatre.

import { SVGRenderer } from './svg-renderer';
import { DiagramEngine, DiagramModel, NodeModel, GroupModel } from '@grafloria/engine';
import { LIGHT_THEME } from '../themes';
import type { VNode } from '../types/vnode.types';

function findLayer(vnode: VNode | undefined, className: string): VNode | undefined {
  if (!vnode || typeof vnode !== 'object') return undefined;
  if ((vnode.props as any)?.className === className) return vnode;
  for (const child of (vnode.children ?? []) as VNode[]) {
    const hit = findLayer(child, className);
    if (hit) return hit;
  }
  return undefined;
}

/** Every VNode in the tree with `data-group-id === id`. */
function findGroupFrame(root: VNode, id: string): VNode | undefined {
  const walk = (v: VNode | undefined): VNode | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    if ((v.props as any)?.['data-group-id'] === id) return v;
    for (const c of (v.children ?? []) as VNode[]) {
      const hit = walk(c);
      if (hit) return hit;
    }
    return undefined;
  };
  return walk(root);
}

/** Depth-first collect of every rect VNode under a subtree. */
function rectsUnder(v: VNode | undefined, out: VNode[] = []): VNode[] {
  if (!v || typeof v !== 'object') return out;
  if (v.type === 'rect') out.push(v);
  for (const c of (v.children ?? []) as VNode[]) rectsUnder(c, out);
  return out;
}

/** Depth-first collect of every text VNode's textContent under a subtree. */
function textsUnder(v: VNode | undefined, out: string[] = []): string[] {
  if (!v || typeof v !== 'object') return out;
  if (v.type === 'text' && typeof (v.props as any)?.textContent === 'string') {
    out.push((v.props as any).textContent);
  }
  for (const c of (v.children ?? []) as VNode[]) textsUnder(c, out);
  return out;
}

const FULL_VIEW = { x: -2000, y: -2000, width: 8000, height: 8000 };

describe('wave12/group-visuals — the SVG renderer draws a frame for every group', () => {
  let engine: DiagramEngine;
  let diagram: DiagramModel;
  let renderer: SVGRenderer;

  beforeEach(() => {
    engine = new DiagramEngine();
    diagram = engine.createDiagram('groups')!;
    renderer = new SVGRenderer(engine, {}, LIGHT_THEME);
  });

  function addNode(id: string, x: number, y: number): NodeModel {
    const n = new NodeModel({ id, type: 'default', position: { x, y }, size: { width: 80, height: 40 } });
    diagram.addNode(n);
    return n;
  }

  function addGroup(id: string, name: string, rect: { x: number; y: number; width: number; height: number }): GroupModel {
    const g = new GroupModel({ id, name });
    diagram.addGroup(g);
    g.setFrame(rect);
    return g;
  }

  it('renders a groups-layer containing a frame <rect> at the group bounds', () => {
    addNode('a', 60, 60);
    addGroup('g1', 'Pipeline', { x: 40, y: 40, width: 220, height: 160 });

    const root = renderer.render(FULL_VIEW, 1);

    const layer = findLayer(root, 'groups-layer');
    expect(layer).toBeDefined();

    const frame = findGroupFrame(root, 'g1');
    expect(frame).toBeDefined();

    // A real <rect> at the group's outer bounds — not a decorative near-miss.
    const rect = rectsUnder(frame).find(
      (r) => Number((r.props as any).width) === 220 && Number((r.props as any).height) === 160
    );
    expect(rect).toBeDefined();
    expect(Number((rect!.props as any).x)).toBe(40);
    expect(Number((rect!.props as any).y)).toBe(40);
  });

  it('shows the group name as a label', () => {
    addGroup('g1', 'Ingest pipeline', { x: 0, y: 0, width: 200, height: 120 });
    const root = renderer.render(FULL_VIEW, 1);
    const frame = findGroupFrame(root, 'g1')!;
    expect(textsUnder(frame)).toContain('Ingest pipeline');
  });

  it('gives the frame a container ARIA role and names it with the group name', () => {
    addGroup('g1', 'Payments', { x: 0, y: 0, width: 200, height: 120 });
    const root = renderer.render(FULL_VIEW, 1);
    const frame = findGroupFrame(root, 'g1')!;
    // A container of graphics symbols — the W3C Graphics ARIA role — named by the group.
    expect((frame.props as any).role).toBe('graphics-object');
    expect((frame.props as any)['aria-label']).toBe('Payments');
  });

  it('styles a collapsed group distinctly from an expanded one', () => {
    addGroup('open', 'Open', { x: 0, y: 0, width: 200, height: 120 });
    const collapsed = addGroup('shut', 'Shut', { x: 400, y: 0, width: 200, height: 120 });
    collapsed.isCollapsed = true;

    const root = renderer.render(FULL_VIEW, 1);
    const openFrame = findGroupFrame(root, 'open')!;
    const shutFrame = findGroupFrame(root, 'shut')!;

    expect((shutFrame.props as any)['data-collapsed']).toBe('true');
    expect((openFrame.props as any)['data-collapsed']).not.toBe('true');
    // The two must not be pixel-identical: something in the frame differs.
    const openRect = rectsUnder(openFrame)[0].props as any;
    const shutRect = rectsUnder(shutFrame)[0].props as any;
    const differs =
      openRect.strokeDasharray !== shutRect.strokeDasharray ||
      openRect.fill !== shutRect.fill ||
      openRect.fillOpacity !== shutRect.fillOpacity;
    expect(differs).toBe(true);
  });

  it('draws a parent group BEHIND its nested child (document order)', () => {
    const parent = addGroup('parent', 'Parent', { x: 0, y: 0, width: 400, height: 300 });
    const child = new GroupModel({ id: 'child', name: 'Child' });
    diagram.addGroup(child);
    child.setFrame({ x: 40, y: 40, width: 150, height: 120 });
    parent.addMember('child', diagram); // nest: child.parentGroupId = parent

    const root = renderer.render(FULL_VIEW, 1);
    const layer = findLayer(root, 'groups-layer')!;
    const order = (layer.children ?? []).map((c) => (c!.props as any)['data-group-id']);
    expect(order.indexOf('parent')).toBeLessThan(order.indexOf('child'));
  });

  it('paints the groups layer BEHIND links and nodes (earlier in document order)', () => {
    addNode('a', 60, 60);
    addGroup('g1', 'G', { x: 0, y: 0, width: 200, height: 120 });
    const root = renderer.render(FULL_VIEW, 1);
    const kids = (root.children ?? []) as VNode[];
    const groupsIdx = kids.findIndex((c) => (c.props as any)?.className === 'groups-layer');
    const linksIdx = kids.findIndex((c) => (c.props as any)?.className === 'links-layer');
    const nodesIdx = kids.findIndex((c) => (c.props as any)?.className === 'nodes-layer');
    expect(groupsIdx).toBeGreaterThanOrEqual(0);
    expect(groupsIdx).toBeLessThan(linksIdx);
    expect(groupsIdx).toBeLessThan(nodesIdx);
  });

  it('culls a group whose frame is entirely off-screen', () => {
    addGroup('near', 'Near', { x: 0, y: 0, width: 100, height: 100 });
    addGroup('far', 'Far', { x: 50000, y: 50000, width: 100, height: 100 });
    const root = renderer.render({ x: -100, y: -100, width: 500, height: 500 }, 1);
    expect(findGroupFrame(root, 'near')).toBeDefined();
    expect(findGroupFrame(root, 'far')).toBeUndefined();
  });

  it('PRESERVES the positional contract: with NO groups, children[0]=links, children[1]=nodes', () => {
    addNode('a', 0, 0);
    const root = renderer.render(FULL_VIEW, 1);
    const kids = (root.children ?? []) as VNode[];
    expect((kids[0].props as any).className).toContain('links-layer');
    expect((kids[1].props as any).className).toContain('nodes-layer');
    // And no empty groups-layer is emitted when there are no groups.
    expect(findLayer(root, 'groups-layer')).toBeUndefined();
  });
});
