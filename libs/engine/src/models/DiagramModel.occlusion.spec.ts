/**
 * isPointCoveredAbove — the port occlusion oracle.
 *
 * Found live (stacked pasted nodes): hovering a node that another node
 * partially covers floated its buried port glyphs ON TOP of the covering
 * node's body, and those hidden ports still won the hover/press race through
 * it. The renderer (paint) and the interaction controller (hover/press) both
 * consult this oracle so the two sides agree the covered port does not exist.
 *
 * Contract: same z-order as getNodeAtPosition (array order, topmost last),
 * same shape-aware containment.
 */
import { DiagramModel } from './DiagramModel';
import { NodeModel } from './NodeModel';

const addNode = (
  diagram: DiagramModel,
  x: number,
  y: number,
  shape?: string
): NodeModel => {
  const node = new NodeModel({
    type: 'rect',
    position: { x, y },
    size: { width: 100, height: 60, depth: 0 },
  });
  if (shape) node.setMetadata('shape', { type: shape });
  diagram.addNode(node);
  return node;
};

describe('DiagramModel.isPointCoveredAbove (port occlusion oracle)', () => {
  let diagram: DiagramModel;

  beforeEach(() => {
    diagram = new DiagramModel();
  });

  it('a point under a LATER-ADDED overlapping node is covered', () => {
    const under = addNode(diagram, 0, 0);
    addNode(diagram, 50, 30); // covers under's bottom-right quadrant

    // under's right-side port anchor (100, 30) sits inside the top node.
    expect(diagram.isPointCoveredAbove(100, 30, under.id)).toBe(true);
    // under's left-side anchor (0, 30) is in the open.
    expect(diagram.isPointCoveredAbove(0, 30, under.id)).toBe(false);
  });

  it('nodes BELOW the owner never cover it, even when they contain the point', () => {
    addNode(diagram, 0, 0); // below
    const top = addNode(diagram, 50, 30);

    // top's left anchor (50, 60) is inside the lower node — but that node is
    // UNDER top, so nothing covers it.
    expect(diagram.isPointCoveredAbove(50, 60, top.id)).toBe(false);
  });

  it('exact stacking: every anchor of the buried node is covered, none of the top one', () => {
    const under = addNode(diagram, 0, 0);
    const top = addNode(diagram, 0, 0);

    for (const [x, y] of [[50, 0], [100, 30], [50, 60], [0, 30]]) {
      expect(diagram.isPointCoveredAbove(x, y, under.id)).toBe(true);
      expect(diagram.isPointCoveredAbove(x, y, top.id)).toBe(false);
    }
  });

  it('containment is shape-aware, not bounding-box (diamond corners are open)', () => {
    const under = addNode(diagram, 0, 0);
    addNode(diagram, 50, 30, 'diamond');

    // (55, 35) is inside the diamond's bbox but OUTSIDE the diamond itself —
    // right next to its top-left corner.
    expect(diagram.isPointCoveredAbove(55, 35, under.id)).toBe(false);
    // The diamond's centre region really covers.
    expect(diagram.isPointCoveredAbove(100, 60, under.id)).toBe(true);
  });

  it('unknown node id is never covered (defensive)', () => {
    addNode(diagram, 0, 0);
    expect(diagram.isPointCoveredAbove(50, 30, 'nope')).toBe(false);
  });

  /**
   * The window-chrome carve-out: ports paint in an overlay above node bodies
   * PRECISELY so a composite's own chrome (a title-bar child covering the
   * parent's top strip) cannot bury the parent's ports. A descendant is part
   * of the same widget — only strangers occlude.
   */
  it("a node's own descendant never occludes it; a stranger at the same spot does", () => {
    const win = addNode(diagram, 100, 100);
    const chrome = addNode(diagram, 100, 100); // covers win's top strip
    chrome.setParent(win.id);

    // win's top-side port anchor (150, 100) is inside chrome.
    expect(diagram.isPointCoveredAbove(150, 100, win.id)).toBe(false);

    // A grandchild keeps the exemption.
    const inner = addNode(diagram, 100, 100);
    inner.setParent(chrome.id);
    expect(diagram.isPointCoveredAbove(150, 100, win.id)).toBe(false);

    // An unrelated node on the same spot still covers.
    addNode(diagram, 100, 100);
    expect(diagram.isPointCoveredAbove(150, 100, win.id)).toBe(true);
  });
});
