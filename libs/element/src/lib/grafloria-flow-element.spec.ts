import type { NodeSpec } from '@grafloria/renderer';
import { GRAFLORIA_EVENTS, GrafloriaFlowElement, defineGrafloriaFlow } from './grafloria-flow-element';
import { Grafloria, render } from './grafloria';
import { registerNodeType, unregisterNodeType } from './node-type-registry';

const WIDTH = 800;
const HEIGHT = 600;

beforeAll(() => {
  // jsdom lays nothing out — give every element a real box so the camera works.
  Element.prototype.getBoundingClientRect = function () {
    return {
      left: 0,
      top: 0,
      width: WIDTH,
      height: HEIGHT,
      right: WIDTH,
      bottom: HEIGHT,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };
  defineGrafloriaFlow();
});

const NODES: NodeSpec[] = [
  { id: 'a', position: { x: 100, y: 100 }, size: { width: 120, height: 60 }, label: 'A' },
  { id: 'b', position: { x: 400, y: 100 }, size: { width: 120, height: 60 }, label: 'B' },
];

function mount(html: string): GrafloriaFlowElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  return host.querySelector('grafloria-flow') as GrafloriaFlowElement;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('<grafloria-flow>', () => {
  it('is registered as a custom element', () => {
    expect(customElements.get('grafloria-flow')).toBe(GrafloriaFlowElement);
  });

  it('mounts a real diagram from JSON ATTRIBUTES (the no-JavaScript path)', () => {
    const el = mount(
      `<grafloria-flow nodes='${JSON.stringify(NODES)}' edges='[{"source":"a","target":"b"}]'></grafloria-flow>`
    );

    expect(el.diagram).toBeTruthy();
    expect(el.querySelector('[data-vnode-key="node-a"]')).toBeTruthy();
    expect(el.querySelector('[data-vnode-key="node-b"]')).toBeTruthy();
    expect(el.querySelector('[data-vnode-key="link-edge-0"]')).toBeTruthy();
  });

  it('accepts rich data through PROPERTIES (what Vue/Svelte/Solid bind to)', () => {
    const el = mount('<grafloria-flow></grafloria-flow>');

    el.nodes = NODES;
    el.diagram!.renderNow();

    expect(el.diagram!.getModel().getNodes().map((n) => n.id)).toEqual(['a', 'b']);
    expect(el.querySelector('[data-vnode-key="node-a"]')).toBeTruthy();
  });

  it('reacts to an attribute change after mount', () => {
    const el = mount(`<grafloria-flow nodes='${JSON.stringify(NODES)}'></grafloria-flow>`);

    el.setAttribute('nodes', JSON.stringify([NODES[0]]));
    el.diagram!.renderNow();

    expect(el.diagram!.getModel().getNodes().map((n) => n.id)).toEqual(['a']);
  });

  it('ignores a malformed JSON attribute instead of taking the page down', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const el = mount(`<grafloria-flow nodes='{{{ not json'></grafloria-flow>`);

    expect(el.diagram).toBeTruthy();
    expect(el.diagram!.getModel().getNodes()).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  describe('DOM events out', () => {
    it('emits grafloria-selection-change as a bubbling, composed CustomEvent', () => {
      const el = mount(`<grafloria-flow nodes='${JSON.stringify(NODES)}'></grafloria-flow>`);
      const seen: CustomEvent[] = [];
      // Listen on `document` to prove it really bubbles out of the element.
      document.addEventListener(GRAFLORIA_EVENTS.selectionChange, (e) =>
        seen.push(e as CustomEvent)
      );

      const model = el.diagram!.getModel();
      model.selectNode(model.getNode('a')!);

      expect(seen).toHaveLength(1);
      expect(seen[0].bubbles).toBe(true);
      expect(seen[0].composed).toBe(true);
      expect(seen[0].detail.nodes.map((n: { id: string }) => n.id)).toEqual(['a']);
    });

    it('emits grafloria-node-click from a real mousedown', () => {
      const el = mount(`<grafloria-flow nodes='${JSON.stringify(NODES)}'></grafloria-flow>`);
      const handler = jest.fn();
      el.addEventListener(GRAFLORIA_EVENTS.nodeClick, handler);

      const canvas = el.querySelector('.grafloria-flow-canvas') as HTMLElement;
      canvas.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 150, clientY: 130 })
      );

      expect(handler).toHaveBeenCalled();
      const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
      expect(detail.node.id).toBe('a');
    });

    it('emits grafloria-ready once mounted', async () => {
      const el = mount(`<grafloria-flow nodes='${JSON.stringify(NODES)}'></grafloria-flow>`);
      const handler = jest.fn();
      el.addEventListener(GRAFLORIA_EVENTS.ready, handler);

      await Promise.resolve();

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('custom nodes with no framework', () => {
    afterEach(() => unregisterNodeType('card'));

    it('renders a SLOTTED <template> into the node host, filling data-field', () => {
      const el = mount(`
        <grafloria-flow nodes='${JSON.stringify([
          { id: 'n1', type: 'card', position: { x: 5, y: 6 }, custom: true, data: { title: 'Hi' } },
        ])}'>
          <template data-node-type="card">
            <div class="card"><h4 data-field="title"></h4><small data-field="id"></small></div>
          </template>
        </grafloria-flow>
      `);

      const host = el.querySelector('[data-node-id="n1"]') as HTMLElement;
      expect(host).toBeTruthy();
      expect(host.querySelector('h4')!.textContent).toBe('Hi');
      expect(host.querySelector('small')!.textContent).toBe('n1');
      expect(host.getAttribute('style')).toContain('left:5px');
    });

    it('never injects data as HTML (a diagram\'s data is user input)', () => {
      const el = mount(`
        <grafloria-flow nodes='${JSON.stringify([
          {
            id: 'n1',
            type: 'card',
            position: { x: 0, y: 0 },
            custom: true,
            data: { title: '<img src=x onerror=alert(1)>' },
          },
        ])}'>
          <template data-node-type="card"><h4 data-field="title"></h4></template>
        </grafloria-flow>
      `);

      const heading = el.querySelector('[data-node-id="n1"] h4') as HTMLElement;
      expect(heading.querySelector('img')).toBeNull();
      expect(heading.textContent).toContain('<img');
    });

    it('a registered renderer wins over a template', () => {
      registerNodeType('card', (node, element) => {
        element.innerHTML = `<b data-testid="reg">${node.id}</b>`;
      });

      const el = mount(`
        <grafloria-flow nodes='${JSON.stringify([
          { id: 'n1', type: 'card', position: { x: 0, y: 0 }, custom: true },
        ])}'>
          <template data-node-type="card"><i>from template</i></template>
        </grafloria-flow>
      `);

      const host = el.querySelector('[data-node-id="n1"]') as HTMLElement;
      expect(host.querySelector('b')!.textContent).toBe('n1');
      expect(host.querySelector('i')).toBeNull();
    });
  });

  it('theme attribute swaps the theme in place', () => {
    const el = mount(`<grafloria-flow nodes='${JSON.stringify(NODES)}'></grafloria-flow>`);
    const svg = el.querySelector('svg');

    el.setAttribute('theme', 'dark');
    el.diagram!.renderNow();

    expect(el.querySelector('svg')).toBe(svg); // patched, not remounted
  });

  it('readonly blocks model mutation but still pans', () => {
    const el = mount(`<grafloria-flow readonly nodes='${JSON.stringify(NODES)}'></grafloria-flow>`);
    const canvas = el.querySelector('.grafloria-flow-canvas') as HTMLElement;
    const node = el.diagram!.getModel().getNode('a')!;

    canvas.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 150, clientY: 130 })
    );
    canvas.dispatchEvent(
      new MouseEvent('mousemove', { bubbles: true, clientX: 250, clientY: 230 })
    );

    expect(node.position.x).toBe(100); // not dragged

    canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 40 }));
    expect(el.diagram!.viewport.getViewport().y).toBe(40); // still pans
  });

  it('disconnecting the element disposes the diagram', () => {
    const el = mount(`<grafloria-flow nodes='${JSON.stringify(NODES)}'></grafloria-flow>`);
    expect(el.diagram).toBeTruthy();

    el.remove();

    expect(el.diagram).toBeNull();
    expect(el.querySelector('svg')).toBeNull();
  });
});

describe('Grafloria.render — the Mermaid-shaped API', () => {
  it('mounts from an object spec into an element', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const diagram = render({ nodes: NODES, edges: [{ source: 'a', target: 'b' }] }, target);

    expect(target.querySelector('[data-vnode-key="node-a"]')).toBeTruthy();
    expect(diagram.getModel().getLinks()).toHaveLength(1);
    diagram.dispose();
  });

  it('accepts a CSS selector and a JSON string', () => {
    const target = document.createElement('div');
    target.id = 'chart';
    document.body.appendChild(target);

    const diagram = Grafloria.render(JSON.stringify({ nodes: NODES }), '#chart');

    expect(target.querySelector('[data-vnode-key="node-b"]')).toBeTruthy();
    diagram.dispose();
  });

  it('routes custom nodes through the global registry', () => {
    registerNodeType('badge', (node, element) => {
      element.textContent = `badge:${node.id}`;
    });
    const target = document.createElement('div');
    document.body.appendChild(target);

    const diagram = Grafloria.render(
      { nodes: [{ id: 'z', type: 'badge', position: { x: 0, y: 0 }, custom: true }] },
      target
    );

    expect((target.querySelector('[data-node-id="z"]') as HTMLElement).textContent).toBe(
      'badge:z'
    );

    diagram.dispose();
    unregisterNodeType('badge');
  });

  it('throws a useful error when the target does not exist', () => {
    expect(() => Grafloria.render({ nodes: [] }, '#nope')).toThrow(/no element matched/);
  });

  it('throws a useful error on a malformed JSON spec', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    expect(() => Grafloria.render('{ nope', target)).toThrow(/must be an object or a JSON string/);
  });

  it('renderStatic is the SSR path, reachable from the tiny API', () => {
    const { svg, snapshot } = Grafloria.renderStatic({ nodes: NODES, instanceId: 'grafloria-tiny' });
    expect(svg).toContain('data-vnode-key="node-a"');
    expect(snapshot.instanceId).toBe('grafloria-tiny');
  });
});
