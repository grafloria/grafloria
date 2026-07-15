import { DiagramEngine, GroupModel } from '@grafloria/engine';
import type { NodeModel } from '@grafloria/engine';
import { contentBounds, createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';
import { HTML_LAYER_CLASS, ROOT_CLASS, SVG_LAYER_CLASS } from './layers';
import { DARK_THEME } from '../themes';
import type { NodeSpec } from './model-input';

const WIDTH = 800;
const HEIGHT = 600;

/** jsdom lays nothing out — give the container a real rect. */
function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
];

describe('createDiagram — the headless instance', () => {
  let container: HTMLElement;
  let diagram: DiagramInstance | undefined;

  beforeEach(() => {
    container = makeContainer();
  });

  afterEach(() => {
    diagram?.dispose();
    diagram = undefined;
    container.remove();
  });

  it('mounts the layer skeleton and paints synchronously on create', () => {
    diagram = createDiagram(container, { nodes: NODES, edges: [{ source: 'a', target: 'b' }] });

    const root = container.querySelector(`.${ROOT_CLASS}`)!;
    expect(root).toBeTruthy();
    expect(root.querySelector(`.${SVG_LAYER_CLASS}`)).toBeTruthy();
    expect(root.querySelector(`.${HTML_LAYER_CLASS}`)).toBeTruthy();

    // The picture exists BEFORE any rAF has run (no empty first frame).
    const svg = container.querySelector('svg')!;
    expect(svg).toBeTruthy();
    expect(svg.querySelector('[data-vnode-key="node-a"]')).toBeTruthy();
    expect(svg.querySelector('[data-vnode-key="node-b"]')).toBeTruthy();
    expect(svg.querySelector('[data-vnode-key="link-edge-0"]')).toBeTruthy();
  });

  it('emits ready ONCE, on a microtask, so a handler attached right after create still sees it', async () => {
    diagram = createDiagram(container, { nodes: NODES });
    const ready = jest.fn();

    // The mount paint already happened (synchronously, inside createDiagram) —
    // an inline emit would have been unobservable from here.
    diagram.on('ready', ready);
    await Promise.resolve();
    expect(ready).toHaveBeenCalledTimes(1);

    diagram.renderNow();
    await Promise.resolve();
    expect(ready).toHaveBeenCalledTimes(1); // one-shot
  });

  it('gives the root the renderer instance scope', () => {
    diagram = createDiagram(container, { nodes: NODES, instanceId: 'grafloria-test' });
    const root = container.querySelector(`.${ROOT_CLASS}`)!;
    expect(root.getAttribute('data-grafloria-instance')).toBe('grafloria-test');
    expect(container.querySelector('svg')!.getAttribute('data-grafloria-instance')).toBe(
      'grafloria-test'
    );
  });

  describe('setNodes / setEdges', () => {
    it('reconciles into the live model and repaints', () => {
      diagram = createDiagram(container, { nodes: NODES });

      diagram.setNodes([...NODES, { id: 'c', position: { x: 700, y: 300 } }]);
      diagram.renderNow();

      expect(diagram.getModel().getNodes().map((n) => n.id)).toEqual(['a', 'b', 'c']);
      expect(container.querySelector('[data-vnode-key="node-c"]')).toBeTruthy();
    });

    it('REUSES the DOM element of an unchanged node across a setNodes()', () => {
      diagram = createDiagram(container, { nodes: NODES });
      const before = container.querySelector('[data-vnode-key="node-a"]');

      diagram.setNodes([...NODES, { id: 'c', position: { x: 700, y: 300 } }]);
      diagram.renderNow();

      expect(container.querySelector('[data-vnode-key="node-a"]')).toBe(before);
    });

    it('removes a node that disappeared from the list', () => {
      diagram = createDiagram(container, { nodes: NODES });
      diagram.setNodes([NODES[0]]);
      diagram.renderNow();

      expect(container.querySelector('[data-vnode-key="node-b"]')).toBeNull();
    });
  });

  describe('events', () => {
    it('on() returns an unsubscribe, and off() also works', () => {
      diagram = createDiagram(container, { nodes: NODES });
      const handler = jest.fn();

      const off = diagram.on('nodes:change', handler);
      diagram.setNodes([...NODES, { id: 'c', position: { x: 0, y: 0 } }]);
      expect(handler).toHaveBeenCalledTimes(1);

      off();
      diagram.setNodes(NODES);
      expect(handler).toHaveBeenCalledTimes(1);

      diagram.on('nodes:change', handler);
      diagram.off('nodes:change', handler);
      diagram.setNodes([...NODES, { id: 'd', position: { x: 0, y: 0 } }]);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits selection:change when the model selection changes', () => {
      diagram = createDiagram(container, { nodes: NODES });
      const handler = jest.fn();
      diagram.on('selection:change', handler);

      diagram.getModel().selectNode(diagram.getModel().getNode('a')!);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ nodes: [expect.objectContaining({ id: 'a' })] })
      );
    });

    it('emits viewport:change on camera moves', () => {
      diagram = createDiagram(container, { nodes: NODES });
      const handler = jest.fn();
      diagram.on('viewport:change', handler);

      diagram.viewport.pan(50, 0);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ viewport: expect.objectContaining({ x: 50 }) })
      );
    });
  });

  describe('custom (HTML-layer) nodes — blocker #4', () => {
    it('calls renderCustomNode with a positioned host element', () => {
      const rendered: Array<{ id: string; el: HTMLElement }> = [];
      diagram = createDiagram(container, {
        nodes: [{ id: 'custom', position: { x: 30, y: 40 }, size: { width: 200, height: 80 }, custom: true }],
        renderCustomNode: (node: NodeModel, el: HTMLElement) => {
          rendered.push({ id: node.id, el });
          el.textContent = `custom:${node.id}`;
        },
      });

      expect(rendered).toHaveLength(1);
      expect(rendered[0].id).toBe('custom');

      const host = container.querySelector('[data-node-id="custom"]') as HTMLElement;
      expect(host).toBe(rendered[0].el);
      expect(host.textContent).toBe('custom:custom');
      expect(host.getAttribute('style')).toContain('left:30px');
      expect(host.getAttribute('style')).toContain('top:40px');
      expect(host.getAttribute('style')).toContain('width:200px');
      // The host lives in the HTML layer, not inside the SVG.
      expect(host.parentElement?.className).toBe(HTML_LAYER_CLASS);
    });

    it('mounts each custom node exactly once, then only repositions it', () => {
      const renderCustomNode = jest.fn();
      diagram = createDiagram(container, {
        nodes: [{ id: 'c', position: { x: 0, y: 0 }, custom: true }],
        renderCustomNode,
      });

      diagram.setNodes([{ id: 'c', position: { x: 90, y: 90 }, custom: true }]);
      diagram.renderNow();

      expect(renderCustomNode).toHaveBeenCalledTimes(1); // NOT re-created
      const host = container.querySelector('[data-node-id="c"]') as HTMLElement;
      expect(host.getAttribute('style')).toContain('left:90px');
    });

    it('calls removeCustomNode and detaches the host when the node goes away', () => {
      const removeCustomNode = jest.fn();
      diagram = createDiagram(container, {
        nodes: [{ id: 'c', position: { x: 0, y: 0 }, custom: true }],
        renderCustomNode: () => undefined,
        removeCustomNode,
      });

      diagram.setNodes([]);
      diagram.renderNow();

      expect(removeCustomNode).toHaveBeenCalledWith('c', expect.any(HTMLElement));
      expect(container.querySelector('[data-node-id="c"]')).toBeNull();
    });

    it('keeps the HTML layer registered with the camera', () => {
      diagram = createDiagram(container, {
        nodes: [{ id: 'c', position: { x: 0, y: 0 }, custom: true }],
        renderCustomNode: () => undefined,
      });

      diagram.viewport.setZoom(2);
      diagram.viewport.pan(10, 20);
      diagram.renderNow();

      const layer = container.querySelector(`.${HTML_LAYER_CLASS}`) as HTMLElement;
      expect(layer.getAttribute('style')).toContain('scale(2)');
      expect(layer.getAttribute('style')).toContain('translate(-20px, -40px)');
    });
  });

  it('fitView frames the content', () => {
    diagram = createDiagram(container, { nodes: NODES, fitView: true });

    const box = diagram.viewport.getViewBox();
    // Content spans x 100..520, y 100..160 — the camera must contain it.
    expect(box.x).toBeLessThanOrEqual(100);
    expect(box.x + box.width).toBeGreaterThanOrEqual(520);
  });

  it('setTheme repaints through the same renderer instance', () => {
    diagram = createDiagram(container, { nodes: NODES, instanceId: 'grafloria-theme' });
    const svgBefore = container.querySelector('svg');

    diagram.setTheme(DARK_THEME);
    diagram.renderNow();

    // Same root element (a theme swap is a patch, not a remount).
    expect(container.querySelector('svg')).toBe(svgBefore);
  });

  describe('dispose', () => {
    it('removes the DOM, stops listening and is idempotent', () => {
      const d = createDiagram(container, { nodes: NODES });
      const handler = jest.fn();
      d.on('nodes:change', handler);

      d.dispose();
      d.dispose(); // idempotent

      expect(container.querySelector(`.${ROOT_CLASS}`)).toBeNull();
      expect(container.children).toHaveLength(0);
    });

    it('unmounts custom nodes on dispose', () => {
      const removeCustomNode = jest.fn();
      const d = createDiagram(container, {
        nodes: [{ id: 'c', position: { x: 0, y: 0 }, custom: true }],
        renderCustomNode: () => undefined,
        removeCustomNode,
      });

      d.dispose();

      expect(removeCustomNode).toHaveBeenCalledWith('c', expect.any(HTMLElement));
    });

    it('leaves a CALLER-SUPPLIED engine alive (it is not ours to destroy)', () => {
      const engine = new DiagramEngine();
      engine.createDiagram('mine');

      const d = createDiagram(container, { engine, nodes: NODES });
      d.dispose();

      expect(engine.getDiagram()).toBeTruthy();
      expect(engine.getDiagram()!.getNodes()).toHaveLength(2);
      engine.destroy();
    });
  });

  // The audit's clipped drag-handle grip: a parent-RELATIVE child rendered at
  // its raw local coordinates (translate(0,-28) → page top-left) because
  // nodeTransform never composed the parent chain, and nothing forwarded the
  // engine's transform-propagated event, so even a correct transform would have
  // painted stale after a parent move.
  describe('parent-relative children render at WORLD position', () => {
    const tick = async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      await new Promise((r) => setTimeout(r, 0));
    };
    const transformOf = (id: string) =>
      container.querySelector(`[data-vnode-key="node-${id}"]`)?.getAttribute('transform');

    async function withParented() {
      diagram = createDiagram(container, {
        nodes: [
          { id: 'win', position: { x: 300, y: 200 }, size: { width: 240, height: 120 }, label: 'window' },
          { id: 'grip', position: { x: 300, y: 172 }, size: { width: 240, height: 28 }, label: 'grip' },
        ],
      });
      const model = diagram.getModel();
      const grip = model.getNode('grip')!;
      grip.setParent('win');
      grip.setPosition(0, -28); // local → world (300, 172)
      await tick();
      return { model, grip };
    }

    it('composes the parent chain into the SVG transform', async () => {
      await withParented();
      expect(transformOf('grip')).toBe('translate(300, 172)');
    });

    it('a parent MOVE repaints its relative children (no touch on the child)', async () => {
      const { model } = await withParented();
      model.getNode('win')!.setPosition(500, 400);
      await tick();
      expect(transformOf('grip')).toBe('translate(500, 372)');
    });
  });

  // The audit's "empty white boxes": four demos declared labels the LEGACY way
  // (data.label) and the renderer gated its <text> on raw metadata — bypassing
  // the getLabel() canon whose whole purpose is that fallback. These drive the
  // public embed end-to-end.
  describe('legacy data.label still renders', () => {
    it('draws the label of a node that only carries data.label', () => {
      diagram = createDiagram(container, {
        nodes: [{ id: 'n', position: { x: 50, y: 50 }, size: { width: 160, height: 60 }, data: { label: 'Ingest' } }],
      });
      const nodeEl = container.querySelector('[data-vnode-key="node-n"]');
      expect(nodeEl?.textContent).toContain('Ingest');
    });

    it('canonical metadata.label wins when both are present', () => {
      diagram = createDiagram(container, {
        nodes: [{
          id: 'n', position: { x: 50, y: 50 }, size: { width: 160, height: 60 },
          label: 'Canon', data: { label: 'Legacy' },
        }],
      });
      const nodeEl = container.querySelector('[data-vnode-key="node-n"]');
      expect(nodeEl?.textContent).toContain('Canon');
      expect(nodeEl?.textContent).not.toContain('Legacy');
    });
  });

  // Also from the screenshot audit: "fit" was doing two wrong things at once —
  // magnifying small graphs wall-to-wall (8 nodes at 288% zoom), and measuring
  // only NODES, so routed edge arcs outside the node bbox got sliced off at the
  // viewport edge while everything reported "contained".
  describe('fitView', () => {
    it('never zooms IN past 1 to fit a small graph', () => {
      diagram = createDiagram(container, { nodes: NODES });
      diagram.fitView(40);
      expect(diagram.viewport.getZoom()).toBe(1);
    });

    it('still zooms OUT to fit a large graph', () => {
      diagram = createDiagram(container, {
        nodes: [
          { id: 'a', position: { x: 0, y: 0 }, size: { width: 100, height: 60 } },
          { id: 'b', position: { x: 4000, y: 2000 }, size: { width: 100, height: 60 } },
        ],
      });
      diagram.fitView(40);
      expect(diagram.viewport.getZoom()).toBeLessThan(1);
      const vb = diagram.viewport.getViewBox();
      expect(vb.x).toBeLessThanOrEqual(0);
      expect(vb.x + vb.width).toBeGreaterThanOrEqual(4100);
    });

    it('contentBounds unions routed link waypoints, not just node boxes', () => {
      diagram = createDiagram(container, { nodes: NODES, edges: [{ id: 'e', source: 'a', target: 'b' }] });
      const model = diagram.getModel();
      // A detour far below every node — exactly the arc a router produces.
      model.getLink('e')!.setPoints([
        { x: 260, y: 130 },
        { x: 300, y: 700 },
        { x: 400, y: 130 },
      ]);
      const bounds = contentBounds(model)!;
      expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(700);
    });
  });

  // Found by the screenshot audit, not by any assert: a demo called
  // group.fitToContents() and the SCREEN never changed. The instance subscribed
  // to node/link/selection/viewport events but to NO group event, so group
  // mutations scheduled nothing — the picture updated only when something
  // unrelated happened to render. These pin the missing subscriptions; none of
  // them may call renderNow().
  describe('group mutations schedule a render on their own', () => {
    // The scheduler flushes on rAF (jsdom runs rAF on a ~16ms cadence), so a
    // bare setTimeout(0) races the frame. Await a real frame, then a macrotask.
    const tick = async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      await new Promise((r) => setTimeout(r, 0));
    };
    const frameOf = (id: string) => container.querySelector(`[data-group-id="${id}"]`);

    async function withGroup() {
      diagram = createDiagram(container, { nodes: NODES });
      const model = diagram.getModel();
      const group = new GroupModel({ name: 'G' });
      model.addGroup(group);
      group.addMember('a', model);
      group.setFrame({ x: 80, y: 80, width: 200, height: 120 });
      await tick();
      return { model, group };
    }

    it('group:added paints the frame without renderNow', async () => {
      const { group } = await withGroup();
      expect(frameOf(String(group.id))).toBeTruthy();
    });

    it('a frame change (fitToContents/setFrame) repaints without renderNow', async () => {
      const { group } = await withGroup();
      group.setFrame({ x: 5, y: 5, width: 500, height: 400 });
      await tick();
      const rect = frameOf(String(group.id))!.querySelector('rect')!;
      expect(Number(rect.getAttribute('width'))).toBe(500);
      expect(Number(rect.getAttribute('height'))).toBe(400);
    });

    it('group:removed erases the frame without renderNow', async () => {
      const { model, group } = await withGroup();
      model.removeGroup(String(group.id));
      await tick();
      expect(frameOf(String(group.id))).toBeNull();
    });
  });
});
