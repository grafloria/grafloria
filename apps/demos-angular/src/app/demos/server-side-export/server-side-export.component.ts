import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { renderStatic } from '@grafloria/element';
import { markReady } from '../demo-ready';

/** Server-side export: a headless, deterministic render — pure spec → SVG with
 *  ZERO DOM (no createDiagram, no mounting). Two independent renders of the same
 *  spec are byte-identical, which is what makes it safe to run on a server,
 *  cache, and diff. The <svg> string is pasted straight into the page. */
const SPEC = {
  nodes: [
    { id: 'a', label: 'Extract', position: { x: 40,  y: 40 }, size: { width: 150, height: 66 } },
    { id: 'b', label: 'Load',    position: { x: 260, y: 40 }, size: { width: 150, height: 66 } },
    { id: 'c', label: 'Model',   position: { x: 150, y: 170 }, size: { width: 150, height: 66 } },
  ],
  edges: [{ id: 'e1', source: 'a', target: 'b' }, { id: 'e2', source: 'a', target: 'c' }],
};
/** FNV-1a — a byte-level fingerprint, so "byte-identical" has a number behind it. */
const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
};

@Component({
  standalone: true,
  imports: [],
  template: `
    <div style="font-size:12px;opacity:.8;padding:10px 24px;border-bottom:1px solid rgba(127,127,127,.25)">
      A headless, deterministic export — pure spec → SVG with zero DOM. Independent renders are byte-identical.
    </div>
    <div style="padding:16px 24px;overflow:auto">
      <div #preview style="border:1px solid rgba(127,127,127,.3);border-radius:8px;display:inline-block"></div>
      <div style="font:12px ui-monospace,Menlo,monospace;margin-top:12px;opacity:.8">{{ hash }}</div>
    </div>
  `,
})
export class ServerSideExportComponent implements AfterViewInit {
  preview = viewChild.required<ElementRef<HTMLElement>>('preview');
  hash = '';

  ngAfterViewInit() {
    const r = renderStatic({ nodes: SPEC.nodes, edges: SPEC.edges, width: 520, height: 300, standalone: true } as never) as any;
    this.preview().nativeElement.innerHTML = `<style>${r.css}</style>${r.svg}`;
    const inlined = String(r.svg).replace(/^(<svg[^>]*>)/, `$1<style>${r.css}</style>`);
    this.hash = `standalone artifact fingerprint: ${fnv(inlined)}`;
    markReady();
  }
}
