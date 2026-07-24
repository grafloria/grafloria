import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
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

/** Force layout in a REAL module Worker via engine.setLayoutPort(): the 45-node
 *  graph is arranged off the main thread, which keeps ticking the whole time. */
export default function OffThreadLayoutDemo() {
  const onInit = (instance: DiagramInstance) => {
    const engine = instance.getEngine() as any;
    (async () => {
      try {
        // esbuild does not bundle `new URL(..., import.meta.url)` under a
        // single-file build, so the worker is emitted as its own ESM entry by
        // build.mjs and loaded here by its BUILT filename.
        const worker = new Worker(new URL('./off-thread-layout.worker.js', import.meta.url), { type: 'module' });
        engine.setLayoutPort(worker);
        await engine.layout('force', { seed: 0x5eed, iterations: 200, threshold: 0 });
      } catch { /* main-thread layout still paints */ }
      markReady();
    })();
  };
  return (
    <div style={{ height: '100vh' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
