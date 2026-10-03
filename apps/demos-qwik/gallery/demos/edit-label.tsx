import { component$, $ } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 260, y: 200 }, size: { width: 150, height: 60 }, label: 'draft' },
  { id: 'b', position: { x: 520, y: 200 }, size: { width: 150, height: 60 }, label: 'review' },
];
const edges = [{ id: 'e1', source: 'a', target: 'b' }];

/** Double-click a node and type — the label edits in place, commits on Enter
 *  or blur as ONE undoable step (Ctrl/⌘+Z brings the old label back), and
 *  Escape abandons the edit. The renderer's binder opens the editor itself,
 *  positioned through the live world→screen map, so it lands on the label at
 *  any zoom or pan. */
export default component$(() => (
  <div style={{ height: '100vh' }}>
    <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
      // The gesture under test — opt-in, so a host with its own editor keeps control.
      instance.getEngine().setInteractionConfig({ enableInPlaceTextEdit: true });
      instance.renderNow();
      markReady();
    })} />
  </div>
));
