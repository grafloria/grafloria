import { component$, $, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance, type EdgeSpec } from '@grafloria/qwik';
import { markReady } from '../ready';

const nodes = [{ id: 'n', position: { x: 320, y: 230 }, size: { width: 200, height: 100 }, label: 'selected' }];
const edges: EdgeSpec[] = [];
const OFFSET = 10;

/** Build the floating toolbar inside `host` and keep it pinned to node 'n'.
 *  Module level so the onInit$ QRL may call it. */
function installToolbar(host: HTMLElement, instance: DiagramInstance): void {
  const model = instance.getModel() as any;
  const viewport = (instance as any).viewport;

  const toolbar = document.createElement('div');
  toolbar.className = 'nt-toolbar';
  toolbar.style.cssText = 'position:absolute;left:0;top:0;z-index:4;display:flex;gap:6px;background:#111827;padding:5px 6px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.3);white-space:nowrap';
  const mk = (label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:12px system-ui;border:0;border-radius:5px;padding:3px 9px;background:#374151;color:#fff;cursor:pointer';
    b.onclick = onClick;
    toolbar.appendChild(b);
  };
  mk('duplicate', () => {
    const src = model.getNode('n'); if (!src) return;
    instance.setNodes([
      ...model.getNodes().map((x: any) => ({ id: x.id, position: { ...x.position }, size: { ...x.size }, label: x.getMetadata('label') })),
      { id: 'n-copy-' + Date.now().toString(36), position: { x: src.position.x + 40, y: src.position.y + 40 }, size: { ...src.size }, label: 'copy' },
    ]);
  });
  mk('delete', () => { if (!model.getNode('n')) return; model.removeNode('n'); toolbar.style.display = 'none'; instance.renderNow(); });
  host.appendChild(toolbar);

  const reposition = () => {
    const node = model.getNode('n'); if (!node) return;
    const r = host.getBoundingClientRect();
    const ax = node.position.x + node.size.width / 2, ay = node.position.y;
    const c = viewport.worldToClient(ax, ay, r);
    toolbar.style.left = (c.x - r.left) + 'px';
    toolbar.style.top = (c.y - r.top) + 'px';
    toolbar.style.transform = `translate(-50%, calc(-100% - ${OFFSET}px))`;
  };
  const syncVisible = () => {
    const node = model.getNode('n');
    toolbar.style.display = node && node.isSelected() ? '' : 'none';
  };

  const n = model.getNode('n');
  n.on('change:position', reposition);
  n.on('change:size', reposition);
  instance.on('selection:change', () => { syncVisible(); reposition(); });
  instance.on('viewport:change', reposition);
  viewport.onChange(reposition);

  model.selectNode(n);
  instance.renderNow();
  reposition(); syncVisible();
}

/** A floating toolbar pinned to a node — shown while the node is selected, held
 *  at a constant on-screen size, riding the node through pans, zooms and drags.
 *  Its buttons (duplicate / delete) act on that node. */
export default component$(() => {
  const wrap = useSignal<HTMLDivElement>();
  return (
    <div ref={wrap} style={{ height: '100vh', position: 'relative' }}>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit$={$((instance: DiagramInstance) => {
        if (wrap.value) installToolbar(wrap.value, instance);
        markReady();
      })} />
    </div>
  );
});
