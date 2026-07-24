import { useMemo, useRef } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { InMemoryViewportChannel, presentTo, followPresenter, lockDocument } from '@grafloria/element';
import { markReady } from '../ready';

/** Presentation mode: the presenter drives the camera and every follower's
 *  viewport follows — the same world region at the same zoom, each keeping its
 *  own canvas size. The follower is read-only from the moment it mounts (the
 *  document lock drives the engine's real mode), yet its camera gestures stay
 *  live, because following is camera work, not a document edit. */
const spec = () => ([
  { id: 'a', label: 'A', position: { x: 60,  y: 80 },  size: { width: 130, height: 60 } },
  { id: 'b', label: 'B', position: { x: 320, y: 80 },  size: { width: 130, height: 60 } },
  { id: 'c', label: 'C', position: { x: 190, y: 240 }, size: { width: 130, height: 60 } },
]);
const edges = [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'a', target: 'c' }];

export default function PresentationModeDemo() {
  const instA = useRef<DiagramInstance | null>(null);
  const instB = useRef<DiagramInstance | null>(null);
  const channel = useMemo(() => new InMemoryViewportChannel(), []);

  const wire = () => {
    const A = instA.current, B = instB.current;
    if (!A || !B) return;
    const hostA = { viewport: A.viewport, render: () => A.renderNow() };
    const hostB = { viewport: B.viewport, render: () => B.renderNow() };
    presentTo(hostA as never, channel, { presenterId: 'ana', throttleMs: 0 });
    followPresenter(hostB as never, channel, { ignorePresenterId: 'bo' });
    const engB = B.getEngine();
    if (engB) lockDocument(engB, true);
    A.fitView(60);
    markReady();
  };

  const badgeR = { position: 'absolute', top: 8, left: 8, zIndex: 2, font: '11px ui-monospace,Menlo,monospace', background: 'rgba(220,38,38,.9)', color: '#fff', padding: '2px 8px', borderRadius: 4 } as const;
  const badgeB = { ...badgeR, background: 'rgba(37,99,235,.85)' } as const;

  return (
    <div>
      <div style={{ fontSize: 12, opacity: .8, padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)' }}>
        The presenter drives the camera; the follower's viewport follows — read-only from the moment it mounts.
      </div>
      <div style={{ display: 'flex', height: 'calc(100vh - 45px)' }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', borderRight: '2px solid rgba(127,127,127,.35)' }}>
          <span style={badgeR}>presenter</span>
          <GrafloriaFlow defaultNodes={spec()} defaultEdges={edges} plugins style={{ display: 'block', height: '100%' }}
            onInit={(i) => { instA.current = i; wire(); }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <span style={badgeB}>follower (read-only)</span>
          <GrafloriaFlow defaultNodes={spec()} defaultEdges={structuredClone(edges)} style={{ display: 'block', height: '100%' }}
            onInit={(i) => { instB.current = i; wire(); }} />
        </div>
      </div>
    </div>
  );
}
