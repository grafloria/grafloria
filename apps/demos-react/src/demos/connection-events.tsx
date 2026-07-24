import { useEffect, useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes: any[] = [
  { id: 'src', position: { x: 80,  y: 70 }, size: { width: 150, height: 60 }, label: 'source',
    ports: [{ id: 'src.out', side: 'right', type: 'output' }] },
  { id: 'dst', position: { x: 430, y: 70 }, size: { width: 150, height: 60 }, label: 'target',
    ports: [{ id: 'dst.in', side: 'left', type: 'input' }] },
];
const edges: any[] = [];

const EVENTS: [string, (p: any) => string][] = [
  ['connection:start',      (p) => p?.sourcePort?.id ?? '?'],
  ['connection:update',     (p) => `${p?.targetPort?.id ?? '(none)'} ${p?.isValid ? 'ok' : 'no'}`],
  ['connection:port-enter', (p) => `${p?.port?.id ?? '?'} ${p?.isValid ? 'ok' : '✗ ' + (p?.rejectionReason ?? '')}`],
  ['connection:port-leave', (p) => p?.port?.id ?? '?'],
  ['connection:complete',   (p) => `${p?.sourcePortId ?? '?'} → ${p?.targetPortId ?? '?'}`],
  ['connection:cancel',     (p) => `${p?.sourcePort?.id ?? '?'} (abandoned / refused)`],
];

/** A live log of the connection lifecycle the engine fires as you drag a wire —
 *  start, per-move update, port enter/leave, then complete or cancel. */
export default function ConnectionEventsDemo() {
  const logRef = useRef<HTMLDivElement | null>(null);
  const disposers = useRef<Array<() => void>>([]);
  useEffect(() => () => disposers.current.forEach((d) => d?.()), []);

  const onInit = (instance: DiagramInstance) => {
    const engine = instance.getEngine() as any;
    const summaryOf = new Map(EVENTS);
    const logEl = logRef.current!;

    const logRow = (name: string, payload: any) => {
      const empty = logEl.querySelector('.empty');
      if (empty) empty.remove();
      const row = document.createElement('div');
      row.className = 'row';
      const summary = (summaryOf.get(name) || (() => ''))(payload);
      const ev = document.createElement('span');
      ev.textContent = name;
      ev.style.cssText = 'display:inline-block;min-width:168px;font-weight:600';
      const det = document.createElement('span');
      det.textContent = summary;
      row.appendChild(ev); row.appendChild(det);
      logEl.prepend(row);
      while (logEl.querySelectorAll('.row').length > 12) logEl.querySelector('.row:last-child')!.remove();
    };

    disposers.current = EVENTS.map(([name]) => engine.eventBus.on(name, (payload: any) => logRow(name, payload)));
    markReady();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '8px 24px 10px', borderBottom: '1px solid rgba(127,127,127,.25)', font: '12px/1.4 ui-monospace, monospace' }}>
        <div ref={logRef} style={{ height: 88, overflowY: 'auto', whiteSpace: 'pre', opacity: 0.9 }}>
          <span className="empty" style={{ opacity: 0.5 }}>drag from the source&apos;s right port to see the connection lifecycle fire…</span>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
      </div>
    </div>
  );
}
