import { component$, $, noSerialize, useSignal, useVisibleTask$, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { registerStencils, bindStencilPalette } from '@grafloria/element';
import { markReady } from '../ready';

/** Stencil palette (Visio-style): drag a shape out of a categorized stencil
 *  palette and drop it on the canvas — 80 BPMN / flowchart / UML / ERD
 *  masters, searchable, each thumbnail drawn from the shape's own outline
 *  geometry. A drop lands centred on the cursor as ONE undoable command
 *  (Ctrl/⌘+Z takes the whole shape back); section headers collapse. */
type PaletteHandle = ReturnType<typeof bindStencilPalette>;

export default component$(() => {
  // The palette owns the rail's inside — rendered childless, so Qwik leaves it alone.
  const rail = useSignal<HTMLDivElement>();
  const canvas = useSignal<HTMLDivElement>();
  const handle = useSignal<NoSerialize<PaletteHandle>>();
  useVisibleTask$(({ cleanup }) => cleanup(() => handle.value?.destroy()));

  // The two-pane authoring frame: palette rail + canvas.
  return (
    <div style={{ display: 'flex', height: '100vh', minHeight: '0' }}>
      <div id="stencil-rail" ref={rail} style={{ width: '232px', flex: 'none' }} />
      <div id="stencil-canvas" ref={canvas} style={{ flex: '1', minWidth: '0', position: 'relative' }}>
        <GrafloriaFlow defaultNodes={[]} defaultEdges={[]} onInit$={$((api: DiagramInstance) => {
          // Every built-in master behind engine.templateRegistry, so NodeFactory
          // can stamp any of them by id.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          registerStencils((api.getEngine() as any).templateRegistry);

          // The palette itself: sections from listStencils(), drops onto the canvas.
          handle.value = noSerialize(bindStencilPalette(api as never, { palette: rail.value!, canvas: canvas.value! }, {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data: (master: any) => ({ label: master.meta?.name ?? master.id }),
          }));
          markReady();
        })} />
      </div>
    </div>
  );
});
