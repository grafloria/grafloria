/**
 * loadText into a FRESH canvas — the case that actually loses data.
 *
 * `exportText` promises "a lossless sidecar by default — feed the result back to
 * loadText for a full round-trip". It was not true. loadText projected the
 * imported models through `toNodeSpec`/`toEdgeSpec`, which carry id, type,
 * position, size, selected, data, label, shape and custom — and nothing else. So
 * custom ports, node and link styles, and every metadata key except `label` were
 * dropped, and groups were never carried at all.
 *
 * The existing round-trip test could not see any of it, for a reason worth
 * stating: it loads back into the SAME instance, which still holds those node
 * objects, and `applyNodes` updates existing models in place rather than
 * rebuilding them. Everything survived because nothing was actually rebuilt.
 * Open the same text in a new canvas — which is what "open a saved file" means —
 * and the loss appears.
 *
 * Hence: a second instance, and assertions on the things the projection dropped.
 */
import { GroupModel } from '@grafloria/engine';
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';

describe('loadText fidelity — into a fresh canvas', () => {
  const containers: HTMLElement[] = [];
  const instances: DiagramInstance[] = [];

  const makeContainer = (): HTMLElement => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 }) as DOMRect;
    document.body.appendChild(el);
    containers.push(el);
    return el;
  };

  afterEach(() => {
    while (instances.length) instances.pop()?.dispose();
    while (containers.length) containers.pop()?.remove();
  });

  /** A document using the features the projection used to discard. */
  function authored(): { instance: DiagramInstance; text: string } {
    const instance = createDiagram(makeContainer(), {
      nodes: [
        { id: 'a', position: { x: 10, y: 20 }, size: { width: 100, height: 50 }, label: 'Extract' },
        { id: 'b', position: { x: 240, y: 20 }, size: { width: 100, height: 50 }, label: 'Load' },
      ],
      edges: [{ id: 'e', source: 'a', target: 'b' }],
    });
    instances.push(instance);

    const model = instance.getModel();
    const a = model.getNode('a')!;
    a.setStyle({ fill: '#f00' });
    a.setMetadata('mine', 'keep-me');

    const link = model.getLinks()[0];
    link.updateStyle({ stroke: '#0f0' });
    link.setMetadata('z', 'also-keep-me');

    const group = new GroupModel({ name: 'Stage' });
    model.addGroup(group);
    group.setFrame({ x: 0, y: 0, width: 400, height: 120 });
    group.addMember('a', model);
    group.addMember('b', model);

    return { instance, text: instance.exportText() };
  }

  it('carries node style, node metadata, link style, link metadata and groups', () => {
    const { text } = authored();

    const fresh = createDiagram(makeContainer(), { nodes: [], edges: [] });
    instances.push(fresh);
    fresh.loadText(text);

    const model = fresh.getModel();
    const a = model.getNode('a')!;

    expect(a.style?.fill).toBe('#f00');
    expect(a.getMetadata('mine')).toBe('keep-me');
    expect(a.getMetadata('label')).toBe('Extract');

    const link = model.getLinks()[0];
    expect(link.style?.stroke).toBe('#0f0');
    expect(link.getMetadata('z')).toBe('also-keep-me');

    // The group arrived, and arrived with its membership — a frame with no
    // members is not the group that was saved.
    expect(model.getGroups()).toHaveLength(1);
    expect([...model.getGroups()[0].members].sort()).toEqual(['a', 'b']);
  });

  it('is idempotent — exporting what was loaded reproduces the text', () => {
    const { text } = authored();

    const fresh = createDiagram(makeContainer(), { nodes: [], edges: [] });
    instances.push(fresh);
    fresh.loadText(text);

    // The real contract behind "lossless": a second trip changes nothing. This
    // is the assertion the id-and-position checks could never make.
    //
    // Everything EXCEPT the container diagram's own identity: loadText
    // reconciles into the live model and deliberately never swaps it, so the
    // document keeps the id and uuid of the canvas it was loaded into. That is
    // the one difference this comparison must forgive — and the only one it
    // does.
    const normalize = (s: string): string =>
      s
        .replace(/"id":"test-[^"]*"/g, '"id":"<diagram>"')
        .replace(/"uuid":"[0-9a-f-]+","version":5/g, '"uuid":"<diagram>","version":5');

    expect(normalize(fresh.exportText())).toBe(normalize(text));
  });

  it('removes a group that the loaded document no longer has', () => {
    const { text } = authored();

    const fresh = createDiagram(makeContainer(), { nodes: [], edges: [] });
    instances.push(fresh);
    fresh.loadText(text);
    expect(fresh.getModel().getGroups()).toHaveLength(1);

    // A document with no groups must LEAVE none behind — reconcile, not merge.
    const empty = createDiagram(makeContainer(), {
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, label: 'A' }],
      edges: [],
    });
    instances.push(empty);
    fresh.loadText(empty.exportText());

    expect(fresh.getModel().getGroups()).toHaveLength(0);
  });
});
