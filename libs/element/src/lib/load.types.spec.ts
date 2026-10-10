/**
 * `render(fromDocument(json), host)` is the documented way to reopen a saved
 * document, so it must compile under `strict` with no cast.
 *
 * This file is partly a COMPILE-TIME test: ts-jest type-checks it, so the
 * positive calls below fail the suite if they stop compiling, and every
 * `@ts-expect-error` must find an error (an unused one fails the build too).
 *
 * The runtime half proves the direct call keeps what the spec carries beyond
 * nodes and edges: the instance options a fluid board asks for (zoom pinned
 * to 1) and the dashboard handle, driving the board that was just mounted.
 */
import { DiagramSerializer } from '@grafloria/engine';
import type { DiagramInstance } from '@grafloria/renderer';
import { render, type RenderSpec } from './grafloria';
import { dashboard } from './dashboard-kit';
import { fromDocument, type LoadedDiagramSpec } from './load';

function sizedHost(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 1200 });
  Object.defineProperty(el, 'clientHeight', { value: 800 });
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 800, width: 1200, height: 800 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

function save(api: DiagramInstance): string {
  return JSON.stringify(new DiagramSerializer().serializeEnvelope(api.getModel()));
}

const BOARD = () =>
  dashboard({
    columns: 12,
    mode: 'fluid',
    views: [
      {
        id: 'main',
        widgets: [
          { id: 'k1', kind: 'kpi', span: 3, rows: 1, title: 'Revenue', data: { label: 'rev', value: '$1.2M' } },
          { id: 'k2', kind: 'kpi', span: 3, rows: 1, title: 'Orders', data: { label: 'orders', value: '845' } },
        ],
      },
    ],
  });

describe('render(fromDocument(json), host) type-checks', () => {
  it('a loaded spec is a RenderSpec', () => {
    const json = save(render(BOARD(), sizedHost()));
    const loaded: RenderSpec = fromDocument(json);
    expect(typeof loaded).toBe('object');
  });

  it('mounts the loaded spec directly, without a cast', () => {
    const original = render(BOARD(), sizedHost());
    const json = save(original);

    const instance = render(fromDocument(json), sizedHost());
    instance.renderNow();

    expect(instance.getModel().getNodes().map((n) => n.id).sort()).toEqual(['k1', 'k2']);
    expect(instance.getModel().getGroup('main')).toBeDefined();
  });

  it('reopens what the model serializes, with no cast', () => {
    const original = render(BOARD(), sizedHost());
    // Both serialized forms the engine hands out are one type, and both load.
    const fromModel = render(fromDocument(original.getModel().serialize()), sizedHost());
    const fromSerializer = render(
      fromDocument(new DiagramSerializer().serialize(original.getModel())),
      sizedHost()
    );
    fromModel.renderNow();
    fromSerializer.renderNow();
    for (const api of [fromModel, fromSerializer]) {
      expect(api.getModel().getNodes().map((n) => n.id).sort()).toEqual(['k1', 'k2']);
    }
  });

  it('keeps the renderOptions a fluid board was saved with', () => {
    const original = render(BOARD(), sizedHost());
    // The authoring path pins the zoom of a fluid board…
    expect(original.viewport.setZoom(2)).toBe(1);

    const loaded = fromDocument(save(original));
    expect(loaded.renderOptions).toEqual({ minZoom: 1, maxZoom: 1 });
    const instance = render(loaded, sizedHost());
    // …and so does the reopened one: a zoom request is clamped back to 1.
    expect(instance.viewport.setZoom(2)).toBe(1);
    expect(instance.viewport.setZoom(0.4)).toBe(1);
  });

  it('keeps the dashboard handle, driving the board it mounted', () => {
    const loaded = fromDocument(save(render(BOARD(), sizedHost())));
    const instance = render(loaded, sizedHost());
    instance.renderNow();

    expect(loaded.handle.views).toEqual(['main']);
    expect(loaded.handle.widget('k2')!.cell).toEqual({ x: 3, y: 0, w: 3, h: 1 });
    loaded.handle.addWidget({ id: 'k3', kind: 'kpi', span: 3, rows: 1, title: 'Added', data: { value: '7' } });
    expect(instance.getModel().getNode('k3')).toBeDefined();
    expect([...(instance.getModel().getGroup('main')!.members ?? [])]).toContain('k3');
  });

  it('still rejects what is not a render spec', () => {
    const loaded = fromDocument(save(render(BOARD(), sizedHost())));
    const host = sizedHost();
    const attempts = [
      // @ts-expect-error a number is not a render spec
      () => render(42, host),
      // @ts-expect-error nodes must be node specs or live models, not strings
      () => render({ nodes: ['k1'], edges: [] }, host),
      // @ts-expect-error a loaded spec's painter takes the live NodeModel, not a string
      () => render({ ...loaded, renderCustomNode: (node: string, el: HTMLElement) => void [node, el] }, host),
    ];
    expect(attempts).toHaveLength(3);
    const spec: LoadedDiagramSpec = loaded;
    expect(spec.nodes.length).toBe(2);
  });
});
