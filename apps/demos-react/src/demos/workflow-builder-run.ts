// Workflow automation builder — Test workflow: walk the links from the
// trigger, evaluate the rules, and keep the run card's state.
//
// The run starts at the trigger; each step spins (620 ms × speed) then turns
// green, the active line animates, the Condition follows the branch its rule
// picks for the sample commit, the Switch follows the output the simulated
// health result picks, and a step whose required field is empty FAILS. Stop
// halts it. Framework-free: the controller hands it the canvas (RunHost); each
// framework's template renders `log`, the chip and the inputs. The same file
// sits next to the workflow-builder demo in the React, Vue, Angular and Qwik apps.
import { ACTIONS, HEALTH, PLACEHOLDER, outputsOf, missingField, type StepData } from './workflow-builder-catalog';
import { kindOf, isLogic, portIdOf, summaryOf, iconOf, lineStyle } from './workflow-builder-steps';

/** A run-log row: cls running / success / failed / stopped, or 'note' (a line of text in `msg`). */
export interface LogRow { id: number; cls: string; icon: string; name: string; msg: string; st: string }

/** What a run needs from the page. */
export interface RunHost {
  readonly model: any;           // the live DiagramModel
  paint(id: string): void;       // repaint a step (its status badge)
  reveal(id: string): void;      // pan until the step is in view
  renderNow(): void;
  miniRefresh(): void;
  scrollLog(): void;             // the log's newest row into view
  changed(): void;               // re-render the component
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class TestRun {
  // ---- what the run card renders ----------------------------------------------
  open = false;
  /** Stop shows while a run is going, Run again otherwise. */
  active = false;
  msg = 'release: v2.14.0 faster checkout totals';
  health = 'degraded';
  chipText = 'Ready';
  chipCls = 'idle';
  log: LogRow[] = [];
  readonly healthOptions = Object.entries(HEALTH).map(([k, h]) => ({ value: k, label: h.label }));
  /** The delays are multiplied by this. */
  speed = 1;
  /** Each step's state in the current run (the badges and the minimap read it). */
  readonly status = new Map<string, string>();
  running = false;

  private host: RunHost;
  private token = 0;
  private seq = 0;
  constructor(host: RunHost) { this.host = host; }

  /** A fresh canvas: nothing has run (no repaint — its steps are new). */
  clear(): void {
    this.token++;
    this.running = false;
    this.status.clear();
    this.log = []; this.open = false; this.active = false; this.chipText = 'Ready'; this.chipCls = 'idle';
  }
  setStatus(id: string, st: string | null): void { if (st) this.status.set(id, st); else this.status.delete(id); this.host.paint(id); }
  private setChip(text: string, cls: string): void { this.chipText = text; this.chipCls = cls; this.host.changed(); }
  /** Badges off, lines back to grey, the log emptied. */
  reset(): void {
    const had = [...this.status.keys()];
    this.status.clear();
    for (const id of had) this.host.paint(id);
    for (const l of this.host.model.getLinks()) l.updateStyle(lineStyle());
    this.log = [];
    this.host.renderNow();
    this.host.miniRefresh();
    this.host.changed();
  }
  /** Halt a run; `silent` also wipes what it showed (every edit does this). */
  stop(silent: boolean): void {
    if (!this.running) { if (silent && this.status.size) this.reset(); return; }
    this.token++;
    this.running = false;
    for (const [id, st] of this.status) if (st === 'running') this.setStatus(id, 'stopped');
    for (const l of this.host.model.getLinks()) if (l.style?.animation?.type === 'flow') l.updateStyle(lineStyle());
    for (const row of this.log) if (row.cls === 'running') { row.cls = 'stopped'; row.msg = 'Stopped before it finished'; row.st = '■'; }
    this.setChip('Stopped', 'idle');
    this.active = false;
    if (silent) this.reset();
    this.host.changed();
  }
  /** The card's Stop. */
  halt(): void { this.stop(false); }
  /** The card's ×. */
  close(): void { this.stop(true); this.open = false; this.host.changed(); }
  setMsg(v: string): void { this.msg = v; this.host.changed(); }
  setHealth(v: string): void { this.health = v; this.host.changed(); }

  private logRow(data: StepData, name: string): (st: string, msg: string) => void {
    const row: LogRow = { id: ++this.seq, cls: 'running', icon: iconOf(data), name, msg: 'Running…', st: '' };
    this.log = [...this.log, row];
    this.host.changed();
    this.host.scrollLog();
    return (st, msg) => {
      row.cls = st; row.st = st === 'success' ? '✓' : st === 'failed' ? '!' : ''; row.msg = msg;
      this.log = [...this.log];
      this.host.changed();
    };
  }
  private note(text: string): void {
    this.log = [...this.log, { id: ++this.seq, cls: 'note', icon: '', name: '', msg: text, st: '' }];
    this.host.changed();
  }

  /** Run from the trigger (Test workflow / Run again). */
  async start(): Promise<void> {
    this.stop(true);
    this.reset();
    this.open = true;
    const model = this.host.model;
    const token = ++this.token;
    this.running = true;
    this.setChip('Running', '');
    this.active = true;
    const trig = model.getNodes().find((n: any) => kindOf(n.data ?? {}) === 'trigger' && !model.getLinks().some((l: any) => l.targetNodeId === n.id));
    let failed = false;
    if (!trig) {
      this.note('This workflow has no trigger yet: choose one first.');
      failed = true;
    } else {
      const sim = { commit: { message: this.msg, branch: trig.data.props.branch || 'main', author: 'maya.k' }, health: this.health };
      this.note(`Sample commit by maya.k on ${sim.commit.branch} · health check will report “${HEALTH[sim.health].label}”`);
      const visited = new Set<string>();
      const visit = async (id: string, via: any): Promise<void> => {
        if (token !== this.token || visited.has(id)) return;
        visited.add(id);
        const node = model.getNode(id);
        if (!node?.data?.action || node.data.action === PLACEHOLDER) return;
        const data: StepData = node.data, a = ACTIONS[data.action];
        if (via) via.updateStyle(lineStyle('active'));
        this.setStatus(id, 'running');
        const row = this.logRow(data, `${a.app} · ${summaryOf(data)}`);
        this.host.reveal(id);
        this.host.renderNow();
        await sleep(620 * this.speed);
        if (token !== this.token) return;
        if (via && model.getLink(via.id)) via.updateStyle(lineStyle('done'));
        const miss = missingField(data);
        if (miss) { this.setStatus(id, 'failed'); row('failed', `${miss.label} is empty — fill it in the panel`); failed = true; return; }
        let res: { msg?: string; out?: string };
        try { res = a.run(data.props, sim, outputsOf(data)) || {}; } catch (err: any) { res = { msg: String(err?.message || err) }; }
        this.setStatus(id, 'success');
        row('success', res.msg || 'Done');
        const outs = outputsOf(data).filter((o) => !isLogic(data) || o.id === res.out);
        for (const o of outs) {
          const pid = portIdOf(id, data, o);
          for (const l of model.getLinks().filter((x: any) => x.sourcePortId === pid)) await visit(l.targetNodeId, l);
        }
      };
      await visit(trig.id, null);
    }
    if (token !== this.token) return;
    this.running = false;
    this.setChip(failed ? 'Failed' : 'Succeeded', failed ? 'bad' : 'ok');
    this.active = false;
    this.host.miniRefresh();
    this.host.changed();
  }
}
