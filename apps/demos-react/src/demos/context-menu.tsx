import { useRef } from 'react';
import type { DiagramInstance } from '@grafloria/react';
import { GrafloriaFlow } from '@grafloria/react';
import { markReady } from '../ready';

const nodes: any[] = [
  { id: 'a', position: { x: 120, y: 120 }, size: { width: 120, height: 48 }, label: 'Alpha' },
  { id: 'b', position: { x: 380, y: 120 }, size: { width: 120, height: 48 }, label: 'Beta' },
];
const edges: any[] = [{ id: 'e', source: 'a', target: 'b' }];

/** Right-click a node for Rename / Duplicate / Delete — driven by a real
 *  contextmenu event, and every item actually mutates the model it names. */
export default function ContextMenuDemo() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<string | null>(null);

  const onInit = (instance: DiagramInstance) => {
    const host = wrapRef.current!;
    const menu = menuRef.current!;
    const api = instance as any;
    const model = api.getModel();
    const engine = instance.getEngine() as any;

    host.addEventListener('contextmenu', (e) => {
      const el = (e.target as HTMLElement).closest('[data-node-id]');
      if (!el) return;
      e.preventDefault();
      targetRef.current = el.getAttribute('data-node-id');
      const rect = host.getBoundingClientRect();
      menu.style.left = `${e.clientX - rect.left}px`;
      menu.style.top = `${e.clientY - rect.top}px`;
      menu.classList.add('open');
      menu.style.display = 'block';
    });

    const act = async (action: string) => {
      const id = targetRef.current!;
      if (action === 'rename') model.getNode(id).setMetadata('label', 'RENAMED');
      if (action === 'delete') model.removeNode(id);
      if (action === 'duplicate') {
        const src = model.getNode(id);
        const copy = await engine.addNode({ type: 'rect', position: { x: src.position.x + 30, y: src.position.y + 60 }, size: { ...src.size } });
        copy.setMetadata('label', (src.getMetadata('label') ?? '') + ' copy');
      }
      menu.classList.remove('open');
      menu.style.display = 'none';
      api.renderNow();
    };
    for (const btn of Array.from(menu.querySelectorAll('button'))) {
      btn.addEventListener('click', () => act((btn as HTMLElement).dataset.act!));
    }
    document.addEventListener('pointerdown', (e) => {
      if (!menu.contains(e.target as Node)) { menu.classList.remove('open'); menu.style.display = 'none'; }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { menu.classList.remove('open'); menu.style.display = 'none'; }
    });
    markReady();
  };

  const btn = { display: 'block', width: '100%', textAlign: 'left' as const, padding: '7px 10px',
    border: 0, background: 'transparent', color: 'inherit', borderRadius: 5, cursor: 'pointer' };

  return (
    <div ref={wrapRef} style={{ height: '100vh', position: 'relative' }}>
      <div ref={menuRef} style={{ position: 'absolute', zIndex: 10, minWidth: 160, background: 'var(--mbg,#1a1a1a)',
        color: 'inherit', border: '1px solid rgba(127,127,127,.35)', borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,.18)',
        padding: 4, display: 'none', font: '13px system-ui, sans-serif' }}>
        <button data-act="rename" style={btn}>Rename</button>
        <button data-act="duplicate" style={btn}>Duplicate</button>
        <button data-act="delete" style={btn}>Delete</button>
      </div>
      <GrafloriaFlow defaultNodes={nodes} defaultEdges={edges} onInit={onInit} />
    </div>
  );
}
