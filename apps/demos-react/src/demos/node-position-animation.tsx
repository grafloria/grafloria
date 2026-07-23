import { useRef, useState } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const IDS = Array.from({ length: 8 }, (_, i) => `n${i}`);
const SIZE = { width: 96, height: 40 };
const HX = SIZE.width / 2, HY = SIZE.height / 2;
const CX = 600, CY = 285;

// Three target layouts as {id: {x,y}} of the node's top-left.
function circleLayout() { const o: any = {}; IDS.forEach((id, i) => { const a = (i / IDS.length) * 2 * Math.PI - Math.PI / 2; o[id] = { x: CX + 250 * Math.cos(a) - HX, y: CY + 205 * Math.sin(a) - HY }; }); return o; }
function gridLayout()   { const o: any = {}; IDS.forEach((id, i) => { const c = i % 4, r = (i / 4) | 0; o[id] = { x: (315 + c * 190) - HX, y: (160 + r * 250) - HY }; }); return o; }
function rowLayout()    { const o: any = {}; IDS.forEach((id, i) => { o[id] = { x: (90 + i * 145) - HX, y: CY - HY }; }); return o; }

const LAYOUTS: any = { grid: gridLayout(), circle: circleLayout(), row: rowLayout() };
const ORDER = ['grid', 'circle', 'row'];
const EDGES = IDS.map((id, i) => ({ id: `e${i}`, source: id, target: IDS[(i + 1) % IDS.length] })); // a ring
const NODES = IDS.map((id) => ({ id, position: { ...LAYOUTS.grid[id] }, size: SIZE, label: id.toUpperCase() }));

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Eight nodes tween between layouts — grid · ring · row — by writing
 *  node.position every frame on an ease-out curve (pure userland). */
export default function NodePositionAnimationDemo() {
  const instanceRef = useRef<DiagramInstance | null>(null);
  const busy = useRef(false);
  const [current, setCurrent] = useState('grid');

  const onInit = (instance: DiagramInstance) => {
    instanceRef.current = instance;
    markReady();
  };

  const tweenTo = (targets: any, duration = 900) => new Promise<void>((resolve) => {
    const instance = instanceRef.current;
    if (!instance) return resolve();
    const model = instance.getModel() as any;
    const starts: any = {};
    for (const id of Object.keys(targets)) { const p = model.getNode(id).position; starts[id] = { x: p.x, y: p.y }; }
    const t0 = performance.now();
    const frame = (now: number) => {
      const raw = Math.min(1, (now - t0) / duration);
      const k = easeOutCubic(raw);
      instance.batchUpdate((m: any) => {
        for (const id of Object.keys(targets)) {
          const s = starts[id], t = targets[id];
          m.getNode(id).setPosition(s.x + (t.x - s.x) * k, s.y + (t.y - s.y) * k);
        }
      });
      instance.renderNow();
      if (raw < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });

  const shuffle = async () => {
    if (busy.current) return;
    busy.current = true;
    const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
    setCurrent(next);
    await tweenTo(LAYOUTS[next]);
    busy.current = false;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '10px 24px',
        borderBottom: '1px solid rgba(127,127,127,.25)', font: '12px system-ui, sans-serif' }}>
        <button type="button" onClick={shuffle}
          style={{ font: '12px system-ui, sans-serif', padding: '4px 12px', border: '1px solid rgba(127,127,127,.5)', borderRadius: 6, background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
          ▶ shuffle layout
        </button>
        <span style={{ opacity: 0.7 }}>layout: {current}</span>
      </div>
      <div style={{ flex: 1 }}>
        <GrafloriaFlow defaultNodes={NODES} defaultEdges={EDGES} onInit={onInit} />
      </div>
    </div>
  );
}
