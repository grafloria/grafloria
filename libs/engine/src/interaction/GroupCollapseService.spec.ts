// GroupCollapseService.spec.ts — Wave-5 Card 4: real collapse / expand.
//
// Covers: member hiding, placeholder "group-as-node", boundary-edge re-homing +
// parallel-crossing aggregation with a count label, internal-link removal,
// exact expand restore, one-command undo through the CommandManager, and a
// lossless serialize/load round-trip of the collapsed state (+ expand after load).

import { DiagramModel } from '../models/DiagramModel';
import { GroupModel } from '../models/GroupModel';
import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { GroupCollapseService } from './GroupCollapseService';
import { DiagramEngine } from '../engine/DiagramEngine';

function node(id: string, x: number, y: number): NodeModel {
  return new NodeModel({ id, type: 'default', position: { x, y }, size: { width: 40, height: 40 } });
}

/** Connect src→tgt using each node's right/left default port; returns the link. */
function connect(d: DiagramModel, src: NodeModel, tgt: NodeModel, id?: string): LinkModel {
  const sp = src.getPortBySide('right')!;
  const tp = tgt.getPortBySide('left')!;
  const link = new LinkModel(sp.id, tp.id);
  if (id) (link as unknown as { id: string }).id = id;
  d.addLink(link);
  return link;
}

/**
 * Scenario: group G = {a, b}; external x, y.
 * Links: a→b (internal), a→x, a→x (parallel), b→y.
 */
function buildScenario(): {
  diagram: DiagramModel;
  group: GroupModel;
  a: NodeModel;
  b: NodeModel;
  x: NodeModel;
  y: NodeModel;
  internal: LinkModel;
  ax1: LinkModel;
  ax2: LinkModel;
  by: LinkModel;
} {
  const diagram = new DiagramModel();
  const a = node('a', 0, 0);
  const b = node('b', 60, 0);
  const x = node('x', 300, 0);
  const y = node('y', 300, 200);
  [a, b, x, y].forEach((n) => diagram.addNode(n));

  const group = new GroupModel({ id: 'G', name: 'Group G' });
  diagram.addGroup(group);
  group.addMember('a', diagram);
  group.addMember('b', diagram);
  group.setFrame({ x: -10, y: -10, width: 120, height: 60 });

  const internal = connect(diagram, a, b);
  const ax1 = connect(diagram, a, x);
  const ax2 = connect(diagram, a, x);
  const by = connect(diagram, b, y);

  return { diagram, group, a, b, x, y, internal, ax1, ax2, by };
}

describe('GroupCollapseService (Wave-5 Card 4)', () => {
  describe('collapse', () => {
    it('hides all member nodes', () => {
      const { diagram, group, a, b } = buildScenario();
      new GroupCollapseService(diagram).collapse(group);
      expect(a.state.visible).toBe(false);
      expect(b.state.visible).toBe(false);
      expect(group.isCollapsed).toBe(true);
    });

    it('spawns a placeholder group-as-node tagged with the group id', () => {
      const { diagram, group } = buildScenario();
      new GroupCollapseService(diagram).collapse(group);
      const proxy = diagram.getProxyNodeForGroup('G');
      expect(proxy).toBeDefined();
      expect(diagram.isProxyNode(proxy!)).toBe(true);
      expect(proxy!.getData('label')).toBe('Group G');
      expect(group.collapsedState?.proxyNodeId).toBe(proxy!.id);
    });

    it('removes internal links and re-homes boundary links to the placeholder', () => {
      const { diagram, group, internal, x } = buildScenario();
      new GroupCollapseService(diagram).collapse(group);
      const proxy = diagram.getProxyNodeForGroup('G')!;

      // internal a→b is gone from the live model
      expect(diagram.getLink(internal.id)).toBeUndefined();

      // exactly two survivors remain (one per external node), both on the proxy
      const live = diagram.getLinks();
      expect(live.length).toBe(2);
      for (const l of live) {
        const endpoints = [l.sourceNodeId, l.targetNodeId];
        expect(endpoints).toContain(proxy.id);
      }
      // x still has an incident survivor
      expect(live.some((l) => l.targetNodeId === x.id || l.sourceNodeId === x.id)).toBe(true);
    });

    it('aggregates parallel crossings into one labelled proxy (label = count)', () => {
      const { diagram, group, ax1, ax2 } = buildScenario();
      new GroupCollapseService(diagram).collapse(group);

      // Only one of the two a→x links survives; it carries a "2" label.
      const survivors = [ax1, ax2].filter((l) => diagram.getLink(l.id));
      expect(survivors.length).toBe(1);
      const survivor = survivors[0];
      expect(survivor.getMetadata('__proxyAggregateCount')).toBe(2);
      expect(survivor.labels.some((lb) => lb.text === '2')).toBe(true);

      const entry = group.collapsedState!.proxyLinks.find((p) => p.linkId === survivor.id);
      expect(entry?.aggregatedCount).toBe(2);
    });

    it('single crossings get no synthetic label', () => {
      const { diagram, group, by } = buildScenario();
      new GroupCollapseService(diagram).collapse(group);
      expect(by.labels.length).toBe(0);
      expect(by.getMetadata('__proxyAggregateCount')).toBe(1);
    });

    it('supports a custom proxy-label hook', () => {
      const { diagram, group } = buildScenario();
      new GroupCollapseService(diagram).collapse(group, {
        proxyLabel: ({ count, direction }) => `${direction}:${count}`,
      });
      const labels = diagram
        .getLinks()
        .flatMap((l) => l.labels.map((lb) => lb.text));
      expect(labels).toContain('out:2');
      expect(labels).toContain('out:1');
    });

    it('shrinks the group to the placeholder and is a no-op when already collapsed', () => {
      const { diagram, group } = buildScenario();
      const svc = new GroupCollapseService(diagram);
      svc.collapse(group);
      const nodeCountAfterFirst = diagram.getNodes().length;
      svc.collapse(group); // no-op
      expect(diagram.getNodes().length).toBe(nodeCountAfterFirst);
      expect(group.getOuterBounds().width).toBe(180);
    });
  });

  describe('expand restores exactly', () => {
    it('restores members, positions, links and geometry', () => {
      const { diagram, group, a, b, internal, ax1, ax2, by } = buildScenario();
      const beforeLinks = diagram.getLinks().map((l) => l.id).sort();
      const beforeFrame = group.getOuterBounds();
      const svc = new GroupCollapseService(diagram);

      svc.collapse(group);
      svc.expand(group);

      // placeholder gone, members visible again
      expect(diagram.getProxyNodeForGroup('G')).toBeUndefined();
      expect(a.state.visible).toBe(true);
      expect(b.state.visible).toBe(true);
      expect(group.isCollapsed).toBe(false);
      expect(group.collapsedState).toBeUndefined();

      // every original link is back with its original endpoints
      const afterLinks = diagram.getLinks().map((l) => l.id).sort();
      expect(afterLinks).toEqual(beforeLinks);
      expect(diagram.getLink(internal.id)).toBeDefined();
      expect(diagram.getLink(ax1.id)).toBeDefined();
      expect(diagram.getLink(ax2.id)).toBeDefined();

      // survivor's endpoint restored off the placeholder
      const survivor = diagram.getLink(by.id)!;
      expect(survivor.sourceNodeId).toBe('b');
      expect(survivor.labels.length).toBe(0);

      // geometry restored exactly
      expect(group.getOuterBounds()).toEqual(beforeFrame);
    });
  });

  describe('undo as one command', () => {
    it('collapse then undo restores the diagram via the CommandManager', async () => {
      const engine = new DiagramEngine();
      const diagram = engine.createDiagram('C')!;
      const a = node('a', 0, 0);
      const b = node('b', 60, 0);
      const x = node('x', 300, 0);
      [a, b, x].forEach((n) => diagram.addNode(n));
      const group = new GroupModel({ id: 'G', name: 'G' });
      diagram.addGroup(group);
      group.addMember('a', diagram);
      group.addMember('b', diagram);
      connect(diagram, a, b);
      connect(diagram, a, x);

      const linkCount = diagram.getLinks().length;
      const nodeCount = diagram.getNodes().length;

      await engine.collapseGroup('G');
      expect(group.isCollapsed).toBe(true);
      expect(diagram.getProxyNodeForGroup('G')).toBeDefined();

      await engine.undo();
      expect(group.isCollapsed).toBe(false);
      expect(diagram.getProxyNodeForGroup('G')).toBeUndefined();
      expect(diagram.getLinks().length).toBe(linkCount);
      expect(diagram.getNodes().length).toBe(nodeCount);
      expect(a.state.visible).toBe(true);
    });
  });

  describe('round-trip', () => {
    it('serializes a collapsed diagram losslessly and can still expand after load', () => {
      const { diagram, group } = buildScenario();
      new GroupCollapseService(diagram).collapse(group);

      const json = diagram.serialize();
      const reloaded = DiagramModel.fromJSON(JSON.parse(JSON.stringify(json)));

      // Invariant: serialize(fromJSON(serialize(d))) === serialize(d).
      expect(JSON.stringify(reloaded.serialize())).toEqual(JSON.stringify(json));

      // The reloaded collapsed group still expands cleanly.
      const rg = reloaded.getGroup('G')!;
      expect(rg.isCollapsed).toBe(true);
      expect(reloaded.getProxyNodeForGroup('G')).toBeDefined();

      new GroupCollapseService(reloaded).expand(rg);
      expect(rg.isCollapsed).toBe(false);
      expect(reloaded.getProxyNodeForGroup('G')).toBeUndefined();
      expect(reloaded.getNode('a')?.state.visible).toBe(true);
      // original 4 links restored
      expect(reloaded.getLinks().length).toBe(4);
    });
  });
});
