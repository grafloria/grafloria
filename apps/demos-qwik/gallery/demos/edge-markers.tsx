import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { registerMarker } from '@grafloria/element';
import { markReady } from '../ready';

const BUILTINS = ['arrow', 'open-arrow', 'circle', 'square', 'diamond', 'crow-foot', 'hollow-diamond', 'one-or-many'];

// A custom marker — a raw feather glyph. registerMarker is the open seam; the
// catalogue is not a closed enum. Registered from onInit$, not at module top
// level (a Qwik module should carry no top-level side effects).
const FEATHER_DEF = {
  tipOffset: (style: { size: number }) => style.size,
  render: (mctx: { size: number; color: string; transform: unknown }) => ({
    type: 'path',
    props: {
      d: `M0,0 L${mctx.size},0 M${mctx.size * 0.4},-4 L${mctx.size},0 L${mctx.size * 0.4},4`,
      stroke: mctx.color, fill: 'none', 'stroke-width': 1.5,
      transform: mctx.transform, className: 'arrow arrow-feather',
    },
  }),
};

const HEADS = [...BUILTINS, 'feather', 'none'];

const nodes = HEADS.flatMap((type, i) => [
  { id: 'a' + i, position: { x: 120, y: 40 + i * 62 }, size: { width: 120, height: 44 }, label: type },
  { id: 'b' + i, position: { x: 620, y: 40 + i * 62 }, size: { width: 120, height: 44 }, label: '' },
]);
const edges = HEADS.map((type, i) => ({
  id: 'e' + i, source: 'a' + i, target: 'b' + i,
  style: { arrowHead: { type, size: 14, filled: false } },
}));

/** Eight built-in arrowheads, one author-defined marker via registerMarker()
 *  and an explicit none, one row each — the ERD heads (crow-foot, one-or-many)
 *  are first-class citizens. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges as never} onInit$={$((instance: DiagramInstance) => {
      registerMarker('feather', FEATHER_DEF as never);
      instance.renderNow();
      markReady();
    })} />
  </div>
));
