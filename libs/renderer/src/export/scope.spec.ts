import type { VNode } from '../types/vnode.types';
import { filterTreeByIds, selectionKeys } from './scope';

const node = (id: string): VNode =>
  ({ type: 'g', key: `node-${id}`, props: {}, children: [{ type: 'rect', props: { width: 10, height: 10 } }] }) as VNode;

const link = (id: string): VNode =>
  ({ type: 'g', key: `link-${id}`, props: {}, children: [{ type: 'path', props: { d: 'M 0 0 L 1 1' } }] }) as VNode;

const tree = (): VNode =>
  ({
    type: 'svg',
    key: 'diagram-root',
    props: {},
    children: [
      { type: 'g', key: 'links-layer', props: {}, children: [link('1'), link('2')] },
      { type: 'g', key: 'nodes-layer', props: {}, children: [node('a'), node('b'), node('c')] },
      { type: 'defs', key: 'defs', props: {}, children: [{ type: 'linearGradient', props: { id: 'grad' } }] },
    ],
  }) as VNode;

const keysIn = (vnode: VNode): string[] => {
  const out: string[] = [];
  const walk = (v: VNode) => {
    if (v.key) out.push(v.key);
    for (const child of v.children ?? []) walk(child);
  };
  walk(vnode);
  return out;
};

describe('selectionKeys', () => {
  it('covers every key shape the renderer mints for an id', () => {
    expect(selectionKeys(['a'])).toEqual(new Set(['node-a', 'node-a-html-layer', 'link-a']));
  });
});

describe('filterTreeByIds', () => {
  it('keeps the selected node and DROPS the rest', () => {
    const keys = keysIn(filterTreeByIds(tree(), ['a']));
    expect(keys).toContain('node-a');
    expect(keys).not.toContain('node-b');
    expect(keys).not.toContain('node-c');
  });

  it('drops un-selected LINKS too — an unshared link is markup in the file, not just pixels outside the box', () => {
    const keys = keysIn(filterTreeByIds(tree(), ['a']));
    expect(keys).not.toContain('link-1');
    expect(keys).not.toContain('link-2');
  });

  it('keeps a selected link', () => {
    const keys = keysIn(filterTreeByIds(tree(), ['1']));
    expect(keys).toContain('link-1');
    expect(keys).not.toContain('link-2');
  });

  it('KEEPS <defs> — a kept node may reference a gradient, and pruning it leaves a dangling url(#…)', () => {
    const pruned = filterTreeByIds(tree(), ['a']);
    const defs = (pruned.children ?? []).find(c => c.type === 'defs');
    expect(defs).toBeDefined();
    expect(defs!.children).toHaveLength(1);
  });

  it('keeps the layer containers so the picture keeps its z-order', () => {
    const keys = keysIn(filterTreeByIds(tree(), ['a']));
    expect(keys).toContain('nodes-layer');
    expect(keys).toContain('links-layer');
  });

  it('keeps a selected node\'s WHOLE subtree (its label and ports carry no id of their own)', () => {
    const withLabel: VNode = {
      type: 'g',
      key: 'root',
      props: {},
      children: [
        {
          type: 'g',
          key: 'node-a',
          props: {},
          children: [
            { type: 'rect', props: {} },
            { type: 'text', props: { textContent: 'label' } },
            { type: 'circle', key: 'port-a-in', props: {} },
          ],
        } as VNode,
      ],
    } as VNode;
    const kept = filterTreeByIds(withLabel, ['a']).children![0];
    expect(kept.children).toHaveLength(3);
  });

  it('does not mutate the input tree (it is the live render — mutating it corrupts the next frame)', () => {
    const original = tree();
    const before = keysIn(original);
    filterTreeByIds(original, ['a']);
    expect(keysIn(original)).toEqual(before);
  });

  it('an empty selection prunes every diagram object but keeps the scaffold', () => {
    const keys = keysIn(filterTreeByIds(tree(), []));
    expect(keys).not.toContain('node-a');
    expect(keys).toContain('defs');
  });
});
