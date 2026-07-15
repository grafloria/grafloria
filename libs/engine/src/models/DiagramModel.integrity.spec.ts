import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';
import { LinkModel } from './LinkModel';
import { PortModel } from './PortModel';
import { RemoveNodeCommand } from '../commands/basic/RemoveNodeCommand';

/**
 * Wave 10 (gallery) — the two derived-state invariants `DiagramModel` did not keep.
 *
 * Both were found by DRIVING THE PUBLIC API in a browser, not by reading code, and both
 * had full green unit suites around the machinery that was supposed to enforce them.
 *
 *  1. `removeNode()` left every link attached to the node in the diagram — still in
 *     `getLinks()`, still PAINTED. Every removal path goes through it (`deleteSelected()`,
 *     which is what the Delete key calls; `applyNodes()`, which is what `setNodes()` calls;
 *     `RemoveNodeCommand`), so deleting a node in the middle of a flow left two dangling
 *     edges hanging off nothing. `deleteSelected()` even carried the comment "this will
 *     also trigger link cleanup via events" — nothing listened.
 *
 *  2. `addLink()` / `removeLink()` never registered the link on its PORTS. `installLink()`
 *     is the single install choke point and it skipped the bookkeeping that
 *     `createSmartLink()` and the engine's interactive connect path both do by hand, so
 *     `port.getConnectionCount()` was 0 for every link built from a spec — and
 *     `maxConnections`, whose only enforcement reads that counter, could never fire.
 */
describe('DiagramModel — derived-state integrity (wave 10)', () => {
  const nodeWith = (id: string, ports: Array<{ id: string; type?: 'input' | 'output' | 'bi' }>) => {
    const node = new NodeModel({
      id,
      type: 'rect',
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
    });
    node.ports.clear();
    for (const p of ports) {
      node.addPort(new PortModel({ id: p.id, type: p.type ?? 'bi', side: 'right' }));
    }
    return node;
  };

  describe('removeNode() cascades the links attached to it', () => {
    let model: DiagramModel;

    beforeEach(() => {
      model = new DiagramModel('d');
      model.addNode(nodeWith('a', [{ id: 'a_out', type: 'output' }]));
      model.addNode(nodeWith('b', [{ id: 'b_in', type: 'input' }, { id: 'b_out', type: 'output' }]));
      model.addNode(nodeWith('c', [{ id: 'c_in', type: 'input' }]));
      model.addLink(new LinkModel('a_out', 'b_in'));
      model.addLink(new LinkModel('b_out', 'c_in'));
    });

    it('drops both links when the MIDDLE node goes', () => {
      expect(model.getLinks()).toHaveLength(2);
      model.removeNode('b');
      expect(model.getLinks()).toHaveLength(0);
    });

    it('leaves a link that does NOT touch the removed node alone', () => {
      model.removeNode('a'); // only a→b touches 'a'
      expect(model.getLinks().map((l) => l.sourcePortId)).toEqual(['b_out']);
    });

    it('emits link:removed for each cascaded link, so a host repaints', () => {
      const removed: string[] = [];
      model.on('link:removed', (link: LinkModel) => removed.push(link.id));
      const ids = model.getLinks().map((l) => l.id);
      model.removeNode('b');
      expect(removed.sort()).toEqual([...ids].sort());
    });

    it('cascades through deleteSelected() — what the Delete key calls', () => {
      model.getNode('b')!.setSelected(true);
      model.deleteSelected();
      expect(model.getLinks()).toHaveLength(0);
    });

    it('releases the port bookkeeping of the cascaded links', () => {
      const cIn = model.getNode('c')!.getPort('c_in')!;
      expect(cIn.getConnectionCount()).toBe(1);
      model.removeNode('b');
      expect(cIn.getConnectionCount()).toBe(0);
    });
  });

  describe('addLink()/removeLink() keep the ports’ connection registry', () => {
    let model: DiagramModel;
    let link: LinkModel;

    beforeEach(() => {
      model = new DiagramModel('d');
      model.addNode(nodeWith('a', [{ id: 'a_out', type: 'output' }]));
      model.addNode(nodeWith('b', [{ id: 'b_in', type: 'input' }]));
      link = new LinkModel('a_out', 'b_in');
      model.addLink(link);
    });

    it('registers the link on BOTH ports (it registered on neither)', () => {
      expect(model.getPortById('a_out')!.getConnectionCount()).toBe(1);
      expect(model.getPortById('b_in')!.getConnectionCount()).toBe(1);
    });

    it('records the role, so directional limits can be enforced', () => {
      expect(model.getPortById('a_out')!.getFromLinkCount()).toBe(1);
      expect(model.getPortById('b_in')!.getToLinkCount()).toBe(1);
    });

    it('deregisters on removeLink()', () => {
      model.removeLink(link.id);
      expect(model.getPortById('a_out')!.getConnectionCount()).toBe(0);
      expect(model.getPortById('b_in')!.getConnectionCount()).toBe(0);
    });

    it('makes maxConnections enforceable — port.canConnect() finally tells the truth', () => {
      const out = model.getPortById('a_out')!;
      out.maxConnections = 1;
      // One link already exists, from the spec. Before the fix the port reported 0
      // connections, so it cheerfully accepted a second.
      expect(out.canConnect()).toBe(false);
    });

    it('does NOT throw when a loaded graph already exceeds a since-tightened limit', () => {
      const out = model.getPortById('a_out')!;
      out.maxConnections = 1;
      model.addNode(nodeWith('c', [{ id: 'c_in', type: 'input' }]));
      // restoreConnection semantics: loading is not enforcement.
      expect(() => model.addLink(new LinkModel('a_out', 'c_in'))).not.toThrow();
      expect(out.getConnectionCount()).toBe(2);
    });

    it('is idempotent with call sites that already registered by hand', () => {
      model.addNode(nodeWith('c', [{ id: 'c_in', type: 'input' }]));
      const out = model.getPortById('a_out')!;
      const second = new LinkModel('a_out', 'c_in');
      out.addConnection(second.id, 'source'); // what createSmartLink()/the engine do
      model.addLink(second);
      expect(out.getConnectionCount()).toBe(2); // not 3
    });
  });

  describe('RemoveNodeCommand undo restores the cascaded links', () => {
    it('brings the node back WITH its edges', () => {
      const model = new DiagramModel('d');
      model.addNode(nodeWith('a', [{ id: 'a_out', type: 'output' }]));
      model.addNode(
        nodeWith('b', [{ id: 'b_in', type: 'input' }, { id: 'b_out', type: 'output' }])
      );
      model.addNode(nodeWith('c', [{ id: 'c_in', type: 'input' }]));
      model.addLink(new LinkModel('a_out', 'b_in'));
      model.addLink(new LinkModel('b_out', 'c_in'));

      const command = new RemoveNodeCommand('b');
      const context = { diagram: model } as never;

      command.execute(context);
      expect(model.getNodes()).toHaveLength(2);
      expect(model.getLinks()).toHaveLength(0); // cascaded

      command.undo(context);
      expect(model.getNodes()).toHaveLength(3);
      // The cascade must not make undo lossy: the edges come back too.
      expect(model.getLinks()).toHaveLength(2);
      expect(model.getPortById('b_in')!.getConnectionCount()).toBe(1);
    });
  });
});
