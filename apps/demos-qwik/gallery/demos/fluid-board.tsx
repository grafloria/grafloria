import { component$, $, noSerialize, useSignal, useStyles$, useOnWindow, type NoSerialize } from '@builder.io/qwik';
import { GrafloriaDashboard } from '@grafloria/qwik';
import type { DashboardHandle, DashboardWidgetSpec, SectionCaption } from '@grafloria/element';
import { markReady } from '../ready';

// THE FLUID BOARD. No width in options → mode 'fluid': the board is 100% of its
// element at zoom 1 and GROWS by default. The switches are PROPS — a state
// change is one handle call on the live board, never a remount: sizing 'fit'
// keeps the height and squeezes rows (and REFUSES an add once full); layout
// 'split' turns the grid into the DevExpress-style splitter tree. The board is
// the JS page's: four KPIs, charts, a SECTION with a kit-painted caption
// ("Operations") and a TAB CONTAINER down the right.
const WIDGETS: DashboardWidgetSpec[] = [
  { id: 'rev',  kind: 'kpi',   span: 2, rows: 1, x: 0, y: 0, data: { label: 'Revenue',   value: '$6.81M', delta: 12.4, spark: [3.9, 4.4, 4.1, 5.2, 5.9, 6.8] } },
  { id: 'cust', kind: 'kpi',   span: 2, rows: 1, x: 2, y: 0, data: { label: 'Customers', value: '1,284',  delta: 8.1,  spark: [980, 1010, 1090, 1150, 1210, 1284] } },
  { id: 'win',  kind: 'kpi',   span: 2, rows: 1, x: 4, y: 0, data: { label: 'Win rate',  value: '27.4%', delta: -1.2, spark: [29, 28.5, 28, 27.9, 27.6, 27.4] } },
  { id: 'nps',  kind: 'kpi',   span: 2, rows: 1, x: 6, y: 0, data: { label: 'NPS',       value: '61',    delta: 4.0,  spark: [52, 54, 57, 58, 60, 61] } },
  { id: 'trend', kind: 'line', span: 6, rows: 3, x: 0, y: 1, title: 'Revenue vs target',
    data: { series: [{ name: 'Revenue', values: [4.1, 4.4, 4.9, 5.2, 5.9, 6.8] }, { name: 'Target', values: [4.0, 4.5, 5.0, 5.5, 6.0, 6.5] }], labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'] } },
  { id: 'mix',  kind: 'donut', span: 3, rows: 3, x: 6, y: 1, title: 'Revenue by region',
    data: { slices: [{ label: 'North America', value: 2860 }, { label: 'EMEA', value: 1920 }, { label: 'APAC', value: 1340 }, { label: 'LATAM', value: 690 }] } },
  { id: 'reps', kind: 'table', span: 5, rows: 3, x: 0, y: 4, title: 'Top reps',
    data: { columns: ['Rep', 'Region', 'Closed', 'Quota'], rows: [['A. Farouk', 'EMEA', 412000, '118%'], ['J. Park', 'APAC', 388000, '104%'], ['M. Silva', 'LATAM', 301000, '96%'], ['R. Chen', 'NA', 297000, '91%']] } },
  { id: 'funnel', kind: 'funnel', span: 4, rows: 3, x: 5, y: 4, title: 'Pipeline',
    data: { stages: [{ label: 'Leads', value: 1840 }, { label: 'Qualified', value: 920 }, { label: 'Proposal', value: 410 }, { label: 'Won', value: 188 }] } },
  // A SECTION with a caption painted by the kit: its own grid, a 44 px band
  // reserved above its children. `setCaption` restyles it live.
  { id: 'ops', title: 'Operations', span: 9, rows: 1, x: 0, y: 7, columns: 9,
    caption: { subtitle: 'live since 08:00', description: 'A section: its own grid inside the board. Drag a KPI in or out; the band is the kit\'s.', actions: [{ id: 'max', label: 'Maximize', icon: '⤢' }, { id: 'menu', label: 'More', icon: '⋯' }] },
    widgets: [
      { id: 'orders', kind: 'kpi', span: 4, rows: 1, data: { label: 'Orders today', value: '312', delta: 5.2 } },
      { id: 'churn',  kind: 'kpi', span: 4, rows: 1, data: { label: 'Churn', value: '1.9%', delta: -0.3 } },
    ] },
  // A TAB CONTAINER down the right: `layout: 'tabs'` makes every child that
  // carries `widgets` a PAGE, one visible at a time.
  { id: 'side', title: 'Side panel', span: 3, rows: 8, x: 9, y: 0, layout: 'tabs', active: 'p-filters', widgets: [
    { id: 'p-filters', title: 'Filters', columns: 3, widgets: [
      { id: 'f-region', kind: 'kpi', span: 3, rows: 4, x: 0, y: 0, data: { label: 'Region', value: 'EMEA' } },
      { id: 'f-period', kind: 'kpi', span: 3, rows: 4, x: 0, y: 4, data: { label: 'Period', value: 'Q3' } } ] },
    { id: 'p-alerts', title: 'Alerts', columns: 3, widgets: [
      { id: 'a-open', kind: 'kpi', span: 3, rows: 8, x: 0, y: 0, data: { label: 'Open alerts', value: '3', delta: -2.0 } } ] },
    { id: 'p-notes', title: 'Notes', columns: 3, widgets: [
      { id: 'n-last', kind: 'kpi', span: 3, rows: 8, x: 0, y: 0, data: { label: 'Last edit', value: '08:12' } } ] },
  ] },
] as DashboardWidgetSpec[];

// The board's own callbacks are OPTIONS — plain functions the kit calls. A
// module-level function cannot reach the component's signals, so each one
// re-dispatches as a window event the component listens to (useOnWindow).
const emit = (type: string, detail: unknown) => window.dispatchEvent(new CustomEvent(type, { detail }));
const OPTIONS = {
  columns: 12,
  gap: 10,
  onCaptionAction: (sectionId: string, actionId: string) => emit('fbcaptionaction', { sectionId, actionId }),
  onSelect: (id: string | undefined) => emit('fbselect', id),
  onTabChange: (containerId: string) => emit('fbselect', containerId),
};

type CaptionMode = 'default' | 'tab' | 'center' | 'hover' | 'none';
const CAPTIONS: Record<CaptionMode, SectionCaption> = {
  default: (WIDGETS.find((w) => w.id === 'ops') as { caption: SectionCaption }).caption,
  tab: { text: 'Operations', position: 'tab', icon: '▤' },
  center: { align: 'center', font: { size: 11, weight: 700, transform: 'uppercase' }, background: '#e8ecfb', border: '1px solid #3b52d9' },
  hover: { show: 'hover', actions: [{ id: 'max', label: 'Maximize', icon: '⤢' }] },
  none: false,
} as Record<CaptionMode, SectionCaption>;
const CAPTION_SAYS: Record<CaptionMode, string> = {
  default: 'caption: a 44 px band with a subtitle, an ⓘ and two actions — a press on it selects the section',
  tab: 'caption as a tab: the same band sized to its text, a chip at the section\'s top-left corner — it reserves its height inside the section, so it never lies over the widget above',
  center: 'caption centred, uppercase, with its own fill and rule — typography and box are options',
  hover: 'caption on hover only: it overlays the content, nothing reserved',
  none: 'no caption: the section is a bare slab again — Ctrl/⌘-Z brings it back',
};

type Drag = 'anywhere' | 'caption' | 'grip';
type GripPos = 'left' | 'center' | 'right';
type GripPlace = 'inside' | 'outside';
interface Spec { id: string; title?: string; layout?: string; widgets?: Spec[] }
interface Target { id: string; name: string; mode: string }

/** THE LAYOUT INSIDE THE SELECTED CONTAINER: a section → itself; a tab group →
 *  its active page; a widget inside a page or a section → that container; a
 *  widget of the view → nothing (the view has the Grid / Split buttons). */
function targetOf(H: DashboardHandle, selected: string | undefined): Target | null {
  if (!selected) return null;
  const locate = (id: string): [Spec, Spec | null] | null => {
    const walk = (ws: Spec[] | undefined, parent: Spec | null): [Spec, Spec | null] | null => {
      for (const w of ws ?? []) { if (w.id === id) return [w, parent]; const r = walk(w.widgets, w); if (r) return r; }
      return null;
    };
    return walk(H.toJSON().views[0].widgets as Spec[], null);
  };
  const nameOf = (s: Spec, parent: Spec | null) =>
    parent && parent.layout === 'tabs' ? `${parent.title ?? parent.id} › ${s.title ?? s.id}` : s.title ?? s.id;
  const hit = locate(selected);
  if (!hit) return null;
  const [s, parent] = hit;
  let t: { id: string; name: string } | null = null;
  if (s.widgets && s.layout === 'tabs') {
    const pg = H.getActiveTab(s.id);
    const ps = pg ? s.widgets.find((p) => p.id === pg) : undefined;
    t = ps ? { id: ps.id, name: nameOf(ps, s) } : null;
  } else if (s.widgets) {
    t = { id: s.id, name: nameOf(s, parent) };
  } else if (parent && parent.widgets) {
    t = { id: parent.id, name: nameOf(parent, locate(parent.id)?.[1] ?? null) };
  }
  return t ? { ...t, mode: H.getLayout(t.id) } : null;
}

const CSS = `
  .fb-page { height: 100vh; display: flex; flex-direction: column; }
  .fb-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid rgba(127,127,127,.24); font: 500 12.5px/1.3 system-ui, sans-serif; }
  .fb-bar button { font: inherit; padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; cursor: pointer; white-space: nowrap; }
  .fb-bar button[aria-pressed="true"] { background: rgba(59, 82, 217, .12); border-color: #3b52d9; }
  .fb-bar button:disabled { opacity: .45; cursor: default; }
  .fb-bar .fb-sep { width: 1px; height: 18px; background: rgba(127,127,127,.3); margin: 0 4px; }
  .fb-bar .fb-lab { display: inline-flex; align-items: center; gap: 6px; }
  .fb-bar #fb-caption { width: 190px; }
  .fb-bar #fb-sel-lab { white-space: nowrap; }
  .fb-bar #fb-sel-lab b { margin-right: 6px; }
  .fb-bar select { font: inherit; padding: 4px 6px; border-radius: 6px; border: 1px solid rgba(127,127,127,.35); background: transparent; color: inherit; }
  .fb-bar select:disabled { opacity: .45; }
  .fb-bar .fb-msg { flex: 1 1 100%; min-height: 1.3em; opacity: .75; font-variant-numeric: tabular-nums; }
  .fb-bar .fb-msg.refused { color: #b3261e; opacity: 1; }
  .fb-stage { flex: 1; min-height: 480px; width: 100%; }
  .fb-stage.narrow { width: 60%; }
`;

/** The DEFAULT mode of dashboard(): no width authored, so the board is 100% of
 *  its container at zoom 1. Narrow the container and it follows; FIT is
 *  bounded and refuses an add when full; Split is the splitter tree; Drag
 *  picks the handle; Caption restyles the section's kit-painted band; Inside
 *  switches the layout inside the selected section or tab page. */
export default component$(() => {
  useStyles$(CSS);
  const handle = useSignal<NoSerialize<DashboardHandle>>();
  const layout = useSignal<'grid' | 'split'>('grid');
  const sizing = useSignal<'fit' | 'grow'>('grow');
  const narrow = useSignal(false);
  const drag = useSignal<Drag>('anywhere');
  const gripPos = useSignal<GripPos>('left');
  const gripPlace = useSignal<GripPlace>('inside');
  const caption = useSignal<CaptionMode>('default');
  const selected = useSignal<string | undefined>(undefined);
  const target = useSignal<Target | null>(null);
  const msg = useSignal('');
  const refused = useSignal(false);
  const added = useSignal(0);

  const say = $((text: string, isRefused = false) => { msg.value = text; refused.value = isRefused; });

  // The kit's selection / tab / caption-action callbacks, bridged from OPTIONS.
  useOnWindow('fbselect', $((e: Event) => {
    selected.value = (e as CustomEvent<string | undefined>).detail;
    const H = handle.value;
    target.value = H ? targetOf(H, selected.value) : null;
  }));
  useOnWindow('fbcaptionaction', $((e: Event) => {
    const { sectionId, actionId } = (e as CustomEvent<{ sectionId: string; actionId: string }>).detail;
    msg.value = `caption action "${actionId}" on ${sectionId} — the app's to implement (maximize, a menu, remove…)`;
    refused.value = false;
  }));

  const applyDrag = $(() => {
    const grip = drag.value === 'grip';
    handle.value?.setDragHandle(grip ? { grip: true, position: gripPos.value, placement: gripPlace.value } : drag.value === 'caption');
    say(grip
      ? `drag by grip: a ${gripPlace.value} grip on the ${gripPos.value} is the only handle — the header and body are content`
      : drag.value === 'caption' ? 'drag by caption: a widget moves only from its caption strip — the body scrolls and clicks as content' : 'drag anywhere: the whole card is the handle');
  });

  const split = layout.value === 'split';
  return (
    <div class="fb-page">
      <div class="fb-bar">
        <button id="fb-narrow" aria-pressed={(narrow.value) ? 'true' : 'false'} title="Make the container 60% wide — the board follows"
          onClick$={() => { narrow.value = !narrow.value; }}>Narrow container</button>
        <span class="fb-sep" />
        <button id="fb-fit" aria-pressed={(split || sizing.value === 'fit') ? 'true' : 'false'} disabled={split}
          onClick$={() => { sizing.value = 'fit'; say('fit: the board keeps its height, rows squeeze — bounded'); }}>Fit</button>
        <button id="fb-grow" aria-pressed={(!split && sizing.value === 'grow') ? 'true' : 'false'} disabled={split}
          onClick$={() => { sizing.value = 'grow'; say('grow: rows keep 130 px, the board extends — wheel to scroll'); }}>Grow</button>
        <span class="fb-sep" />
        <button id="fb-grid" aria-pressed={(!split) ? 'true' : 'false'} title="The cell grid: columns, spans, push"
          onClick$={() => { layout.value = 'grid'; say('grid: cells, spans and push — the gridstack model'); }}>Grid</button>
        <button id="fb-split" aria-pressed={(split) ? 'true' : 'false'} title="The splitter tree: the board is always covered, dividers are percentages"
          onClick$={() => { layout.value = 'split'; say('split: the board is always covered — drag a divider (a percentage), drag a widget onto an edge, add one and it halves the largest'); }}>Split</button>
        <span class="fb-sep" />
        <label class="fb-lab" title="Where a widget can be grabbed: anywhere on the card, only its caption strip, or only a painted grip">Drag
          <select id="fb-drag" value={drag.value} onChange$={(_, el) => { drag.value = el.value as Drag; return applyDrag(); }}>
            <option value="anywhere">anywhere</option><option value="caption">by caption</option><option value="grip">by grip</option>
          </select>
        </label>
        <select id="fb-grip-pos" disabled={drag.value !== 'grip'} value={gripPos.value} title="Where the grip sits along the top edge"
          onChange$={(_, el) => { gripPos.value = el.value as GripPos; return applyDrag(); }}>
          <option value="left">left</option><option value="center">center</option><option value="right">right</option>
        </select>
        <select id="fb-grip-place" disabled={drag.value !== 'grip'} value={gripPlace.value} title="Inside the header band, or a tab above the card"
          onChange$={(_, el) => { gripPlace.value = el.value as GripPlace; return applyDrag(); }}>
          <option value="inside">inside</option><option value="outside">outside</option>
        </select>
        <span class="fb-sep" />
        <label class="fb-lab" title="The Operations section's caption, painted by the kit — handle.setCaption() switches it live">Caption
          <select id="fb-caption" value={caption.value} onChange$={(_, el) => {
            const mode = el.value as CaptionMode;
            caption.value = mode;
            handle.value?.setCaption('ops', CAPTIONS[mode]);
            return say(CAPTION_SAYS[mode]);
          }}>
            <option value="default">subtitle · ⓘ · actions</option><option value="tab">a tab at the corner</option>
            <option value="center">centred · uppercase</option><option value="hover">on hover only</option><option value="none">none</option>
          </select>
        </label>
        <span class="fb-sep" />
        <label class="fb-lab" id="fb-sel-lab" title="The layout INSIDE the selected container — a section, or a tab group's page">Inside <b id="fb-sel-name">{target.value?.name ?? 'nothing selected'}</b>
          {(['grid', 'split'] as const).map((mode) => (
            <button key={mode} id={`fb-sel-${mode}`} aria-pressed={(target.value?.mode === mode) ? 'true' : 'false'} disabled={!target.value}
              onClick$={() => {
                const H = handle.value;
                const t = H ? targetOf(H, selected.value) : null;
                if (!H || !t) return;
                H.setLayout(mode, t.id);
                target.value = targetOf(H, selected.value);
                return say(`${t.name}: ${mode === 'split' ? 'a splitter tree inside it — its widgets cover it, dividers are percentages' : 'a grid inside it — cells, spans and push'} · handle.setLayout('${mode}', '${t.id}')`);
              }}>{mode === 'grid' ? 'Grid' : 'Split'}</button>
          ))}
        </label>
        <span class="fb-sep" />
        <button id="fb-add" title="Add a full-width KPI row — a fit board refuses once it is full" onClick$={() => {
          const H = handle.value;
          if (!H) return;
          const n = added.value + 1;
          const id = `row-${n}`;
          const w = H.addWidget({ id, kind: 'kpi', span: 9, rows: 1, data: { label: `Row ${n}`, value: `#${n}` } });
          const m = H.metrics();
          if (w) { added.value = n; return say(`added ${id} — ${m?.rows} rows of ${m?.capacity ?? '∞'}`); }
          return say(`refused: the board holds ${m?.capacity} rows and is full — nothing painted past its edge`, true);
        }}>+ Add a row</button>
        <span id="fb-msg" class={['fb-msg', refused.value ? 'refused' : ''].join(' ')}>{msg.value}</span>
      </div>
      <div class={['fb-stage', narrow.value ? 'narrow' : ''].join(' ')}>
        <GrafloriaDashboard widgets={WIDGETS} options={OPTIONS} layout={layout.value} sizing={sizing.value}
          onReady$={$((h: DashboardHandle) => {
            handle.value = noSerialize(h);
            const m = h.metrics();
            if (m) msg.value = `fluid · grow · ${Math.round(m.frame.width)}×${Math.round(m.frame.height)} px · ${m.rows} rows`;
            markReady();
          })} />
      </div>
    </div>
  );
});
