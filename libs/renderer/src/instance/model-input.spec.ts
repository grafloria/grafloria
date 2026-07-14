import { DiagramEngine, LinkModel, NodeModel } from '@grafloria/engine';
import {
  applyEdges,
  applyNodes,
  buildNode,
  defaultPortId,
  resolvePortId,
  toEdgeSpec,
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

  // =========================================================================
  // wave10/gallery — REACHABILITY. Every field below is declared on the model,
  // consumed by the renderer/validator, and was DROPPED by this translator.
  // These tests exist because a unit test on PortModel proves PortModel works;
  // it never proves that anything a host can call ever builds one.
  // =========================================================================
  describe('wave10 — the wave-6 port vocabulary survives the spec layer', () => {
    it('carries glyph / label / layout / dataType / group onto the PortModel', () => {
      const { model } = freshDiagram();
      applyNodes(model, [
        {
          id: 'n',
          position: { x: 0, y: 0 },
          size: { width: 120, height: 80 },
          metadata: {
            portGroups: {
              in: { id: 'in', side: 'left', layout: { strategy: 'sideLinear' } },
            },
          },
          ports: [
            {
              id: 'p1',
              group: 'in',
              type: 'input',
              shape: { shape: 'diamond', size: 14 },
              label: { text: 'amount', layout: 'outside' },
              layout: { strategy: 'sideLinear', args: { padding: 8 } },
              dataType: 'number',
              spread: { enabled: true, spacing: 12 },
              style: { fill: '#f0f' },
            },
          ],
        },
      ]);

      const port = model.getNode('n')!.getPort('p1')!;
      expect(port.shape).toEqual({ shape: 'diamond', size: 14 });
      expect(port.label).toEqual({ text: 'amount', layout: 'outside' });
      expect(port.layout).toEqual({ strategy: 'sideLinear', args: { padding: 8 } });
      expect(port.dataType).toBe('number');
      expect(port.group).toBe('in');
      expect(port.spread).toEqual({ enabled: true, spacing: 12 });
      expect(port.style).toEqual({ fill: '#f0f' });
    });

    it('a port with a group but no side does NOT claim an explicit side', () => {
      // explicitSide exists so a group's side is not clobbered by the model's
      // `right` default. Passing `side: undefined` through would have set it.
      const { model } = freshDiagram();
      applyNodes(model, [
        {
          id: 'n',
          position: { x: 0, y: 0 },
          size: { width: 100, height: 50 },
          ports: [{ id: 'p', group: 'in', type: 'input' }],
        },
      ]);
      expect(model.getNode('n')!.getPort('p')!.explicitSide).toBe(false);
    });

    it('a port that DOES declare a side keeps explicitSide true', () => {
      const { model } = freshDiagram();
      applyNodes(model, [
        {
          id: 'n',
          position: { x: 0, y: 0 },
          size: { width: 100, height: 50 },
          ports: [{ id: 'p', side: 'top', type: 'input' }],
        },
      ]);
      const port = model.getNode('n')!.getPort('p')!;
      expect(port.explicitSide).toBe(true);
      expect(port.side).toBe('top');
    });

    it('carries directional gating so a full port can actually refuse a link', () => {
      const { model } = freshDiagram();
      applyNodes(model, [
        {
          id: 'n',
          position: { x: 0, y: 0 },
          size: { width: 100, height: 50 },
          ports: [
            {
              id: 'only-one',
              side: 'left',
              type: 'input',
              gating: {
                isConnectableStart: false,
                toMaxLinks: 1,
                allowedTypes: ['number'],
              },
            },
          ],
        },
      ]);

      const port = model.getNode('n')!.getPort('only-one')!;
      expect(port.isConnectableStart).toBe(false);
      expect(port.toMaxLinks).toBe(1);
      expect([...port.allowedTypes]).toEqual(['number']);
    });
  });

  describe('wave10 — router / connector / metadata / points survive the spec layer', () => {
    it('sets the explicit router and connector (wave-5 Card 0 split fields)', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A, B]);
      applyEdges(model, [
        { id: 'e', source: 'a', target: 'b', router: 'avoid', connector: 'rounded' },
      ]);

      const link = model.getLink('e')!;
      expect(link.router).toBe('avoid');
      expect(link.connector).toBe('rounded');
      expect(link.effectiveRouter()).toBe('avoid');
      expect(link.effectiveConnector()).toBe('rounded');
    });

    it('carries metadata — which is how floating edges are named per link', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A, B]);
      applyEdges(model, [
        {
          id: 'e',
          source: 'a',
          target: 'b',
          metadata: { connectionPoint: 'smart', sourceAnchor: 'perimeter' },
        },
      ]);

      const link = model.getLink('e')!;
      expect(link.getMetadata('connectionPoint')).toBe('smart');
      expect(link.getMetadata('sourceAnchor')).toBe('perimeter');
    });

    it('carries explicit waypoints', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A, B]);
      applyEdges(model, [
        { id: 'e', source: 'a', target: 'b', points: [{ x: 0, y: 0 }, { x: 50, y: 90 }, { x: 300, y: 0 }] },
      ]);
      expect(model.getLink('e')!.points).toHaveLength(3);
    });

    it('round-trips router/connector back out through toEdgeSpec', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A, B]);
      applyEdges(model, [{ id: 'e', source: 'a', target: 'b', router: 'manhattan' }]);
      expect(toEdgeSpec(model.getLink('e')!).router).toBe('manhattan');
    });

    it('updating an existing edge switches its router (the reconcile path)', () => {
      const { model } = freshDiagram();
      applyNodes(model, [A, B]);
      applyEdges(model, [{ id: 'e', source: 'a', target: 'b', router: 'orthogonal' }]);
      applyEdges(model, [{ id: 'e', source: 'a', target: 'b', router: 'avoid' }]);
      expect(model.getLink('e')!.effectiveRouter()).toBe('avoid');
    });
  });
});
