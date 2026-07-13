// edge-templates.spec.ts — Wave 4 (Edges & links), Card 5
//
// The extensibility seam: link templates, label templates and author-defined
// markers, plus the foreignObject helper that carries HTML onto an edge.

import {
  clearEdgeTemplates,
  getEdgeTemplateVersion,
  getLabelTemplate,
  getLinkTemplate,
  getMarker,
  hasMarker,
  hashString,
  htmlLabelVNode,
  listLinkTemplates,
  listMarkers,
  markerTipOffset,
  onEdgeTemplateChange,
  registerLabelTemplate,
  registerLinkTemplate,
  registerMarker,
} from './edge-templates';
import { VNodePatcher, XHTML_NS } from '../vnode/patch';
import type { ArrowStyle } from '@grafloria/engine';

describe('edge-templates — registries', () => {
  afterEach(() => clearEdgeTemplates());

  it('registers and resolves a link template', () => {
    const template = () => ({ type: 'path', props: { d: 'M0 0' } });
    registerLinkTemplate('mine', template);

    expect(getLinkTemplate('mine')).toBe(template);
    expect(listLinkTemplates()).toContain('mine');
  });

  it('registers and resolves a label template', () => {
    const template = () => ({ type: 'text', props: {} });
    registerLabelTemplate('badge', template);

    expect(getLabelTemplate('badge')).toBe(template);
  });

  it('registers and resolves a marker', () => {
    const definition = { render: () => null, tipOffset: 7 };
    registerMarker('feather', definition);

    expect(getMarker('feather')).toBe(definition);
    expect(hasMarker('feather')).toBe(true);
    expect(listMarkers()).toContain('feather');
  });

  it('returns undefined for a name nobody registered — the renderer falls back rather than dropping the link', () => {
    expect(getLinkTemplate('ghost')).toBeUndefined();
    expect(getMarker('ghost')).toBeUndefined();
  });

  it('lets a registration be REPLACED', () => {
    const first = () => null;
    const second = () => null;
    registerLinkTemplate('x', first);
    registerLinkTemplate('x', second);

    expect(getLinkTemplate('x')).toBe(second);
  });

  it('notifies subscribers on every mutation — a template\'s OUTPUT is baked into the cached VNode, so a redefinition that did not invalidate would never show up', () => {
    const listener = jest.fn();
    const unsubscribe = onEdgeTemplateChange(listener);

    registerLinkTemplate('a', () => null);
    registerMarker('b', { render: () => null });
    registerLabelTemplate('c', () => null);

    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    registerLinkTemplate('d', () => null);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('bumps a version on every mutation', () => {
    const before = getEdgeTemplateVersion();
    registerMarker('v', { render: () => null });
    expect(getEdgeTemplateVersion()).toBeGreaterThan(before);
  });

  it('clearEdgeTemplates() is a no-op (and does not notify) when nothing is registered', () => {
    clearEdgeTemplates();
    const listener = jest.fn();
    onEdgeTemplateChange(listener);
    clearEdgeTemplates();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('edge-templates — markerTipOffset', () => {
  const style: ArrowStyle = { type: 'custom', size: 12, filled: true };

  it('reads a constant tip offset', () => {
    expect(markerTipOffset({ render: () => null, tipOffset: 5 }, style)).toBe(5);
  });

  it('reads a tip offset computed from the style, so a marker can scale with `size`', () => {
    expect(markerTipOffset({ render: () => null, tipOffset: s => s.size }, style)).toBe(12);
  });

  it('defaults to 0 — the marker\'s origin IS its tip', () => {
    expect(markerTipOffset({ render: () => null }, style)).toBe(0);
  });
});

describe('edge-templates — htmlLabelVNode', () => {
  it('CENTRES the box on the anchor (labels hang off a path; nodes hang off a corner)', () => {
    const vnode = htmlLabelVNode({
      id: 'l1',
      html: '<b>hi</b>',
      anchor: { x: 100, y: 50 },
      width: 60,
      height: 20,
    });

    expect(vnode.type).toBe('foreignObject');
    expect(vnode.props?.['x']).toBe(70);
    expect(vnode.props?.['y']).toBe(40);
    expect(vnode.props?.['width']).toBe(60);
    expect(vnode.props?.['height']).toBe(20);
  });

  it('puts the HTML on an XHTML div via innerHTML', () => {
    const vnode = htmlLabelVNode({
      id: 'l1',
      html: '<b>hi</b>',
      anchor: { x: 0, y: 0 },
      width: 60,
      height: 20,
    });

    const div = vnode.children?.[0] as any;
    expect(div.type).toBe('div');
    expect(div.props.xmlns).toBe(XHTML_NS);
    expect(div.props.innerHTML).toBe('<b>hi</b>');
  });

  it('FOLDS THE CONTENT INTO THE KEY — the patcher treats foreignObject as opaque, so an edited label would otherwise render its old HTML forever', () => {
    const anchor = { x: 0, y: 0 };
    const before = htmlLabelVNode({ id: 'l1', html: '<b>one</b>', anchor, width: 60, height: 20 });
    const after = htmlLabelVNode({ id: 'l1', html: '<b>two</b>', anchor, width: 60, height: 20 });
    const same = htmlLabelVNode({ id: 'l1', html: '<b>one</b>', anchor, width: 60, height: 20 });

    expect(after.key).not.toBe(before.key);
    // …and unchanged content keeps the same identity, so live DOM survives.
    expect(same.key).toBe(before.key);
  });

  it('is actually re-rendered by the patcher when its content changes', () => {
    // The behaviour the key hash exists to produce, driven through the real patcher.
    const patcher = new VNodePatcher();
    const container = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    const tree = (html: string) => ({
      type: 'g',
      key: 'root',
      props: {},
      children: [htmlLabelVNode({ id: 'l1', html, anchor: { x: 0, y: 0 }, width: 60, height: 20 })],
    });

    patcher.reconcile(container, tree('<b>one</b>'));
    expect(container.querySelector('foreignObject b')?.textContent).toBe('one');

    patcher.reconcile(container, tree('<b>two</b>'));
    expect(container.querySelector('foreignObject b')?.textContent).toBe('two');
  });
});

describe('edge-templates — hashString', () => {
  it('is stable', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
  });

  it('separates different content', () => {
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });

  it('handles the empty string', () => {
    expect(typeof hashString('')).toBe('string');
  });
});
