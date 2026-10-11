/**
 * S8 (docs review v4): a UML association lost its label when a multiplicity was
 * set.
 *
 * The kit draws multiplicities as END chips (`slot: 'start' | 'end'` entries in
 * `link.labels`); the relationship's name is the link's display label
 * (`metadata.label`). The renderer drew the display label only when `labels`
 * was EMPTY, so the first chip hid the name. End chips do not replace the
 * middle label: the display label is drawn unless a label already occupies the
 * line itself (a placed label — which is how `labelPlacement` edges carry it).
 */
import { createDiagram } from '../instance/create-diagram';
import type { DiagramInstance } from '../instance/create-diagram';

const made: Array<{ container: HTMLElement; instance: DiagramInstance }> = [];
function mount(edge: Record<string, unknown>): { container: HTMLElement; instance: DiagramInstance } {
  const container = document.createElement('div');
  container.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(container);
  const instance = createDiagram(container, {
    nodes: [
      { id: 'a', label: 'A', position: { x: 0, y: 0 } },
      { id: 'b', label: 'B', position: { x: 400, y: 0 } },
    ],
    edges: [{ id: 'ab', source: 'a', target: 'b', ...edge } as never],
  });
  made.push({ container, instance });
  return { container, instance };
}
afterEach(() => {
  for (const { instance, container } of made.splice(0)) {
    instance.dispose();
    container.remove();
  }
});

const texts = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('g[data-link-id="ab"] text, g[data-link-id="ab"] foreignObject')).map((t) => (t.textContent ?? '').trim()).filter(Boolean);

const chip = (text: string, slot: 'start' | 'end') => ({ id: `chip-${slot}`, text, slot, position: 0.5, offset: { x: 0, y: -7 } });

describe('S8: the display label survives end chips', () => {
  it('a named link with two multiplicity chips draws the name AND both chips', () => {
    const { container, instance } = mount({ label: 'with multiplicity' });
    const link = instance.getModel().getLink('ab')!;
    link.addLabel(chip('0..*', 'start') as never);
    link.addLabel(chip('1..*', 'end') as never);
    instance.renderNow();
    const drawn = texts(container);
    expect(drawn).toContain('0..*');
    expect(drawn).toContain('1..*');
    expect(drawn).toContain('with multiplicity');
  });

  it('a placed label (labelPlacement) is still drawn once, not twice', () => {
    const { container, instance } = mount({ label: 'placed', labelPlacement: 'on' });
    instance.renderNow();
    expect(texts(container).filter((t) => t === 'placed')).toHaveLength(1);
  });

  it('a middle label added beside the name still wins (no duplicate name)', () => {
    const { container, instance } = mount({ label: 'name' });
    instance.getModel().getLink('ab')!.addLabel({ id: 'mid', text: 'override', position: 0.5, offset: { x: 0, y: 0 } } as never);
    instance.renderNow();
    const drawn = texts(container);
    expect(drawn).toContain('override');
    expect(drawn).not.toContain('name');
  });
});
