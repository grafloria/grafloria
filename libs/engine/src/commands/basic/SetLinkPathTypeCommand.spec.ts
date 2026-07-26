// SetLinkPathTypeCommand — the panel's "Route" selector as ONE undo entry.
//
// The interesting part is what setPathType destroys on the way: the cached
// polyline and the manual-waypoints flag. Undo must bring hand-placed
// waypoints back; an auto-routed polyline must NOT be pinned back (it belongs
// to the router, which recomputes it on the next paint).

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { PortModel } from '../../models/PortModel';
import { LinkModel } from '../../models/LinkModel';
import { CommandContext } from '../Command';
import { CommandManager } from '../CommandManager';
import { SetLinkPathTypeCommand } from './SetLinkPathTypeCommand';

describe('SetLinkPathTypeCommand', () => {
  let diagram: DiagramModel;
  let context: CommandContext;
  let manager: CommandManager;
  let link: LinkModel;

  beforeEach(() => {
    diagram = new DiagramModel();
    const a = new NodeModel({ type: 'rect', position: { x: 0, y: 0 } });
    a.addPort(new PortModel({ id: 'a-out', type: 'output', side: 'right' } as any));
    const b = new NodeModel({ type: 'rect', position: { x: 200, y: 0 } });
    b.addPort(new PortModel({ id: 'b-in', type: 'input', side: 'left' } as any));
    diagram.addNode(a);
    diagram.addNode(b);
    link = new LinkModel('a-out', 'b-in', 'smooth');
    diagram.addLink(link);
    context = { diagram, eventBus: { emit: jest.fn() }, store: new Map() } as any;
    manager = new CommandManager(context, (context as any).eventBus);
  });

  it('sets the path type and undo restores the previous one', async () => {
    expect(link.pathType).toBe('smooth');
    await manager.execute(new SetLinkPathTypeCommand(link.id, 'orthogonal'));
    expect(link.pathType).toBe('orthogonal');
    await manager.undo();
    expect(link.pathType).toBe('smooth');
    await manager.redo();
    expect(link.pathType).toBe('orthogonal');
  });

  it('is ONE undo entry per route change (no merging of distinct edits)', async () => {
    await manager.execute(new SetLinkPathTypeCommand(link.id, 'orthogonal'));
    await manager.execute(new SetLinkPathTypeCommand(link.id, 'direct'));
    expect(link.pathType).toBe('direct');
    await manager.undo();
    expect(link.pathType).toBe('orthogonal'); // one Ctrl+Z rewinds ONE edit
    await manager.undo();
    expect(link.pathType).toBe('smooth');
  });

  it('undo restores hand-placed waypoints the route change wiped', async () => {
    const manual = [
      { x: 10, y: 10 },
      { x: 90, y: 40 },
      { x: 180, y: 10 },
    ];
    link.setPoints(manual);
    link.setMetadata('hasManualWaypoints', true);

    await manager.execute(new SetLinkPathTypeCommand(link.id, 'orthogonal'));
    // setPathType cleared the cache — that is the behaviour under test.
    expect(link.points).toEqual([]);
    expect(link.getMetadata('hasManualWaypoints')).toBe(false);

    await manager.undo();
    expect(link.pathType).toBe('smooth');
    expect(link.points.map((p) => ({ x: p.x, y: p.y }))).toEqual(manual);
    expect(link.getMetadata('hasManualWaypoints')).toBe(true);
  });

  it('does NOT pin back an auto-routed polyline on undo', async () => {
    link.setPoints([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]); // router output, not manual
    await manager.execute(new SetLinkPathTypeCommand(link.id, 'orthogonal'));
    await manager.undo();
    // The route type is back; the polyline is left for the router to recompute.
    expect(link.pathType).toBe('smooth');
    expect(link.points).toEqual([]);
  });

  it('re-snapshots on redo — the second undo restores what the redo covered', async () => {
    await manager.execute(new SetLinkPathTypeCommand(link.id, 'orthogonal'));
    await manager.undo();
    await manager.redo();
    await manager.undo();
    expect(link.pathType).toBe('smooth');
  });

  it('refuses a missing link', () => {
    const cmd = new SetLinkPathTypeCommand('nope', 'orthogonal');
    expect(cmd.canExecute(context)).toBe(false);
    expect(() => cmd.execute(context)).toThrow('not found');
  });

  it('canUndo is false before execute and true after', async () => {
    const cmd = new SetLinkPathTypeCommand(link.id, 'orthogonal');
    expect(cmd.canUndo(context)).toBe(false);
    await manager.execute(cmd);
    expect(cmd.canUndo(context)).toBe(true);
  });

  it('serializes the link, the target route and the snapshot', async () => {
    const cmd = new SetLinkPathTypeCommand(link.id, 'orthogonal');
    await manager.execute(cmd);
    const s = cmd.serialize();
    expect(s.data['linkId']).toBe(link.id);
    expect(s.data['pathType']).toBe('orthogonal');
    expect((s.data['previous'] as any).pathType).toBe('smooth');
  });
});
