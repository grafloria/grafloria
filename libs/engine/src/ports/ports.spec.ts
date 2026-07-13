// Wave 6 (Ports & connections) — engine seam.
//
// The through-line of every test here: DEFAULTS ARE THE OLD BEHAVIOUR. A port
// that sets none of the new config must resolve, validate and serialize exactly
// as it did before wave 6 — that is the contract the whole wave rests on.

import { DiagramEngine } from '../engine/DiagramEngine';
import { DiagramModel } from '../models/DiagramModel';
import { LinkModel } from '../models/LinkModel';
import { NodeModel } from '../models/NodeModel';
import { PortModel } from '../models/PortModel';
import {
  DEFAULT_PORT_GATING,
  buildDynamicPortCommands,
  evaluatePortConnection,
  planDynamicPorts,
  portGroupRegistry,
  portTypeRegistry,
  resolvePortConfig,
  setNodePortGroups,
  type PortGroupDefinition,
} from './index';

function makeNode(id: string, type = 'rect'): NodeModel {
  const node = new NodeModel({ type, position: { x: 0, y: 0 }, size: { width: 100, height: 60 } } as any);
  (node as any).id = id;
  return node;
}

function makePort(id: string, config: Partial<ConstructorParameters<typeof PortModel>[0]> = {}): PortModel {
  return new PortModel({ id, type: 'output', ...config } as any);
}

afterEach(() => {
  portGroupRegistry.clear();
  portTypeRegistry.clear();
});

// ===========================================================================
// Card 3 — named groups with inheritance
// ===========================================================================

describe('port groups (Card 3)', () => {
  it('a port with no group resolves to the pre-wave-6 defaults', () => {
    const node = makeNode('n1');
    const port = makePort('p1', { side: 'right' });
    node.addPort(port);

    const resolved = resolvePortConfig(port, node);

    expect(resolved.side).toBe('right');
    expect(resolved.groupId).toBeUndefined();
    expect(resolved.shape).toBeUndefined();
    expect(resolved.label).toBeUndefined();
    expect(resolved.layout).toBeUndefined();
    expect(resolved.gating).toEqual(DEFAULT_PORT_GATING);
  });

  it('inherits side, shape, label config and gating from the group', () => {
    const node = makeNode('n1');
    const group: PortGroupDefinition = {
      id: 'in',
      side: 'left',
      shape: { shape: 'diamond', size: 10 },
      label: { layout: 'orthogonal', offset: 8 },
      gating: { isConnectableStart: false, toMaxLinks: 1 },
      dataType: 'number',
    };
    setNodePortGroups(node, { in: group });

    // Declares ONLY its group and its own label text.
    const port = makePort('p1', { type: 'input', group: 'in', label: { text: 'A' } });
    node.addPort(port);

    const resolved = resolvePortConfig(port, node);

    expect(resolved.side).toBe('left'); // from the group, not the ctor default 'right'
    expect(resolved.shape).toEqual({ shape: 'diamond', size: 10 });
    expect(resolved.label).toEqual({ text: 'A', layout: 'orthogonal', offset: 8 });
    expect(resolved.gating.isConnectableStart).toBe(false);
    expect(resolved.gating.toMaxLinks).toBe(1);
    expect(resolved.dataType).toBe('number');
    expect(resolved.groupId).toBe('in');
  });

  it('the port overrides only what it declares; the rest still comes from the group', () => {
    const node = makeNode('n1');
    setNodePortGroups(node, {
      in: { id: 'in', side: 'left', shape: { shape: 'square', size: 8 }, dataType: 'number' },
    });

    const port = makePort('p1', {
      type: 'input',
      group: 'in',
      shape: { shape: 'triangle', size: 12 }, // override
      // dataType and side NOT declared → inherited
    });
    node.addPort(port);

    const resolved = resolvePortConfig(port, node);
    expect(resolved.shape).toEqual({ shape: 'triangle', size: 12 });
    expect(resolved.side).toBe('left');
    expect(resolved.dataType).toBe('number');
  });

  it("an explicitly declared side beats the group's", () => {
    const node = makeNode('n1');
    setNodePortGroups(node, { in: { id: 'in', side: 'left' } });

    const port = makePort('p1', { group: 'in', side: 'top' });
    node.addPort(port);

    expect(resolvePortConfig(port, node).side).toBe('top');
  });

  it('groups can be registered per NODE TYPE and inherited by every node of it', () => {
    portGroupRegistry.register('and-gate', { id: 'in', side: 'left', dataType: 'bool' });

    const node = makeNode('n1', 'and-gate');
    const port = makePort('p1', { type: 'input', group: 'in' });
    node.addPort(port);

    const resolved = resolvePortConfig(port, node);
    expect(resolved.side).toBe('left');
    expect(resolved.dataType).toBe('bool');
  });

  it("a group defined on the NODE beats the node type's", () => {
    portGroupRegistry.register('and-gate', { id: 'in', side: 'left', dataType: 'bool' });

    const node = makeNode('n1', 'and-gate');
    setNodePortGroups(node, { in: { id: 'in', side: 'bottom', dataType: 'number' } });
    const port = makePort('p1', { type: 'input', group: 'in' });
    node.addPort(port);

    const resolved = resolvePortConfig(port, node);
    expect(resolved.side).toBe('bottom');
    expect(resolved.dataType).toBe('number');
  });

  it('port style overrides group style PER KEY', () => {
    const node = makeNode('n1');
    setNodePortGroups(node, { in: { id: 'in', style: { fill: 'red', stroke: 'black' } } });

    const port = makePort('p1', { group: 'in', style: { fill: 'blue' } });
    node.addPort(port);

    expect(resolvePortConfig(port, node).style).toEqual({ fill: 'blue', stroke: 'black' });
  });
});

// ===========================================================================
// Card 2 — directional connectability gating
// ===========================================================================

describe('connection rules (Card 2)', () => {
  function pair(sourceConfig: any = {}, targetConfig: any = {}) {
    const sourceNode = makeNode('n1');
    const targetNode = makeNode('n2');
    const source = makePort('s', { type: 'output', ...sourceConfig });
    const target = makePort('t', { type: 'input', ...targetConfig });
    sourceNode.addPort(source);
    targetNode.addPort(target);
    return { sourceNode, targetNode, source, target };
  }

  it('an unconfigured output→input connection is allowed (the old default)', () => {
    const { source, target, sourceNode, targetNode } = pair();
    expect(evaluatePortConnection(source, target, { sourceNode, targetNode }).ok).toBe(true);
  });

  it('output→output is still rejected', () => {
    const { source, target, sourceNode, targetNode } = pair({}, { type: 'output' });
    const verdict = evaluatePortConnection(source, target, { sourceNode, targetNode });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('direction');
  });

  it('isConnectableStart=false blocks a link STARTING at the port but not ending there', () => {
    const { source, target, sourceNode, targetNode } = pair({ isConnectableStart: false, type: 'bi' }, { type: 'bi' });

    expect(evaluatePortConnection(source, target, { sourceNode, targetNode }).reason).toBe(
      'not-connectable-start'
    );
    // The reverse direction is a DIFFERENT question, and it is allowed.
    expect(
      evaluatePortConnection(target, source, { sourceNode: targetNode, targetNode: sourceNode }).ok
    ).toBe(true);
  });

  it('isConnectableEnd=false blocks a link ENDING at the port', () => {
    const { source, target, sourceNode, targetNode } = pair({}, { isConnectableEnd: false });
    expect(evaluatePortConnection(source, target, { sourceNode, targetNode }).reason).toBe(
      'not-connectable-end'
    );
  });

  it('fromMaxLinks caps OUTGOING links only — incoming ones do not count', () => {
    const { source, target, sourceNode, targetNode } = pair({ fromMaxLinks: 1 });

    source.addConnection('existing-in', 'target'); // an INCOMING link
    expect(evaluatePortConnection(source, target, { sourceNode, targetNode }).ok).toBe(true);

    source.addConnection('existing-out', 'source'); // now one OUTGOING
    expect(evaluatePortConnection(source, target, { sourceNode, targetNode }).reason).toBe(
      'from-max-links'
    );
  });

  it('toMaxLinks caps INCOMING links only', () => {
    const { source, target, sourceNode, targetNode } = pair({}, { toMaxLinks: 1 });

    target.addConnection('out', 'source');
    expect(evaluatePortConnection(source, target, { sourceNode, targetNode }).ok).toBe(true);

    target.addConnection('in', 'target');
    expect(evaluatePortConnection(source, target, { sourceNode, targetNode }).reason).toBe('to-max-links');
  });

  it('the total maxConnections cap is enforced — the interactive path never checked it', () => {
    const { source, target, sourceNode, targetNode } = pair({ maxConnections: 1 });
    source.addConnection('a');
    expect(evaluatePortConnection(source, target, { sourceNode, targetNode }).reason).toBe(
      'max-connections'
    );
  });

  it('a null maxConnections means UNLIMITED, not zero (the Infinity→null sentinel)', () => {
    const { source, target, sourceNode, targetNode } = pair();
    for (let i = 0; i < 50; i++) source.addConnection(`link-${i}`, 'source');
    expect(resolvePortConfig(source, sourceNode).gating.maxConnections).toBeNull();
    expect(evaluatePortConnection(source, target, { sourceNode, targetNode }).ok).toBe(true);
  });

  it('same-node links are rejected unless BOTH ports allow self-links', () => {
    const node = makeNode('n1');
    const a = makePort('a', { type: 'output' });
    const b = makePort('b', { type: 'input' });
    node.addPort(a);
    node.addPort(b);

    expect(evaluatePortConnection(a, b, { sourceNode: node, targetNode: node }).reason).toBe('self-link');

    a.allowSelfLink = true;
    b.allowSelfLink = true;
    expect(evaluatePortConnection(a, b, { sourceNode: node, targetNode: node }).ok).toBe(true);
  });

  it('a port linked to ITSELF needs allowSelfLink on that port', () => {
    const node = makeNode('n1');
    const port = makePort('p', { type: 'bi' });
    node.addPort(port);

    expect(evaluatePortConnection(port, port, { sourceNode: node, targetNode: node }).reason).toBe(
      'self-port'
    );

    port.allowSelfLink = true;
    expect(evaluatePortConnection(port, port, { sourceNode: node, targetNode: node }).ok).toBe(true);
  });

  it('allowDuplicateLinks=false rejects a second link between the same ports', () => {
    const { source, target, sourceNode, targetNode } = pair({ allowDuplicateLinks: false });
    const link = new LinkModel('s', 't');

    expect(
      evaluatePortConnection(source, target, { sourceNode, targetNode, links: [link] }).reason
    ).toBe('duplicate-link');
  });

  it('duplicates are allowed by default (preserving the old interactive behaviour)', () => {
    const { source, target, sourceNode, targetNode } = pair();
    const link = new LinkModel('s', 't');
    expect(evaluatePortConnection(source, target, { sourceNode, targetNode, links: [link] }).ok).toBe(
      true
    );
  });

  it('rejectDuplicatesByDefault lets proximity-connect keep its no-duplicates rule', () => {
    const { source, target, sourceNode, targetNode } = pair();
    const link = new LinkModel('s', 't');
    expect(
      evaluatePortConnection(source, target, {
        sourceNode,
        targetNode,
        links: [link],
        rejectDuplicatesByDefault: true,
      }).reason
    ).toBe('duplicate-link');
  });

  it('allowedTypes is finally enforced — it was dead config with no caller', () => {
    const { source, target, sourceNode, targetNode } = pair({}, { allowedTypes: ['number'] });

    expect(evaluatePortConnection(source, target, { sourceNode, targetNode }).reason).toBe(
      'allowed-types'
    );

    source.dataType = 'number';
    expect(evaluatePortConnection(source, target, { sourceNode, targetNode }).ok).toBe(true);
  });

  it('a rejection always carries a reason AND a human-readable message', () => {
    const { source, target, sourceNode, targetNode } = pair({}, { type: 'output' });
    const verdict = evaluatePortConnection(source, target, { sourceNode, targetNode });
    expect(verdict.reason).toBeTruthy();
    expect(typeof verdict.message).toBe('string');
    expect(verdict.message!.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Card 7 — typed data-flow ports
// ===========================================================================

describe('typed data-flow ports (Card 7)', () => {
  it('untyped ports connect to anything (every pre-wave-6 diagram still works)', () => {
    expect(portTypeRegistry.isCompatible(undefined, 'number')).toBe(true);
    expect(portTypeRegistry.isCompatible('number', undefined)).toBe(true);
    expect(portTypeRegistry.isCompatible(undefined, undefined)).toBe(true);
  });

  it('identical types connect; different unregistered types do not', () => {
    expect(portTypeRegistry.isCompatible('number', 'number')).toBe(true);
    expect(portTypeRegistry.isCompatible('number', 'string')).toBe(false);
  });

  it('compatibleWith widens a type, DIRECTIONALLY', () => {
    portTypeRegistry.register({ name: 'int', compatibleWith: ['float'] });
    portTypeRegistry.register({ name: 'float' });

    expect(portTypeRegistry.isCompatible('int', 'float')).toBe(true); // widening: ok
    expect(portTypeRegistry.isCompatible('float', 'int')).toBe(false); // lossy: not ok
  });

  it('the * wildcard fits everything', () => {
    portTypeRegistry.register({ name: 'any', compatibleWith: ['*'] });
    expect(portTypeRegistry.isCompatible('any', 'number')).toBe(true);
    expect(portTypeRegistry.isCompatible('number', '*')).toBe(true);
  });

  it('an incompatible data type rejects the connection with reason "data-type"', () => {
    portTypeRegistry.register({ name: 'number', color: '#3b82f6' });
    portTypeRegistry.register({ name: 'string', color: '#22c55e' });

    const sourceNode = makeNode('n1');
    const targetNode = makeNode('n2');
    const source = makePort('s', { type: 'output', dataType: 'number' });
    const target = makePort('t', { type: 'input', dataType: 'string' });
    sourceNode.addPort(source);
    targetNode.addPort(target);

    expect(evaluatePortConnection(source, target, { sourceNode, targetNode }).reason).toBe('data-type');
  });

  it('colour comes from the registered type', () => {
    portTypeRegistry.register({ name: 'number', color: '#3b82f6' });
    expect(portTypeRegistry.colorFor('number')).toBe('#3b82f6');
    expect(portTypeRegistry.colorFor('unregistered')).toBeUndefined();
    expect(portTypeRegistry.colorFor(undefined)).toBeUndefined();
  });
});

// ===========================================================================
// Card 7 — dynamic auto-ports
// ===========================================================================

describe('dynamic auto-ports (Card 7)', () => {
  function dynamicNode(spare = 1, max = 0): NodeModel {
    const node = makeNode('n1');
    setNodePortGroups(node, {
      in: { id: 'in', side: 'left', type: 'input', dynamic: { enabled: true, spare, max } },
    });
    return node;
  }

  it('does nothing for a group that is not dynamic', () => {
    const node = makeNode('n1');
    setNodePortGroups(node, { in: { id: 'in', side: 'left' } });
    node.addPort(makePort('in-0', { type: 'input', group: 'in' }));

    expect(planDynamicPorts(node)).toEqual({ add: [], remove: [] });
  });

  it('spawns a spare when the group has none free', () => {
    const node = dynamicNode();
    const port = makePort('in-0', { type: 'input', group: 'in' });
    port.addConnection('link-1', 'target'); // the last free port just got used
    node.addPort(port);

    const plan = planDynamicPorts(node);
    expect(plan.add).toHaveLength(1);
    expect(plan.add[0]!.id).toBe('in-1');
    expect(plan.add[0]!.group).toBe('in');
    expect(plan.add[0]!.type).toBe('input');
    expect(plan.add[0]!.dynamic).toBe(true);
  });

  it('is idempotent — a settled node plans nothing', () => {
    const node = dynamicNode();
    const used = makePort('in-0', { type: 'input', group: 'in' });
    used.addConnection('link-1', 'target');
    node.addPort(used);
    node.addPort(makePort('in-1', { type: 'input', group: 'in', dynamic: true }));

    expect(planDynamicPorts(node)).toEqual({ add: [], remove: [] });
  });

  it('retires a SURPLUS spare it spawned itself, newest first', () => {
    const node = dynamicNode();
    node.addPort(makePort('in-0', { type: 'input', group: 'in', index: 0, dynamic: true }));
    node.addPort(makePort('in-1', { type: 'input', group: 'in', index: 1, dynamic: true }));

    const plan = planDynamicPorts(node);
    expect(plan.remove).toEqual(['in-1']); // in-0 — the one the user is looking at — stays put
  });

  it('never retires an AUTHORED port, however free it is', () => {
    const node = dynamicNode();
    node.addPort(makePort('in-0', { type: 'input', group: 'in' })); // authored
    node.addPort(makePort('in-1', { type: 'input', group: 'in' })); // authored

    expect(planDynamicPorts(node).remove).toEqual([]);
  });

  it('honours the max cap', () => {
    const node = dynamicNode(1, 2);
    for (const id of ['in-0', 'in-1']) {
      const port = makePort(id, { type: 'input', group: 'in' });
      port.addConnection(`link-${id}`, 'target');
      node.addPort(port);
    }
    expect(planDynamicPorts(node).add).toEqual([]); // at the cap: no more
  });

  it('emits UNDOABLE commands, and undo really puts the port back', async () => {
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram('d');
    const node = dynamicNode();
    const port = makePort('in-0', { type: 'input', group: 'in' });
    port.addConnection('link-1', 'target');
    node.addPort(port);
    diagram.addNode(node);

    const commands = buildDynamicPortCommands(node);
    expect(commands).toHaveLength(1);

    await engine.commandManager.execute(commands[0]!);
    expect(diagram.getNode('n1')!.getPort('in-1')).toBeDefined();

    await engine.commandManager.undo();
    expect(diagram.getNode('n1')!.getPort('in-1')).toBeUndefined();
  });

  it('END TO END: wiring the last free port makes the engine spawn the next one', () => {
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram('d');

    // NOTE: NodeModel ships four default `bi` ports (top/right/bottom/left) that
    // belong to no group, so the allocator ignores them entirely. Count the
    // GROUP's members, which is the only population it manages.
    const membersOfIn = (nodeId: string) =>
      diagram.getNode(nodeId)!.getPorts().filter((p) => p.group === 'in');

    const sink = dynamicNode();
    sink.addPort(makePort('in-0', { type: 'input', group: 'in' }));
    diagram.addNode(sink);

    const source = makeNode('n2');
    source.addPort(makePort('out', { type: 'output' }));
    diagram.addNode(source);

    expect(membersOfIn('n1')).toHaveLength(1);

    const link = new LinkModel('out', 'in-0');
    link.setSourcePort('out', 'n2');
    link.setTargetPort('in-0', 'n1');
    diagram.addLink(link);

    // The allocator ran off `link:added` — a fresh free input is waiting.
    const members = membersOfIn('n1');
    expect(members).toHaveLength(2);
    expect(members.some((p) => p.id === 'in-1' && p.dynamic === true)).toBe(true);
  });

  it('END TO END: unwiring the port retires the spare the allocator spawned', () => {
    const engine = new DiagramEngine();
    const diagram = engine.createDiagram('d');
    const membersOfIn = () => diagram.getNode('n1')!.getPorts().filter((p) => p.group === 'in');

    const sink = dynamicNode();
    sink.addPort(makePort('in-0', { type: 'input', group: 'in' }));
    diagram.addNode(sink);

    const source = makeNode('n2');
    source.addPort(makePort('out', { type: 'output' }));
    diagram.addNode(source);

    const link = new LinkModel('out', 'in-0');
    link.setSourcePort('out', 'n2');
    link.setTargetPort('in-0', 'n1');
    diagram.addLink(link);
    expect(membersOfIn()).toHaveLength(2);

    diagram.removeLink(link.id);

    // in-0 is free again → two spares is one too many → the SPAWNED one goes.
    const members = membersOfIn();
    expect(members).toHaveLength(1);
    expect(members[0]!.id).toBe('in-0');
  });
});

// ===========================================================================
// Serialization — the byte-stability contract
// ===========================================================================

describe('PortModel serialization (wave 6)', () => {
  it('a port with no wave-6 config serializes to the SAME keys as before', () => {
    const port = makePort('p1', { side: 'right' });
    const json = port.serialize() as unknown as Record<string, unknown>;

    for (const key of [
      'group',
      'shape',
      'label',
      'layout',
      'fromSpot',
      'toSpot',
      'spread',
      'dataType',
      'isConnectableStart',
      'isConnectableEnd',
      'fromMaxLinks',
      'toMaxLinks',
      'allowSelfLink',
      'allowDuplicateLinks',
      'dynamic',
    ]) {
      expect(json).not.toHaveProperty(key);
    }
  });

  it('round-trips every wave-6 field', () => {
    const port = makePort('p1', {
      type: 'input',
      group: 'in',
      shape: { shape: 'diamond', size: 10 },
      label: { text: 'A', layout: 'radial' },
      layout: { strategy: 'sideLinear', args: { padding: 8 } },
      fromSpot: { spot: 'right', distance: 4 },
      toSpot: { spot: 'left' },
      spread: { enabled: true, spacing: 12 },
      dataType: 'number',
      isConnectableStart: false,
      toMaxLinks: 3,
      allowSelfLink: true,
      allowDuplicateLinks: false,
      dynamic: true,
    });

    const restored = PortModel.fromJSON(port.serialize());

    expect(restored.group).toBe('in');
    expect(restored.shape).toEqual({ shape: 'diamond', size: 10 });
    expect(restored.label).toEqual({ text: 'A', layout: 'radial' });
    expect(restored.layout).toEqual({ strategy: 'sideLinear', args: { padding: 8 } });
    expect(restored.fromSpot).toEqual({ spot: 'right', distance: 4 });
    expect(restored.toSpot).toEqual({ spot: 'left' });
    expect(restored.spread).toEqual({ enabled: true, spacing: 12 });
    expect(restored.dataType).toBe('number');
    expect(restored.isConnectableStart).toBe(false);
    expect(restored.toMaxLinks).toBe(3);
    expect(restored.allowSelfLink).toBe(true);
    expect(restored.allowDuplicateLinks).toBe(false);
    expect(restored.dynamic).toBe(true);
  });

  it('an Infinity directional cap round-trips as null (UNLIMITED), never as 0', () => {
    const port = makePort('p1');
    port.fromMaxLinks = Infinity as unknown as number;

    const json = port.serialize();
    expect(json.fromMaxLinks).toBeNull();

    // The bug this guards: JSON.stringify(Infinity) === 'null', and a `null` read
    // back as "0 links allowed" makes the port permanently unconnectable.
    const restored = PortModel.fromJSON(JSON.parse(JSON.stringify(json)));
    expect(restored.fromMaxLinks).toBeNull();

    const node = makeNode('n1');
    node.addPort(restored);
    expect(resolvePortConfig(restored, node).gating.fromMaxLinks).toBeNull();
  });

  it('the reconcile-on-load rebuilds DIRECTIONAL roles, not just the link set', () => {
    const diagram = new DiagramModel();
    const a = makeNode('n1');
    const b = makeNode('n2');
    const out = makePort('out', { type: 'output' });
    const inp = makePort('in', { type: 'input' });
    a.addPort(out);
    b.addPort(inp);
    diagram.addNode(a);
    diagram.addNode(b);

    const link = new LinkModel('out', 'in');
    diagram.addLink(link);

    diagram.reconcilePortConnections();

    expect(out.getFromLinkCount()).toBe(1);
    expect(out.getToLinkCount()).toBe(0);
    expect(inp.getToLinkCount()).toBe(1);
    expect(inp.getFromLinkCount()).toBe(0);
  });
});
