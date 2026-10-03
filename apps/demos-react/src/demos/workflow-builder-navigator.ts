// Workflow automation builder — the navigator card: a minimap (the sticky
// notes drawn under its steps, a step coloured by its run state), the zoom
// slider and its readout, Fit and Fit width.
//
// Framework-free: the controller mounts it on the canvas instance; each
// framework's template renders the card's buttons from `zoomPct`, `mmOn` and
// `flashing`. The same file sits next to the workflow-builder demo in the
// React, Vue, Angular and Qwik apps.
import { createMiniMap } from '@grafloria/element';
import { visualBox } from './workflow-builder-layout';
import { geomOf, DARK } from './workflow-builder-steps';

const SVG = 'http://www.w3.org/2000/svg';
const RUN_COLOUR: Record<string, string> = { running: '#f59e0b', success: '#16a34a', failed: '#dc2626' };

export class Navigator {
  // ---- what the card renders --------------------------------------------------------
  zoomPct = 100;
  mmOn = true;
  /** The button that just fired (a short highlight). */
  flashing: 'fit' | 'fitw' | null = null;

  private api: any = null;
  private model: any = null;
  private host!: HTMLElement;
  private mm: any = null;
  private mmNotes: SVGGElement | null = null;
  private raf = 0;
  private changed: () => void;
  constructor(changed: () => void) { this.changed = changed; }

  /** Mount the minimap in `el`; `status` is the run's step states. */
  mount(api: any, host: HTMLElement, el: HTMLElement, status: Map<string, string>): void {
    this.dispose();
    this.api = api; this.model = api.getModel(); this.host = host;
    this.mmOn = true;
    const model = this.model;
    const mm = (this.mm = createMiniMap(el, api.viewport, () => model, {
      placement: 'top-left', offset: 0, width: 242, height: 128, padding: 70, showLinks: true,
      panelBackground: 'transparent', panelBorder: 'transparent', ariaLabel: 'Workflow minimap',
      maskColor: 'rgba(59,82,217,0.06)', maskStroke: 'rgba(59,82,217,0.85)',
      nodeColor: (n: any) => RUN_COLOUR[status.get(n.id) ?? ''] ?? (DARK.matches ? '#646d82' : '#aab2c3'),
    }));
    mm.portal.element.style.borderRadius = '0';
    mm.portal.element.style.boxShadow = 'none';
    this.mmNotes = document.createElementNS(SVG, 'g');
    mm.element.insertBefore(this.mmNotes, mm.element.firstChild);
  }
  dispose(): void {
    cancelAnimationFrame(this.raf); this.raf = 0;
    try { this.mm?.dispose(); } catch { /* the canvas went first */ }
    this.mm = null;
  }
  /** Redraw the minimap's steps and notes (once per frame). */
  refresh(): void {
    if (this.raf || !this.mm) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (!this.mm) return;
      this.mm.refresh();
      this.mmNotes!.replaceChildren(...this.model.getGroups().filter((g: any) => g.getMetadata('note')).map((g: any) => {
        const f = g.getOuterBounds(), r = document.createElementNS(SVG, 'rect');
        for (const [k, v] of Object.entries({ x: f.x, y: f.y, width: f.width, height: f.height, rx: 10, fill: DARK.matches ? '#4a4120' : '#f8e7a6' })) r.setAttribute(k, String(v));
        return r;
      }));
    });
  }
  /** The camera moved: the readout and the slider follow its zoom. */
  zoomed(zoom: number): void {
    const pct = Math.round(zoom * 100);
    if (pct !== this.zoomPct) { this.zoomPct = pct; this.changed(); }
  }
  private flash(which: 'fit' | 'fitw'): void {
    this.flashing = which; this.changed();
    setTimeout(() => { if (this.flashing === which) { this.flashing = null; this.changed(); } }, 260);
  }
  private contentBounds(): { x: number; y: number; width: number; height: number } | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of this.model.getNodes()) {
      if (!n.data?.action) continue;
      const b = visualBox({ ...geomOf(n.data), x: n.position.x, y: n.position.y });
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    for (const g of this.model.getGroups()) { const f = g.getOuterBounds(); x0 = Math.min(x0, f.x); y0 = Math.min(y0, f.y); x1 = Math.max(x1, f.x + f.width); y1 = Math.max(y1, f.y + f.height); }
    return Number.isFinite(x0) ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
  }
  /** Fit everything in view (at most 125%). */
  frame(): void {
    const b = this.contentBounds(), r = this.host.getBoundingClientRect(), vp = this.api.viewport;
    if (!b) return;
    const z = Math.min(1.25, (r.width - 80) / b.width, (r.height - 80) / b.height);
    vp.setZoom(z);
    const c = vp.getViewport();
    vp.setViewport({ ...c, x: b.x + b.width / 2 - c.width / 2, y: b.y + b.height / 2 - c.height / 2 });
    this.api.renderNow();
  }
  /** The card's Fit. */
  fit(): void { this.flash('fit'); this.frame(); }
  /** The card's Fit width. */
  fitWidth(): void {
    this.flash('fitw');
    const b = this.contentBounds(), r = this.host.getBoundingClientRect(), vp = this.api.viewport;
    if (!b) return;
    const z = vp.setZoom(Math.min(2, (r.width - 48) / b.width));
    // Centred when it fits the height too, else its top edge just under the canvas top.
    const c = vp.getViewport(), cy = b.height * z <= r.height - 48 ? b.y + b.height / 2 : b.y - 24 / z + r.height / z / 2;
    vp.setViewport({ ...c, x: b.x + b.width / 2 - c.width / 2, y: cy - c.height / 2 });
    this.api.renderNow();
  }
  /** The zoom slider (percent). */
  zoomTo(pct: number): void { this.api.viewport.setZoom(pct / 100); this.api.renderNow(); }
  /** Show or hide the minimap. */
  toggleMinimap(): void {
    this.mmOn = !this.mmOn;
    this.changed();
    if (this.mmOn) this.refresh();
  }
}
