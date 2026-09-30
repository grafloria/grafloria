/**
 * The bulk clears leave nothing behind that a single remove would have cleaned up.
 *
 * `removeLink` releases the link's ports and takes it out of the spatial index
 * the renderer culls through; `clearLinks` only emptied the map. The index went on
 * handing the renderer a link the model no longer had — it stayed on screen —
 * and a port with `maxConnections` stayed "full" of links that did not exist.
 * `clearNodes` left the node index the same way. (`clear()` was fine: it removes
 * one by one and then clears both indices.)
 */
import { importDiagramText } from '../serialization/TextFormat';

const EVERYWHERE = { x: -1e5, y: -1e5, width: 2e5, height: 2e5 };

describe('bulk clears', () => {
  it('clearLinks: nothing left in the culling index, and the ports are free again', () => {
    const d = importDiagramText('flowchart LR\n  a --> b\n  a --> c').diagram;
    const ports = d.getLinks().flatMap((l) => [d.getPortById(l.sourcePortId!), d.getPortById(l.targetPortId!)]);
    expect(d.getVisibleLinks(EVERYWHERE as never)).toHaveLength(2);
    expect(ports.every((p) => p && p.getConnectionCount() > 0)).toBe(true);

    d.clearLinks();

    expect(d.getLinks()).toHaveLength(0);
    expect(d.getVisibleLinks(EVERYWHERE as never)).toHaveLength(0);
    expect(ports.map((p) => p!.getConnectionCount())).toEqual(ports.map(() => 0));
  });

  it('clearNodes: nothing left in the culling index', () => {
    const d = importDiagramText('flowchart LR\n  a --> b').diagram;
    d.clearLinks();
    expect(d.getVisibleNodes(EVERYWHERE as never)).toHaveLength(2);

    d.clearNodes();

    expect(d.getNodes()).toHaveLength(0);
    expect(d.getVisibleNodes(EVERYWHERE as never)).toHaveLength(0);
  });
});
