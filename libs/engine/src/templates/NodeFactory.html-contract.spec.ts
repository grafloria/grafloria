// The html contract of a factory-built node.
//
// A master carrying `structure.html` used to be stamped with
// `metadata.useHTMLLayer = true`, and the SVG renderer answers that flag with an
// EMPTY <g> — so every one of the 80 generated masters rendered as nothing at
// all while every model-level assertion stayed green. The flag must stay off:
// the renderer's real rich-content seam is `metadata.html` (a structured,
// sanitized tree), not this factory's raw template string.

import { DiagramModel } from '../models/DiagramModel';
import { TemplateRegistry } from './TemplateRegistry';
import { NodeFactory } from './NodeFactory';
import { EventBus } from '../events/EventBus';
import type { NodeTemplate } from './NodeTemplate';

const HTML_MASTER: NodeTemplate = {
  id: 'test-html-master',
  version: '1.0.0',
  meta: { name: 'Html Master', description: '', category: 'common', tags: [], author: 't' },
  structure: {
    type: 'test:html',
    size: { width: 120, height: 60 },
    shape: { type: 'rect', fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    html: { mode: 'template', template: '<div>{{data.label}}</div>' },
  },
  defaultData: { label: 'Hi' },
} as unknown as NodeTemplate;

describe('NodeFactory — html contract', () => {
  let diagram: DiagramModel;
  let factory: NodeFactory;

  beforeEach(() => {
    diagram = new DiagramModel();
    const registry = new TemplateRegistry(new EventBus());
    registry.register(HTML_MASTER);
    factory = new NodeFactory(registry, diagram);
  });

  it('does NOT set useHTMLLayer — that flag renders an empty group', () => {
    const node = factory.createFromTemplate('test-html-master', {}, { x: 0, y: 0 });
    expect(node.getMetadata('useHTMLLayer')).not.toBe(true);
  });

  it('keeps the shape metadata, so the node paints its real silhouette', () => {
    const node = factory.createFromTemplate('test-html-master', {}, { x: 0, y: 0 });
    expect(node.getMetadata('shape')).toMatchObject({ type: 'rect' });
  });

  it('still records the html config for callers that render it themselves', () => {
    const node = factory.createFromTemplate('test-html-master', {}, { x: 0, y: 0 });
    expect(node.data['_html']).toMatchObject({ mode: 'template' });
  });

  it('does not fabricate a metadata.html tree from the raw template string', () => {
    // `metadata.html` is a STRUCTURED, sanitized content tree (html-node.ts).
    // Handing it a handlebars string would be a different kind of broken.
    const node = factory.createFromTemplate('test-html-master', {}, { x: 0, y: 0 });
    const html = node.getMetadata('html');
    expect(typeof html === 'string').toBe(false);
  });
});
