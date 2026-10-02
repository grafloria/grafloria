import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const IDS = Array.from({ length: 8 }, (_, i) => `n${i}`);
const SIZE = { width: 96, height: 40 };
const HX = SIZE.width / 2, HY = SIZE.height / 2;
const CX = 600, CY = 285;

type Layout = Record<string, { x: number; y: number }>;

// Three target layouts as {id: {x,y}} of the node's top-left.
function circleLayout() { const o: Layout = {}; IDS.forEach((id, i) => { const a = (i / IDS.length) * 2 * Math.PI - Math.PI / 2; o[id] = { x: CX + 250 * Math.cos(a) - HX, y: CY + 205 * Math.sin(a) - HY }; }); return o; }
function gridLayout()   { const o: Layout = {}; IDS.forEach((id, i) => { const c = i % 4, r = (i / 4) | 0; o[id] = { x: (315 + c * 190) - HX, y: (160 + r * 250) - HY }; }); return o; }
function rowLayout()    { const o: Layout = {}; IDS.forEach((id, i) => { o[id] = { x: (90 + i * 145) - HX, y: CY - HY }; }); return o; }

const LAYOUTS: Record<string, Layout> = { grid: gridLayout(), circle: circleLayout(), row: rowLayout() };
const ORDER = ['grid', 'circle', 'row'];
const EDGES = IDS.map((id, i) => ({ id: `e${i}`, source: id, target: IDS[(i + 1) % IDS.length]! })); // a ring
const NODES = IDS.map((id) => ({ id, position: { ...LAYOUTS.grid![id]! }, size: SIZE, label: id.toUpperCase() }));

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Tween every node to its target on an ease-out curve. Module level so the
 *  onClick$ QRL may call it (a helper inside component$ could not be). */
function tweenTo(instance: DiagramInstance, targets: Layout, duration = 900): Promise<void> {
  return new Promise<void>((resolve) => {
    const model = instance.getModel() as any;
    const starts: Layout = {};
    for (const id of Object.keys(targets)) { const p = model.getNode(id).position; starts[id] = { x: p.x, y: p.y }; }
    const t0 = performance.now();
    const frame = (now: number) => {
      const raw = Math.min(1, (now - t0) / duration);
      const k = easeOutCubic(raw);
      instance.batchUpdate((m: any) => {
        for (const id of Object.keys(targets)) {
          const s = starts[id]!, t = targets[id]!;
          m.getNode(id).setPosition(s.x + (t.x - s.x) * k, s.y + (t.y - s.y) * k);
        }
      });
      instance.renderNow();
      if (raw < 1) requestAnimationFrame(frame); else resolve();
    };
    requestAnimationFrame(frame);
  });
}

/** Eight nodes tween between layouts — grid · ring · row — by writing
 *  node.position every frame on an ease-out curve (pure userland). */
export default component$(() => {
  const instance = useSignal<NoSerialize<DiagramInstance>>();
  const busy = useSignal(false);
  const current = useSignal('grid');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', padding: '10px 24px',
        borderBottom: '1px solid rgba(127,127,127,.25)', font: '12px system-ui, sans-serif' }}>
        <button type="button"
          onClick$={async () => {
            const api = instance.value;
            if (busy.value || !api) return;
            busy.value = true;
            const next = ORDER[(ORDER.indexOf(current.value) + 1) % ORDER.length]!;
            current.value = next;
            await tweenTo(api, LAYOUTS[next]!);
            busy.value = false;
          }}
          style={{ font: '12px system-ui, sans-serif', padding: '4px 12px', border: '1px solid rgba(127,127,127,.5)', borderRadius: '6px', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
          ▶ shuffle layout
        </button>
        <span style={{ opacity: 0.7 }}>layout: {current.value}</span>
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={NODES} defaultEdges={EDGES}
          onInit$={$((api: DiagramInstance) => { instance.value = noSerialize(api); markReady(); })} />
      </div>
    </div>
  );
});
