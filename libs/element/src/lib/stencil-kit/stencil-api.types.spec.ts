/**
 * The stencil palette and the shape-data panel take a diagram through typed
 * slots: a `DiagramInstance` fits as it is, and an adapter of the wrong shape
 * is a compile error.
 *
 * This file is mostly a COMPILE-TIME test: ts-jest type-checks it, and every
 * `@ts-expect-error` below must find an error. With the slots typed `any`
 * nothing was rejected, and the directives themselves failed the build as
 * unused.
 */
import { createDiagram, type DiagramInstance } from '@grafloria/renderer';
import { bindShapeDataPanel, bindStencilPalette } from './index';
import type { ShapeDataPanelApi, StencilPaletteApi } from './index';

function host(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe('stencil palette and shape-data panel slots are typed', () => {
  let api: DiagramInstance;
  beforeEach(() => {
    api = createDiagram(host(), { nodes: [{ id: 'n1', position: { x: 40, y: 40 }, label: 'n1' }] });
  });
  afterEach(() => api.dispose());

  it('a DiagramInstance is passed directly to both binders', () => {
    const palette = bindStencilPalette(api, { palette: host(), canvas: api.container });
    const panel = bindShapeDataPanel(api, host());
    const asPalette: StencilPaletteApi = api;
    const asPanel: ShapeDataPanelApi = api;
    expect(asPalette.getModel()).toBe(asPanel.getModel());
    palette.destroy();
    panel.destroy();
  });

  it('a hand-written adapter of the right shape compiles and works', () => {
    const adapter: ShapeDataPanelApi = {
      getEngine: () => api.getEngine(),
      getModel: () => api.getModel(),
      on: (event, handler) => api.on(event, handler),
    };
    const panel = bindShapeDataPanel(adapter, host());
    panel.refresh();
    panel.destroy();
  });

  it('an adapter of the wrong shape is a type error', () => {
    const el = host();
    const attempts = [
      // @ts-expect-error the selection handler is handed { nodes, edges }, not a number
      () => bindShapeDataPanel({ getEngine: () => api.getEngine(), getModel: () => api.getModel(), on: (_e: 'selection:change', h: (n: number) => void) => api.on('selection:change', () => h(1)) }, el),
      // @ts-expect-error getEngine must return the DiagramEngine
      () => bindShapeDataPanel({ getEngine: () => 'engine', getModel: () => api.getModel(), on: api.on }, el),
      // @ts-expect-error getModel must return the DiagramModel
      () => bindShapeDataPanel({ getEngine: () => api.getEngine(), getModel: () => api.getEngine(), on: api.on }, el),
      // @ts-expect-error the panel needs a way to hear selection changes
      () => bindShapeDataPanel({ getEngine: () => api.getEngine(), getModel: () => api.getModel() }, el),
      // @ts-expect-error the palette needs the viewport, to place a drop at the cursor
      () => bindStencilPalette({ getEngine: () => api.getEngine(), getModel: () => api.getModel() }, { palette: el, canvas: el }),
      // @ts-expect-error getEngine must return the DiagramEngine
      () => bindStencilPalette({ getEngine: () => 42, getModel: () => api.getModel(), viewport: api.viewport }, { palette: el, canvas: el }),
    ];
    expect(attempts).toHaveLength(6);
  });
});
