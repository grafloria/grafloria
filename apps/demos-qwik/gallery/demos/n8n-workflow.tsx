import { component$, $, noSerialize, useOnDocument, useSignal } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance, type EdgeSpec } from '@grafloria/qwik';
import { markReady } from '../ready';
import { N8nController } from './n8n-controller';

/**
 * The flagship n8n-style workflow builder, on the Grafloria engine — with n8n's
 * EXECUTION model, not just its looks. Press "▶ Test workflow" and a topological
 * walk sweeps the graph from the Trigger: the running node spins, finished nodes
 * get green ✓ badges, a failing one a red ! that halts the run; wires grow
 * "n items" pills; the AI Agent's model/memory/tool sub-nodes flash on animated
 * dashed wires while it thinks; the If node routes items down ONE branch by a
 * real condition. Pause / step / continue a live run, read the execution log,
 * and double-click any node for the Node Details View.
 *
 * The imperative machinery is the same as the execute-flow demo — node metadata
 * re-render for status, link.updateStyle({ animation }) for wire flow, a graph
 * walk executor — reached through the Qwik wrapper's getEngine()/getModel().
 * All of it lives in N8nController (noSerialize'd — it is not data); this
 * component owns only the JSX and re-renders on the controller's bump().
 */

const SPEC = N8nController.spec();

const HOST_CSS = `
#n8n-stage { display: grid; grid-template-columns: 188px 1fr; height: 100vh; min-height: 460px; }
#n8n-palette { border-right: 1px solid rgba(127,127,127,.2); padding: 12px 12px 16px; overflow-y: auto;
  background: #fafbfd; }
#n8n-palette .pal-title { font: 600 10px/1.4 system-ui, sans-serif; letter-spacing: .8px; text-transform: uppercase;
  color: #8a91a2; margin: 2px 2px 10px; }
#n8n-palette .pal-item { display: flex; align-items: center; gap: 9px; width: 100%; margin: 0 0 8px; padding: 7px 9px;
  border: 1px solid #e4e7ee; border-radius: 9px; background: #fff; cursor: pointer; text-align: left;
  font: 500 12.5px/1.2 system-ui, sans-serif; color: #2d2e3a; box-shadow: 0 1px 1px rgba(16,24,40,.04); }
#n8n-palette .pal-item:hover { border-color: #c7ccd8; background: #f7f8fb; }
#n8n-palette .pal-dot { width: 24px; height: 24px; border-radius: 6px; flex: none; display: flex; align-items: center;
  justify-content: center; font-size: 14px; color: #fff; }
#n8n-palette .pal-dot.mono { font: 700 12px/1 ui-monospace, monospace; }
#n8n-canvas { height: 100%; position: relative; overflow: hidden;
  background-color: #f4f5f8;
  background-image: radial-gradient(circle, #d5d9e2 1.1px, transparent 1.1px);
  background-size: 22px 22px; }
/* Only the flow fills the canvas. (The React port's extra "#n8n-canvas > div"
   also matched the HUD, legend, run bar and log — it outranks their own id
   rules and stretched each to 100% height, a white panel over the graph.) */
#n8n-canvas > .grafloria-flow { display: block; height: 100%; }
/* Status badges sit half-out of the card's top-right corner, n8n-style. */
#n8n-canvas foreignObject { overflow: visible; }

/* ---- the node card painted inside each node's foreignObject ------------- */
#n8n-canvas .n8n-card { display: flex; align-items: center; gap: 10px; width: 100%; height: 100%;
  box-sizing: border-box; padding: 0 12px; background: #fff; color: #2d2e3a; position: relative;
  border: 1px solid #dfe2ea; border-left-width: 3px; border-radius: 9px;
  box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.05); font-family: system-ui, sans-serif; }
#n8n-canvas .n8n-badge { width: 34px; height: 34px; border-radius: 8px; flex: none; display: flex;
  align-items: center; justify-content: center; font-size: 19px; line-height: 1; color: #fff; background: #667; }
#n8n-canvas .n8n-badge.mono { font: 700 15px/1 ui-monospace, monospace; }
#n8n-canvas .n8n-body { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
#n8n-canvas .n8n-title { font-weight: 600; font-size: 13.5px; line-height: 1.15; color: #262a35;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#n8n-canvas .n8n-sub { font-size: 10px; letter-spacing: .4px; text-transform: uppercase; color: #8a91a2;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Trigger nodes: the signature n8n left-rounded "start" pill. */
#n8n-canvas .n8n-card.cat-trigger { border-radius: 28px 9px 9px 28px; padding-left: 15px; }

/* A half-wired "next step" node — dashed, inviting you to connect it. */
#n8n-canvas .n8n-card.dangling { border-style: dashed; border-color: #b794f4; background: #fbf8ff; }
#n8n-canvas .n8n-card.dangling .n8n-sub { color: #9b6bd6; }

/* Category accents: coloured icon badge + left border, n8n-style. */
#n8n-canvas .cat-trigger .n8n-badge { background: #10b981; } #n8n-canvas .cat-trigger { border-left-color: #10b981; }
#n8n-canvas .cat-http    .n8n-badge { background: #0ea5e9; } #n8n-canvas .cat-http    { border-left-color: #0ea5e9; }
#n8n-canvas .cat-set     .n8n-badge { background: #6366f1; } #n8n-canvas .cat-set     { border-left-color: #6366f1; }
#n8n-canvas .cat-code    .n8n-badge { background: #475569; } #n8n-canvas .cat-code    { border-left-color: #475569; }
#n8n-canvas .cat-merge   .n8n-badge { background: #06b6d4; } #n8n-canvas .cat-merge   { border-left-color: #06b6d4; }
#n8n-canvas .cat-if      .n8n-badge { background: #f97316; } #n8n-canvas .cat-if      { border-left-color: #f97316; }
#n8n-canvas .cat-ai      .n8n-badge { background: #8b5cf6; } #n8n-canvas .cat-ai      { border-left-color: #8b5cf6; }
#n8n-canvas .cat-sheet   .n8n-badge { background: #22a565; } #n8n-canvas .cat-sheet   { border-left-color: #22a565; }
#n8n-canvas .cat-notify  .n8n-badge { background: #ec4899; } #n8n-canvas .cat-notify  { border-left-color: #ec4899; }

/* ---- EXECUTION affordances (the n8n run language) ----------------------- */
#n8n-canvas .n8n-card.st-pending { opacity: .42; }
#n8n-canvas .n8n-card.st-running { border-color: #ff6d5a; border-left-color: #ff6d5a;
  box-shadow: 0 0 0 2.5px rgba(255,109,90,.28), 0 2px 8px rgba(255,109,90,.18); }
#n8n-canvas .n8n-card.st-error { border-color: #ea1f30; border-left-color: #ea1f30;
  box-shadow: 0 0 0 2px rgba(234,31,48,.18); }
#n8n-canvas .n8n-card.st-flash { border-color: #8b5cf6;
  box-shadow: 0 0 0 2.5px rgba(139,92,246,.3), 0 2px 10px rgba(139,92,246,.25); }
#n8n-canvas .n8n-status { position: absolute; top: -8px; right: -8px; width: 17px; height: 17px;
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font: 700 10.5px/1 system-ui, sans-serif; color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.28); }
#n8n-canvas .n8n-status.ok  { background: #2ea56e; }
#n8n-canvas .n8n-status.err { background: #ea1f30; }
#n8n-canvas .n8n-spin { position: absolute; top: -9px; right: -9px; width: 18px; height: 18px;
  box-sizing: border-box; border-radius: 50%; background: #fff;
  border: 3px solid rgba(255,109,90,.25); border-top-color: #ff6d5a;
  animation: n8nspin .7s linear infinite; }
@keyframes n8nspin { to { transform: rotate(360deg); } }

/* ---- the floating run bar (n8n's bottom-centre "Test workflow") --------- */
#n8n-runbar { position: absolute; left: 50%; transform: translateX(-50%); bottom: 14px; z-index: 6;
  display: flex; gap: 7px; align-items: center; background: rgba(255,255,255,.96);
  border: 1px solid #dfe2ea; border-radius: 12px; padding: 8px 10px;
  box-shadow: 0 6px 22px rgba(15,23,42,.16); }
#n8n-canvas.logs-open #n8n-runbar { bottom: 200px; }
#n8n-runbar #btn-run { background: #ff6d5a; color: #fff; border: none; font: 600 13px/1.2 system-ui, sans-serif;
  padding: 8px 14px; border-radius: 8px; cursor: pointer; }
#n8n-runbar #btn-run:hover { background: #f75e4a; }
#n8n-runbar #btn-run:disabled { opacity: .55; cursor: default; }
#n8n-runbar .rb { padding: 7px 10px; border: 1px solid #d6dae4; background: #fff; border-radius: 8px;
  cursor: pointer; font: 500 12px/1.2 system-ui, sans-serif; color: #3c4254; }
#n8n-runbar .rb:hover { border-color: #b9bfce; }
#n8n-runbar .rb:disabled { opacity: .45; cursor: default; }
#n8n-runbar .rb[aria-pressed="true"] { background: #fdece9; border-color: #ff6d5a; color: #c2402f; }
#n8n-runbar #run-readout { font: 11px/1.3 ui-monospace, monospace; color: #6a7183; min-width: 76px; max-width: 200px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ---- the execution log panel (n8n's bottom Logs view) ------------------- */
#n8n-runlog { position: absolute; left: 0; right: 0; bottom: 0; height: 186px; z-index: 5;
  background: rgba(255,255,255,.97); border-top: 1px solid #dfe2ea; display: flex;
  flex-direction: column; box-shadow: 0 -8px 24px rgba(15,23,42,.09); }
#n8n-runlog[hidden] { display: none; }
#n8n-runlog .rl-head { display: flex; gap: 10px; align-items: center; padding: 7px 14px;
  border-bottom: 1px solid #eceef4; font: 600 10px/1.4 system-ui, sans-serif;
  letter-spacing: .7px; text-transform: uppercase; color: #7c8296; }
#n8n-runlog #rl-status { text-transform: none; letter-spacing: 0; font: 500 11.5px/1.3 system-ui, sans-serif; color: #6a7183; }
#n8n-runlog #rl-status.ok { color: #218358; } #n8n-runlog #rl-status.err { color: #c11626; }
#n8n-runlog #rl-close { margin-left: auto; border: none; background: transparent; color: #8a91a2;
  font-size: 15px; cursor: pointer; padding: 0 2px; }
#n8n-runlog .rl-rows { overflow: auto; flex: 1; }
#n8n-runlog .rl-row { display: grid; grid-template-columns: 14px minmax(140px,1.2fr) minmax(90px,1fr) 110px 110px;
  gap: 10px; align-items: center; padding: 4px 14px; border-bottom: 1px dashed #eef0f5;
  font: 11.5px/1.5 ui-monospace, monospace; color: #3c4254; }
#n8n-runlog .rl-dot { width: 8px; height: 8px; border-radius: 50%; background: #2ea56e; }
#n8n-runlog .rl-dot.err { background: #ea1f30; }
#n8n-runlog .rl-name { font-family: system-ui, sans-serif; font-weight: 600; font-size: 12px; color: #2d2e3a;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#n8n-runlog .rl-sub { color: #8a91a2; font-size: 10px; text-transform: uppercase; letter-spacing: .4px;
  font-family: system-ui, sans-serif; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#n8n-runlog .rl-ms { text-align: right; color: #6a7183; }

/* ---- the NDV (Node Details View) — n8n's input | parameters | output ---- */
#n8n-ndv { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; }
#n8n-ndv[hidden] { display: none; }
#n8n-ndv .ndv-back { position: absolute; inset: 0; background: rgba(22,23,32,.62); }
#n8n-ndv .ndv-modal { position: relative; width: min(1150px, 94vw); height: min(660px, 88vh); background: #f4f5f9;
  border-radius: 12px; overflow: hidden; display: flex; flex-direction: column;
  box-shadow: 0 24px 80px rgba(0,0,0,.45); font-family: system-ui, sans-serif; }
#n8n-ndv .ndv-head { display: flex; align-items: center; gap: 10px; background: #2b2c39; color: #eceef4;
  padding: 9px 14px; flex: none; }
#n8n-ndv .ndv-head .hd-badge { width: 30px; height: 30px; border-radius: 7px; flex: none; display: flex;
  align-items: center; justify-content: center; font-size: 16px; color: #fff; background: #667; }
#n8n-ndv #ndv-name { background: transparent; border: 1px solid transparent; color: inherit;
  font: 600 15px/1.3 system-ui, sans-serif; padding: 4px 8px; border-radius: 6px; min-width: 240px; }
#n8n-ndv #ndv-name:hover, #n8n-ndv #ndv-name:focus { border-color: #4a4c5e; background: #232430; outline: none; }
#n8n-ndv .ndv-head .hd-kind { font-size: 10.5px; letter-spacing: .5px; text-transform: uppercase; color: #8a90a6; }
#n8n-ndv #ndv-exec { margin-left: auto; background: #ff6d5a; color: #fff; border: none; border-radius: 8px;
  padding: 8px 14px; font: 600 12.5px/1.2 system-ui, sans-serif; cursor: pointer; }
#n8n-ndv #ndv-exec:hover { background: #f75e4a; }
#n8n-ndv #ndv-exec:disabled { opacity: .5; cursor: default; }
#n8n-ndv #ndv-close { background: transparent; color: #9aa0b4; border: none; font-size: 20px; cursor: pointer; padding: 0 4px; }
#n8n-ndv #ndv-close:hover { color: #fff; }
#n8n-ndv .ndv-body { flex: 1; display: grid; grid-template-columns: 1fr 1.18fr 1fr; min-height: 0; }
#n8n-ndv .ndv-pane { display: flex; flex-direction: column; min-height: 0; background: #eef0f6; border-right: 1px solid #e0e3ec; }
#n8n-ndv .ndv-pane.out { border-right: none; border-left: 1px solid #e0e3ec; }
#n8n-ndv .ndv-pane-head { font: 600 10px/1.4 system-ui, sans-serif; letter-spacing: .7px; text-transform: uppercase;
  padding: 10px 12px 8px; color: #7c8296; display: flex; justify-content: space-between; }
#n8n-ndv .ndv-items { overflow: auto; padding: 0 10px 12px; flex: 1; display: flex; flex-direction: column; }
#n8n-ndv .ndv-item { background: #fff; border: 1px solid #e2e5ee; border-radius: 8px; margin: 0 0 8px; flex: none; }
#n8n-ndv .ndv-item pre { margin: 0; padding: 7px 10px; font: 10.5px/1.55 ui-monospace, monospace;
  white-space: pre-wrap; word-break: break-word; color: #34394a; }
#n8n-ndv .ndv-hint { margin: auto; text-align: center; color: #8a91a2; font: 12.5px/1.6 system-ui, sans-serif; padding: 18px; }
#n8n-ndv .ndv-hint button { display: block; margin: 10px auto 0; border: 1px solid #ff6d5a; color: #d34a36;
  background: #fff; border-radius: 8px; padding: 7px 12px; font: 600 12px/1.2 system-ui, sans-serif; cursor: pointer; }
#n8n-ndv .ndv-hint button:hover { background: #fdece9; }
#n8n-ndv .ndv-main { background: #fff; display: flex; flex-direction: column; min-height: 0; }
#n8n-ndv .ndv-tabs { display: flex; gap: 2px; padding: 6px 12px 0; border-bottom: 1px solid #eceef4; flex: none; }
#n8n-ndv .ndv-tab { border: none; background: transparent; font: 600 12.5px/1.3 system-ui, sans-serif; color: #7c8296;
  padding: 8px 10px; cursor: pointer; border-bottom: 2px solid transparent; }
#n8n-ndv .ndv-tab.on { color: #ff6d5a; border-bottom-color: #ff6d5a; }
#n8n-ndv #ndv-params, #n8n-ndv #ndv-settings { overflow: auto; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
#n8n-ndv .ndv-field label { display: block; font: 600 11px/1.4 system-ui, sans-serif; color: #5b6273; margin-bottom: 4px; }
#n8n-ndv .ndv-field input[type="text"], #n8n-ndv .ndv-field input[type="number"], #n8n-ndv .ndv-field select, #n8n-ndv .ndv-field textarea {
  width: 100%; box-sizing: border-box; font: 12.5px/1.4 system-ui, sans-serif; padding: 7px 9px;
  border: 1px solid #d9dde7; border-radius: 7px; background: #fbfcfe; color: #2d2e3a; }
#n8n-ndv .ndv-field textarea { min-height: 74px; resize: vertical; }
#n8n-ndv .ndv-field textarea.code { font: 11.5px/1.5 ui-monospace, monospace; min-height: 130px; }
#n8n-ndv .ndv-kv { display: grid; grid-template-columns: 1fr 1.4fr; gap: 6px; margin-bottom: 6px; }
#n8n-ndv .ndv-add { align-self: flex-start; border: 1px dashed #c3c9d6; background: transparent; color: #5b6273;
  border-radius: 7px; padding: 6px 10px; font: 600 11.5px/1.2 system-ui, sans-serif; cursor: pointer; }
#n8n-ndv .ndv-check { display: flex; gap: 8px; align-items: center; font: 12.5px/1.4 system-ui, sans-serif; color: #3c4254; }
#n8n-ndv .ndv-note { font: 12px/1.6 system-ui, sans-serif; color: #7c8296; }

/* HUD + legend — plain chrome, overlaid on the canvas (no model entities). */
#n8n-hud { position: absolute; right: 12px; top: 10px; z-index: 4; font: 12px/1.3 ui-monospace, monospace;
  color: #5b6273; background: rgba(255,255,255,.86); border: 1px solid #dfe2ea; border-radius: 8px;
  padding: 5px 10px; pointer-events: none; }
#n8n-legend { position: absolute; left: 12px; bottom: 12px; z-index: 4; pointer-events: none;
  font: 11px/1.5 system-ui, sans-serif; color: #4b5162; background: rgba(255,255,255,.92);
  border: 1px solid #dfe2ea; border-radius: 9px; padding: 9px 12px; box-shadow: 0 4px 14px rgba(15,23,42,.1); }
#n8n-legend b { display: block; font: 600 9.5px/1.4 system-ui; letter-spacing: .6px; text-transform: uppercase;
  color: #8a91a2; margin-bottom: 5px; }
#n8n-legend .row { display: flex; align-items: center; gap: 8px; margin: 2px 0; }
#n8n-legend .swatch { width: 30px; height: 0; flex: none; }
#n8n-legend .main  { border-top: 2.5px solid #9aa2b1; }
#n8n-legend .ai    { border-top: 2.5px dashed #8b5cf6; }
#n8n-legend .yes   { border-top: 2.5px solid #16a34a; }
#n8n-legend .no    { border-top: 2.5px solid #dc2626; }

/* The AI port labels (Model / Memory / Tool) sit exactly where their dashed
   wires dive into the agent's bottom ports — a canvas-coloured text HALO. */
#n8n-canvas text.ai-port-label { fill: #4b5162; paint-order: stroke; stroke: #f4f5f8;
  stroke-width: 5px; stroke-linejoin: round; }

@media (prefers-color-scheme: dark) {
  #n8n-canvas text.ai-port-label { fill: #b9becd; stroke: #16171d; }
  #n8n-palette { background: #191a22; border-right-color: rgba(255,255,255,.08); }
  #n8n-palette .pal-item { background: #23242f; border-color: #33353f; color: #e7e9f0; }
  #n8n-palette .pal-item:hover { background: #2b2c39; border-color: #45485a; }
  #n8n-palette .pal-title { color: #7b8194; }
  #n8n-canvas { background-color: #16171d; background-image: radial-gradient(circle, #2a2c38 1.1px, transparent 1.1px); }
  #n8n-canvas .n8n-card { background: #262733; color: #e7e9f0; border-color: #363845; }
  #n8n-canvas .n8n-title { color: #eceef4; }
  #n8n-canvas .n8n-sub { color: #9298ab; }
  #n8n-canvas .n8n-card.dangling { background: #241d33; border-color: #6d4fa0; }
  #n8n-canvas .n8n-spin { background: #262733; }
  #n8n-hud, #n8n-legend { background: rgba(30,31,42,.9); border-color: #363845; color: #b9becd; }
  #n8n-legend b { color: #838aa0; }
  #n8n-runbar { background: rgba(30,31,42,.95); border-color: #363845; }
  #n8n-runbar .rb { background: #23242f; border-color: #3a3c49; color: #c9cdda; }
  #n8n-runbar .rb[aria-pressed="true"] { background: #3a2320; border-color: #ff6d5a; color: #ff8d7d; }
  #n8n-runbar #run-readout { color: #9298ab; }
  #n8n-runlog { background: rgba(24,25,33,.97); border-top-color: #363845; }
  #n8n-runlog .rl-head { border-bottom-color: #2c2e3a; color: #838aa0; }
  #n8n-runlog .rl-row { border-bottom-color: #23242f; color: #c9cdda; }
  #n8n-runlog .rl-name { color: #e7e9f0; }
  #n8n-ndv .ndv-modal { background: #1d1e28; }
  #n8n-ndv .ndv-pane { background: #191a22; border-color: #2c2e3a; }
  #n8n-ndv .ndv-pane.out { border-left-color: #2c2e3a; }
  #n8n-ndv .ndv-main { background: #23242f; }
  #n8n-ndv .ndv-tabs { border-bottom-color: #2c2e3a; }
  #n8n-ndv .ndv-item { background: #262733; border-color: #363845; }
  #n8n-ndv .ndv-item pre { color: #c9cdda; }
  #n8n-ndv .ndv-field input[type="text"], #n8n-ndv .ndv-field input[type="number"], #n8n-ndv .ndv-field select, #n8n-ndv .ndv-field textarea {
    background: #1c1d26; border-color: #3a3c49; color: #e7e9f0; }
  #n8n-ndv .ndv-check { color: #c9cdda; }
  #n8n-ndv .ndv-hint button { background: #23242f; }
}
`;

/** Hand the render the controller as of tick `_tick`. A CALL on purpose: Qwik's
 *  optimizer inlines a plain `const c = ctl.value` into derived-signal bindings
 *  on `ctl` alone, which never change — every readout froze at its first value.
 *  Through a call, `tick.value` is read in the component body, so each bump()
 *  re-renders the component and the controller's fields are read afresh. */
function at(ctl: N8nController | undefined, _tick: number): N8nController {
  return ctl!;
}

export default component$(() => {
  // The controller holds the instance, timers and closures: not data, so it
  // lives behind noSerialize. Its bump() ticks `tick`.
  const ctl = useSignal(() => noSerialize(new N8nController()));
  const tick = useSignal(0);
  const canvasHost = useSignal<HTMLElement>();
  const c = at(ctl.value, tick.value);

  useOnDocument('keydown', $((e: KeyboardEvent) => ctl.value?.onKeydown(e)));

  return (
    <>
      <style dangerouslySetInnerHTML={HOST_CSS} />
      <div id="n8n-stage">
        <div id="n8n-palette">
          <div class="pal-title">Add node</div>
          {c.palItems.map((p) => {
            const kind = p.kind;
            return (
              <button key={kind} class="pal-item" onClick$={() => ctl.value?.addNode(kind)}>
                <span class={'pal-dot' + (p.mono ? ' mono' : '')} style={{ background: p.bg }}>{p.glyph}</span>{p.sub}
              </button>
            );
          })}
        </div>

        <div id="n8n-canvas" ref={canvasHost} class={c.logsOpen ? 'logs-open' : undefined}
          onDblClick$={(e) => { if (canvasHost.value) ctl.value?.onDblClick(e.clientX, e.clientY, canvasHost.value); }}>
          <GrafloriaFlow defaultNodes={SPEC.nodes} defaultEdges={SPEC.edges as unknown as EdgeSpec[]}
            style={{ display: 'block', height: '100%', width: '100%' }}
            onInit$={$((instance: DiagramInstance) => {
              const ctrl = ctl.value!;
              ctrl.bump = () => { tick.value++; };
              ctrl.init(instance);
              markReady();
              tick.value++;
            })} />

          <div id="n8n-hud">{c.hudText}</div>

          <div id="n8n-legend">
            <b>Connections</b>
            <div class="row"><span class="swatch main"></span>data flow (main)</div>
            <div class="row"><span class="swatch ai"></span>ai · model / memory / tool</div>
            <div class="row"><span class="swatch yes"></span>if → true</div>
            <div class="row"><span class="swatch no"></span>if → false</div>
          </div>

          <div id="n8n-runbar">
            <button id="btn-run" title="Run the workflow from the trigger" disabled={c.runActive} onClick$={() => ctl.value?.onRun()}>▶ Test workflow</button>
            <button class="rb" disabled={!c.runActive} onClick$={() => ctl.value?.onPause()}>{c.paused ? '▶ continue' : '⏸ pause'}</button>
            <button class="rb" title="Advance one node (starts a paused run when idle)" disabled={c.stepDisabled} onClick$={() => ctl.value?.onStep()}>step ▸</button>
            <button class="rb" onClick$={() => ctl.value?.onReset()}>reset</button>
            <button class="rb" aria-pressed={c.logsOpen ? 'true' : 'false'} onClick$={() => ctl.value?.onToggleLogs()}>☰ logs</button>
            <button class="rb" aria-pressed={c.failArmed ? 'true' : 'false'} title="Simulate a 502 from the vendors API on the next run" onClick$={() => ctl.value?.onToggleFail()}>⚡ fail vendors</button>
            <span id="run-readout">{c.readout}</span>
          </div>

          <div id="n8n-runlog" hidden={!c.logsOpen}>
            <div class="rl-head">
              <span>Execution log</span>
              <span id="rl-status" class={c.logStatusCls}>{c.logStatusText}</span>
              <button id="rl-close" title="close" onClick$={() => ctl.value?.onCloseLogs()}>×</button>
            </div>
            <div class="rl-rows">
              {c.logRows.map((r, i) => (
                <div class="rl-row" key={i}>
                  <span class={'rl-dot' + (r.status === 'error' ? ' err' : '')}></span>
                  <span class="rl-name">{r.title}</span>
                  <span class="rl-sub">{r.sub}</span>
                  <span>{r.nIn} → {r.nOut} items</span>
                  <span class="rl-ms">{r.ms} ms{r.note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div id="n8n-ndv" hidden={!c.ndvOpen}>
        <div class="ndv-back" onClick$={() => ctl.value?.closeNDV()}></div>
        <div class="ndv-modal">
          <div class="ndv-head">
            <div class="hd-badge" style={{ background: c.ndvBadgeBg }}>{c.ndvBadge}</div>
            <div>
              <input id="ndv-name" aria-label="Node name" value={c.ndvName} onInput$={(_, el) => ctl.value?.onNdvName(el.value)} />
              <div class="hd-kind">{c.ndvKind}</div>
            </div>
            <button id="ndv-exec" disabled={c.runActive} onClick$={() => ctl.value?.onNdvExec()}>▶ Execute step</button>
            <button id="ndv-close" title="close (Esc)" onClick$={() => ctl.value?.closeNDV()}>×</button>
          </div>

          <div class="ndv-body">
            {/* INPUT pane */}
            <div class="ndv-pane">
              <div class="ndv-pane-head"><span>Input</span><span>{c.ndvInput.count}</span></div>
              <div class="ndv-items">
                {c.ndvInput.items ? (
                  c.ndvInput.items.map((it, i) => (
                    <div class="ndv-item" key={i}><pre>{c.json(it)}</pre></div>
                  ))
                ) : (
                  <div class="ndv-hint">
                    {c.ndvInput.hint}
                    {c.ndvInput.prevBtn && <button onClick$={() => ctl.value?.onExecutePrev()}>▶ Execute previous nodes</button>}
                  </div>
                )}
              </div>
            </div>

            {/* PARAMETERS / SETTINGS */}
            <div class="ndv-main">
              <div class="ndv-tabs">
                <button class={'ndv-tab' + (c.ndvTab === 'params' ? ' on' : '')} onClick$={() => ctl.value?.setTab('params')}>Parameters</button>
                <button class={'ndv-tab' + (c.ndvTab === 'settings' ? ' on' : '')} onClick$={() => ctl.value?.setTab('settings')}>Settings</button>
              </div>

              <div id="ndv-params" style={c.ndvTab === 'params' ? '' : 'display:none'}>
                {c.ndvFields.map((f, i) => {
                  const key = f.key ?? '';
                  if (f.type === 'note') return <p class="ndv-note" key={i}>{f.text}</p>;
                  if (f.type === 'select') {
                    const current = String(c.paramVal(key));
                    return (
                      <div class="ndv-field" key={i}>
                        <label>{f.label}</label>
                        <select data-param={key} onChange$={(_, el) => ctl.value?.onParamInput(key, el.value)}>
                          {f.options!.map((o) => <option key={o} value={o} selected={o === current}>{o}</option>)}
                        </select>
                      </div>
                    );
                  }
                  if (f.type === 'text') return (
                    <div class="ndv-field" key={i}>
                      <label>{f.label}</label>
                      <input type="text" data-param={key} value={c.paramVal(key)} onInput$={(_, el) => ctl.value?.onParamInput(key, el.value)} />
                    </div>
                  );
                  if (f.type === 'number') return (
                    <div class="ndv-field" key={i}>
                      <label>{f.label}</label>
                      <input type="number" data-param={key} value={c.paramVal(key)} onInput$={(_, el) => ctl.value?.onParamInput(key, el.value, true)} />
                    </div>
                  );
                  if (f.type === 'textarea') return (
                    <div class="ndv-field" key={i}>
                      <label>{f.label}</label>
                      <textarea class={f.code ? 'code' : undefined} data-param={key} value={c.paramVal(key)} onInput$={(_, el) => ctl.value?.onParamInput(key, el.value)} />
                    </div>
                  );
                  if (f.type === 'set-fields') return (
                    <div key={i}>
                      <div class="ndv-field"><label>Fields to set (name = value)</label></div>
                      {c.setFields.map((kv, j) => (
                        <div class="ndv-kv" key={j}>
                          <input type="text" value={kv.name} onInput$={(_, el) => ctl.value?.onSetFieldName(j, el.value)} />
                          <input type="text" value={kv.value} onInput$={(_, el) => ctl.value?.onSetFieldValue(j, el.value)} />
                        </div>
                      ))}
                      <button class="ndv-add" onClick$={() => ctl.value?.addSetField()}>+ Add field</button>
                    </div>
                  );
                  return null;
                })}
              </div>

              <div id="ndv-settings" style={c.ndvTab === 'settings' ? '' : 'display:none'}>
                <label class="ndv-check">
                  <input type="checkbox" checked={c.settingVal('retryOnFail')} onChange$={(_, el) => ctl.value?.onSettingToggle('retryOnFail', el.checked)} />
                  <span>Retry on fail — one retry, then give up</span>
                </label>
                <label class="ndv-check">
                  <input type="checkbox" checked={c.settingVal('continueOnFail')} onChange$={(_, el) => ctl.value?.onSettingToggle('continueOnFail', el.checked)} />
                  <span>Continue on fail — pass the error item downstream</span>
                </label>
                <label class="ndv-check">
                  <input type="checkbox" checked={c.settingVal('executeOnce')} onChange$={(_, el) => ctl.value?.onSettingToggle('executeOnce', el.checked)} />
                  <span>Execute once — consume only the first input item</span>
                </label>
                <div class="ndv-field">
                  <label>Notes</label>
                  <textarea value={c.notesVal} onInput$={(_, el) => ctl.value?.onNotesInput(el.value)} />
                </div>
              </div>
            </div>

            {/* OUTPUT pane */}
            <div class="ndv-pane out">
              <div class="ndv-pane-head"><span>Output</span><span>{c.ndvOutput.count}</span></div>
              <div class="ndv-items">
                {c.ndvOutput.items ? (
                  c.ndvOutput.items.map((it, i) => (
                    <div class="ndv-item" key={i}><pre>{c.json(it)}</pre></div>
                  ))
                ) : (
                  <div class="ndv-hint">{c.ndvOutput.hint}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});
