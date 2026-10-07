// Workflow automation builder — the sticky notes. A note is an engine GROUP
// (its members ride along when it is dragged); this draws it on a div UNDER
// the diagram's SVG that copies viewport.getHtmlLayerTransform(), keeps its
// frame round its members (its header measured in a hidden twin), and leaves
// the frame alone while a step is being dragged — the engine decides on drop,
// by that frame, whether the step left or joined the note.
//
// Framework-free: the same file sits next to the workflow-builder demo in the
// React, Vue, Angular and Qwik apps.
import { visualBox, noteFrame, LAYOUT } from './workflow-builder-layout';
import { geomOf, esc } from './workflow-builder-steps';

export interface NoteData { title: string; text: string }

export class NoteLayer {
  private api: any = null;
  private model: any = null;
  private layer: HTMLElement | null = null;
  private twin: HTMLElement | null = null;
  private headers = new Map<string, number>();

  /** Put the layer under the diagram of `api` (first child of its root). */
  mount(api: any, diagramRoot: HTMLElement): void {
    this.unmount();
    this.api = api; this.model = api.getModel();
    this.headers.clear();
    this.layer = document.createElement('div');
    this.layer.className = 'wf-notes';
    diagramRoot.insertBefore(this.layer, diagramRoot.firstChild);
    if (!this.twin || !this.twin.isConnected) {
      this.twin = document.createElement('div');
      this.twin.id = 'wf-measure';
      this.twin.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none';
      document.body.appendChild(this.twin);
    }
  }
  unmount(): void { this.layer?.remove(); this.layer = null; }
  /** Unmount and drop the measuring twin too. */
  dispose(): void { this.unmount(); this.twin?.remove(); this.twin = null; }

  /** The height a note's title + text take above its steps (measured once per text). */
  header(nt: NoteData): number {
    const key = `${nt.title}\u0000${nt.text}`;
    if (!this.headers.has(key)) {
      const mh = this.twin!;
      mh.innerHTML = `<div class="wf-note" style="width:${LAYOUT.minNoteWidth}px"><div class="wf-note-h">${esc(nt.title)}</div><div class="wf-note-t">${esc(nt.text)}</div></div>`;
      const h = (mh.firstChild as HTMLElement).getBoundingClientRect().height;
      this.headers.set(key, Math.ceil(h + 6));
    }
    return this.headers.get(key)!;
  }

  /** Fit every note's frame round its members (not mid-drag), then redraw; `selId` is the selected note. */
  fit(selId: string | null): void {
    const model = this.model;
    const dragging = this.api.getDraggingNodeIds?.().length > 0;
    for (const g of model.getGroups()) {
      const nt = g.getMetadata('note');
      if (!nt || dragging) continue;
      const boxes = [...g.members].map((id) => model.getNode(id)).filter((n: any) => n?.data?.action)
        .map((n: any) => visualBox({ ...geomOf(n.data), x: n.position.x, y: n.position.y }));
      const f = noteFrame(boxes, this.header(nt));
      if (!f) continue;
      const o = g.getOuterBounds();
      if (Math.abs(o.x - f.x) > 0.5 || Math.abs(o.y - f.y) > 0.5 || Math.abs(o.width - f.width) > 0.5 || Math.abs(o.height - f.height) > 0.5) g.setFrame(f);
    }
    this.render(selId);
  }

  /** The camera moved: the layer follows it. */
  follow(): void { if (this.layer) this.layer.style.transform = this.api.viewport.getHtmlLayerTransform(); }

  /** Draw every note at its frame; `selId` is the selected note. */
  render(selId: string | null): void {
    const layer = this.layer;
    if (!layer) return;
    this.follow();
    const seen = new Set<string>();
    for (const g of this.model.getGroups().filter((x: any) => x.getMetadata('note'))) {
      seen.add(g.id);
      let el = layer.querySelector(`[data-note="${CSS.escape(g.id)}"]`) as HTMLElement | null;
      if (!el) {
        el = document.createElement('div');
        el.className = 'wf-note';
        el.dataset['note'] = g.id;
        el.innerHTML = '<div class="wf-note-h"></div><div class="wf-note-t"></div>';
        layer.appendChild(el);
      }
      const f = g.getOuterBounds(), nt = g.getMetadata('note');
      Object.assign(el.style, { left: f.x + 'px', top: f.y + 'px', width: f.width + 'px', height: f.height + 'px' });
      el.firstChild!.textContent = nt.title;
      el.lastChild!.textContent = nt.text;
      el.classList.toggle('sel', selId === g.id);
    }
    for (const el of Array.from(layer.children) as HTMLElement[]) if (!seen.has(el.dataset['note']!)) el.remove();
  }
}
