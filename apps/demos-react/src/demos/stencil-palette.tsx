import { useEffect, useRef } from 'react';
import { GrafloriaFlow } from '@grafloria/react';
import type { DiagramInstance } from '@grafloria/react';
import { registerStencils, bindStencilPalette } from '@grafloria/element';
import { markReady } from '../ready';

/** Stencil palette (Visio-style): drag a shape out of a categorized stencil
 *  palette and drop it on the canvas — 80 BPMN / flowchart / UML / ERD
 *  masters, searchable, each thumbnail drawn from the shape's own outline
 *  geometry. A drop lands centred on the cursor as ONE undoable command
 *  (Ctrl/⌘+Z takes the whole shape back); section headers collapse. */
type PaletteHandle = ReturnType<typeof bindStencilPalette>;

export default function StencilPalette() {
  const rail = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const handle = useRef<PaletteHandle | null>(null);
  useEffect(() => () => { handle.current?.destroy(); handle.current = null; }, []);

  const onInit = (api: DiagramInstance) => {
    // Every built-in master behind engine.templateRegistry, so NodeFactory can
    // stamp any of them by id.
    registerStencils((api.getEngine() as any).templateRegistry);

    // The palette itself: sections from listStencils(), drops onto the canvas.
    // It owns the rail's inside; a remount re-binds a fresh one.
    handle.current?.destroy();
    handle.current = bindStencilPalette(api as any, { palette: rail.current!, canvas: canvas.current! }, {
      data: (master: any) => ({ label: master.meta?.name ?? master.id }),
    });
    markReady();
  };

  // The two-pane authoring frame: palette rail + canvas.
  return (
    <div style={{ display: 'flex', height: '100vh', minHeight: 0 }}>
      <div id="stencil-rail" ref={rail} style={{ width: 232, flex: 'none' }} />
      <div id="stencil-canvas" ref={canvas} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <GrafloriaFlow defaultNodes={[]} defaultEdges={[]} onInit={onInit} />
      </div>
    </div>
  );
}
