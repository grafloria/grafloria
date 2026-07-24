import { useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { Replica } from '@grafloria/element';
import { markReady } from '../ready';

const nodes: any[] = ['ingest', 'clean', 'model', 'serve'].map((id, i) => ({
  id, position: { x: 80 + i * 200, y: 160 }, size: { width: 140, height: 56 }, label: id,
}));
const edges: any[] = [
  { id: 'e1', source: 'ingest', target: 'clean' },
  { id: 'e2', source: 'clean', target: 'model' },
];
const STEP = 16;

/** Everything by keyboard: Tab moves a focus ring, arrows nudge (⌘Z undoes to
 *  the exact pixel), C+Tab+Enter connects, and a live-region outline mirror
 *  narrates the whole graph to a screen reader. Built on the public model. */
export default function KeyboardA11yDemo() {
  const kbdRef = useRef<HTMLDivElement | null>(null);
  const outlineRef = useRef<HTMLUListElement | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);

  const onInit = (instance: DiagramInstance) => {
    const api = instance as any;
    const model = api.getModel();
    const replica = new Replica(model, { actor: 'kbd', onLocalOp: () => {} });
    const kbd = kbdRef.current!;
    const outline = outlineRef.current!;
    const order = () => model.getNodes().map((n: any) => n.id).sort();
    const state = { focusIndex: 0, connectFrom: null as string | null };
    const focusedId = () => order()[state.focusIndex];

    const paintFocus = () => {
      const id = focusedId();
      kbd.setAttribute('aria-activedescendant', `node-${id}`);
      for (const n of model.getNodes()) n.setSelected(n.id === id);
      api.renderNow();
    };
    const syncOutline = () => {
      outline.innerHTML = model.getNodes().map((n: any) => {
        const outs = model.getLinks().filter((l: any) => l.sourceNodeId === n.id).map((l: any) => l.targetNodeId);
        const label = n.getMetadata('label') ?? n.id;
        return `<li id="node-${n.id}" role="listitem">${label} at ${Math.round(n.position.x)},${Math.round(n.position.y)}${outs.length ? ' → connects to ' + outs.join(', ') : ''}</li>`;
      }).join('');
    };
    const report = (m: string) => {
      if (readoutRef.current) readoutRef.current.textContent = `focused: ${focusedId()}${state.connectFrom ? `  connecting from ${state.connectFrom}` : ''}\n${m}`;
    };

    const handleKey = (key: string, shift = false, meta = false) => {
      const ids = order();
      if (key === 'Tab') { state.focusIndex = (state.focusIndex + (shift ? -1 : 1) + ids.length) % ids.length; paintFocus(); report('Tab moved focus'); return; }
      if (key === 'z' && meta) { replica.undo(); api.renderNow(); syncOutline(); report('⌘Z undo'); return; }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
        const n = model.getNode(focusedId());
        const dx = key === 'ArrowLeft' ? -STEP : key === 'ArrowRight' ? STEP : 0;
        const dy = key === 'ArrowUp' ? -STEP : key === 'ArrowDown' ? STEP : 0;
        n.setPosition(n.position.x + dx, n.position.y + dy);
        api.renderNow(); syncOutline(); report(`nudged ${key.replace('Arrow', '').toLowerCase()}`);
        return;
      }
      if (key === 'c') { state.connectFrom = focusedId(); report('connect mode: Tab to a target, Enter to link'); return; }
      if (key === 'Enter' && state.connectFrom) {
        const target = focusedId();
        if (target !== state.connectFrom) {
          const s = model.getNode(state.connectFrom).getPortBySide('right');
          const t = model.getNode(target).getPortBySide('left');
          const csm = instance.getEngine().getConnectionStateManager();
          csm.startConnection(s, { x: 0, y: 0 });
          csm.completeConnection(t);
        }
        state.connectFrom = null;
        api.renderNow(); syncOutline(); report('linked by keyboard');
        return;
      }
    };
    kbd.addEventListener('keydown', (e) => {
      const handledKeys = ['Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'c', 'z'];
      if (handledKeys.includes(e.key)) { e.preventDefault(); handleKey(e.key, e.shiftKey, e.metaKey || e.ctrlKey); }
    });
    api.on('connect', () => syncOutline());
    api.on('edges:change', () => syncOutline());
    api.on('nodes:change', () => syncOutline());

    paintFocus();
    syncOutline();
    report('ready — keyboard only');
    markReady();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div ref={readoutRef} style={{ padding: '8px 24px', font: '12px/1.5 ui-monospace, monospace', opacity: 0.85,
        borderBottom: '1px solid rgba(127,127,127,.25)', whiteSpace: 'pre' }} />
      <div style={{ position: 'relative', flex: 1 }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} style={{ height: '100%' }} />
        <div ref={kbdRef} tabIndex={0} role="application"
          aria-label="Diagram editor. Tab to move between nodes, arrow keys to nudge, C then a node to connect."
          aria-activedescendant=""
          style={{ position: 'absolute', inset: 0, outline: 'none' }} />
        <ul ref={outlineRef} role="list" aria-live="polite" aria-label="Diagram outline"
          style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }} />
        <div style={{ position: 'absolute', left: 12, bottom: 10, font: '12px system-ui', opacity: 0.6 }}>
          Tab / ⇧Tab · arrows nudge · ⌘Z undo · C+Tab+Enter connect
        </div>
      </div>
    </div>
  );
}
