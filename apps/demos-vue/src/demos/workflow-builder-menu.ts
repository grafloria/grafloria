// Workflow automation builder — the add-step menu's state: its search, its
// sections, the highlighted row, and where it sits over the canvas.
//
// Framework-free: the controller opens it (from a "+", a panel button, a line
// let go on empty canvas, or the placeholder) and decides what a pick does;
// each framework's template renders `groups` and binds `query`. The same file
// sits next to the workflow-builder demo in the React, Vue, Angular and Qwik apps.
import { ACTIONS, CATEGORIES } from './workflow-builder-catalog';

export interface MenuItem { key: string; app: string; label: string; icon: string; index: number }
export interface MenuGroup { cat: string; items: MenuItem[] }

export class StepMenu {
  open = false;
  query = '';
  groups: MenuGroup[] = [];
  /** The highlighted row (Enter picks it). */
  on = 0;
  style = { left: '0px', top: '0px', bottom: '' };
  private items: string[] = [];

  /** The highlighted action, if any row matches. */
  get current(): string | undefined { return this.items[this.on]; }

  /** Rebuild the rows for the current query: the triggers only, or every other section. */
  build(triggersOnly: boolean): void {
    const q = this.query.trim().toLowerCase();
    const cats = triggersOnly ? ['Triggers'] : CATEGORIES.filter((c) => c !== 'Triggers');
    const items: string[] = [], groups: MenuGroup[] = [];
    for (const c of cats) {
      const list = Object.entries(ACTIONS).filter(([, a]) => a.cat === c && (!q || `${a.app} ${a.label} ${c}`.toLowerCase().includes(q)));
      if (!list.length) continue;
      groups.push({ cat: c, items: list.map(([k, a]) => ({ key: k, app: a.app, label: a.label, icon: a.icon, index: items.push(k) - 1 })) });
    }
    this.groups = groups;
    this.items = items;
    this.on = Math.min(this.on, Math.max(0, items.length - 1));
  }

  /**
   * Sit at a client point inside the canvas rect `r`: below the point when the
   * full list fits, else growing UP from it (its height changes as you search,
   * so the anchored edge must stay put). `mw` is the menu's width.
   */
  place(r: DOMRect, clientX: number, clientY: number, mw: number): void {
    const room = r.height - (clientY - r.top);
    const left = Math.round(Math.min(Math.max(8, clientX - r.left), r.width - mw - 8)) + 'px';
    if (room >= 420 || clientY - r.top < 420) this.style = { left, top: Math.round(Math.min(Math.max(8, clientY - r.top), r.height - 418)) + 'px', bottom: '' };
    else this.style = { left, top: '', bottom: Math.round(Math.max(8, r.bottom - clientY - 24)) + 'px' };
  }

  /** ↑ / ↓: move the highlight, wrapping round. */
  move(delta: 1 | -1): void {
    this.on = (this.on + delta + this.items.length) % Math.max(1, this.items.length);
  }
}
