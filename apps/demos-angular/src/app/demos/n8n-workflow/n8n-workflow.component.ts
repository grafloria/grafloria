import { AfterViewInit, Component, ElementRef, ViewEncapsulation, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { markReady } from '../demo-ready';
import {
  buildSpec, card, evalIf, aiStyle, mainStyle,
  KIND, META, TITLES0, DEFAULT_PARAMS, SIM_MS, PALETTE, kindLabel, CAT_BG,
  MAIN, YES, NO,
} from './n8n-spec';

interface LogRow { title: string; sub: string; status: string; ms: number; nIn: number; nOut: number; note: string; }
interface Field { type: string; key?: string; label?: string; options?: string[]; code?: boolean; text?: string; }

/**
 * The flagship n8n-style workflow builder, on the Grafloria engine — with n8n's
 * EXECUTION model, not just its looks. Press "▶ Test workflow" and a topological
 * walk sweeps the graph from the Trigger: the running node spins, finished nodes
 * get green ✓ badges, a failing one a red ! that halts the run; wires grow
 * "n items" pills; the AI Agent's model/memory/tool sub-nodes flash on animated
 * dashed wires while it thinks; the If node routes items down ONE branch by a
 * real condition. Pause / step / continue a live run, read the execution log,
 * and double-click any node for the Node Details View (input items | a per-type
 * Parameters form + Settings tab | output items, plus "Execute step").
 *
 * The imperative machinery is the same as the execute-flow demo — node metadata
 * re-render for status, link.updateStyle({ animation }) for wire flow, a graph
 * walk executor — reached through the Angular wrapper's activeEngine()/getDiagram().
 */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './n8n-workflow.component.html',
  styleUrl: './n8n-workflow.component.css',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class N8nWorkflowComponent implements AfterViewInit {
  canvas = viewChild.required(DiagramCanvasComponent);
  canvasHost = viewChild.required<ElementRef<HTMLElement>>('canvasHost');

  // The spec DATA, verbatim from the JS source.
  nodes: any[] = buildSpec().nodes;
  edges: any[] = buildSpec().edges;

  private api!: DiagramCanvasComponent;
  private model: any;
  private engine: any;

  // ---- the per-node registry (mutable, editable NDV state) ----------------
  private titles: Record<string, string> = { ...TITLES0 };
  private PARAMS: Record<string, any> = {};
  private SETTINGS: Record<string, any> = {};
  private flash = new Set<string>();

  // ---- run state (mirrors the JS RS) --------------------------------------
  private RS = {
    seq: 0,
    status: new Map<string, string>(),
    data: new Map<string, { input: any[]; output: any[]; ms: number }>(),
    branchOut: new Map<string, Record<string, any[]>>(),
    executed: [] as string[],
    log: [] as LogRow[],
    running: null as string | null,
  };

  // ---- template-bound UI state --------------------------------------------
  hudText = '';
  readout = 'idle';
  logsOpen = false;
  logRows: LogRow[] = [];
  logStatusText = 'idle';
  logStatusCls = '';
  failArmed = false;
  runActive = false;
  paused = false;

  // NDV
  ndvOpen = false;
  ndvOpenId: string | null = null;
  ndvBadge = '⚙';
  ndvBadgeBg = '#667';
  ndvName = '';
  ndvKind = '';
  ndvTab: 'params' | 'settings' = 'params';
  ndvFields: Field[] = [];
  ndvInput: { items?: any[]; count: string; hint?: string; prevBtn?: boolean } = { count: '' };
  ndvOutput: { items?: any[]; count: string; hint?: string; prevBtn?: boolean } = { count: '' };

  // ---- pause/step gate ----------------------------------------------------
  private runToken = 0;
  private pauseWaiters: Array<() => void> = [];
  private pendingSteps = 0;
  private wakeSleep: (() => void) | null = null;
  private added = 0;
  private readonly DARK_MQ = window.matchMedia('(prefers-color-scheme: dark)');

  ngAfterViewInit() {
    this.api = this.canvas();
    this.engine = this.api.activeEngine();
    this.model = this.engine?.getDiagram();
    if (!this.model) { markReady(); return; }

    this.engine.setInteractionConfig?.({ portVisibility: 'always' as never });

    // Keep the n8n CARDS painted at every zoom (LOD widening).
    try {
      const cfg = this.model.getLODConfig();
      const full = new Set<any>();
      for (const t of cfg.tiers) for (const f of t.features) full.add(f);
      for (const t of cfg.tiers) for (const f of full) t.features.add(f);
      this.model.setLODConfig(cfg);
    } catch { /* older engine without LOD config — the demo still runs */ }

    // registry defaults
    for (const id of Object.keys(KIND)) {
      this.PARAMS[id] = DEFAULT_PARAMS[KIND[id]](id);
      this.SETTINGS[id] = this.defSettings();
    }

    // Boot the wire labels as pills (If branches show true/false).
    for (const l of this.model.getLinks()) this.clearPill(l);
    this.updateHud();

    this.api.fitToContent(46);

    // A live scheme flip repaints the chips (they are model styles, not CSS).
    this.DARK_MQ.addEventListener?.('change', () => {
      for (const l of this.model.getLinks()) {
        const i = l.labels.findIndex((x: any) => x.id === this.PILL);
        if (i !== -1) l.updateLabel(i, { style: this.pillStyle() });
      }
    });

    // connect-by-drag restyles the new wire (main/ai/branch) + resolves slack.
    this.model.on?.('link:added', () => setTimeout(() => { this.restyleLinks(); this.updateHud(); }, 0));

    markReady();
  }

  private defSettings() { return { notes: '', retryOnFail: false, continueOnFail: false, executeOnce: false }; }

  // ---- link helpers -------------------------------------------------------
  private isMain(l: any) { return !/agent_(model|memory|tool)|_aiout/.test(`${l.sourcePortId} ${l.targetPortId}`); }
  private srcOf(l: any) { return this.model.getNodeByPortId(l.sourcePortId)?.id; }
  private tgtOf(l: any) { return this.model.getNodeByPortId(l.targetPortId)?.id; }
  private styleFor(l: any) {
    return l.sourcePortId === 'if_true' ? { stroke: YES, strokeWidth: 2, arrowHead: { type: 'arrow', size: 8, filled: true } }
      : l.sourcePortId === 'if_false' ? { stroke: NO, strokeWidth: 2, arrowHead: { type: 'arrow', size: 8, filled: true } }
        : !this.isMain(l) ? aiStyle() : mainStyle();
  }
  private baseLabel(l: any) { return l.sourcePortId === 'if_true' ? 'true' : l.sourcePortId === 'if_false' ? 'false' : ''; }

  private readonly PILL = 'wire-pill';
  private pillStyle() {
    return this.DARK_MQ.matches
      ? { fontSize: 11, fontWeight: '600', color: '#e7e9f0', background: '#262733', border: '#3a3c49', padding: 5, borderRadius: 9 }
      : { fontSize: 11, fontWeight: '600', color: '#3c4254', background: '#ffffff', border: '#d6dae4', padding: 5, borderRadius: 9 };
  }
  private setWirePill(l: any, text: string) {
    const i = l.labels.findIndex((x: any) => x.id === this.PILL);
    if (!text) { if (i !== -1) l.removeLabel(this.PILL); return; }
    if (i !== -1) l.updateLabel(i, { text, style: this.pillStyle() });
    else l.addLabel({ id: this.PILL, text, position: 0.5, offset: { x: 0, y: 0 }, style: this.pillStyle() });
  }
  private setPill(l: any, n: number) {
    const b = this.baseLabel(l);
    this.setWirePill(l, n > 0 ? (b ? b + ' · ' : '') + n + (n === 1 ? ' item' : ' items') : b);
  }
  private clearPill(l: any) { this.setWirePill(l, this.baseLabel(l)); }
  private pillsFrom(id: string) {
    const d = this.RS.data.get(id);
    if (!d) return;
    const b = this.RS.branchOut.get(id);
    for (const l of this.model.getLinks()) {
      if (!this.isMain(l) || this.srcOf(l) !== id) continue;
      this.setPill(l, b ? (b[l.sourcePortId] ?? []).length : d.output.length);
    }
  }
  private setEdgesRun(id: string, on: boolean) {
    for (const l of this.model.getLinks()) {
      if (!this.isMain(l) || this.tgtOf(l) !== id) continue;
      l.updateStyle({ ...this.styleFor(l), animation: on ? { type: 'flow', speed: 'fast', direction: 'forward' } : { type: 'none' } });
    }
  }
  private setAgentFlash(id: string, on: boolean) {
    if (!/^agent$/.test(id)) return;
    for (const sid of ['model', 'memory', 'tool']) { on ? this.flash.add(sid) : this.flash.delete(sid); this.paintNode(sid); }
    for (const l of this.model.getLinks()) {
      if (this.isMain(l)) continue;
      l.updateStyle({ ...aiStyle(), animation: on ? { type: 'dash-flow', speed: 'fast', direction: 'forward' } : { type: 'none' } });
    }
  }

  // ---- painting: the card IS the status display ---------------------------
  private paintNode(id: string) {
    const n = this.model.getNode(id), m = META[id];
    if (!n || !m) return;
    const st = this.RS.status.get(id) || 'idle';
    const dangling = id === 'slack' && !this.model.getLinks().some((l: any) => this.isMain(l) && this.tgtOf(l) === 'slack');
    n.setMetadata('html', {
      content: card(m.cat, m.glyph, this.titles[id] ?? id, dangling ? 'drag a wire to me' : m.sub,
        { mono: m.mono, dangling, status: st, flash: this.flash.has(id) }),
      padding: 0,
    });
  }
  private paintStatus(id: string, st: string) { this.RS.status.set(id, st); this.paintNode(id); }

  private restyleLinks() {
    for (const l of this.model.getLinks()) l.updateStyle(this.styleFor(l));
    this.paintNode('slack');
  }

  private updateHud() { this.hudText = `${this.model.getNodes().length} nodes · ${this.model.getLinks().length} wires`; }

  // ---- the execution log --------------------------------------------------
  private setLogsOpen(on: boolean) { this.logsOpen = on; }
  private setLogStatus(text: string, cls = '') { this.logStatusText = text; this.logStatusCls = cls; }
  private pushLog(id: string, status: string, ms: number, nIn: number, nOut: number, note = '') {
    this.RS.log.push({ title: this.titles[id] ?? id, sub: (META[id] || {}).sub || '', status, ms, nIn, nOut, note });
    this.logRows = [...this.RS.log];
  }

  // ---- the walk: topological over MAIN edges ------------------------------
  private buildWalk(upTo: string | null = null, exclusive = false): string[] {
    const links = this.model.getLinks().filter((l: any) => this.isMain(l));
    const out = new Map<string, string[]>(), rin = new Map<string, string[]>();
    for (const l of links) {
      const s = this.srcOf(l), t = this.tgtOf(l);
      if (!s || !t) continue;
      (out.get(s) ?? out.set(s, []).get(s)!).push(t);
      (rin.get(t) ?? rin.set(t, []).get(t)!).push(s);
    }
    const seen = new Set<string>();
    const q = this.model.getNode('start') ? ['start'] : [];
    while (q.length) {
      const id = q.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const t of out.get(id) || []) q.push(t);
    }
    let keep: Set<string> = seen;
    if (upTo) {
      keep = new Set();
      const q2 = [upTo];
      while (q2.length) {
        const id = q2.shift()!;
        if (keep.has(id) || !seen.has(id)) continue;
        keep.add(id);
        for (const s of rin.get(id) || []) q2.push(s);
      }
      if (exclusive) keep.delete(upTo);
    }
    const deg = new Map<string, number>();
    for (const id of keep) deg.set(id, 0);
    for (const l of links) {
      const s = this.srcOf(l), t = this.tgtOf(l);
      if (keep.has(s) && keep.has(t)) deg.set(t, (deg.get(t) || 0) + 1);
    }
    const order: string[] = [], q3 = [...keep].filter((id) => deg.get(id) === 0);
    while (q3.length) {
      const id = q3.shift()!;
      order.push(id);
      for (const t of out.get(id) || []) {
        if (!keep.has(t)) continue;
        deg.set(t, deg.get(t)! - 1);
        if (deg.get(t) === 0) q3.push(t);
      }
    }
    return order;
  }

  private gatherInputs(id: string): any[] {
    const items: any[] = [];
    for (const l of this.model.getLinks()) {
      if (!this.isMain(l) || this.tgtOf(l) !== id) continue;
      const up = this.srcOf(l);
      if (!up || !this.RS.data.has(up)) continue;
      const b = this.RS.branchOut.get(up);
      items.push(...(b ? (b[l.sourcePortId] ?? []) : this.RS.data.get(up)!.output));
    }
    return items;
  }

  // ---- the simulators: items in → items out, per node ---------------------
  private simOutput(id: string, input: any[]): any[] {
    const p = this.PARAMS[id] || {};
    switch (id) {
      case 'start': return [{ trigger: 'manual', run: this.RS.seq }];
      case 'login': return [{ token: 'pams.7f3d1c', expiresIn: 3600 }];
      case 'setToken': return input.map((it) => ({ ...it, authorization: 'Bearer pams.7f3d1c' }));
      case 'getBranches': return ['Cairo HQ', 'Alexandria', 'Giza Plant', 'Mansoura'].map((name, i) => ({ branchId: 101 + i, name }));
      case 'getVendors': {
        const pend = this.RS.seq % 2 === 1 ? 0 : 2;
        return [
          { vendorId: 'V-201', vendor: 'Nile Supplies', pendingInquiries: 0 },
          { vendorId: 'V-202', vendor: 'Delta Tools', pendingInquiries: pend },
          { vendorId: 'V-203', vendor: 'Suez Freight', pendingInquiries: 0 },
        ];
      }
      case 'store': return input.map((it) => ({ ...it, storedAt: 'lookup_cache' }));
      case 'agent': {
        const open = input.reduce((n, it) => n + (it.pendingInquiries || 0), 0);
        return [{ verdict: open === 0 ? 'all inquiries resolved' : `${open} inquiries still open`, openInquiries: open, allDone: open === 0 }];
      }
      case 'excel': return [{ file: p.file || 'summary.xlsx', rows: input.length, written: true }];
      case 'slack': return [{ channel: p.channel || '#it-ops', sent: true }];
      default: break;
    }
    switch (KIND[id]) {
      case 'http': return [{ status: 200, url: p.url }, { status: 200, page: 2 }];
      case 'ai': return [{ response: 'ok' }];
      default: return input.length ? input : [{}];
    }
  }

  // ---- pause/step gate ----------------------------------------------------
  private gateSleep(ms: number): Promise<void> {
    return new Promise((res) => {
      const t = setTimeout(() => { this.wakeSleep = null; res(); }, ms);
      this.wakeSleep = () => { clearTimeout(t); this.wakeSleep = null; res(); };
    });
  }
  private pokeGate() { if (this.wakeSleep) this.wakeSleep(); }
  private releaseGate(all: boolean) {
    if (all) {
      this.pendingSteps = 0;
      for (const res of this.pauseWaiters.splice(0)) res();
      return;
    }
    const parked = this.pauseWaiters.splice(0, 1);
    if (parked.length) parked[0]();
    else { this.pendingSteps += 1; this.pokeGate(); }
  }
  private async stepGate(stepMs: number) {
    if (!this.paused) await this.gateSleep(stepMs);
    if (!this.paused) return;
    if (this.pendingSteps > 0) { this.pendingSteps -= 1; return; }
    await new Promise<void>((res) => this.pauseWaiters.push(res));
  }

  setPaused(on: boolean) {
    if (!this.runActive) return;
    this.paused = on;
    const held = this.RS.running;
    if (on) this.readout = `paused at: ${held ? this.titles[held] : '—'} — ▶ continue or step ▸`;
    else {
      if (held) this.readout = `running: ${this.titles[held]}`;
      this.releaseGate(true);
    }
  }

  reset() {
    this.runToken += 1;
    this.paused = false;
    this.runActive = false;
    this.releaseGate(true);
    this.pokeGate();
    this.RS.status.clear(); this.RS.data.clear(); this.RS.branchOut.clear();
    this.RS.executed = []; this.RS.log = []; this.RS.running = null;
    this.flash.clear();
    this.logRows = [];
    for (const id of Object.keys(META)) this.paintNode(id);
    for (const l of this.model.getLinks()) {
      this.clearPill(l);
      l.updateStyle({ ...this.styleFor(l), animation: { type: 'none' } });
    }
    this.setLogStatus('idle', '');
    this.readout = 'idle';
    if (this.ndvOpenId) this.refreshNDVData();
  }

  /** THE EXECUTOR — walks the live graph topologically from the trigger. */
  async execute({ stepMs = 480, upTo = null as string | null, exclusive = false, startPaused = false } = {}) {
    this.reset();
    const token = this.runToken;
    this.RS.seq += 1;
    this.runActive = true;
    this.paused = !!startPaused;
    this.setLogsOpen(true);
    this.setLogStatus('Running…', '');
    try {
      const walk = this.buildWalk(upTo, exclusive);
      if (!walk.length) {
        this.readout = upTo ? 'not connected to the trigger' : 'no trigger node';
        this.setLogStatus(this.readout, 'err');
        return { executed: [] as string[], failed: null as string | null, aborted: false };
      }
      for (const id of walk) if (this.model.getNode(id)) this.paintStatus(id, 'pending');

      let failedAt: string | null = null, totalMs = 0;
      for (const id of walk) {
        if (!this.model.getNode(id)) continue;
        const hasIncoming = this.model.getLinks().some((l: any) => this.isMain(l) && this.tgtOf(l) === id);
        const input = this.gatherInputs(id);
        if (hasIncoming && input.length === 0) continue;

        this.RS.running = id;
        this.paintStatus(id, 'running');
        this.setEdgesRun(id, true);
        this.setAgentFlash(id, true);
        this.readout = this.paused ? `paused at: ${this.titles[id]} — ▶ continue or step ▸` : `running: ${this.titles[id]}`;
        await this.stepGate(stepMs);
        if (token !== this.runToken) return { executed: [] as string[], failed: null as string | null, aborted: true };
        if (this.paused) this.readout = `paused at: ${this.titles[id]} — ▶ continue or step ▸`;

        const s = this.SETTINGS[id] || this.defSettings();
        const inWork = s.executeOnce ? input.slice(0, 1) : input;
        let failing = this.failArmed && id === 'getVendors';
        let ms = SIM_MS[id] ?? 45, note = '', status = 'completed', output: any[];
        if (failing && s.retryOnFail) { failing = false; ms = ms * 2 + 210; note = ' · retried ×1'; }
        if (failing) {
          status = 'error';
          output = s.continueOnFail ? [{ error: 'PAMS vendor API: 502 Bad Gateway' }] : [];
          if (s.continueOnFail) note = ' · continued';
          else failedAt = id;
        } else {
          output = this.simOutput(id, inWork);
        }
        if (id === 'ifNode' && status === 'completed') {
          const parts = evalIf(output, this.PARAMS.ifNode || {});
          this.RS.branchOut.set(id, { if_true: parts.t, if_false: parts.f });
        }
        this.RS.data.set(id, { input: inWork, output, ms });
        this.RS.executed.push(id);
        totalMs += ms;

        this.setEdgesRun(id, false);
        this.setAgentFlash(id, false);
        this.paintStatus(id, status);
        this.pillsFrom(id);
        this.pushLog(id, status, ms, inWork.length, output.length, note);
        if (failedAt) break;
      }
      this.RS.running = null;
      for (const id of walk) if (this.RS.status.get(id) === 'pending') this.paintStatus(id, 'idle');
      const secs = (totalMs / 1000).toFixed(2);
      if (failedAt) {
        this.readout = `✗ failed at: ${this.titles[failedAt]} — downstream never ran`;
        this.setLogStatus(`Error after ${secs}s — halted at ${this.titles[failedAt]}`, 'err');
      } else {
        this.readout = upTo ? `✓ ran up to: ${this.titles[upTo] ?? upTo}` : '✓ workflow ran successfully';
        this.setLogStatus(`Success in ${secs}s · ${this.RS.executed.length} nodes`, 'ok');
      }
      if (this.ndvOpenId) this.refreshNDVData();
      return { executed: [...this.RS.executed], failed: failedAt, aborted: false };
    } finally {
      if (token === this.runToken) {
        this.runActive = false;
        this.paused = false;
        this.RS.running = null;
      }
    }
  }

  // ---- run-bar wiring -----------------------------------------------------
  onRun() { if (!this.runActive) this.execute(); }
  onPause() { this.setPaused(!this.paused); }
  onStep() {
    if (this.runActive && this.paused) this.releaseGate(false);
    else if (!this.runActive) this.execute({ startPaused: true, stepMs: 250 });
  }
  onReset() { this.reset(); }
  onToggleLogs() { this.setLogsOpen(!this.logsOpen); }
  onCloseLogs() { this.setLogsOpen(false); }
  onToggleFail() { this.failArmed = !this.failArmed; }

  get stepDisabled() { return this.runActive && !this.paused; }

  // ---- the NDV ------------------------------------------------------------
  private paramFields(id: string): Field[] {
    switch (KIND[id]) {
      case 'trigger': return [{ type: 'note', text: 'When you press "▶ Test workflow", this trigger emits one item and the run begins. Triggers have no parameters here.' }];
      case 'http': return [
        { type: 'select', key: 'method', label: 'Method', options: ['GET', 'POST', 'PUT', 'DELETE'] },
        { type: 'text', key: 'url', label: 'URL' },
        { type: 'select', key: 'auth', label: 'Authentication', options: ['None', 'Basic Auth', 'Header Auth', 'Bearer Token'] },
      ];
      case 'set': return [{ type: 'set-fields' }];
      case 'code': return [
        { type: 'select', key: 'mode', label: 'Mode', options: ['Run Once for All Items', 'Run Once for Each Item'] },
        { type: 'textarea', key: 'code', label: 'JavaScript', code: true },
      ];
      case 'merge': return [
        { type: 'select', key: 'mode', label: 'Mode', options: ['Append', 'Combine', 'Choose Branch'] },
        { type: 'number', key: 'inputs', label: 'Number of inputs' },
      ];
      case 'if': return [
        { type: 'text', key: 'value1', label: 'Value 1' },
        { type: 'select', key: 'operation', label: 'Operation', options: ['is true', 'is false', 'equals', 'not equals', 'larger'] },
        { type: 'text', key: 'value2', label: 'Value 2' },
      ];
      case 'ai': return [
        { type: 'textarea', key: 'prompt', label: 'Prompt (system message)' },
        { type: 'select', key: 'model', label: 'Model', options: ['gpt-5.5', 'gpt-4.1', 'o4-mini'] },
        { type: 'number', key: 'temperature', label: 'Temperature' },
      ];
      case 'ai-model': return [
        { type: 'text', key: 'deployment', label: 'Deployment' },
        { type: 'text', key: 'apiVersion', label: 'API version' },
      ];
      case 'ai-memory': return [
        { type: 'text', key: 'collection', label: 'Collection' },
        { type: 'number', key: 'contextWindow', label: 'Context window' },
      ];
      case 'ai-tool': return [{ type: 'textarea', key: 'description', label: 'Tool description' }];
      case 'sheet': return [
        { type: 'select', key: 'operation', label: 'Operation', options: ['Write to file', 'Append to file'] },
        { type: 'text', key: 'file', label: 'File name' },
      ];
      case 'noop': return [
        { type: 'number', key: 'amount', label: 'Wait amount' },
        { type: 'select', key: 'unit', label: 'Unit', options: ['seconds', 'minutes', 'hours'] },
      ];
      case 'notify': return [
        { type: 'text', key: 'channel', label: 'Channel' },
        { type: 'textarea', key: 'text', label: 'Message' },
      ];
      default: return [{ type: 'note', text: 'This node has no parameters.' }];
    }
  }

  // template accessors for the NDV params/settings forms
  paramVal(key: string) { return this.ndvOpenId ? (this.PARAMS[this.ndvOpenId]?.[key] ?? '') : ''; }
  onParamInput(key: string, value: string, isNumber = false) {
    if (!this.ndvOpenId) return;
    this.PARAMS[this.ndvOpenId][key] = isNumber ? Number(value) : value;
  }
  get setFields(): Array<{ name: string; value: string }> {
    return this.ndvOpenId ? (this.PARAMS[this.ndvOpenId]?.fields ?? []) : [];
  }
  onSetFieldName(i: number, v: string) { this.setFields[i].name = v; }
  onSetFieldValue(i: number, v: string) { this.setFields[i].value = v; }
  addSetField() {
    const f = this.setFields;
    f.push({ name: 'field_' + (f.length + 1), value: '' });
    this.ndvFields = [...this.ndvFields]; // nudge the view
  }
  settingVal(key: string) { return this.ndvOpenId ? !!this.SETTINGS[this.ndvOpenId]?.[key] : false; }
  get notesVal() { return this.ndvOpenId ? (this.SETTINGS[this.ndvOpenId]?.notes ?? '') : ''; }
  onSettingToggle(key: string, checked: boolean) { if (this.ndvOpenId) this.SETTINGS[this.ndvOpenId][key] = checked; }
  onNotesInput(v: string) { if (this.ndvOpenId) this.SETTINGS[this.ndvOpenId].notes = v; }

  private renderPaneView(which: 'input' | 'output') {
    const id = this.ndvOpenId;
    const empty = { count: '' } as { items?: any[]; count: string; hint?: string; prevBtn?: boolean };
    if (!id) return empty;
    if (['ai-model', 'ai-memory', 'ai-tool'].includes(KIND[id])) {
      return { count: '', hint: which === 'input'
        ? 'This sub-node is invoked BY its AI Agent while the agent step runs — it takes no items of its own.'
        : "Sub-nodes produce no items; they answer the agent's calls." };
    }
    const d = this.RS.data.get(id);
    let items: any[] | null = d ? (d as any)[which] : null;
    if (!items && which === 'input') {
      const fromUpstream = this.gatherInputs(id);
      if (fromUpstream.length) items = fromUpstream;
    }
    if (!items) {
      if (which === 'output') return { count: '', hint: 'No output data yet — press "▶ Execute step" above to run up to this node.' };
      if (KIND[id] === 'trigger') return { count: '', hint: 'The trigger starts the run — it consumes no input items.' };
      if (!this.model.getLinks().some((l: any) => this.isMain(l) && this.tgtOf(l) === id))
        return { count: '', hint: 'Wire an input into this node first — it has no incoming connection.' };
      return { count: '', hint: 'No input data yet.', prevBtn: true };
    }
    return { items, count: `${items.length} item${items.length === 1 ? '' : 's'}` };
  }
  private refreshNDVData() {
    this.ndvInput = this.renderPaneView('input');
    this.ndvOutput = this.renderPaneView('output');
  }
  json(it: any) { return JSON.stringify(it, null, 1); }

  openNDV(id: string) {
    if (!META[id] || !this.model.getNode(id)) return;
    this.ndvOpenId = id;
    const m = META[id];
    this.ndvBadge = m.glyph;
    this.ndvBadgeBg = CAT_BG[m.cat] || '#667';
    this.ndvName = this.titles[id] ?? id;
    this.ndvKind = kindLabel[KIND[id]] || m.sub;
    this.ndvTab = 'params';
    this.ndvFields = this.paramFields(id);
    this.refreshNDVData();
    this.ndvOpen = true;
  }
  closeNDV() { this.ndvOpenId = null; this.ndvOpen = false; }
  onNdvName(v: string) {
    if (!this.ndvOpenId) return;
    this.ndvName = v;
    this.titles[this.ndvOpenId] = v;
    this.paintNode(this.ndvOpenId);
  }
  onNdvExec() { if (this.ndvOpenId && !this.runActive) this.execute({ upTo: this.ndvOpenId, stepMs: 140 }); }
  onExecutePrev() { if (this.ndvOpenId && !this.runActive) this.execute({ upTo: this.ndvOpenId, exclusive: true, stepMs: 140 }); }
  setTab(t: 'params' | 'settings') { this.ndvTab = t; }

  onKeydown(e: KeyboardEvent) { if (e.key === 'Escape' && this.ndvOpen) this.closeNDV(); }

  // Double-click a node card → its NDV. DOM bbox hit-test (the card is not
  // itself clickable — its foreignObject passes pointer events to the shape).
  onDblClick(e: MouseEvent) {
    const host = this.canvasHost().nativeElement;
    // Hit-test against the CARD box (position/size), not the node group whose
    // bbox includes far-flung ports/branch wires and would overlap neighbours.
    let hitId: string | null = null, best = Infinity;
    for (const cardEl of Array.from(host.querySelectorAll<HTMLElement>('.n8n-card'))) {
      const r = cardEl.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) continue;
      const area = r.width * r.height;
      if (area >= best) continue;
      const g = cardEl.closest<Element>('[data-node-id]');
      if (g) { hitId = g.getAttribute('data-node-id'); best = area; }
    }
    if (hitId) this.openNDV(hitId);
  }

  // ---- palette ------------------------------------------------------------
  palItems = ['http', 'set', 'code', 'if', 'merge', 'ai'].map((kind) => ({
    kind, glyph: PALETTE[kind].glyph, sub: PALETTE[kind].sub, mono: !!PALETTE[kind].mono, bg: CAT_BG[kind],
  }));

  async addNode(kind: string) {
    const meta = PALETTE[kind];
    const x = 60 + (this.added % 3) * 46, y = 470 + Math.floor(this.added / 3) * 24;
    this.added++;
    const node = await this.engine.addNode({ type: 'rect', position: { x, y }, size: { width: 200, height: 64 } });
    node.setMetadata('shape', { type: 'rect', fill: 'none', stroke: 'none' });
    KIND[node.id] = kind;
    META[node.id] = { cat: kind, glyph: meta.glyph, sub: meta.sub, mono: meta.mono };
    this.titles[node.id] = meta.sub;
    this.PARAMS[node.id] = (DEFAULT_PARAMS[kind] || (() => ({})))(node.id);
    this.SETTINGS[node.id] = this.defSettings();
    this.paintNode(node.id);
    this.updateHud();
    return node;
  }
}
