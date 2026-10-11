/**
 * S3 (docs review v4): undoing a shape-data panel name edit blanked the label of
 * a node made from the stencil palette.
 *
 * A stencil-stamped node (NodeFactory) carries its label in the legacy
 * `data.label` slot; `metadata.label` is absent. SetNodeLabelCommand captured
 * the old label from `metadata.label` only — `''` — and undo wrote `''` into
 * BOTH slots, so the label vanished. Undo now puts each slot back exactly as it
 * was (absent stays absent), for nodes and links alike.
 */
import { DiagramModel } from '../../models/DiagramModel';
import { LinkModel } from '../../models/LinkModel';
import { NodeModel } from '../../models/NodeModel';
import { SetLinkDisplayLabelCommand } from './SetLinkDisplayLabelCommand';
import { SetNodeLabelCommand } from './SetNodeLabelCommand';

const ctx = (diagram: DiagramModel) => ({ diagram, eventBus: { emit: () => undefined } });

describe('S3: a label edit undoes back to the exact slots it found', () => {
  it('a node labelled only in data.label (a stencil master) gets its label back', () => {
    const diagram = new DiagramModel('d');
    const node = new NodeModel({ id: 'pay', type: 'flowchart-process', position: { x: 0, y: 0 } });
    (node as unknown as { data: Record<string, unknown> }).data = { label: 'Pay' };
    diagram.addNode(node);
    expect(node.getLabel()).toBe('Pay');
    expect(node.getMetadata('label')).toBeUndefined();

    const cmd = new SetNodeLabelCommand('pay', 'Edited');
    cmd.execute(ctx(diagram));
    expect(node.getLabel()).toBe('Edited');
    cmd.undo(ctx(diagram));

    expect(node.getLabel()).toBe('Pay');
    expect(node.getData('label')).toBe('Pay');
    expect(node.getMetadata('label')).toBeUndefined();

    cmd.redo(ctx(diagram));
    expect(node.getLabel()).toBe('Edited');
  });

  it('a node labelled in metadata keeps the old behaviour', () => {
    const diagram = new DiagramModel('d');
    const node = new NodeModel({ id: 'n', type: 'basic', position: { x: 0, y: 0 } });
    node.setLabel('Plain');
    diagram.addNode(node);
    const cmd = new SetNodeLabelCommand('n', 'Edited');
    cmd.execute(ctx(diagram));
    cmd.undo(ctx(diagram));
    expect(node.getLabel()).toBe('Plain');
    expect(node.getMetadata('label')).toBe('Plain');
  });

  it('a link labelled only in data.label gets its label back too', () => {
    const diagram = new DiagramModel('d');
    const link = new LinkModel('p1', 'p2', 'direct');
    (link as unknown as { data: Record<string, unknown> }).data = { label: 'sends' };
    diagram.addLink(link);
    const before = link.getLabel();
    const cmd = new SetLinkDisplayLabelCommand(link.id, 'Edited');
    cmd.execute(ctx(diagram));
    cmd.undo(ctx(diagram));
    expect(link.getLabel()).toBe(before);
    expect(link.getMetadata('label')).toBeUndefined();
  });
});
