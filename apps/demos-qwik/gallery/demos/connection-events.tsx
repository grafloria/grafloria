import { component$, $, noSerialize, useSignal, useVisibleTask$, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

/* eslint-disable @typescript-eslint/no-explicit-any */
const nodes = [
  { id: 'src', position: { x: 80,  y: 70 }, size: { width: 150, height: 60 }, label: 'source',
    ports: [{ id: 'src.out', side: 'right', type: 'output' }] },
  { id: 'dst', position: { x: 430, y: 70 }, size: { width: 150, height: 60 }, label: 'target',
    ports: [{ id: 'dst.in', side: 'left', type: 'input' }] },
] as never[];

const EVENTS: [string, (p: any) => string][] = [
  ['connection:start',      (p) => p?.sourcePort?.id ?? '?'],
  ['connection:update',     (p) => `${p?.targetPort?.id ?? '(none)'} ${p?.isValid ? 'ok' : 'no'}`],
  ['connection:port-enter', (p) => `${p?.port?.id ?? '?'} ${p?.isValid ? 'ok' : '✗ ' + (p?.rejectionReason ?? '')}`],
  ['connection:port-leave', (p) => p?.port?.id ?? '?'],
  ['connection:complete',   (p) => `${p?.sourcePortId ?? '?'} → ${p?.targetPortId ?? '?'}`],
  ['connection:cancel',     (p) => `${p?.sourcePort?.id ?? '?'} (abandoned / refused)`],
];

interface Row { key: number; name: string; summary: string }

/** A live log of the connection lifecycle the engine fires as you drag a wire —
 *  start, per-move update, port enter/leave, then complete or cancel. */
export default component$(() => {
  const rows = useSignal<Row[]>([]);
  const disposers = useSignal<NoSerialize<Array<() => void>>>();

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    cleanup(() => disposers.value?.forEach((d) => d?.()));
  }, { strategy: 'document-ready' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '8px 24px 10px', borderBottom: '1px solid rgba(127,127,127,.25)', font: '12px/1.4 ui-monospace, monospace' }}>
        <div style={{ height: '88px', overflowY: 'auto', whiteSpace: 'pre', opacity: '0.9' }}>
          {rows.value.length === 0
            ? <span class="empty" style={{ opacity: '0.5' }}>drag from the source&apos;s right port to see the connection lifecycle fire…</span>
            : rows.value.map((r) => (
              <div class="row" key={r.key}>
                <span style={{ display: 'inline-block', minWidth: '168px', fontWeight: '600' }}>{r.name}</span>
                <span>{r.summary}</span>
              </div>
            ))}
        </div>
      </div>
      <div style={{ flex: '1' }}>
        <GrafloriaFlow defaultNodes={nodes} defaultEdges={[]} onInit$={$((instance: DiagramInstance) => {
          const engine = instance.getEngine() as any;
          const summaryOf = new Map(EVENTS);
          let seq = 0;
          const logRow = (name: string, payload: any) => {
            const summary = (summaryOf.get(name) || (() => ''))(payload);
            rows.value = [{ key: ++seq, name, summary }, ...rows.value].slice(0, 12);
          };
          disposers.value = noSerialize(EVENTS.map(([name]) => engine.eventBus.on(name, (payload: any) => logRow(name, payload))));
          markReady();
        })} />
      </div>
    </div>
  );
});
