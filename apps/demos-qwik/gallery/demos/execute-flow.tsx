import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

/* eslint-disable @typescript-eslint/no-explicit-any */
const SPEC_NODES = [
  { id: 'trigger',   position: { x: 60,  y: 180 }, size: { width: 130, height: 54 }, label: 'Trigger' },
  { id: 'fetch',     position: { x: 260, y: 180 }, size: { width: 130, height: 54 }, label: 'Fetch data' },
  { id: 'transform', position: { x: 460, y: 180 }, size: { width: 130, height: 54 }, label: 'Transform' },
  { id: 'validate',  position: { x: 660, y: 100 }, size: { width: 130, height: 54 }, label: 'Validate' },
  { id: 'enrich',    position: { x: 660, y: 260 }, size: { width: 130, height: 54 }, label: 'Enrich' },
  { id: 'save',      position: { x: 860, y: 180 }, size: { width: 130, height: 54 }, label: 'Save' },
  { id: 'notify',    position: { x: 1060, y: 180 }, size: { width: 130, height: 54 }, label: 'Notify' },
];
const SPEC_EDGES = [
  { id: 'e1', source: 'trigger',   target: 'fetch' },
  { id: 'e2', source: 'fetch',     target: 'transform' },
  { id: 'e3', source: 'transform', target: 'validate' },
  { id: 'e4', source: 'transform', target: 'enrich' },
  { id: 'e5', source: 'validate',  target: 'save' },
  { id: 'e6', source: 'enrich',    target: 'save' },
  { id: 'e7', source: 'save',      target: 'notify' },
];
const ORDER = ['trigger', 'fetch', 'transform', 'validate', 'enrich', 'save', 'notify'];

interface RunOptions { failAt?: string | null; warnAt?: string | null; stepMs?: number }
/** The run controller built in onInit$ — not data, so it lives behind noSerialize. */
interface Runner {
  reset(): void;
  execute(opts?: RunOptions): Promise<void>;
  step(): void;
  applyWire(): void;
  applyPulse(): void;
  applyRm(): void;
}

const btn = { padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };
const barSel = { font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid rgba(127,127,127,.4)', borderRadius: '5px', padding: '2px 4px' };
const barLabel = { display: 'inline-flex', gap: '5px', alignItems: 'center', font: '12px/1.6 inherit', opacity: '0.9' };

/** n8n-style flow execution over the shipped status machinery: nodes pulse while
 *  running, the active wire animates, a failure halts and a warning does not. The
 *  page only calls setState({ status }) per node and link.updateStyle({ animation }). */
export default component$(() => {
  const runner = useSignal<NoSerialize<Runner>>();
  const readout = useSignal('idle');
  const wireType = useSignal('marching-ants');
  const speed = useSignal('fast');
  const direction = useSignal('forward');
  const pulse = useSignal(true);
  const reducedMotion = useSignal(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: '8px', padding: '8px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={btn} onClick$={() => runner.value?.execute()}>▶ execute flow</button>
        <button style={btn} onClick$={() => runner.value?.execute({ failAt: 'transform' })}>execute with a failure</button>
        <button style={btn} onClick$={() => runner.value?.execute({ warnAt: 'enrich' })}>execute with a warning</button>
        <button style={btn} onClick$={() => runner.value?.step()}>step ▸</button>
        <button style={btn} onClick$={() => runner.value?.reset()}>reset</button>
        <span style={{ marginLeft: 'auto', font: '12px/1.4 ui-monospace, monospace', opacity: '0.8' }}>{readout.value}</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', padding: '6px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={barLabel}>wire
          <select style={barSel} onChange$={(_, el) => { wireType.value = el.value; runner.value?.applyWire(); }}>
            <option value="marching-ants" selected={wireType.value === 'marching-ants'}>marching ants</option>
            <option value="flow" selected={wireType.value === 'flow'}>flow</option>
            <option value="pulse" selected={wireType.value === 'pulse'}>pulse</option>
            <option value="dash-flow" selected={wireType.value === 'dash-flow'}>dash flow</option>
          </select>
        </label>
        <label style={barLabel}>speed
          <select style={barSel} onChange$={(_, el) => { speed.value = el.value; runner.value?.applyWire(); }}>
            <option value="slow" selected={speed.value === 'slow'}>slow</option>
            <option value="normal" selected={speed.value === 'normal'}>normal</option>
            <option value="fast" selected={speed.value === 'fast'}>fast</option>
          </select>
        </label>
        <label style={barLabel}>direction
          <select style={barSel} onChange$={(_, el) => { direction.value = el.value; runner.value?.applyWire(); }}>
            <option value="forward" selected={direction.value === 'forward'}>forward</option>
            <option value="reverse" selected={direction.value === 'reverse'}>reverse</option>
          </select>
        </label>
        <label style={barLabel}>
          <input type="checkbox" checked={pulse.value} onChange$={(_, el) => { pulse.value = el.checked; runner.value?.applyPulse(); }} /> pulse the running node
        </label>
        <label style={barLabel}>
          <input type="checkbox" checked={reducedMotion.value} onChange$={(_, el) => { reducedMotion.value = el.checked; runner.value?.applyRm(); }} /> reduced motion (statics only)
        </label>
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={SPEC_NODES} defaultEdges={SPEC_EDGES} onInit$={$((instance: DiagramInstance) => {
          const api = instance as any;
          const model = api.getModel();
          api.animations.updateConfig({ respectBatteryStatus: false, batterySavingMode: false });
          api.fitView(40);

          const activeEdges = new Set<string>();
          let runToken = 0;
          let stepIndex = -1;
          const setReadout = (m: string) => { readout.value = m; };
          const wireAnim = () => ({ type: wireType.value, speed: speed.value, direction: direction.value });
          const setStatus = (id: string, status: string) => {
            const n = model.getNode(id);
            if (n) n.setState({ status, animateStatus: pulse.value });
          };
          const setEdgeActive = (id: string, active: boolean) => {
            const l = model.getLink(id);
            if (!l) { activeEdges.delete(id); return; }
            if (active) { activeEdges.add(id); l.updateStyle({ animation: wireAnim() }); }
            else { activeEdges.delete(id); l.updateStyle({ animation: { type: 'none' } }); }
          };
          const aliveOrder = () => ORDER.filter((id) => model.getNode(id));
          const beginNode = (id: string) => { for (const e of SPEC_EDGES) if (e.target === id) setEdgeActive(e.id, true); setStatus(id, 'running'); };
          const endNode = (id: string, status: string) => { for (const e of SPEC_EDGES) if (e.target === id) setEdgeActive(e.id, false); setStatus(id, status); };

          const reset = () => {
            runToken += 1;
            stepIndex = -1;
            for (const id of ORDER) setStatus(id, 'idle');
            for (const e of SPEC_EDGES) setEdgeActive(e.id, false);
            api.renderNow();
            setReadout('idle');
          };
          const execute = async ({ failAt = null, warnAt = null, stepMs = 550 }: RunOptions = {}) => {
            reset();
            const token = runToken;
            const walk = aliveOrder();
            for (const id of walk) setStatus(id, 'pending');
            api.renderNow();
            let warned: string | null = null;
            for (const id of walk) {
              beginNode(id);
              setReadout(`running: ${id}`);
              api.renderNow();
              await new Promise((r) => setTimeout(r, stepMs));
              if (token !== runToken) return;
              if (failAt === id) { endNode(id, 'error'); setReadout(`failed at: ${id} — downstream never ran`); api.renderNow(); return; }
              if (warnAt === id) { warned = id; endNode(id, 'warning'); setReadout(`warning at: ${id} — flow continues`); }
              else endNode(id, 'completed');
              api.renderNow();
            }
            setReadout(warned ? `flow completed with a warning at ${warned} ⚠` : 'flow completed ✓');
          };
          const step = () => {
            const walk = aliveOrder();
            if (!walk.length) return;
            if (stepIndex < 0) {
              reset();
              for (const id of walk) setStatus(id, 'pending');
              stepIndex = 0; beginNode(walk[0]!);
              setReadout(`step 1/${walk.length}: running ${walk[0]}`);
            } else {
              endNode(walk[Math.min(stepIndex, walk.length - 1)]!, 'completed');
              stepIndex += 1;
              if (stepIndex < walk.length) { beginNode(walk[stepIndex]!); setReadout(`step ${stepIndex + 1}/${walk.length}: running ${walk[stepIndex]}`); }
              else { stepIndex = -1; setReadout('flow completed ✓'); }
            }
            api.renderNow();
          };
          const applyWire = () => { for (const id of activeEdges) model.getLink(id)?.updateStyle({ animation: wireAnim() }); if (activeEdges.size) api.renderNow(); };
          const applyPulse = () => {
            for (const id of aliveOrder()) { const n = model.getNode(id); if (n.state.status && n.state.status !== 'idle') n.setState({ animateStatus: pulse.value }); }
            api.renderNow();
          };
          const applyRm = () => api.animations.updateConfig({ reducedMotion: reducedMotion.value });

          runner.value = noSerialize({ reset, execute, step, applyWire, applyPulse, applyRm });
          markReady();
        })} />
      </div>
    </div>
  );
});
