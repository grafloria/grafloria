import { VNodePatcher, SVG_NS, XHTML_NS, serializeStyle } from './patch';
import type { VNode } from '../types/vnode.types';

/**
 * VNode → DOM patcher (keyed reconciler).
 *
 * The contract these tests lock down: re-rendering REUSES DOM. Object identity
 * (`toBe`) is the assertion that matters — a rebuilt element is a different
 * object, and a rebuilt element is exactly how focus / selection / animations /
 * mounted components used to die every frame.
 */
describe('VNodePatcher', () => {
  let patcher: VNodePatcher;
  let container: HTMLElement;

  beforeEach(() => {
    patcher = new VNodePatcher();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  const g = (key: string, children: VNode[] = [], props: Record<string, any> = {}): VNode => ({
    type: 'g',
    key,
    props,
    children,
  });

  describe('createElement', () => {
    it('creates SVG elements in the SVG namespace', () => {
      const el = patcher.createElement({ type: 'rect', props: { x: 1, y: 2 } });

      expect(el.namespaceURI).toBe(SVG_NS);
      expect(el.tagName.toLowerCase()).toBe('rect');
      expect(el.getAttribute('x')).toBe('1');
    });

    it('kebab-cases camelCase props but keeps genuinely-camelCase SVG attrs verbatim', () => {
      const el = patcher.createElement({
        type: 'linearGradient',
        props: { strokeWidth: 2, gradientUnits: 'userSpaceOnUse', viewBox: '0 0 1 1' },
      });

      expect(el.getAttribute('stroke-width')).toBe('2');
      expect(el.getAttribute('gradientUnits')).toBe('userSpaceOnUse');
      expect(el.getAttribute('viewBox')).toBe('0 0 1 1');
      expect(el.getAttribute('gradient-units')).toBeNull();
    });

    it('serializes object styles instead of stringifying them', () => {
      const el = patcher.createElement({
        type: 'g',
        props: { style: { cursor: 'move', transitionDuration: '2s' } },
      });

      expect(el.getAttribute('style')).toBe('cursor:move;transition-duration:2s');
    });

    it('skips null/undefined props (writing "undefined" would beat the stylesheet)', () => {
      const el = patcher.createElement({
        type: 'path',
        props: { d: 'M 0 0', strokeWidth: undefined, stroke: null as unknown as string },
      });

      expect(el.getAttribute('stroke-width')).toBeNull();
      expect(el.getAttribute('stroke')).toBeNull();
      expect(el.hasAttribute('stroke-width')).toBe(false);
    });

    it('never stringifies function props into attributes', () => {
      const el = patcher.createElement({
        type: 'rect',
        props: { onClick: () => undefined },
      });

      expect(el.hasAttribute('on-click')).toBe(false);
    });

    it('mirrors the VNode key onto data-vnode-key', () => {
      const el = patcher.createElement(g('node-7'));
      expect(el.getAttribute('data-vnode-key')).toBe('node-7');
    });

    it('creates foreignObject children in the XHTML namespace', () => {
      const el = patcher.createElement({
        type: 'foreignObject',
        key: 'fo-1',
        props: { x: 0, y: 0, width: 10, height: 10 },
        children: [{ type: 'div', props: { className: 'content' } }],
      });

      expect(el.namespaceURI).toBe(SVG_NS);
      expect(el.firstElementChild?.namespaceURI).toBe(XHTML_NS);
    });

    it('materializes text children as text nodes', () => {
      const el = patcher.createElement({
        type: 'text',
        props: {},
        children: ['hello' as unknown as VNode],
      });

      expect(el.childNodes[0].nodeType).toBe(Node.TEXT_NODE);
      expect(el.textContent).toBe('hello');
    });
  });

  describe('reconcile — DOM reuse', () => {
    it('mounts on the first call', () => {
      const root = patcher.reconcile(container, g('root'));

      expect(container.children.length).toBe(1);
      expect(container.firstElementChild).toBe(root);
      expect(patcher.stats.created).toBeGreaterThan(0);
    });

    it('REUSES the same DOM element object across re-renders (no teardown-and-rebuild)', () => {
      const first = patcher.reconcile(
        container,
        g('root', [{ type: 'rect', key: 'r1', props: { x: 0 } }])
      );
      const firstRect = first.firstElementChild!;

      const second = patcher.reconcile(
        container,
        g('root', [{ type: 'rect', key: 'r1', props: { x: 40 } }])
      );

      expect(second).toBe(first); // same root object
      expect(second.firstElementChild).toBe(firstRect); // same child object
      expect(firstRect.getAttribute('x')).toBe('40'); // ...and it was patched
      expect(patcher.stats.created).toBe(0); // nothing rebuilt
    });

    it('preserves live DOM state (focus / animation) that a rebuild would destroy', () => {
      // A rebuilt element loses everything attached to the element object.
      const tree = (x: number): VNode =>
        g('root', [{ type: 'rect', key: 'r1', props: { x } }]);

      const root = patcher.reconcile(container, tree(0));
      const rect = root.firstElementChild as SVGElement & { __liveState?: string };
      rect.__liveState = 'focus+animation'; // stand-in for state bound to the element

      patcher.reconcile(container, tree(10));

      const after = container.firstElementChild!.firstElementChild as typeof rect;
      expect(after).toBe(rect);
      expect(after.__liveState).toBe('focus+animation');
    });

    it('skips the whole subtree when the VNode object is identical (renderer cache hit)', () => {
      const cached: VNode = g('root', [{ type: 'rect', key: 'r1', props: { x: 1 } }]);

      patcher.reconcile(container, cached);
      patcher.reconcile(container, cached); // same object — renderer served a cached VNode

      expect(patcher.stats.created).toBe(0);
      expect(patcher.stats.skipped).toBe(1);
      expect(patcher.stats.reused).toBe(0); // nothing even had to be compared
    });

    it('adds, removes and updates children without rebuilding the survivors', () => {
      const root = patcher.reconcile(
        container,
        g('root', [
          { type: 'rect', key: 'a', props: {} },
          { type: 'rect', key: 'b', props: {} },
        ])
      );
      const a = root.children[0];
      const b = root.children[1];

      patcher.reconcile(
        container,
        g('root', [
          { type: 'rect', key: 'a', props: { fill: 'red' } },
          { type: 'circle', key: 'c', props: {} },
        ])
      );

      expect(root.children.length).toBe(2);
      expect(root.children[0]).toBe(a); // survivor reused
      expect(root.children[0].getAttribute('fill')).toBe('red');
      expect(root.children[1].tagName.toLowerCase()).toBe('circle');
      expect(b.parentNode).toBeNull(); // 'b' removed
    });

    it('replaces the element when the type changes under the same key', () => {
      const root = patcher.reconcile(
        container,
        g('root', [{ type: 'rect', key: 'x', props: {} }])
      );
      const rect = root.firstElementChild;

      patcher.reconcile(container, g('root', [{ type: 'circle', key: 'x', props: {} }]));

      expect(root.firstElementChild).not.toBe(rect);
      expect(root.firstElementChild!.tagName.toLowerCase()).toBe('circle');
      expect(root.children.length).toBe(1);
    });

    it('replaces the root when its type changes', () => {
      const first = patcher.reconcile(container, { type: 'svg', key: 'root', props: {} });
      const next = patcher.reconcile(container, { type: 'g', key: 'root', props: {} });

      expect(next).not.toBe(first);
      expect(container.children.length).toBe(1);
      expect(container.firstElementChild).toBe(next);
    });

    it('remounts if the root was removed behind our back', () => {
      const first = patcher.reconcile(container, g('root'));
      container.removeChild(first);

      const next = patcher.reconcile(container, g('root'));

      expect(container.children.length).toBe(1);
      expect(container.firstElementChild).toBe(next);
    });
  });

  describe('reconcile — keyed reordering', () => {
    it('MOVES keyed children instead of recreating them', () => {
      const order = (keys: string[]): VNode =>
        g('root', keys.map((k) => ({ type: 'rect', key: k, props: { id: k } })));

      const root = patcher.reconcile(container, order(['a', 'b', 'c']));
      const [a, b, c] = [root.children[0], root.children[1], root.children[2]];

      patcher.reconcile(container, order(['c', 'a', 'b']));

      // Same three element objects, new order.
      expect(root.children[0]).toBe(c);
      expect(root.children[1]).toBe(a);
      expect(root.children[2]).toBe(b);
      expect(patcher.stats.created).toBe(0);
      expect(patcher.stats.moved).toBeGreaterThan(0);
    });

    it('reverses a keyed list without creating a single element', () => {
      const order = (keys: string[]): VNode =>
        g('root', keys.map((k) => ({ type: 'rect', key: k, props: {} })));

      const root = patcher.reconcile(container, order(['a', 'b', 'c', 'd']));
      const before = Array.from(root.children);

      patcher.reconcile(container, order(['d', 'c', 'b', 'a']));

      expect(patcher.stats.created).toBe(0);
      expect(Array.from(root.children)).toEqual([...before].reverse());
    });

    it('handles a MIX of keyed and keyless children (leaf primitives have no key)', () => {
      // A node group in the real renderer: keyless shape/label leaves + keyed ports.
      const group = (selected: boolean): VNode =>
        g('node-1', [
          ...(selected
            ? [{ type: 'rect', props: { className: 'selection-highlight' } } as VNode]
            : []),
          { type: 'rect', props: { className: 'node-shape' } },
          { type: 'text', props: { textContent: 'Label' } },
          { type: 'circle', key: 'port-out', props: { cx: 10 } },
          { type: 'circle', key: 'port-in', props: { cx: 0 } },
        ]);

      const root = patcher.reconcile(container, group(false));
      const portOut = root.querySelector('[data-vnode-key="port-out"]')!;
      const portIn = root.querySelector('[data-vnode-key="port-in"]')!;

      // Selecting the node prepends a keyless highlight, shifting every keyless index.
      patcher.reconcile(container, group(true));

      expect(root.children.length).toBe(5);
      expect(root.children[0].getAttribute('class')).toBe('selection-highlight');
      expect(root.children[1].getAttribute('class')).toBe('node-shape');
      expect(root.children[2].textContent).toBe('Label');
      // Keyed children survive the shift as the SAME objects.
      expect(root.querySelector('[data-vnode-key="port-out"]')).toBe(portOut);
      expect(root.querySelector('[data-vnode-key="port-in"]')).toBe(portIn);
    });

    it('keeps DOM aligned when conditional children are dropped from the list', () => {
      const tree = (withShadow: boolean): VNode =>
        g('root', [
          ...(withShadow ? [{ type: 'ellipse', props: { className: 'shadow' } } as VNode] : []),
          { type: 'rect', key: 'body', props: {} },
        ]);

      const root = patcher.reconcile(container, tree(true));
      const body = root.querySelector('[data-vnode-key="body"]')!;

      patcher.reconcile(container, tree(false));

      expect(root.children.length).toBe(1);
      expect(root.children[0]).toBe(body);
    });
  });

  describe('reconcile — foreignObject is opaque', () => {
    const fo = (x: number): VNode =>
      g('node-1', [
        {
          type: 'foreignObject',
          key: 'fo-node-1',
          props: { x, y: 0, width: 100, height: 50, containerId: `fo-node-1-${x}` },
          children: [{ type: 'div', props: { id: 'mount-point' } }],
        },
      ]);

    it('preserves a foreignObject subtree (live HTML/components) across re-renders', () => {
      const root = patcher.reconcile(container, fo(0));
      const foEl = root.firstElementChild!;
      const mount = foEl.firstElementChild!;

      // Something else (a framework) mounts live content into the container div.
      const live = document.createElement('input');
      live.value = 'user typing';
      mount.appendChild(live);

      patcher.reconcile(container, fo(25));

      // Same foreignObject, same mount point, same live child — nothing rebuilt.
      expect(root.firstElementChild).toBe(foEl);
      expect(foEl.firstElementChild).toBe(mount);
      expect(mount.firstElementChild).toBe(live);
      expect((mount.firstElementChild as HTMLInputElement).value).toBe('user typing');
      // ...but the foreignObject's own props were still patched.
      expect(foEl.getAttribute('x')).toBe('25');
    });

    it('does not wipe injected content even when the VNode declares no children', () => {
      const withChildren: VNode = g('n', [
        {
          type: 'foreignObject',
          key: 'fo-n',
          props: { width: 10, height: 10 },
          children: [{ type: 'div', props: {} }],
        },
      ]);
      const withoutChildren: VNode = g('n', [
        { type: 'foreignObject', key: 'fo-n', props: { width: 20, height: 10 } },
      ]);

      const root = patcher.reconcile(container, withChildren);
      const foEl = root.firstElementChild!;
      const injected = document.createElement('span');
      foEl.firstElementChild!.appendChild(injected);

      patcher.reconcile(container, withoutChildren);

      expect(root.firstElementChild).toBe(foEl);
      expect(foEl.contains(injected)).toBe(true);
      expect(foEl.getAttribute('width')).toBe('20');
    });

    it('rebuilds the foreignObject when its key changes (a genuinely different node)', () => {
      const root = patcher.reconcile(container, fo(0));
      const foEl = root.firstElementChild!;

      patcher.reconcile(
        container,
        g('node-1', [
          {
            type: 'foreignObject',
            key: 'fo-node-2',
            props: { x: 0, y: 0, width: 100, height: 50 },
            children: [{ type: 'div', props: {} }],
          },
        ])
      );

      expect(root.firstElementChild).not.toBe(foEl);
      expect(root.firstElementChild!.getAttribute('data-vnode-key')).toBe('fo-node-2');
    });
  });

  describe('patchProps', () => {
    it('removes props that vanished from the new VNode', () => {
      const el = patcher.createElement({ type: 'rect', props: { fill: 'red', stroke: 'blue' } });

      patcher.patchProps(el, { fill: 'red', stroke: 'blue' }, { fill: 'red' });

      expect(el.getAttribute('fill')).toBe('red');
      expect(el.getAttribute('stroke')).toBeNull();
    });

    it('removes a prop that went undefined instead of leaving it stale', () => {
      // The hover style used to get stuck on: `style: hovered ? {...} : undefined`
      // was *skipped* rather than removed.
      const el = patcher.createElement({ type: 'g', props: { style: { cursor: 'move' } } });
      expect(el.getAttribute('style')).toBe('cursor:move');

      patcher.patchProps(el, { style: { cursor: 'move' } }, { style: undefined });

      expect(el.hasAttribute('style')).toBe(false);
    });

    it('does not rewrite an unchanged style object', () => {
      const el = patcher.createElement({ type: 'g', props: { style: { cursor: 'move' } } });
      const setAttribute = jest.spyOn(el, 'setAttribute');

      patcher.patchProps(el, { style: { cursor: 'move' } }, { style: { cursor: 'move' } });

      expect(setAttribute).not.toHaveBeenCalled();
    });

    it('updates textContent', () => {
      const el = patcher.createElement({ type: 'text', props: { textContent: 'old' } });

      patcher.patchProps(el, { textContent: 'old' }, { textContent: 'new' });

      expect(el.textContent).toBe('new');
    });

    it('maps className to the class attribute', () => {
      const el = patcher.createElement({ type: 'g', props: { className: 'a' } });

      patcher.patchProps(el, { className: 'a' }, { className: 'b' });

      expect(el.getAttribute('class')).toBe('b');
    });
  });

  describe('textContent-driven elements (labels)', () => {
    // Regression: `textContent` creates a text node that is NOT in `children`.
    // The child diff used to see an empty child list, decide the text node was a
    // stray, and delete it — so every node/link label went blank on the SECOND
    // render (the first render was fine, which is exactly how this hid).
    it('keeps a label alive and updates it across re-renders', () => {
      const label = (text: string): VNode =>
        g('node-1', [{ type: 'text', key: 'label', props: { x: 5, textContent: text } }]);

      const root = patcher.reconcile(container, label('Start'));
      const textEl = root.firstElementChild!;
      expect(textEl.textContent).toBe('Start');

      patcher.reconcile(container, label('Start'));
      expect(root.firstElementChild).toBe(textEl);
      expect(textEl.textContent).toBe('Start'); // not wiped

      patcher.reconcile(container, label('Renamed'));
      expect(root.firstElementChild).toBe(textEl);
      expect(textEl.textContent).toBe('Renamed');
    });

    it('restores element children when a node stops using textContent', () => {
      const asText: VNode = g('n', [
        { type: 'g', key: 'slot', props: { textContent: 'plain' } },
      ]);
      const asChildren: VNode = g('n', [
        {
          type: 'g',
          key: 'slot',
          props: {},
          children: [{ type: 'rect', props: {} }],
        },
      ]);

      patcher.reconcile(container, asText);
      patcher.reconcile(container, asChildren);

      const slot = container.querySelector('[data-vnode-key="slot"]')!;
      expect(slot.textContent).toBe('');
      expect(slot.children.length).toBe(1);
      expect(slot.children[0].tagName.toLowerCase()).toBe('rect');
    });
  });

  describe('text children', () => {
    it('updates a text node in place', () => {
      const tree = (t: string): VNode => ({
        type: 'text',
        key: 't',
        props: {},
        children: [t as unknown as VNode],
      });

      const root = patcher.reconcile(container, tree('one'));
      const textNode = root.childNodes[0];

      patcher.reconcile(container, tree('two'));

      expect(root.childNodes[0]).toBe(textNode);
      expect(root.textContent).toBe('two');
    });
  });

  describe('unmount', () => {
    it('removes the tree and forgets the container', () => {
      patcher.reconcile(container, g('root'));
      patcher.unmount(container);

      expect(container.children.length).toBe(0);
      expect(patcher.getMountedElement(container)).toBeUndefined();
    });
  });

  describe('serializeStyle', () => {
    it('handles objects, strings and empties', () => {
      expect(serializeStyle({ fontSize: '12px', color: 'red' })).toBe('font-size:12px;color:red');
      expect(serializeStyle('cursor:move')).toBe('cursor:move');
      expect(serializeStyle(undefined)).toBe('');
      expect(serializeStyle({})).toBe('');
    });
  });
});
