/**
 * `render({ …, layout: 'architecture' })` — the one-liner reaches the composing
 * layout: boxes given no positions come out arranged (zones stacked, a row inside
 * each), not piled at the origin.
 */
import { render } from './grafloria';

describe("render(spec) with layout: 'architecture'", () => {
  it('arranges boxes that were given no positions', () => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 }) as DOMRect;
    document.body.appendChild(el);
    const api = render(
      {
        layout: 'architecture',
        nodes: [{ id: 'user', label: 'User' }, { id: 'a', label: 'Auth' }, { id: 'b', label: 'Billing' }],
        groups: [{ id: 'svc', label: 'SERVICES', children: ['a', 'b'] }],
        edges: [{ source: 'user', target: 'a' }, { source: 'a', target: 'b' }],
      },
      el
    );
    const m = api.getModel();
    const x = (id: string) => m.getNode(id)!.position.x;
    expect(x('user')).toBeLessThan(x('a'));
    expect(x('a')).toBeLessThan(x('b'));
    expect(m.getNode('a')!.position.y).toBeCloseTo(m.getNode('b')!.position.y, 0);
    api.dispose();
    el.remove();
  });
});
