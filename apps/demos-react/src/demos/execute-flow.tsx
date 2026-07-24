import { useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const SPEC_NODES: any[] = [
  { id: 'trigger',   position: { x: 60,  y: 180 }, size: { width: 130, height: 54 }, label: 'Trigger' },
  { id: 'fetch',     position: { x: 260, y: 180 }, size: { width: 130, height: 54 }, label: 'Fetch data' },
  { id: 'transform', position: { x: 460, y: 180 }, size: { width: 130, height: 54 }, label: 'Transform' },
  { id: 'validate',  position: { x: 660, y: 100 }, size: { width: 130, height: 54 }, label: 'Validate' },
  { id: 'enrich',    position: { x: 660, y: 260 }, size: { width: 130, height: 54 }, label: 'Enrich' },
  { id: 'save',      position: { x: 860, y: 180 }, size: { width: 130, height: 54 }, label: 'Save' },
  { id: 'notify',    position: { x: 1060, y: 180 }, size: { width: 130, height: 54 }, label: 'Notify' },
];
const SPEC_EDGES: any[] = [
  { id: 'e1', source: 'trigger',   target: 'fetch' },
  { id: 'e2', source: 'fetch',     target: 'transform' },
  { id: 'e3', source: 'transform', target: 'validate' },
  { id: 'e4', source: 'transform', target: 'enrich' },
  { id: 'e5', source: 'validate',  target: 'save' },
  { id: 'e6', source: 'enrich',    target: 'save' },
  { id: 'e7', source: 'save',      target: 'notify' },
];
const ORDER = ['trigger', 'fetch', 'transform', 'validate', 'enrich', 'save', 'notify'];

/** n8n-style flow execution over the shipped status machinery: nodes pulse while
 *  running, the active wire animates, a failure halts and a warning does not. The
 *  page only calls setState({ status }) per node and link.updateStyle({ animation }). */
export default function ExecuteFlowDemo() {
  const readoutRef = useRef<HTMLSpanElement | null>(null);
  const selType = useRef<HTMLSelectElement | null>(null);
  const selSpeed = useRef<HTMLSelectElement | null>(null);
  const selDir = useRef<HTMLSelectElement | null>(null);
  const chkPulse = useRef<HTMLInputElement | null>(null);
  const chkRm = useRef<HTMLInputElement | null>(null);
  const ctx = useRef<any>({ activeEdges: new Set<string>(), runToken: 0, stepIndex: -1 });

  const onInit = (instance: DiagramInstance) => {
    const api = instance as any;
    const model = api.getModel();
    const c = ctx.current;
    c.api = api; c.model = model;
    api.animations.updateConfig({ respectBatteryStatus: false, batterySavingMode: false });
    api.fitView(40);

    const setReadout = (m: string) => { if (readoutRef.current) readoutRef.current.textContent = m; };
    const wireAnim = () => ({ type: selType.current?.value ?? 'marching-ants', speed: selSpeed.current?.value ?? 'fast', direction: selDir.current?.value ?? 'forward' });
    const setStatus = (id: string, status: string) => {
      const n = model.getNode(id);
      if (n) n.setState({ status, animateStatus: chkPulse.current?.checked ?? true });
    };
    const setEdgeActive = (id: string, active: boolean) => {
      const l = model.getLink(id);
      if (!l) { c.activeEdges.delete(id); return; }
      if (active) { c.activeEdges.add(id); l.updateStyle({ animation: wireAnim() }); }
      else { c.activeEdges.delete(id); l.updateStyle({ animation: { type: 'none' } }); }
    };
    const aliveOrder = () => ORDER.filter((id) => model.getNode(id));
    const beginNode = (id: string) => { for (const e of SPEC_EDGES) if (e.target === id) setEdgeActive(e.id, true); setStatus(id, 'running'); };
    const endNode = (id: string, status: string) => { for (const e of SPEC_EDGES) if (e.target === id) setEdgeActive(e.id, false); setStatus(id, status); };

    c.reset = () => {
      c.runToken += 1;
      c.stepIndex = -1;
      for (const id of ORDER) setStatus(id, 'idle');
      for (const e of SPEC_EDGES) setEdgeActive(e.id, false);
      api.renderNow();
      setReadout('idle');
    };
    c.execute = async ({ failAt = null as string | null, warnAt = null as string | null, stepMs = 550 } = {}) => {
      c.reset();
      const token = c.runToken;
      const walk = aliveOrder();
      for (const id of walk) setStatus(id, 'pending');
      api.renderNow();
      let warned: string | null = null;
      for (const id of walk) {
        beginNode(id);
        setReadout(`running: ${id}`);
        api.renderNow();
        await new Promise((r) => setTimeout(r, stepMs));
        if (token !== c.runToken) return;
        if (failAt === id) { endNode(id, 'error'); setReadout(`failed at: ${id} — downstream never ran`); api.renderNow(); return; }
        if (warnAt === id) { warned = id; endNode(id, 'warning'); setReadout(`warning at: ${id} — flow continues`); }
        else endNode(id, 'completed');
        api.renderNow();
      }
      setReadout(warned ? `flow completed with a warning at ${warned} ⚠` : 'flow completed ✓');
    };
    c.step = () => {
      const walk = aliveOrder();
      if (!walk.length) return;
      if (c.stepIndex < 0) {
        c.reset();
        for (const id of walk) setStatus(id, 'pending');
        c.stepIndex = 0; beginNode(walk[0]);
        setReadout(`step 1/${walk.length}: running ${walk[0]}`);
      } else {
        endNode(walk[Math.min(c.stepIndex, walk.length - 1)], 'completed');
        c.stepIndex += 1;
        if (c.stepIndex < walk.length) { beginNode(walk[c.stepIndex]); setReadout(`step ${c.stepIndex + 1}/${walk.length}: running ${walk[c.stepIndex]}`); }
        else { c.stepIndex = -1; setReadout('flow completed ✓'); }
      }
      api.renderNow();
    };
    c.applyWire = () => { for (const id of c.activeEdges) model.getLink(id)?.updateStyle({ animation: wireAnim() }); if (c.activeEdges.size) api.renderNow(); };
    c.applyPulse = () => {
      for (const id of aliveOrder()) { const n = model.getNode(id); if (n.state.status && n.state.status !== 'idle') n.setState({ animateStatus: chkPulse.current?.checked ?? true }); }
      api.renderNow();
    };
    c.applyRm = () => api.animations.updateConfig({ reducedMotion: chkRm.current?.checked ?? false });

    markReady();
  };

  const btn = { padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)', background: 'transparent', color: 'inherit', cursor: 'pointer', font: 'inherit' };
  const barSel = { font: 'inherit', color: 'inherit', background: 'transparent', border: '1px solid rgba(127,127,127,.4)', borderRadius: 5, padding: '2px 4px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 8, padding: '8px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={btn} onClick={() => ctx.current.execute?.()}>▶ execute flow</button>
        <button style={btn} onClick={() => ctx.current.execute?.({ failAt: 'transform' })}>execute with a failure</button>
        <button style={btn} onClick={() => ctx.current.execute?.({ warnAt: 'enrich' })}>execute with a warning</button>
        <button style={btn} onClick={() => ctx.current.step?.()}>step ▸</button>
        <button style={btn} onClick={() => ctx.current.reset?.()}>reset</button>
        <span ref={readoutRef} style={{ marginLeft: 'auto', font: '12px/1.4 ui-monospace, monospace', opacity: 0.8 }}>idle</span>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '6px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', font: '12px/1.6 inherit', opacity: 0.9 }}>wire
          <select ref={selType} defaultValue="marching-ants" style={barSel} onChange={() => ctx.current.applyWire?.()}>
            <option value="marching-ants">marching ants</option>
            <option value="flow">flow</option>
            <option value="pulse">pulse</option>
            <option value="dash-flow">dash flow</option>
          </select>
        </label>
        <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', font: '12px/1.6 inherit', opacity: 0.9 }}>speed
          <select ref={selSpeed} defaultValue="fast" style={barSel} onChange={() => ctx.current.applyWire?.()}>
            <option value="slow">slow</option>
            <option value="normal">normal</option>
            <option value="fast">fast</option>
          </select>
        </label>
        <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', font: '12px/1.6 inherit', opacity: 0.9 }}>direction
          <select ref={selDir} defaultValue="forward" style={barSel} onChange={() => ctx.current.applyWire?.()}>
            <option value="forward">forward</option>
            <option value="reverse">reverse</option>
          </select>
        </label>
        <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', font: '12px/1.6 inherit', opacity: 0.9 }}>
          <input ref={chkPulse} type="checkbox" defaultChecked onChange={() => ctx.current.applyPulse?.()} /> pulse the running node
        </label>
        <label style={{ display: 'inline-flex', gap: 5, alignItems: 'center', font: '12px/1.6 inherit', opacity: 0.9 }}>
          <input ref={chkRm} type="checkbox" onChange={() => ctx.current.applyRm?.()} /> reduced motion (statics only)
        </label>
      </div>
      <div style={{ flex: 1 }}>
        <GrafloriaFlow defaultNodes={SPEC_NODES} defaultEdges={SPEC_EDGES} onInit={onInit} />
      </div>
    </div>
  );
}
