// patch.ts — the `innerHTML` prop (Wave 4 / Edges & links, Card 5)
//
// HTML edge labels ride a `foreignObject` whose child div carries `innerHTML`.
// Without an explicit branch in the patcher, that prop would be kebab-cased into
// a meaningless `inner-h-t-m-l` ATTRIBUTE and every HTML label would render blank.

import { VNodePatcher, SVG_NS, XHTML_NS } from './patch';
import type { VNode } from '../types/vnode.types';

describe('VNodePatcher — innerHTML (Card 5)', () => {
  let patcher: VNodePatcher;
  let container: Element;

  beforeEach(() => {
    patcher = new VNodePatcher();
    container = document.createElementNS(SVG_NS, 'g');
    document.body.appendChild(container);
  });

  afterEach(() => container.remove());

  const htmlDiv = (html: string): VNode => ({
    type: 'foreignObject',
    key: `fo-${html}`,
    props: { x: 0, y: 0, width: 100, height: 30 },
    children: [
      {
        type: 'div',
        props: { xmlns: XHTML_NS, innerHTML: html },
        children: [],
      },
    ],
  });

  it('materialises real HTML, not an escaped string and not an attribute', () => {
    patcher.reconcile(container, htmlDiv('<b>bold</b>'));

    const div = container.querySelector('div')!;
    expect(div.querySelector('b')?.textContent).toBe('bold');
    expect(div.hasAttribute('inner-h-t-m-l')).toBe(false);
  });

  it('does not delete the injected content as "stray children" on the next patch', () => {
    // `innerHTML` OWNS the element's content: the DOM it creates is not in
    // `children`. A child diff would see an empty list, call that content stray,
    // and wipe it — exactly the bug `textContent` already had to be guarded against.
    const div = (html: string): VNode => ({
      type: 'div',
      key: 'd',
      props: { innerHTML: html },
      children: [],
    });

    patcher.reconcile(container, { type: 'g', key: 'r', props: {}, children: [div('<i>x</i>')] });
    expect(container.querySelector('i')).toBeTruthy();

    patcher.reconcile(container, { type: 'g', key: 'r', props: {}, children: [div('<i>x</i>')] });
    expect(container.querySelector('i')?.textContent).toBe('x');
  });

  it('updates the content when the prop changes on a NON-opaque element', () => {
    const div = (html: string): VNode => ({
      type: 'div',
      key: 'd',
      props: { innerHTML: html },
      children: [],
    });

    patcher.reconcile(container, { type: 'g', key: 'r', props: {}, children: [div('<i>one</i>')] });
    patcher.reconcile(container, { type: 'g', key: 'r', props: {}, children: [div('<i>two</i>')] });

    expect(container.querySelector('i')?.textContent).toBe('two');
  });

  it('clears the content when the prop disappears', () => {
    const withHtml: VNode = { type: 'div', key: 'd', props: { innerHTML: '<i>x</i>' }, children: [] };
    const without: VNode = { type: 'div', key: 'd', props: {}, children: [] };

    patcher.reconcile(container, { type: 'g', key: 'r', props: {}, children: [withHtml] });
    expect(container.querySelector('i')).toBeTruthy();

    patcher.reconcile(container, { type: 'g', key: 'r', props: {}, children: [without] });
    expect(container.querySelector('i')).toBeNull();
  });

  it('keeps foreignObject subtrees OPAQUE — content is replaced by identity (a new key), never diffed into', () => {
    patcher.reconcile(container, { type: 'g', key: 'r', props: {}, children: [htmlDiv('<b>one</b>')] });
    const first = container.querySelector('foreignObject')!;

    // Same key ⇒ same element object survives (this is what keeps host-mounted
    // component content alive across frames).
    patcher.reconcile(container, { type: 'g', key: 'r', props: {}, children: [htmlDiv('<b>one</b>')] });
    expect(container.querySelector('foreignObject')).toBe(first);

    // Different content ⇒ different key ⇒ a fresh element, and the new HTML shows.
    patcher.reconcile(container, { type: 'g', key: 'r', props: {}, children: [htmlDiv('<b>two</b>')] });
    expect(container.querySelector('foreignObject')).not.toBe(first);
    expect(container.querySelector('foreignObject b')?.textContent).toBe('two');
  });
});
