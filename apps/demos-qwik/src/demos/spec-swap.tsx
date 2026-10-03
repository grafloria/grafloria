import { component$, useSignal, $ } from '@builder.io/qwik';
import { GrafloriaDiagram } from '@grafloria/qwik';

/**
 * `<GrafloriaDiagram>` follows its spec by VALUE: a changed spec replaces the
 * diagram (and fires onReady$ again); an equal spec built again on a re-render
 * — the usual inline `spec={kit({ … })}` — leaves it alone.
 */
const pipeline = (stage: string) => ({
  nodes: [
    { id: 'src', position: { x: 80, y: 120 }, size: { width: 170, height: 64 }, label: 'Source' },
    { id: 'stage', position: { x: 360, y: 120 }, size: { width: 170, height: 64 }, label: stage },
    { id: 'out', position: { x: 640, y: 120 }, size: { width: 170, height: 64 }, label: 'Report' },
  ],
  edges: [
    { id: 'e1', source: 'src', target: 'stage', sourceHandle: 'right', targetHandle: 'left' },
    { id: 'e2', source: 'stage', target: 'out', sourceHandle: 'right', targetHandle: 'left' },
  ],
});

export default component$(() => {
  const stage = useSignal('Clean');
  const renders = useSignal(0);
  const readies = useSignal(0);
  return (
    <>
      <div class="toolbar">
        <button type="button" id="swap-spec" onClick$={() => (stage.value = stage.value === 'Clean' ? 'Enrich' : 'Clean')}>
          Swap the middle step
        </button>
        <button type="button" id="rerender" onClick$={() => renders.value++}>
          Re-render (same spec)
        </button>
        <span class="readout" id="ready-count">ready {readies.value} · renders {renders.value}</span>
      </div>
      <div class="canvas">
        <GrafloriaDiagram
          spec={pipeline(stage.value)}
          onReady$={$(() => { readies.value++; })}
        />
      </div>
    </>
  );
});
