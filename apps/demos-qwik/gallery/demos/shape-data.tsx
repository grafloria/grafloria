import { component$, $, noSerialize, useSignal, useVisibleTask$, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { registerStencils, bindShapeDataPanel, NodeFactory } from '@grafloria/element';
import { markReady } from '../ready';

/** T9/visio — Visio's "Shape Data" window. Every master ships a dataSchema and
 *  the values live on node.data. Select a shape and edit the fields its master
 *  declares — a framework-free property sheet (bindShapeDataPanel) driven by the
 *  template's dataSchema, writing through SetNodeDataCommand so every field edit
 *  is undoable (Ctrl/⌘+Z) and collab-safe. Click empty canvas to deselect; the
 *  panel follows the selection. */
type PanelHandle = ReturnType<typeof bindShapeDataPanel>;

export default component$(() => {
  // The panel owns its element's inside — rendered childless, so Qwik leaves it alone.
  const panel = useSignal<HTMLDivElement>();
  const handle = useSignal<NoSerialize<PanelHandle>>();
  useVisibleTask$(({ cleanup }) => cleanup(() => handle.value?.destroy()));

  return (
    <div style={{ display: 'flex', height: '100vh', minHeight: '0' }}>
      <div style={{ flex: '1', minWidth: '0', position: 'relative' }}>
        <GrafloriaFlow defaultNodes={[]} defaultEdges={[]} onInit$={$((api: DiagramInstance) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const engine = api.getEngine() as any;
          // Masters carry the dataSchema the panel renders.
          registerStencils(engine.templateRegistry);
          const factory = new NodeFactory(engine.templateRegistry, api.getModel() as never);
          factory.createFromTemplate('flowchart-decision', { label: 'Approve?' }, { x: 220, y: 180 });
          factory.createFromTemplate('flowchart-process', { label: 'Pay' }, { x: 460, y: 180 });

          handle.value = noSerialize(bindShapeDataPanel(api as never, panel.value!));

          api.renderNow();
          markReady();
        })} />
      </div>
      <div id="sd-panel" ref={panel} style={{ width: '232px', flex: 'none' }} />
    </div>
  );
});
