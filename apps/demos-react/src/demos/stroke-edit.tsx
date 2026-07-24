import { useRef, useState } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { registerTool, createDrawTool, createStrokeEditTool, StrokeModel } from '@grafloria/element';
import { markReady } from '../ready';
import { whiteboardHost } from './whiteboard-host';

/** Stroke edit: draw ink with the pen, then switch to the edit tool and drag a
 *  committed stroke — the whole stroke translates as one undoable step. The
 *  draw and edit tools are both registered; the toolbar is the tool-switch
 *  seam (setActive). */
export default function StrokeEditDemo() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const drawTool = useRef<{ setActive: (a: boolean) => void } | null>(null);
  const editTool = useRef<{ setActive: (a: boolean) => void } | null>(null);
  const [edit, setEdit] = useState(false);

  const setTool = (e: boolean) => {
    setEdit(e);
    drawTool.current?.setActive(!e);
    editTool.current?.setActive(e);
  };

  const onInit = (instance: DiagramInstance) => {
    const model = instance.getModel() as any;
    if (model) {
      model.addStroke(new StrokeModel(
        [{ x: 120, y: 200 }, { x: 240, y: 230 }, { x: 360, y: 210 }, { x: 420, y: 260 }],
        { color: '#0f766e', width: 4 }, { id: 'seed' },
      ));
      const wbHost = whiteboardHost(instance, hostRef.current!);
      drawTool.current = createDrawTool(wbHost, { color: '#0f766e', width: 4 }) as never;
      registerTool(drawTool.current as never);
      editTool.current = createStrokeEditTool(wbHost, { active: false }) as never;
      registerTool(editTool.current as never);
      instance.renderNow();
    }
    markReady();
  };

  const tab = (active: boolean) => ({
    padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(127,127,127,.4)', cursor: 'pointer', font: 'inherit',
    background: active ? '#0f766e' : 'transparent', color: active ? '#fff' : 'inherit',
  } as const);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', alignItems: 'center' }}>
        <span>tool:</span>
        <button onClick={() => setTool(false)} style={tab(!edit)}>draw</button>
        <button onClick={() => setTool(true)} style={tab(edit)}>edit</button>
      </div>
      <div ref={hostRef} style={{ display: 'block', height: 'calc(100vh - 45px)' }}>
        <GrafloriaFlow defaultNodes={[]} defaultEdges={[]} style={{ display: 'block', height: '100%' }} onInit={onInit} />
      </div>
    </div>
  );
}
