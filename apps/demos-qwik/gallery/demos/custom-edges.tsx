import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { registerLinkTemplate } from '@grafloria/element';
import { markReady } from '../ready';

// registerLinkTemplate() is the seam for an entirely custom edge shape. The
// template is handed the frame's routed polyline and the path string the default
// renderer would draw, and returns whatever SVG it likes — here a two-rail
// "pipe": a wide casing under a thin core. Registered from onInit$ (a Qwik
// module should carry no top-level side effects), then repainted.
const pipe = (ctx: { pathData: string; selected: boolean }) => {
  const d = ctx.pathData;
  const stroke = ctx.selected ? '#2563eb' : '#0ea5e9';
  return [
    { type: 'path', props: { d, className: 'pipe-casing', fill: 'none', stroke, 'stroke-width': 10, 'stroke-opacity': 0.35, 'stroke-linecap': 'round' } },
    { type: 'path', props: { d, className: 'pipe-core', fill: 'none', stroke, 'stroke-width': 2.5 } },
  ];
};

const nodes = [
  { id: 'a', position: { x: 120, y: 120 }, size: { width: 140, height: 64 }, label: 'Source' },
  { id: 'b', position: { x: 680, y: 340 }, size: { width: 140, height: 64 }, label: 'Sink' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b', type: 'smooth' as const, style: { template: 'pipe' } }];

const BTN = { padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)',
  background: 'transparent', color: 'inherit', cursor: 'pointer' };

/** An author-supplied edge template via registerLinkTemplate() — a two-rail
 *  pipe drawn from the routed polyline, replacing the default edge. The bar
 *  swaps it for the default edge and back. */
export default component$(() => {
  const instance = useSignal<NoSerialize<DiagramInstance>>();
  const which = useSignal('pipe');

  const useTemplate = $((name: string) => {
    which.value = name;
    instance.value?.getModel().getLink('e1')?.updateStyle({ template: name || undefined } as never);
    instance.value?.renderNow();
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        <button aria-pressed={which.value === 'pipe' ? 'true' : 'false'} onClick$={() => useTemplate('pipe')}
          style={{ ...BTN, fontWeight: which.value === 'pipe' ? '600' : '400' }}>custom template</button>
        <button aria-pressed={which.value === '' ? 'true' : 'false'} onClick$={() => useTemplate('')}
          style={{ ...BTN, fontWeight: which.value === '' ? '600' : '400' }}>default edge</button>
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((api: DiagramInstance) => {
          registerLinkTemplate('pipe', pipe as never);
          instance.value = noSerialize(api);
          api.renderNow();
          markReady();
        })} />
      </div>
    </div>
  );
});
