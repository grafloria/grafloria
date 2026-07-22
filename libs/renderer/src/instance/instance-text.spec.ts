/**
 * DiagramInstance.exportText / loadText — the Mermaid-compatible text seam on
 * the instance, so every framework wrapper inherits it. loadText reconciles
 * INTO the live model (same reconciler as setNodes), never swaps it.
 */
import { createDiagram } from './create-diagram';

describe('instance text round-trip', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => container.remove());

  it('exportText emits the diagram; loadText round-trips it into the SAME model', () => {
    const instance = createDiagram(container, {
      nodes: [
        { id: 'a', position: { x: 10, y: 20 }, size: { width: 100, height: 50 }, label: 'Extract' },
        { id: 'b', position: { x: 240, y: 20 }, size: { width: 100, height: 50 }, label: 'Load' },
      ],
      edges: [{ source: 'a', target: 'b' }],
    });
    const model = instance.getModel();

    const text = instance.exportText();
    expect(text).toContain('Extract');

    // wreck the diagram, then restore from the text
    instance.setNodes([{ id: 'z', position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, label: 'Z' }]);
    expect(model.getNodes().map((n) => n.id)).toEqual(['z']);

    const result = instance.loadText(text);
    expect(instance.getModel()).toBe(model); // SAME model — never swapped
    expect(model.getNodes().map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(model.getLinks()).toHaveLength(1);
    // sidecar preserved geometry
    const a = model.getNodes().find((n) => n.id === 'a')!;
    expect(a.position).toEqual({ x: 10, y: 20 });
    expect(result.source).toBe('sidecar');
    instance.dispose();
  });
});
