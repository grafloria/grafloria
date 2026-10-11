/**
 * S2 (docs review v4): the container layout ignored the frame's padding and
 * title band, and drifted on every fit.
 *
 * group-and-nest-nodes groups two boxes, gives the group a 2-column grid
 * (`120px 120px`, gap 24), applies it, then fits the frame. The grid placed the
 * members at the frame's OUTER corner — on the title band — and stretched the
 * `120px` columns over the frame's width; each fit then moved the frame up by
 * padding + header and the layout followed it, so "Stage" (the parent frame)
 * ended at y = −20 after one round, and lower after every further one.
 *
 * Rules:
 *  - a container lays its members out in its CONTENT box: the frame minus its
 *    padding and title band (getInnerBounds), minus the layout's own padding;
 *  - fixed grid tracks (`120px`) are honoured; `fr`/`auto` share what is left;
 *  - layout + fit is idempotent.
 */
import { DiagramModel } from './DiagramModel';
import { GroupModel } from './GroupModel';
import { NodeModel } from './NodeModel';

function page() {
  const diagram = new DiagramModel('d');
  const ingest = new NodeModel({ id: 'ingest', type: 'basic', position: { x: 120, y: 140 }, size: { width: 120, height: 56 } });
  const validate = new NodeModel({ id: 'validate', type: 'basic', position: { x: 290, y: 140 }, size: { width: 120, height: 56 } });
  diagram.addNode(ingest);
  diagram.addNode(validate);
  const processing = new GroupModel({ name: 'Processing' });
  diagram.addGroup(processing);
  processing.addMember('ingest', diagram);
  processing.addMember('validate', diagram);
  processing.fitToContents(diagram);
  return { diagram, processing, ingest, validate };
}

const at = (n: NodeModel) => ({ x: n.position.x, y: n.position.y });
const frame = (g: GroupModel) => g.getOuterBounds();

describe('S2: container layout works in the content box', () => {
  it('a grid places members inside the content box, below the title band, with fixed tracks', () => {
    const { diagram, processing, ingest, validate } = page();
    const inner = processing.getInnerBounds();
    processing.setLayout('grid', {
      templateColumns: '120px 120px',
      templateRows: '56px',
      columnGap: 24,
      rowGap: 16,
      autoFlow: 'row',
    });
    processing.applyLayout(diagram);

    expect(at(ingest)).toEqual({ x: inner.x, y: inner.y });
    expect(at(validate)).toEqual({ x: inner.x + 120 + 24, y: inner.y });
    for (const n of [ingest, validate]) {
      expect(n.position.y).toBeGreaterThanOrEqual(frame(processing).y + 16 + processing.headerHeight);
    }
  });

  it('layout + fit is idempotent: the frame and the members stop moving', () => {
    const { diagram, processing, ingest, validate } = page();
    processing.setLayout('grid', {
      templateColumns: '120px 120px',
      templateRows: '56px',
      columnGap: 24,
      rowGap: 16,
      autoFlow: 'row',
    });
    processing.applyLayout(diagram);
    processing.fitToContents(diagram);
    const settled = { frame: frame(processing), a: at(ingest), b: at(validate) };
    for (let i = 0; i < 3; i++) {
      processing.fitToContents(diagram);
      processing.applyLayout(diagram);
    }
    expect({ frame: frame(processing), a: at(ingest), b: at(validate) }).toEqual(settled);
    // …and the frame sits where the group was, not padding + header above it.
    expect(settled.frame.y).toBe(100);
  });

  it('a parent frame fitted around the laid-out group does not climb (Stage stays put)', () => {
    const { diagram, processing } = page();
    processing.setLayout('grid', {
      templateColumns: '120px 120px',
      templateRows: '56px',
      columnGap: 24,
      rowGap: 16,
      autoFlow: 'row',
    });
    processing.applyLayout(diagram);
    processing.fitToContents(diagram);
    const stage = new GroupModel({ name: 'Stage' });
    diagram.addGroup(stage);
    stage.addMember(processing.id, diagram);
    stage.fitToContents(diagram, { deepRecursive: true });
    const first = frame(stage);
    stage.fitToContents(diagram, { deepRecursive: true });
    expect(frame(stage)).toEqual(first);
    expect(first.y).toBe(100 - 16 - stage.headerHeight);
  });

  it('a flexbox row starts in the content box too', () => {
    const { diagram, processing, ingest, validate } = page();
    const inner = processing.getInnerBounds();
    processing.setLayout('flexbox', {
      direction: 'row',
      wrap: 'nowrap',
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      alignContent: 'flex-start',
      gap: 10,
    } as never);
    processing.applyLayout(diagram);
    expect(at(ingest)).toEqual({ x: inner.x, y: inner.y });
    expect(at(validate)).toEqual({ x: inner.x + 130, y: inner.y });
  });

  it('`fr` tracks still share the content width equally', () => {
    const { diagram, processing, ingest, validate } = page();
    const inner = processing.getInnerBounds();
    processing.setLayout('grid', { templateColumns: '1fr 1fr', templateRows: '56px', columnGap: 10, rowGap: 0, autoFlow: 'row' });
    processing.applyLayout(diagram);
    const col = (inner.width - 10) / 2;
    expect(at(ingest).x).toBeCloseTo(inner.x, 6);
    expect(at(validate).x).toBeCloseTo(inner.x + col + 10, 6);
  });
});
