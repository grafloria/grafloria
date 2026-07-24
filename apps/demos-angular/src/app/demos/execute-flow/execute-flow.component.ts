import { AfterViewInit, Component, ElementRef, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { markReady } from '../demo-ready';

/** n8n-style flow execution over the shipped status machinery: nodes carry
 *  state.status (idle | pending | running | completed | error | warning) and
 *  the running node pulses; the active wire animates in the chosen style. A
 *  failure halts the run, a warning does not, and a run can be paused/stepped.
 *  The page only calls node.setState(...) and link.updateStyle({ animation }). */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="display:flex;gap:8px;padding:8px 24px;border-bottom:1px solid rgba(127,127,127,.25);align-items:center;flex-wrap:wrap">
      <button (click)="run()" [disabled]="busy" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">▶ execute flow</button>
      <button (click)="run('transform')" [disabled]="busy" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">execute with a failure</button>
      <button (click)="run(null, 'enrich')" [disabled]="busy" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">execute with a warning</button>
      <button (click)="togglePause()" [disabled]="!running" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">{{ paused ? '▶ continue' : '⏸ pause' }}</button>
      <button (click)="step()" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">step ▸</button>
      <button (click)="reset()" style="padding:5px 12px;border-radius:6px;border:1px solid rgba(127,127,127,.4);background:transparent;color:inherit;cursor:pointer">reset</button>
      <span #readout style="margin-left:auto;font:12px/1.4 ui-monospace,monospace;opacity:.8">idle</span>
    </div>
    <div style="display:flex;gap:8px;padding:6px 24px;border-bottom:1px solid rgba(127,127,127,.25);align-items:center;flex-wrap:wrap;font:12px/1.6 inherit;opacity:.9">
      <label>wire
        <select #selType (change)="applyWire()" style="font:inherit;color:inherit;background:transparent;border:1px solid rgba(127,127,127,.4);border-radius:5px;padding:2px 4px">
          <option value="marching-ants" selected>marching ants</option>
          <option value="flow">flow</option>
          <option value="pulse">pulse</option>
          <option value="dash-flow">dash flow</option>
        </select>
      </label>
      <label>speed
        <select #selSpeed (change)="applyWire()" style="font:inherit;color:inherit;background:transparent;border:1px solid rgba(127,127,127,.4);border-radius:5px;padding:2px 4px">
          <option value="slow">slow</option><option value="normal">normal</option><option value="fast" selected>fast</option>
        </select>
      </label>
      <label>direction
        <select #selDir (change)="applyWire()" style="font:inherit;color:inherit;background:transparent;border:1px solid rgba(127,127,127,.4);border-radius:5px;padding:2px 4px">
          <option value="forward" selected>forward</option><option value="reverse">reverse</option>
        </select>
      </label>
      <label><input type="checkbox" #chkRm (change)="onReducedMotion(chkRm.checked)"> reduced motion (statics only)</label>
    </div>
    <div style="height:calc(100vh - 96px)">
      <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:100%" />
    </div>
  `,
})
export class ExecuteFlowComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  readout = viewChild.required<ElementRef<HTMLElement>>('readout');
  selType = viewChild.required<ElementRef<HTMLSelectElement>>('selType');
  selSpeed = viewChild.required<ElementRef<HTMLSelectElement>>('selSpeed');
  selDir = viewChild.required<ElementRef<HTMLSelectElement>>('selDir');

  nodes: any[] = [
    { id: 'trigger', position: { x: 60, y: 180 }, size: { width: 130, height: 54 }, label: 'Trigger' },
    { id: 'fetch', position: { x: 260, y: 180 }, size: { width: 130, height: 54 }, label: 'Fetch data' },
    { id: 'transform', position: { x: 460, y: 180 }, size: { width: 130, height: 54 }, label: 'Transform' },
    { id: 'validate', position: { x: 660, y: 100 }, size: { width: 130, height: 54 }, label: 'Validate' },
    { id: 'enrich', position: { x: 660, y: 260 }, size: { width: 130, height: 54 }, label: 'Enrich' },
    { id: 'save', position: { x: 860, y: 180 }, size: { width: 130, height: 54 }, label: 'Save' },
    { id: 'notify', position: { x: 1060, y: 180 }, size: { width: 130, height: 54 }, label: 'Notify' },
  ];
  edges: any[] = [
    { id: 'e1', source: 'trigger', target: 'fetch' }, { id: 'e2', source: 'fetch', target: 'transform' },
    { id: 'e3', source: 'transform', target: 'validate' }, { id: 'e4', source: 'transform', target: 'enrich' },
    { id: 'e5', source: 'validate', target: 'save' }, { id: 'e6', source: 'enrich', target: 'save' },
    { id: 'e7', source: 'save', target: 'notify' },
  ];
  private readonly order = ['trigger', 'fetch', 'transform', 'validate', 'enrich', 'save', 'notify'];
  private readonly incoming: Record<string, string[]> = {
    fetch: ['e1'], transform: ['e2'], validate: ['e3'], enrich: ['e4'], save: ['e5', 'e6'], notify: ['e7'],
  };
  private model: any;
  private active = new Set<string>();
  private token = 0;
  private stepIndex = -1;
  busy = false;
  running = false;
  paused = false;
  private resume: (() => void) | null = null;

  ngAfterViewInit() {
    this.model = this.canvas().activeEngine()?.getDiagram();
    this.canvas().fitToContent(40);
    markReady();
  }

  private wireAnim() {
    return { type: this.selType().nativeElement.value, speed: this.selSpeed().nativeElement.value, direction: this.selDir().nativeElement.value };
  }
  private say(m: string) { const el = this.readout()?.nativeElement; if (el) el.textContent = m; }
  private setStatus(id: string, status: string) { this.model?.getNode(id)?.setState({ status, animateStatus: true }); }
  private setEdge(id: string, on: boolean) {
    const l = this.model?.getLink(id); if (!l) { this.active.delete(id); return; }
    if (on) { this.active.add(id); l.updateStyle({ animation: this.wireAnim() }); }
    else { this.active.delete(id); l.updateStyle({ animation: { type: 'none' } }); }
  }
  applyWire() { for (const id of this.active) this.model?.getLink(id)?.updateStyle({ animation: this.wireAnim() }); }
  onReducedMotion(on: boolean) { document.body.classList.toggle('reduced-motion', on); }

  reset() {
    this.token += 1;
    this.paused = false; this.running = false; this.busy = false; this.stepIndex = -1;
    if (this.resume) { this.resume(); this.resume = null; }
    for (const id of this.order) this.setStatus(id, 'idle');
    for (const e of this.edges) this.setEdge(e.id, false);
    this.say('idle');
  }

  private gate(ms: number): Promise<void> {
    return new Promise((res) => {
      if (this.paused) { this.resume = () => { this.resume = null; res(); }; return; }
      setTimeout(res, ms);
    });
  }

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    if (!this.paused && this.resume) { const r = this.resume; this.resume = null; r(); }
    this.say(this.paused ? 'paused — ▶ continue' : 'running');
  }

  async run(failAt: string | null = null, warnAt: string | null = null) {
    this.reset();
    const token = this.token;
    this.busy = true; this.running = true;
    for (const id of this.order) this.setStatus(id, 'pending');
    let warned: string | null = null;
    for (const id of this.order) {
      for (const e of this.incoming[id] ?? []) this.setEdge(e, true);
      this.setStatus(id, 'running');
      this.say(`running: ${id}`);
      await this.gate(500);
      if (token !== this.token) return;
      for (const e of this.incoming[id] ?? []) this.setEdge(e, false);
      if (failAt === id) { this.setStatus(id, 'error'); this.say(`failed at: ${id} — downstream never ran`); this.busy = false; this.running = false; return; }
      if (warnAt === id) { warned = id; this.setStatus(id, 'warning'); this.say(`warning at: ${id} — flow continues`); }
      else this.setStatus(id, 'completed');
    }
    this.say(warned ? `flow completed with a warning at ${warned} ⚠` : 'flow completed ✓');
    this.busy = false; this.running = false;
  }

  step() {
    if (this.running) return;
    if (this.stepIndex < 0) {
      this.reset();
      for (const id of this.order) this.setStatus(id, 'pending');
      this.stepIndex = 0;
      this.setStatus(this.order[0], 'running');
      this.say(`step 1/${this.order.length}: running ${this.order[0]}`);
    } else {
      this.setStatus(this.order[Math.min(this.stepIndex, this.order.length - 1)], 'completed');
      this.stepIndex += 1;
      if (this.stepIndex < this.order.length) {
        this.setStatus(this.order[this.stepIndex], 'running');
        this.say(`step ${this.stepIndex + 1}/${this.order.length}: running ${this.order[this.stepIndex]}`);
      } else { this.stepIndex = -1; this.say('flow completed ✓'); }
    }
  }
}
