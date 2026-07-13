// Wave 7 — Card 7a. The bridge from the real model (wave-6 ports, wave-4 labels)
// to the layout layer.

import { NodeModel } from '../models/NodeModel';
import { LinkModel } from '../models/LinkModel';
import { PortModel } from '../models/PortModel';
import {
  isDefaultPort,
  declaredPorts,
  hasDeclaredPorts,
  derivePortInfos,
  resolvePortConstraint,
  toElkPortSide,
  estimateLabelBox,
  deriveLabelBoxes,
  linkLabelBox,
  reservedLabelSpace,
} from './port-label-bridge';

function makeNode(id: string): NodeModel {
  const node = new NodeModel({ id, type: 'default', position: { x: 0, y: 0 } });
  node.setSize(100, 60);
  return node;
}

function addDeclaredPort(
  node: NodeModel,
  id: string,
  side: 'left' | 'right' | 'top' | 'bottom',
  type: 'input' | 'output' | 'bi' = 'output',
  index = 0
): PortModel {
  const port = new PortModel({ id, type, side, index });
  port.nodeId = node.id;
  node.addPort(port);
  return port;
}

describe('port-label-bridge — ports', () => {
  it('treats the four auto-created ports as NOT declared', () => {
    // NodeModel.initializeDefaultPorts() invents top/right/bottom/left on every
    // node. If layout read those as constraints, every node would be pinned on
    // all four sides and port-awareness would make layouts WORSE.
    const node = makeNode('n1');

    expect(node.getPorts()).toHaveLength(4);
    expect(node.getPorts().every(isDefaultPort)).toBe(true);
    expect(declaredPorts(node)).toHaveLength(0);
    expect(hasDeclaredPorts(node)).toBe(false);
  });

  it('does NOT rely on explicitSide to spot an authored port', () => {
    // The trap: default ports are constructed with `side:`, so PortModel's
    // constructor sets explicitSide = true on them too. Anyone using that flag to
    // detect authored ports gets all four defaults back.
    const node = makeNode('n1');
    expect(node.getPorts().every((p) => p.explicitSide)).toBe(true);
    expect(hasDeclaredPorts(node)).toBe(false); // ...and yet: none are authored.
  });

  it('derives PortInfo only for author-declared ports', () => {
    const node = makeNode('n1');
    addDeclaredPort(node, 'p-out', 'right', 'output');

    const infos = derivePortInfos([node]);

    expect(infos).toHaveLength(1);
    expect(infos[0]).toMatchObject({
      id: 'p-out',
      nodeId: 'n1',
      preferredSide: 'right',
      direction: 'output',
    });
  });

  it('maps port type to flow direction', () => {
    const node = makeNode('n1');
    addDeclaredPort(node, 'in', 'left', 'input');
    addDeclaredPort(node, 'out', 'right', 'output');
    addDeclaredPort(node, 'both', 'top', 'bi');

    const byId = new Map(derivePortInfos([node]).map((p) => [p.id, p]));

    expect(byId.get('in')!.direction).toBe('input');
    expect(byId.get('out')!.direction).toBe('output');
    expect(byId.get('both')!.direction).toBe('bidirectional');
  });

  it('emits ports in a canonical order (determinism is a Card 0 invariant)', () => {
    const a = makeNode('a');
    const b = makeNode('b');
    addDeclaredPort(b, 'z', 'left', 'input');
    addDeclaredPort(a, 'y', 'right', 'output', 1);
    addDeclaredPort(a, 'x', 'right', 'output', 0);

    const ids = derivePortInfos([b, a]).map((p) => p.id);

    // Sorted by (nodeId, side, index, id) — NOT by Map insertion order.
    expect(ids).toEqual(['x', 'y', 'z']);
  });

  it('resolves the port constraint per node: authored => FIXED_SIDE, bare => FREE', () => {
    const bare = makeNode('bare');
    const authored = makeNode('authored');
    addDeclaredPort(authored, 'p', 'right', 'output');

    expect(resolvePortConstraint(bare, 'auto')).toBe('FREE');
    expect(resolvePortConstraint(authored, 'auto')).toBe('FIXED_SIDE');

    // Explicit modes override the per-node decision.
    expect(resolvePortConstraint(authored, 'free')).toBe('FREE');
    expect(resolvePortConstraint(bare, 'fixed-side')).toBe('FIXED_SIDE');
  });

  it('translates sides into ELK compass points', () => {
    expect(toElkPortSide('top')).toBe('NORTH');
    expect(toElkPortSide('right')).toBe('EAST');
    expect(toElkPortSide('bottom')).toBe('SOUTH');
    expect(toElkPortSide('left')).toBe('WEST');
  });
});

describe('port-label-bridge — labels', () => {
  function makeLink(): LinkModel {
    const link = new LinkModel('pa', 'pb');
    link.sourceNodeId = 'a';
    link.targetNodeId = 'b';
    return link;
  }

  function linkWithLabels(...texts: string[]): LinkModel {
    const link = makeLink();
    texts.forEach((text) => link.addLabel({ text, position: 0.5 }));
    return link;
  }

  it('sizes a label with the SAME heuristic the renderer draws with', () => {
    // renderer/src/svg/text-block.ts: width = text.length * fontSize * 0.6
    // renderer/src/svg/auto-size.ts:  height = lines * fontSize * 1.2, font 14.
    // If these drift, layout reserves one box and the renderer draws another.
    const box = estimateLabelBox({ id: 'L', text: 'hello', position: 0.5, offset: { x: 0, y: 0 } });

    expect(box.width).toBeCloseTo(5 * 14 * 0.6);
    expect(box.height).toBeCloseTo(1 * 14 * 1.2);
  });

  it('honours fontSize and padding from the label style', () => {
    const box = estimateLabelBox({
      id: 'L',
      text: 'abc',
      position: 0.5,
      offset: { x: 0, y: 0 },
      style: { fontSize: 20, padding: 4 },
    });

    expect(box.width).toBeCloseTo(3 * 20 * 0.6 + 8);
    expect(box.height).toBeCloseTo(20 * 1.2 + 8);
  });

  it('wraps multi-line labels so the reserved box is tall, not endlessly wide', () => {
    const box = estimateLabelBox({
      id: 'L',
      text: 'one two three four',
      position: 0.5,
      offset: { x: 0, y: 0 },
      textWrap: true,
      maxWidth: 40,
    });

    expect(box.height).toBeGreaterThan(14 * 1.2); // more than one line
    expect(box.width).toBeLessThanOrEqual(60);
  });

  it('reserves the MAX of a link\'s labels, never the sum', () => {
    // Three slot labels (source/centre/target) sit at different points along the
    // path — they do not stack. Summing would blow the ranks apart.
    const link = linkWithLabels('short', 'a much longer label');
    const box = linkLabelBox(link)!;

    const boxes = deriveLabelBoxes(link);
    expect(boxes).toHaveLength(2);
    expect(box.width).toBe(Math.max(boxes[0].width, boxes[1].width));
    expect(box.width).toBeLessThan(boxes[0].width + boxes[1].width);
  });

  it('ignores empty labels and reports no box for a bare link', () => {
    const bare = makeLink();
    expect(linkLabelBox(bare)).toBeUndefined();
    expect(deriveLabelBoxes(linkWithLabels(''))).toHaveLength(0);
  });

  it('summarises the space every labelled edge needs', () => {
    const l1 = linkWithLabels('x');
    const l2 = linkWithLabels('a much longer label');

    const space = reservedLabelSpace([l1, l2]);

    expect(space.width).toBeCloseTo(estimateLabelBox({ id: 'L', text: 'a much longer label', position: 0.5, offset: { x: 0, y: 0 } }).width);
    expect(space.height).toBeGreaterThan(0);
  });

  it('reserves nothing when no edge is labelled', () => {
    const bare = makeLink();
    expect(reservedLabelSpace([bare])).toEqual({ width: 0, height: 0 });
  });
});
