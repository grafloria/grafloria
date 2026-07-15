// wave14/model — DEFECT 2: removeNode() left the node's `diagram` back-reference standing.
//
// installNode() sets `node.diagram = this`; dispose() clears it; removeNode() — the one
// path that detaches a LIVE node — never did. A removed node therefore kept a strong ref
// to the whole diagram (leak-shaped), still saw its old diagram's read-only lock through
// writeBlocked(), and lied about its own state: "detached node" is a documented, freely
// mutable status (see NodeModel.writeBlocked) that this node never re-entered.
//
// The clear happens AFTER the removal events/ops have emitted: OpCapture serializes the
// entity's full state and unwatches it inside the trackChange('nodes', node, null)
// emission (capture.ts), and synchronous 'node:removed' listeners may still want the
// owning diagram — so both fire before the ref is dropped.

import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';

function node(id: string, x: number, y: number): NodeModel {
  const n = new NodeModel({ type: 'basic', position: { x, y }, size: { width: 100, height: 50 } });
  (n as unknown as { id: string }).id = id;
  return n;
}

describe('DEFECT 2 — removeNode clears the diagram back-reference (mirror of installNode)', () => {
  it('a removed node no longer points at the diagram it left', () => {
    const d = new DiagramModel('d');
    const n = node('n1', 10, 20);
    d.addNode(n);
    expect(n.diagram).toBe(d);

    d.removeNode('n1');

    expect(n.diagram).toBeUndefined();
  });

  it('…but only AFTER the removal has emitted — capture and listeners see the live ref', () => {
    const d = new DiagramModel('d');
    const n = node('n1', 10, 20);
    d.addNode(n);

    const seen: Array<{ event: string; diagram: DiagramModel | undefined }> = [];
    // The op-capture seam: trackChange('nodes', node, null) emits 'change' synchronously,
    // and capture serializes the entity + unwatches it right there (capture.ts:311).
    d.on('change', (entry: { property: string; oldValue: unknown; newValue: unknown }) => {
      if (entry.property === 'nodes' && entry.oldValue && !entry.newValue) {
        seen.push({ event: 'change(remove)', diagram: (entry.oldValue as NodeModel).diagram });
      }
    });
    d.on('node:removed', (removed: NodeModel) => {
      seen.push({ event: 'node:removed', diagram: removed.diagram });
    });

    d.removeNode('n1');

    expect(seen.map((s) => s.event)).toEqual(['change(remove)', 'node:removed']);
    for (const s of seen) {
      expect(s.diagram).toBe(d); // the ref survives THROUGH the emissions…
    }
    expect(n.diagram).toBeUndefined(); // …and is gone once removal completes
  });

  it('a removed node can be re-added to ANOTHER diagram and is fully re-wired', () => {
    const d1 = new DiagramModel('first');
    const d2 = new DiagramModel('second');
    const n = node('n1', 10, 20);
    d1.addNode(n);
    d1.removeNode('n1');

    expect(() => d2.addNode(n)).not.toThrow();
    expect(n.diagram).toBe(d2);
    expect(d2.getNode('n1')).toBe(n);

    // Re-wired for real: the second diagram's port index resolves this node's ports.
    const port = n.getPorts()[0];
    expect(port).toBeDefined();
    expect(d2.getNodeByPortId(port.id)).toBe(n);
  });
});
