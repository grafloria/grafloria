/**
 * Wave 4 — Card 5: hover / selection / validation / drop-target highlighters.
 */
import { DiagramEngine, DiagramModel, NodeModel, LinkModel } from '@grafloria/engine';
import { HighlighterController, parseValidationPath } from './highlighters';

describe('Card 5 — HighlighterController', () => {
  let highlighters: HighlighterController;
  let engine: DiagramEngine;
  let diagram: DiagramModel;

  beforeEach(() => {
    highlighters = new HighlighterController();
    engine = new DiagramEngine();
    diagram = engine.createDiagram('wave4-highlighters');
  });

  afterEach(() => engine.destroy());

  function addNode(x: number, y: number): NodeModel {
    const node = new NodeModel({
      type: 'test',
      position: { x, y },
      size: { width: 100, height: 50, depth: 0 },
    });
    diagram.addNode(node);
    return node;
  }

  test('a hovered node gets a padded hover highlighter', () => {
    const node = addNode(10, 20);
    node.setState({ hovered: true });

    const result = highlighters.compute(engine);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'hover',
      entity: 'node',
      entityId: node.id,
      bounds: { x: 8, y: 18, width: 104, height: 54 },
    });
    expect(result[0]!.className).toContain('grafloria-highlighter-hover');
  });

  test('selection beats hover on the same node (no double outline)', () => {
    const node = addNode(0, 0);
    node.setState({ hovered: true });
    diagram.selectNode(node);

    const kinds = highlighters.compute(engine).map((h) => h.kind);
    expect(kinds).toEqual(['selection']);
  });

  test('a rotated node carries its rotation onto the highlighter', () => {
    const node = addNode(0, 0);
    node.setRotation(45);
    diagram.selectNode(node);

    expect(highlighters.compute(engine)[0]!.rotation).toBe(45);
  });

  test('a selected link is traced along its route', () => {
    const a = addNode(0, 0);
    const b = addNode(300, 0);
    const link = new LinkModel(a.getPortBySide('right')!.id, b.getPortBySide('left')!.id);
    link.setPoints([
      { x: 100, y: 25 },
      { x: 300, y: 25 },
    ]);
    diagram.addLink(link);
    link.setState('selected');

    const result = highlighters.compute(engine);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'selection', entity: 'link', entityId: link.id });
    expect(result[0]!.points).toHaveLength(2);
  });

  describe('validation highlighters', () => {
    test('parseValidationPath maps ValidationEngine paths back to entities', () => {
      expect(parseValidationPath('node.n1')).toEqual({ entity: 'node', entityId: 'n1' });
      expect(parseValidationPath('node.n1.port.p2')).toEqual({ entity: 'node', entityId: 'n1' });
      expect(parseValidationPath('link.l9')).toEqual({ entity: 'link', entityId: 'l9' });
      expect(parseValidationPath('diagram')).toBeNull();
    });

    test('a link whose ports do not exist is highlighted as an ERROR', () => {
      const orphan = new LinkModel('missing-source', 'missing-target');
      orphan.setPoints([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ]);
      diagram.addLink(orphan);

      const issues = highlighters.refreshValidation(engine);
      expect(issues.some((i) => i.entityId === orphan.id && i.severity === 'error')).toBe(true);

      const validation = highlighters
        .compute(engine)
        .filter((h) => h.kind === 'validation' && h.entityId === orphan.id);
      expect(validation).toHaveLength(1);
      expect(validation[0]).toMatchObject({
        entity: 'link',
        entityId: orphan.id,
        severity: 'error',
      });
      expect(validation[0]!.message).toBe('Source port missing-source not found');
    });

    test('an unregistered node type surfaces as a WARNING highlighter', () => {
      // The ValidationEngine warns about unknown types; the highlighter layer is
      // what makes that visible on the canvas (amber, not red).
      const node = addNode(0, 0);
      highlighters.refreshValidation(engine);

      const validation = highlighters
        .compute(engine)
        .filter((h) => h.kind === 'validation' && h.entityId === node.id);
      expect(validation).toHaveLength(1);
      expect(validation[0]).toMatchObject({ severity: 'warning', entity: 'node' });
      expect(validation[0]!.className).toContain('grafloria-highlighter-warning');
    });

    test('no validation refresh ⇒ no validation highlighters at all (the cache is the source)', () => {
      const node = addNode(0, 0);
      highlighters.refreshValidation(engine);
      expect(highlighters.getIssues(node.id).map((i) => i.severity)).toContain('warning');

      highlighters.clearValidation();
      expect(highlighters.compute(engine).filter((h) => h.kind === 'validation')).toHaveLength(0);
    });
  });

  test('config switches individual highlighter kinds off', () => {
    const node = addNode(0, 0);
    node.setState({ hovered: true });

    highlighters.updateConfig({ showHover: false });
    expect(highlighters.compute(engine)).toHaveLength(0);
  });
});
