import { component$, $, noSerialize, sync$, useSignal, useStyles$, useVisibleTask$, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaFlow, type DiagramInstance } from '@grafloria/qwik';
import {
  ensureDiagramKitStyles, bindJoinGuidance,
  registerConnectionValidator, clearConnectionValidators, SetLinkLabelsCommand,
} from '@grafloria/element';
import { markReady } from '../ready';
import { mountCodeEditor } from '../code-editor';
import {
  TABLES, CARD_W, HEAD_H, JOIN_TYPES, tableOf, seedChecked, seedSpec, cardContent, tableNode,
  pillLabel, joinType, joinEquation, adoptJoin, alreadyJoined, generateSql,
} from './query-builder-data';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** A visual QUERY BUILDER — the Query Studio of a production BI tool, rebuilt on
 *  Grafloria's own idioms. Table cards with per-column ports on BOTH sides; drag
 *  a wire from a column and every other table's columns tint by join fit (the
 *  kit's bindJoinGuidance, scoring ported verbatim); the drop makes an undoable
 *  join with a type pill at its centre; and the SQL pane below writes itself on
 *  every model change. The connect gesture, its validation (no self-joins, no
 *  duplicate table pairs) and Delete/undo are all the engine's own — none of the
 *  magnet-circle hit-test hacks the original needed.
 *
 *  Qwik owns the shell (rail, inspector, zoom cluster, toast, SQL pane); the
 *  cards, ports and joins are the engine's, reached through onInit$'s instance. */

const SEED = seedSpec();
const BACKGROUND = { background: { variant: 'dots', gap: 20, size: 1.4, color: 'rgba(120,130,145,.38)' } } as any;
const INTERACTION = { portVisibility: 'always' };
const ZOOM_STEP = 1.2;

type Inspector = { kind: 'query' | 'join'; placed: string[]; id: string; eq: string; type: string };
interface Studio {
  setJoinType(linkId: string, type: string): void;
  zoom(to: 'out' | 'reset' | 'in' | 'fit'): void;
  dispose(): void;
}

export default component$(() => {
  useStyles$(QB_CSS);
  const canvas = useSignal<HTMLDivElement>();
  const studio = useSignal<NoSerialize<Studio>>();
  const sql = useSignal('');
  const placed = useSignal<string[]>([]);
  const inspector = useSignal<Inspector>({ kind: 'query', placed: [], id: '', eq: '', type: '' });
  const zoomPct = useSignal(100);
  const toast = useSignal({ msg: '', show: false });

  // The SQL reads as SQL: the gallery's editor colours it, read-only, mounted
  // in an empty host (Qwik leaves a childless element's inside alone). The
  // textarea stays canonical — its value is the `sql` signal.
  const sqlText = useSignal<HTMLTextAreaElement>();
  const editorHost = useSignal<HTMLDivElement>();
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    void mountCodeEditor(sqlText.value, { language: 'sql', readOnly: true, host: editorHost.value });
    cleanup(() => studio.value?.dispose());
  });

  const onInit = $((api: DiagramInstance) => {
    ensureDiagramKitStyles();
    const model: any = api.getModel();
    const engine: any = api.getEngine();
    const host = canvas.value!;
    const checked = seedChecked();

    // interactive wires route orthogonally ('step'), and invalid targets dim
    engine.setInteractionConfig({ connectionLineStyle: 'step', highlightValidTargets: true });
    for (const t of TABLES) model.getNode(t.id)?.setBehavior?.({ resizable: false });

    // ---- THE feature: live join guidance, from the kit ---------------------
    const guidance = bindJoinGuidance(api as any);

    for (const link of model.getLinks()) adoptJoin(link);

    // ---- refusal rules: self-joins and duplicate table pairs ---------------
    // Same-table is already the engine's own self-link rule; the pair rule is a
    // registered validator. Both dim the ports mid-drag AND stop the drop; the
    // toast makes the refusal loud (a console error is not a UX).
    clearConnectionValidators();
    let lastVeto: { msg: string; at: number } | null = null;
    const disposeValidator = registerConnectionValidator(({ sourceNode, targetNode }: any) => {
      if (!sourceNode || !targetNode) return true;
      if (alreadyJoined(model, sourceNode.id, targetNode.id)) {
        lastVeto = { msg: `${sourceNode.id} and ${targetNode.id} are already joined`, at: performance.now() };
        return lastVeto.msg;
      }
      return true;
    }) as unknown as () => void;
    let toastTimer = 0;
    const showToast = (msg: string) => {
      toast.value = { msg: `✕ ${msg}`, show: true };
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { toast.value = { ...toast.value, show: false }; }, 2200);
    };
    engine.eventBus.on('connection:cancel', () => {
      // read the drag state BEFORE the manager resets it (we are inside emit)
      const st = engine.getConnectionStateManager().getState();
      if (!st.targetPort) return;   // dropped on air = abandoned, not refused
      if (lastVeto && performance.now() - lastVeto.at < 400) showToast(lastVeto.msg);
      else if (st.rejectionMessage) showToast(st.rejectionMessage);
    });

    // The SQL also goes into the canonical textarea IN the event, as the JS page
    // writes it (the signal's re-render then finds it equal: a no-op). Qwik
    // patches the DOM a task later, and an editor rewrite that late lands in a
    // Monaco sticky-scroll race — "Illegal value for lineNumber", every run.
    const regenerate = () => {
      sql.value = generateSql(model, checked);
      if (sqlText.value) sqlText.value.value = sql.value;
    };
    const syncRail = () => { placed.value = TABLES.filter((t) => !!model.getNode(t.id)).map((t) => t.id); };

    // ---- the inspector: clicking a pill SELECTS its join (never cycles) ----
    let selectedJoin: any = null;
    const renderInspector = () => {
      const live = selectedJoin && model.getLink?.(selectedJoin.id) ? selectedJoin : null;
      selectedJoin = live;
      inspector.value = live
        ? { kind: 'join', placed: [], id: live.id, eq: joinEquation(live), type: joinType(live) }
        : { kind: 'query', placed: TABLES.filter((t) => !!model.getNode(t.id)).map((t) => t.id), id: '', eq: '', type: '' };
    };
    api.on('selection:change', ({ edges }: any) => {
      selectedJoin = (edges?.length === 1 && edges[0].getMetadata('qbJoin')) ? edges[0] : null;
      renderInspector();
    });

    // regenerate on every model change — including undo/redo of any of it.
    // settleLink: a link drawn onto a freshly PLACED table can pass the cull
    // query yet stay unpainted until a real geometry change marks it dirty. Two
    // frames later, re-assert its points — an honest change:points — so the
    // renderer routes and mounts it. Idempotent for links that already paint.
    const settleLink = (link: any) => {
      api.renderNow();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (link?.points?.length) link.setPoints?.([...link.points]);
        api.renderNow();
      }));
    };
    model.on?.('link:added', (link: any) => { adoptJoin(link); settleLink(link); regenerate(); renderInspector(); });
    model.on?.('link:removed', () => { regenerate(); renderInspector(); });
    model.on?.('node:added', () => { regenerate(); syncRail(); });
    model.on?.('node:removed', () => { regenerate(); syncRail(); renderInspector(); });
    for (const ev of ['command:executed', 'command:undone', 'command:redone']) {
      engine.eventBus.on(ev, () => { api.renderNow(); regenerate(); renderInspector(); });
    }

    // ---- column checkboxes: real state, and they never start a drag --------
    // Plain capture-phase listeners: the press must stop BEFORE the engine
    // (inside this element) sees it, synchronously — a lazily loaded Qwik
    // handler would arrive too late to stop anything.
    const checkOf = (e: Event) => (e.target instanceof Element ? e.target.closest('.qb-check') : null);
    const stopForCheck = (e: Event) => { if (checkOf(e)) e.stopPropagation(); };
    host.addEventListener('pointerdown', stopForCheck, true);
    host.addEventListener('mousedown', stopForCheck, true);
    const refreshCard = (tableId: string) => {
      const node = model.getNode(tableId);
      if (!node) return;
      node.setMetadata('html', { content: cardContent(tableOf(tableId)!, checked.get(tableId)!), interactive: true, padding: 0 });
      api.renderNow();
    };
    host.addEventListener('click', (e) => {
      const chk = checkOf(e);
      if (!chk) return;
      e.stopPropagation();
      const group = chk.closest('[data-node-id]');
      const t = tableOf(group?.getAttribute('data-node-id') ?? '');
      if (!group || !t) return;
      const set = checked.get(t.id)!;
      if (chk.classList.contains('qb-all')) {
        if (set.size === t.columns.length) set.clear();
        else for (const c of t.columns) set.add(c.name);
      } else {
        const col = t.columns[[...group.querySelectorAll('.axk-row')].indexOf(chk.closest('.axk-row')!)];
        if (!col) return;
        if (set.has(col.name)) set.delete(col.name); else set.add(col.name);
      }
      refreshCard(t.id);
      regenerate();
    }, true);

    // ---- the rail's drop: one placement per table ---------------------------
    // dragover/drop must preventDefault (and read dataTransfer) synchronously.
    host.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'; });
    host.addEventListener('drop', (e) => {
      e.preventDefault();
      const t = tableOf(e.dataTransfer!.getData('text/plain'));
      if (!t || model.getNode(t.id)) return;
      const world = api.viewport.clientToWorld(e.clientX, e.clientY, api.container.getBoundingClientRect());
      model.addNode(tableNode(t, { x: world.x - CARD_W / 2, y: world.y - HEAD_H / 2 }, checked.get(t.id)!));
      api.renderNow();
      regenerate();
      syncRail();
    });

    studio.value = noSerialize<Studio>({
      async setJoinType(linkId, type) {
        await engine.commandManager.execute(new SetLinkLabelsCommand(linkId, [pillLabel(type)] as any));
        api.renderNow();
        regenerate();
        renderInspector();
      },
      zoom(to) {
        const vp = api.viewport;
        if (to === 'fit') api.fitView();
        else vp.setZoom(to === 'reset' ? 1 : to === 'in' ? vp.getZoom() * ZOOM_STEP : vp.getZoom() / ZOOM_STEP);
        api.renderNow();
      },
      dispose() {
        guidance.dispose();
        disposeValidator?.();
        clearConnectionValidators();
        clearTimeout(toastTimer);
      },
    });

    // the zoom readout follows the camera
    const paintZoom = () => { zoomPct.value = Math.round(api.viewport.getZoom() * 100); };
    api.viewport.onChange(paintZoom);

    regenerate();
    syncRail();
    renderInspector();
    api.fitView?.(40);
    api.renderNow();
    paintZoom();
    markReady();
  });

  return (
    <div id="qb-shell">
      <div id="qb-body">
        <div id="qb-rail">
          <div class="qb-rail-title">Tables</div>
          {TABLES.map((t) => {
            const isPlaced = placed.value.includes(t.id);
            return (
              // sync$: dataTransfer is only writable DURING dragstart; a lazily
              // loaded handler would set the payload after the drag has begun.
              <div key={t.id} class={'qb-chip' + (isPlaced ? ' placed' : '')} data-table={t.id}
                draggable={!isPlaced /* a boolean: Qwik sets it as the property */}
                onDragStart$={sync$((e: DragEvent, el: HTMLElement) => {
                  if (el.getAttribute('draggable') === 'false') { e.preventDefault(); return; }
                  e.dataTransfer!.setData('text/plain', el.dataset.table || '');
                  e.dataTransfer!.effectAllowed = 'copy';
                })}>
                <span class="qb-chip-n">{t.id}</span><span class="qb-chip-c">{t.columns.length} cols</span>
              </div>
            );
          })}
        </div>
        <div id="qb-canvas" ref={canvas}>
          <GrafloriaFlow defaultNodes={SEED.nodes as never} defaultEdges={SEED.edges as never}
            interaction={INTERACTION} plugins={BACKGROUND} onInit$={onInit} />
          <div id="qb-toast" class={toast.value.show ? 'show' : ''}>{toast.value.msg}</div>
          {/* zoom cluster (the visio-editor convention, bottom-right) */}
          <div id="qb-zoom">
            <button title="Zoom out" onClick$={() => studio.value?.zoom('out')}>−</button>
            <button id="qb-zoom-pct" title="Zoom level — click to reset" onClick$={() => studio.value?.zoom('reset')}>{zoomPct.value}%</button>
            <button title="Zoom in" onClick$={() => studio.value?.zoom('in')}>＋</button>
            <button title="Fit the query in view" onClick$={() => studio.value?.zoom('fit')}>⤢</button>
          </div>
        </div>
        <div id="qb-inspector">
          {inspector.value.kind === 'query' ? (
            <>
              <h3>Query</h3>
              <div class="qb-hint">Drag tables in from the left, wire column to column, tick the columns you want.<br /><br />Click a join's pill to edit its type here.</div>
              <ul class="qb-placed-list">{inspector.value.placed.map((id) => <li key={id}>▦ {id}</li>)}</ul>
            </>
          ) : (
            <>
              <h3>Join</h3>
              <div class="qb-join-eq">{inspector.value.eq}</div>
              <div class="qb-types">
                {JOIN_TYPES.map((t) => (
                  <button key={t} class={'qb-type' + (t === inspector.value.type ? ' on' : '')} data-type={t}
                    onClick$={() => studio.value?.setJoinType(inspector.value.id, t)}>{t}</button>
                ))}
              </div>
              <p class="qb-hint" style={{ marginTop: '10px' }}>Delete/Backspace removes this join. Ctrl/⌘+Z undoes any of it.</p>
            </>
          )}
        </div>
      </div>
      {/* SQL preview pane — the textarea stays canonical; Monaco mounts over it. */}
      <div id="qb-sql">
        <div class="qb-sql-head">SQL preview — regenerates on every change</div>
        <div class="qb-sql-body">
          <div ref={editorHost} style={{ display: 'none', height: '100%' }} />
          <textarea id="qb-sql-text" ref={sqlText} aria-label="SQL preview" spellcheck={false} readOnly value={sql.value} />
        </div>
      </div>
    </div>
  );
});

// The JS page's stylesheet, verbatim — plus the gallery shell's light tokens and
// box model, which the JS page inherits from demo.css and this app does not.
const QB_CSS = `
#qb-shell { --gf-bg: #FCFCFF; --gf-panel: #FFFFFF; --gf-ink: #232A3D; --gf-mut: #5A6478; --gf-line: #E3E7F2;
  height: 100vh; -webkit-font-smoothing: antialiased; }
#qb-shell * { box-sizing: border-box; }
#qb-shell { display: flex; flex-direction: column; min-height: 0; }
#qb-body { display: flex; flex: 1; min-height: 0; }
#qb-rail {
  flex: 0 1 190px; min-width: 140px; border-right: 1px solid var(--gf-line, #e5e7eb);
  background: var(--gf-panel, #fff); padding: 10px; overflow-y: auto;
  font: 12px ui-sans-serif, system-ui, sans-serif;
}
#qb-rail .qb-rail-title { font-weight: 700; color: var(--gf-mut, #6b7280);
  text-transform: uppercase; font-size: 10px; letter-spacing: .6px; margin: 2px 0 8px; }
.qb-chip {
  display: flex; align-items: center; gap: 8px; padding: 8px 10px; margin-bottom: 6px;
  border: 1px solid var(--gf-line, #e5e7eb); border-radius: 8px; cursor: grab;
  background: var(--gf-bg, #fff); color: var(--gf-ink, #1e2436); user-select: none;
}
.qb-chip:hover { border-color: #2080e8; }
.qb-chip .qb-chip-n { font-weight: 600; flex: 1; }
.qb-chip .qb-chip-c { color: var(--gf-mut, #6b7280); font-size: 10px; }
.qb-chip.placed { opacity: .38; cursor: default; }
.qb-chip.placed:hover { border-color: var(--gf-line, #e5e7eb); }
#qb-canvas { flex: 1 1 auto; min-width: 260px; position: relative; --qb-accent: #2080e8; }
#qb-inspector {
  flex: 0 1 210px; min-width: 160px; border-left: 1px solid var(--gf-line, #e5e7eb);
  background: var(--gf-panel, #fff); padding: 12px; overflow-y: auto;
  font: 12px ui-sans-serif, system-ui, sans-serif; color: var(--gf-ink, #1e2436);
}
@media (max-width: 1280px) { #qb-inspector { display: none; } }
#qb-inspector h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .6px;
  color: var(--gf-mut, #6b7280); margin: 0 0 8px; }
#qb-inspector .qb-join-eq { font: 12px ui-monospace, Menlo, monospace; padding: 8px;
  background: rgba(32,128,232,.08); border-radius: 6px; margin-bottom: 10px; word-break: break-all; }
#qb-inspector .qb-types { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
#qb-inspector .qb-type {
  padding: 6px 0; border: 1px solid var(--gf-line, #e5e7eb); border-radius: 6px;
  background: transparent; color: var(--gf-ink, #1e2436); cursor: pointer;
  font: 11px/1 ui-sans-serif, system-ui, sans-serif; font-weight: 700;
}
#qb-inspector .qb-type:hover { border-color: #2080e8; color: #2080e8; }
#qb-inspector .qb-type.on { background: #2080e8; border-color: #2080e8; color: #fff; }
#qb-inspector .qb-hint { color: var(--gf-mut, #6b7280); line-height: 1.5; }
#qb-inspector .qb-placed-list { margin: 8px 0 0; padding: 0; list-style: none; }
#qb-inspector .qb-placed-list li { padding: 3px 0; font-family: ui-monospace, Menlo, monospace; }
/* SQL preview pane — the textarea stays canonical; Monaco mounts over it. */
#qb-sql { flex: 0 0 148px; border-top: 1px solid var(--gf-line, #e5e7eb);
  display: flex; flex-direction: column; min-height: 0; background: var(--gf-panel, #fff); }
#qb-sql .qb-sql-head { padding: 5px 12px; font: 10px ui-sans-serif, system-ui, sans-serif;
  font-weight: 700; text-transform: uppercase; letter-spacing: .6px;
  color: var(--gf-mut, #6b7280); border-bottom: 1px solid var(--gf-line, #e5e7eb); flex: none; }
#qb-sql .qb-sql-body { flex: 1; min-height: 0; position: relative; }
#qb-sql-text { width: 100%; height: 100%; border: 0; resize: none; outline: none;
  font: 12.5px/1.5 ui-monospace, Menlo, monospace; padding: 8px 12px; box-sizing: border-box;
  background: transparent; color: var(--gf-ink, #1e2436); }

/* ===== The Query Studio card skin — OVER the kit's .axk-* classes ===== */
#qb-canvas .axk-entity { background: #fff; border: 1px solid #c7cfdd; border-radius: 10px;
  box-shadow: 0 4px 14px rgba(30,40,70,.10); font: 13px/1.45 ui-sans-serif, system-ui, sans-serif; }
#qb-canvas .axk-entity-head { background: var(--qb-accent); color: #fff; font-weight: 700;
  font-size: 13px; padding: 8px 12px; height: 34px; box-sizing: border-box;
  display: flex; align-items: center; gap: 8px; text-transform: none; letter-spacing: 0; }
#qb-canvas .axk-row { display: flex; align-items: center; gap: 8px; padding: 5px 12px;
  height: 28px; box-sizing: border-box; border-top: 1px solid #eef1f7; font-size: 13px; }
/* no zebra, no hover tint (the guidance tiers own the row backgrounds) */
#qb-canvas .axk-row:not([class*="axk-match"]):not(.qb-on):hover { background: transparent; }
#qb-canvas .axk-col { flex: 1; color: #22314f; }
#qb-canvas .qb-badge { font-size: 10px; font-weight: 700; border-radius: 4px;
  padding: 1px 5px; flex: 0 0 auto; line-height: 1.3; }
#qb-canvas .qb-badge.pk { background: #fde68a; color: #92600a; }
#qb-canvas .qb-badge.fk { background: #bfdbfe; color: #1e40af; }
/* checkboxes (structured spans — the html layer allows no form controls) */
#qb-canvas .qb-check { width: 14px; height: 14px; flex: 0 0 auto; box-sizing: border-box;
  border: 1.5px solid #b6c2d6; border-radius: 4px; background: #fff; cursor: pointer; position: relative; }
#qb-canvas .qb-check.on { background: var(--qb-accent); border-color: var(--qb-accent); }
#qb-canvas .qb-check.on::after { content: ''; position: absolute; left: 3.5px; top: 0.5px;
  width: 4px; height: 7px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
#qb-canvas .qb-head-check { border-color: rgba(255,255,255,.85); background: transparent; }
#qb-canvas .qb-head-check.on { background: #fff; border-color: #fff; }
#qb-canvas .qb-head-check.on::after { border-color: var(--qb-accent); }
/* checked-row fill */
#qb-canvas .axk-row.qb-on, #qb-canvas .axk-row.qb-on:hover {
  background: color-mix(in srgb, var(--qb-accent) 8%, #fff); }
/* guidance tiers must WIN over the skin's row fills (same values as the kit
   stylesheet — re-scoped here so #qb-canvas rules cannot out-rank them) */
#qb-canvas .axk-row.axk-match-top, #qb-canvas .axk-row.axk-match-top:hover {
  background: #fffbeb; box-shadow: inset 4px 0 0 #f59e0b, inset 0 0 0 1px #fcd34d; }
#qb-canvas .axk-row.axk-match-top .axk-col { font-weight: 800; color: #92600a; }
#qb-canvas .axk-row.axk-match-good, #qb-canvas .axk-row.axk-match-good:hover {
  background: #dcfce7; box-shadow: inset 4px 0 0 #16a34a; }
#qb-canvas .axk-row.axk-match-good .axk-col { font-weight: 700; color: #14532d; }
#qb-canvas .axk-row.axk-match-ok, #qb-canvas .axk-row.axk-match-ok:hover {
  background: #dbeafe; box-shadow: inset 4px 0 0 #2563eb; }
#qb-canvas .axk-row.axk-match-none { opacity: .4; }
/* selection = a RING on the card, accent (the kit hides the node rect) */
#qb-canvas g.node-group[data-selected="true"] .axk-entity {
  border-color: var(--qb-accent);
  box-shadow: 0 0 0 2px var(--qb-accent), 0 4px 14px rgba(30,40,70,.10); }
/* per-column ports: 9px accent dots with a white 2px ring, never clipped —
   they are SVG glyphs BESIDE the card, not children of its overflow box */
#qb-canvas circle[data-port-id] { fill: var(--qb-accent); stroke: #fff; stroke-width: 2; }
#qb-canvas circle[data-port-invalid] { fill: #dc2626 !important; stroke: #fff !important; }
/* join pill: accent bg, white 2px border, radius 999, 10px/800 uppercase */
#qb-canvas .link-label-bg { fill: var(--qb-accent); stroke: #fff; stroke-width: 2; rx: 999px;
  filter: drop-shadow(0 1px 4px rgba(20,25,40,.25)); }
#qb-canvas .link-label-group text { fill: #fff; font-weight: 800; font-size: 10px;
  letter-spacing: .5px; text-transform: uppercase; cursor: pointer; }
/* refusal toast — a refused join must be VISIBLE, never a console error */
#qb-toast { position: absolute; left: 50%; bottom: 76px; transform: translateX(-50%);
  background: #b42318; color: #fff; padding: 6px 14px; border-radius: 8px;
  font: 12px ui-sans-serif, system-ui, sans-serif; opacity: 0; transition: opacity .15s;
  pointer-events: none; z-index: 40; white-space: nowrap; }
#qb-toast.show { opacity: 1; }
/* zoom cluster (the visio-editor convention, bottom-right; 34px clears the fold) */
#qb-zoom { position: absolute; right: 10px; bottom: 34px; z-index: 25;
  display: flex; align-items: center; gap: 2px; padding: 3px;
  background: var(--gf-panel, #fff); border: 1px solid var(--gf-line, #e5e7eb);
  border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.08);
  font: 12px ui-sans-serif, system-ui, sans-serif; }
#qb-zoom button { padding: 4px 8px; border: 0; border-radius: 6px; background: transparent;
  color: var(--gf-ink, #1e2436); cursor: pointer; font: inherit; }
#qb-zoom button:hover { background: rgba(32,128,232,.1); color: #2080e8; }
#qb-zoom #qb-zoom-pct { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
`;
