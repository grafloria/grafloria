// Wave 5 (Edge routing) — Card 6: group-aware / hierarchical obstacle routing.
//
// Engine side: the shared ObstacleMap follows GROUP state — a collapsed group
// (with geometry) is ONE solid obstacle and its hidden members leave the map;
// expanding reverses both, idempotently, driven by the groups' own collapse/
// expand events. Router side: Manhattan's soft containment keeps a sibling
// edge inside its group when an inside route exists, without forbidding escape.

import { DiagramEngine } from '../engine/DiagramEngine';
import { NodeModel } from '../models/NodeModel';
import { GroupModel } from '../models/GroupModel';
import { ManhattanRouter } from './algorithms/ManhattanRouter';
import type { RoutedPath } from './types';

describe('group-aware obstacles (Wave 5, Card 6)', () => {
  describe('engine: the ObstacleMap follows group state', () => {
    let engine: DiagramEngine;

    beforeEach(() => {
      engine = new DiagramEngine();
    });

    afterEach(() => {
      engine.destroy();
    });

    function setup() {
      const diagram = engine.createDiagram('g6')!;
      const a = new NodeModel({ type: 'basic', position: { x: 100, y: 100 }, size: { width: 80, height: 40 } });
      const b = new NodeModel({ type: 'basic', position: { x: 300, y: 100 }, size: { width: 80, height: 40 } });
      diagram.addNode(a);
      diagram.addNode(b);
      const group = new GroupModel({ id: 'grp', name: 'G' });
      group.members = new Set([a.id, b.id]);
      group.position = { x: 80, y: 80 };
      group.size = { width: 320, height: 100, depth: 0 };
      diagram.addGroup(group);
      return { diagram, a, b, group };
    }

    it('collapse: members leave the map, the group becomes one solid obstacle', () => {
      const { a, b, group } = setup();
      const map = engine.getRoutingEngine();
      expect(map.getObstacleCount()).toBe(2); // the two nodes

      group.collapse();

      const ids = map.getObstacles().map((o) => o.id).sort();
      expect(ids).toEqual(['grp']);
      expect(map.getObstacles()[0]).toMatchObject({ kind: 'group', x: 80, y: 80, width: 320 });
      // member obstacles are gone
      expect(ids).not.toContain(a.id);
      expect(ids).not.toContain(b.id);
    });

    it('expand: members come back, the group block goes away', () => {
      const { a, b, group } = setup();
      group.collapse();
      group.expand();

      const ids = engine.getRoutingEngine().getObstacles().map((o) => o.id).sort();
      expect(ids).toEqual([a.id, b.id].sort());
    });

    it('nested collapse: a collapsed group hidden inside another collapsed group does NOT block', () => {
      const { diagram, group } = setup();
      const outer = new GroupModel({ id: 'outer', name: 'O' });
      outer.members = new Set([group.id]);
      group.parentGroupId = 'outer';
      outer.position = { x: 60, y: 60 };
      outer.size = { width: 400, height: 160, depth: 0 };
      diagram.addGroup(outer);

      group.collapse();
      outer.collapse();

      const ids = engine.getRoutingEngine().getObstacles().map((o) => o.id).sort();
      // only the OUTER block remains: inner group + all nodes are hidden
      expect(ids).toEqual(['outer']);
    });

    it('refreshGroupObstacles is idempotent (the grouping feature may call it after batches)', () => {
      const { group } = setup();
      group.collapse();
      engine.refreshGroupObstacles();
      engine.refreshGroupObstacles();
      expect(engine.getRoutingEngine().getObstacles().map((o) => o.id)).toEqual(['grp']);
    });
  });

  describe('Manhattan: soft same-group containment', () => {
    it('stays inside the container when an inside route exists — and still escapes when obstacles force it', () => {
      const router = new ManhattanRouter();
      const container = { x: 0, y: 0, width: 400, height: 200 };

      // Endpoints near the container's left and right edges; an obstacle in the
      // middle. Without the penalty, going OVER the top (outside) is as cheap as
      // detouring inside; with it, the inside route must win.
      const wall = { id: 'wall', x: 180, y: 0, width: 40, height: 120 };
      const path = router.route({
        start: { x: 20, y: 60 },
        end: { x: 380, y: 60 },
        sourceDirection: 'right',
        targetDirection: 'left',
        obstacles: [wall],
        options: { gridSize: 20, obstacleMargin: 10, container, containerPenalty: 100 },
      }) as RoutedPath;

      expect(path).not.toBeNull();
      for (const p of path.points) {
        expect(p.x).toBeGreaterThanOrEqual(container.x - 1);
        expect(p.x).toBeLessThanOrEqual(container.x + container.width + 1);
        expect(p.y).toBeGreaterThanOrEqual(container.y - 1);
        expect(p.y).toBeLessThanOrEqual(container.y + container.height + 1);
      }

      // …but a wall spanning the WHOLE container height forces an escape: the
      // penalty biases, it must not imprison.
      const fullWall = { id: 'wall', x: 180, y: -20, width: 40, height: 240 };
      const escape = router.route({
        start: { x: 20, y: 60 },
        end: { x: 380, y: 60 },
        sourceDirection: 'right',
        targetDirection: 'left',
        obstacles: [fullWall],
        options: { gridSize: 20, obstacleMargin: 10, container, containerPenalty: 100 },
      }) as RoutedPath;
      expect(escape).not.toBeNull();
      const escaped = escape.points.some(
        (p) => p.y < container.y - 1 || p.y > container.y + container.height + 1
      );
      expect(escaped).toBe(true);
    });
  });
});
