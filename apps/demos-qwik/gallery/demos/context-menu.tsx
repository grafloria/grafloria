import { component$, $, noSerialize, useSignal, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [
  { id: 'a', position: { x: 120, y: 120 }, size: { width: 120, height: 48 }, label: 'Alpha' },
  { id: 'b', position: { x: 380, y: 120 }, size: { width: 120, height: 48 }, label: 'Beta' },
];
const edges = [{ id: 'e', source: 'a', target: 'b' }];

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Every menu item mutates the model it names. */
async function act(api: DiagramInstance, id: string, action: string): Promise<void> {
  const model = api.getModel() as any;
  const engine = api.getEngine() as any;
  if (action === 'rename') model.getNode(id).setMetadata('label', 'RENAMED');
  if (action === 'delete') model.removeNode(id);
  if (action === 'duplicate') {
    const src = model.getNode(id);
    const copy = await engine.addNode({ type: 'rect', position: { x: src.position.x + 30, y: src.position.y + 60 }, size: { ...src.size } });
    copy.setMetadata('label', (src.getMetadata('label') ?? '') + ' copy');
  }
  api.renderNow();
}

const btn = { display: 'block', width: '100%', textAlign: 'left' as const, padding: '7px 10px',
  border: '0', background: 'transparent', color: 'inherit', borderRadius: '5px', cursor: 'pointer' };

/** Right-click a node for Rename / Duplicate / Delete — driven by a real
 *  contextmenu event, and every item actually mutates the model it names. */
export default component$(() => {
  const wrap = useSignal<HTMLElement>();
  const menuEl = useSignal<HTMLElement>();
  const inst = useSignal<NoSerialize<DiagramInstance>>();
  const open = useSignal(false);
  const pos = useSignal({ x: 0, y: 0 });
  const target = useSignal<string | null>(null);

  const choose = $(async (action: string) => {
    const api = inst.value;
    if (api && target.value) await act(api, target.value, action);
    open.value = false;
  });

  return (
    <div ref={wrap} style={{ height: '100vh', position: 'relative' }}>
      <div ref={menuEl} style={{ position: 'absolute', zIndex: '10', minWidth: '160px', background: 'var(--mbg,#1a1a1a)',
        color: 'inherit', border: '1px solid rgba(127,127,127,.35)', borderRadius: '8px', boxShadow: '0 8px 30px rgba(0,0,0,.18)',
        padding: '4px', display: open.value ? 'block' : 'none', font: '13px system-ui, sans-serif',
        left: `${pos.value.x}px`, top: `${pos.value.y}px` }} class={open.value ? 'open' : ''}>
        <button data-act="rename" style={btn} onClick$={() => choose('rename')}>Rename</button>
        <button data-act="duplicate" style={btn} onClick$={() => choose('duplicate')}>Duplicate</button>
        <button data-act="delete" style={btn} onClick$={() => choose('delete')}>Delete</button>
      </div>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
        inst.value = noSerialize(instance);
        const host = wrap.value!;
        // preventDefault must run synchronously and only over a node, so the
        // contextmenu listener is a plain DOM listener rather than onContextMenu$.
        host.addEventListener('contextmenu', (e) => {
          const el = (e.target as HTMLElement).closest('[data-node-id]');
          if (!el) return;
          e.preventDefault();
          target.value = el.getAttribute('data-node-id');
          const rect = host.getBoundingClientRect();
          pos.value = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          open.value = true;
        });
        document.addEventListener('pointerdown', (e) => {
          if (!menuEl.value?.contains(e.target as Node)) open.value = false;
        });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') open.value = false;
        });
        markReady();
      })} />
    </div>
  );
});
