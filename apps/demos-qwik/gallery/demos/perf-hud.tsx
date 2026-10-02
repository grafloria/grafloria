import { component$, $, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { QualityGovernor, PerfHud, EMPTY_SNAPSHOT } from '@grafloria/element';
import { markReady } from '../ready';

/** Perf HUD & quality governor: an adaptive governor that steps the render tier
 *  DOWN under load and restores it when the budget recovers, and a HUD that
 *  reports it — fed live scene numbers off the mounted canvas. */
const nodes = Array.from({ length: 24 }, (_, i) => ({
  id: 'n' + i, label: 'N' + i,
  position: { x: 40 + (i % 6) * 150, y: 40 + Math.floor(i / 6) * 110 },
  size: { width: 120, height: 60 },
}));
const edges = Array.from({ length: 20 }, (_, i) => ({ id: 'e' + i, source: 'n' + i, target: 'n' + (i + 1) }));

export default component$(() => {
  const hudRef = useSignal<HTMLDivElement>();
  return (
    <div>
      <div style={{ fontSize: '12px', opacity: '.8', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        An adaptive quality governor and a HUD that reports it — measured live off the mounted scene.
      </div>
      <div style={{ height: 'calc(100vh - 45px)', position: 'relative' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} style={{ display: 'block', height: '100%' }}
          onInit$={$((instance: DiagramInstance) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const model = instance.getModel() as any;
            const gov = new QualityGovernor();
            const hud = new PerfHud(hudRef.value!);
            hud.show();
            if (model) {
              const hostEl = hudRef.value!.parentElement as HTMLElement;
              hud.update({
                ...EMPTY_SNAPSHOT,
                nodes: model.getNodes().length,
                visibleNodes: hostEl.querySelectorAll('[data-node-id]').length,
                links: model.getLinks().length,
                visibleLinks: hostEl.querySelectorAll('[data-link-id]').length,
                tier: 'high',
                governor: gov.getState(),
              } as never);
            }
            markReady();
          })} />
        <div ref={hudRef} style={{ position: 'absolute', top: '12px', right: '12px', width: '280px', zIndex: '5' }} />
      </div>
    </div>
  );
});
