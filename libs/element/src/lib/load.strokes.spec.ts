/**
 * Whiteboard ink is part of the saved document (`strokes` in the serializer's
 * output), so reopening the document must bring it back: save →
 * `fromDocument` → `render` reopens with the same strokes, painted.
 */
import { DiagramSerializer, StrokeModel } from '@grafloria/engine';
import type { DiagramInstance } from '@grafloria/renderer';
import { render } from './grafloria';
import { fromDocument } from './load';

function sizedHost(): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 1200 });
  Object.defineProperty(el, 'clientHeight', { value: 800 });
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 800, width: 1200, height: 800 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

function inked(): { api: DiagramInstance; host: HTMLElement } {
  const host = sizedHost();
  const api = render({ nodes: [{ id: 'n1', position: { x: 300, y: 300 }, label: 'Box' }] }, host);
  const model = api.getModel();
  model.addStroke(
    new StrokeModel(
      [
        { x: 10, y: 10 },
        { x: 40, y: 65 },
        { x: 90, y: 20 },
      ],
      { color: '#dc2626', width: 3 },
      { id: 'circle', label: 'circled for review' }
    )
  );
  model.addStroke(
    new StrokeModel(
      [
        { x: 200, y: 10, pressure: 0.2 },
        { x: 240, y: 40, pressure: 0.8 },
      ],
      { color: '#1f2933', width: 5 },
      { id: 'tick' }
    )
  );
  api.renderNow();
  return { api, host };
}

const shape = (api: DiagramInstance) =>
  api
    .getModel()
    .getStrokes()
    .map((s) => s.serialize())
    .map(({ id, points, style, label }) => ({ id, points, style, label }))
    .sort((a, b) => a.id.localeCompare(b.id));

const painted = (host: HTMLElement) =>
  Array.from(host.querySelectorAll('[data-stroke-id]'))
    .map((e) => e.getAttribute('data-stroke-id'))
    .sort();

describe('fromDocument keeps whiteboard ink', () => {
  it('the saved document carries the strokes', () => {
    const { api } = inked();
    const doc = new DiagramSerializer().serializeEnvelope(api.getModel());
    expect(doc.document.strokes).toHaveLength(2);
  });

  it('reopens with the same strokes, painted', () => {
    const { api, host } = inked();
    expect(painted(host)).toEqual(['circle', 'tick']);
    const json = JSON.stringify(new DiagramSerializer().serializeEnvelope(api.getModel()));

    const reopenedHost = sizedHost();
    const reopened = render(fromDocument(json), reopenedHost);
    reopened.renderNow();

    expect(shape(reopened)).toEqual(shape(api));
    expect(painted(reopenedHost)).toEqual(['circle', 'tick']);
  });

  it('a reopened stroke is live: erasing it removes it', () => {
    const { api } = inked();
    const json = JSON.stringify(new DiagramSerializer().serialize(api.getModel()));
    const reopenedHost = sizedHost();
    const reopened = render(fromDocument(json), reopenedHost);
    reopened.renderNow();
    reopened.getModel().removeStroke('circle');
    reopened.renderNow();
    expect(painted(reopenedHost)).toEqual(['tick']);
  });
});
