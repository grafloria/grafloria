import { DiagramEngine, LinkModel, NodeModel } from '@grafloria/engine';
import {
  applyEdges,
  applyNodes,
  buildNode,
  defaultPortId,
  resolvePortId,
} from './model-input';
import type { EdgeSpec, NodeSpec } from './model-input';

function freshDiagram() {
  const engine = new DiagramEngine();
  return { engine, model: engine.createDiagram('t') };
}

const A: NodeSpec = { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } };
const B: NodeSpec = { id: 'b', position: { x: 300, y: 0 }, size: { width: 100, height: 50 } };

describe('model-input — spec → model', () => {
  describe('determinism (the precondition for SSR hydration)', () => {
    it('gives ids-less nodes/edges a stable index-based id, never a nanoid', () => {
      const { model } = freshDiagram();
      applyNodes(model, [
        { position: { x: 0, y: 0 } },
        { position: { x: 200, y: 0 } },
      ]);
      applyEdges(model, [{ source: 'node-0', target: 'node-1' }]);

      expect(model.getNodes().map((n) => n.id)).toEqual(['node-0', 'node-1']);
      expect(model.getLinks().map((l) => l.id)).toEqual(['edge-0']);
    });

    it('replaces the engine\'s nanoid auto-ports with deterministic ones', () => {
      // The renderer emits `port-<id>` as a VNode key, so random port ids would
      // make the server and the client disagree on every key.
      const bare = new NodeModel({ id: 'x', type: 'rect', position: { x: 0, y: 0 } });
      const bareIds = bare.getPorts().map((p) => p.id);
      expect(bareIds.some((id) => id.startsWith('x__'))).toBe(false); // engine default

      const node = buildNode({ id: 'x', position: { x: 0, y: 0 } }, 0);
      expect(node.getPorts().map((p) => p.id).sort()).toEqual([
        'x__bottom',
        'x__left',
        'x__right',
        'x__top',
      ]);
    });

    it('two independent builds of the same spec produce identical ids', () => {
      const first = freshDiagram();
      const second = freshDiagram();
      const specs: NodeSpec[] = [{ position: { x: 1, y: 2 } }, { position: { x: 3, y: 4 } }];

      applyNodes(first.model, specs);
      applyNodes(second.model, specs);

      const portIds = (m: typeof first.model) =>
        m.getNodes().flatMap((n) => n.getPorts().map((p) => p.id));

      expect(portIds(first.model)).toEqual(portIds(second.model));
    });
  });

  describe('port resolution', () => {
    it('defaults source→right and target→left', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A, B]);
      applyEdges(model, [{ id: 'e', source: 'a', target: 'b' }]);

      const link = model.getLink('e')!;
      expect(link.sourcePortId).toBe(defaultPortId('a', 'right'));
      expect(link.targetPortId).toBe(defaultPortId('b', 'left'));
      expect(link.sourceNodeId).toBe('a');
      expect(link.targetNodeId).toBe('b');
    });

    it('accepts a side name as a handle', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A, B]);
      applyEdges(model, [
        { id: 'e', source: 'a', target: 'b', sourceHandle: 'bottom', targetHandle: 'top' },
      ]);

      const link = model.getLink('e')!;
      expect(link.sourcePortId).toBe('a__bottom');
      expect(link.targetPortId).toBe('b__top');
    });

    it('accepts an explicit port id, and a raw port id as the endpoint', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A, B]);
      expect(resolvePortId(model, 'a', 'a__top', 'right')).toBe('a__top');
      expect(resolvePortId(model, 'a__top', undefined, 'right')).toBe('a__top');
    });

    it('drops an edge whose endpoint does not exist rather than throwing', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A]);
      applyEdges(model, [{ id: 'e', source: 'a', target: 'ghost' }]);
      expect(model.getLinks()).toHaveLength(0);
    });
  });

  describe('reconciliation', () => {
    it('adds, updates and removes to match the spec list', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A, B]);
      expect(model.getNodes()).toHaveLength(2);

      applyNodes(model, [{ ...A, position: { x: 40, y: 60 } }]);

      expect(model.getNodes().map((n) => n.id)).toEqual(['a']);
      expect(model.getNode('a')!.position).toMatchObject({ x: 40, y: 60 });
    });

    it('reuses the SAME NodeModel object across updates (identity is stability)', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A]);
      const first = model.getNode('a');

      applyNodes(model, [{ ...A, position: { x: 5, y: 5 } }]);

      expect(model.getNode('a')).toBe(first);
    });

    it('passes live models through untouched', () => {
      const { model } = freshDiagram();
      const node = new NodeModel({ id: 'live', type: 'rect', position: { x: 0, y: 0 } });
      applyNodes(model, [node]);
      expect(model.getNode('live')).toBe(node);
    });

    it('maps label / shape / custom onto metadata', () => {
      const { model } = freshDiagram();
      applyNodes(model, [{ ...A, label: 'Hi', shape: { type: 'circle' }, custom: true }]);

      const node = model.getNode('a')!;
      expect(node.getMetadata('label')).toBe('Hi');
      expect(node.getMetadata('shape')).toEqual({ type: 'circle' });
      expect(node.getMetadata('useHTMLLayer')).toBe(true);
    });

    it('honours selected / draggable / selectable flags', () => {
      const { model } = freshDiagram();
      applyNodes(model, [{ ...A, selected: true, draggable: false }]);

      const node = model.getNode('a')!;
      expect(node.isSelected()).toBe(true);
      expect(node.isDraggable()).toBe(false);
    });

    it('updates an existing edge in place (type + selection)', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A, B]);
      const edge: EdgeSpec = { id: 'e', source: 'a', target: 'b', type: 'smooth' };
      applyEdges(model, [edge]);
      const link = model.getLink('e')!;

      applyEdges(model, [{ ...edge, type: 'orthogonal', selected: true }]);

      expect(model.getLink('e')).toBe(link);
      expect(link.pathType).toBe('orthogonal');
      expect(link.state).toBe('selected');
    });

    it('passes live LinkModels through untouched', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A, B]);
      const link = new LinkModel('a__right', 'b__left', 'direct');
      applyEdges(model, [link]);
      expect(model.getLink(link.id)).toBe(link);
    });
  });
});
