import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { registerTool, createDrawTool, createStrokeEditTool, StrokeModel } from '@grafloria/element';
import { markReady } from '../ready';
import { whiteboardHost } from './whiteboard-host';

/** Stroke edit: draw ink with the pen, then switch to the edit tool and drag a
 *  committed stroke — the whole stroke translates as one undoable step. The
 *  draw and edit tools are both registered; the toolbar is the tool-switch
 *  seam (setActive). */
type Tool = { setActive: (a: boolean) => void };

const tab = (active: boolean) => ({
  padding: '4px 12px', borderRadius: '6px', border: '1px solid rgba(127,127,127,.4)', cursor: 'pointer', font: 'inherit',
  background: active ? '#0f766e' : 'transparent', color: active ? '#fff' : 'inherit',
});

export default component$(() => {
  const hostRef = useSignal<HTMLDivElement>();
  // The tools are live gesture handlers, not data.
  const drawTool = useSignal<NoSerialize<Tool>>();
  const editTool = useSignal<NoSerialize<Tool>>();
  const edit = useSignal(false);

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', padding: '10px 24px', borderBottom: '1px solid rgba(127,127,127,.25)', alignItems: 'center' }}>
        <span>tool:</span>
        <button style={tab(!edit.value)} onClick$={() => {
          edit.value = false;
          drawTool.value?.setActive(true);
          editTool.value?.setActive(false);
        }}>draw</button>
        <button style={tab(edit.value)} onClick$={() => {
          edit.value = true;
          drawTool.value?.setActive(false);
          editTool.value?.setActive(true);
        }}>edit</button>
      </div>
      <div ref={hostRef} style={{ display: 'block', height: 'calc(100vh - 45px)' }}>
        <GrafloriaFlow defaultNodes={[]} defaultEdges={[]} style={{ display: 'block', height: '100%' }}
          onInit$={$((instance: DiagramInstance) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const model = instance.getModel() as any;
            if (model) {
              model.addStroke(new StrokeModel(
                [{ x: 120, y: 200 }, { x: 240, y: 230 }, { x: 360, y: 210 }, { x: 420, y: 260 }],
                { color: '#0f766e', width: 4 }, { id: 'seed' },
              ));
              const wbHost = whiteboardHost(instance, hostRef.value!);
              const draw = createDrawTool(wbHost, { color: '#0f766e', width: 4 }) as unknown as Tool;
              registerTool(draw as never);
              const editor = createStrokeEditTool(wbHost, { active: false }) as unknown as Tool;
              registerTool(editor as never);
              drawTool.value = noSerialize(draw);
              editTool.value = noSerialize(editor);
              instance.renderNow();
            }
            markReady();
          })} />
      </div>
    </div>
  );
});
