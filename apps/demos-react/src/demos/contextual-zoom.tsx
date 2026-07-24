import { useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes: any[] = Array.from({ length: 12 }, (_, i) => ({
  id: `n${i}`, position: { x: (i % 4) * 200, y: Math.floor(i / 4) * 140 },
  size: { width: 150, height: 70 }, label: `Node ${i}`,
}));
const edges: any[] = Array.from({ length: 11 }, (_, i) => ({ id: `e${i}`, source: `n${i}`, target: `n${i + 1}`, type: 'direct' }));

/** Level-of-detail: the tier the renderer draws is a pure function of zoom.
 *  high → medium → sketch → low, both in getQualityState().tier and in the
 *  amount of text that reaches the DOM. */
export default function ContextualZoomDemo() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const apiRef = useRef<any>(null);

  const onInit = (instance: DiagramInstance) => {
    const api = instance as any;
    apiRef.current = api;
    api.fitView(40);
    tierAt(1.5);
    markReady();
  };

  const labelCount = () => wrapRef.current?.querySelectorAll('svg text').length ?? 0;
  const tierAt = (z: number) => {
    const api = apiRef.current;
    if (!api) return;
    api.viewport.setZoom(z);
    api.renderNow();
    const tier = api.getQualityState().tier;
    if (readoutRef.current) readoutRef.current.textContent = `zoom ${z}×  →  tier "${tier}"  (${labelCount()} text nodes)`;
  };

  const btn = { padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)',
    background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };

  return (
    <div ref={wrapRef} style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', alignItems: 'center' }}>
        <span>zoom:</span>
        <button style={btn} onClick={() => tierAt(1.5)}>1.5× high</button>
        <button style={btn} onClick={() => tierAt(0.7)}>0.7× medium</button>
        <button style={btn} onClick={() => tierAt(0.3)}>0.3× sketch</button>
        <button style={btn} onClick={() => tierAt(0.15)}>0.15× low</button>
        <span ref={readoutRef} style={{ marginLeft: 'auto', font: '12px/1.4 ui-monospace, monospace', opacity: 0.85 }} />
      </div>
      <div style={{ flex: 1 }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} rendererConfig={{ qualityGovernor: false }} onInit={onInit} />
      </div>
    </div>
  );
}
