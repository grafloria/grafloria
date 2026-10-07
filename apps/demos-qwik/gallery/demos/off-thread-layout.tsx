import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const N = 45;

const nodes = Array.from({ length: N }, (_, i) => ({
  id: `n${i}`, position: { x: (i % 9) * 90, y: Math.floor(i / 9) * 90 },
  size: { width: 40, height: 40 }, label: `${i}`,
}));
const edges = [
  ...Array.from({ length: N - 1 }, (_, k) => {
    const i = k + 1;
    return { id: `e${i}`, source: `n${i - 1}`, target: `n${i}`, type: 'direct' as const };
  }),
  ...Array.from({ length: Math.ceil(N / 5) }, (_, k) => {
    const i = k * 5;
    return { id: `x${i}`, source: `n${i}`, target: `n${(i + 12) % N}`, type: 'direct' as const };
  }),
];

// Module level on purpose: Vite rewrites `new Worker(new URL(…, import.meta.url))`
// into its own worker chunk, and keeping the expression in THIS module (rather
// than inside a $() segment the optimizer moves) keeps the URL relative to it.
const spawnLayoutWorker = () =>
  new Worker(new URL('./off-thread-layout.worker.ts', import.meta.url), { type: 'module' });

/** Force layout in a REAL module Worker via engine.setLayoutPort(): the 45-node
 *  graph is arranged off the main thread, which keeps ticking the whole time. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$(async (instance: DiagramInstance) => {
      const engine = instance.getEngine() as any;
      try {
        // Vite serves the worker from its SOURCE filename, next to this demo.
        const worker = spawnLayoutWorker();
        engine.setLayoutPort(worker);
        await engine.layout('force', { seed: 0x5eed, iterations: 200, threshold: 0 });
      } catch { /* main-thread layout still paints */ }
      markReady();
    })} />
  </div>
));
