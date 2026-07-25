/**
 * The stencil palette — the signature Visio surface: a categorized, searchable
 * list of shape masters you DRAG ONTO THE CANVAS.
 *
 * Two halves, deliberately in one module because they share the drag contract:
 *   T6  the palette UI    — sections from `listStencils()`, live search, and a
 *                           thumbnail drawn from the master's OWN outline
 *                           geometry (`getShape(type).outline(w,h)`), so what
 *                           you see in the palette is the shape you get.
 *   T7  drag-to-place     — HTML5 drag-and-drop (not pointer events: the canvas
 *                           binder consumes pointerdown, and DnD is the gesture
 *                           browsers already route across two elements). The
 *                           drop lands the master at the cursor as ONE undoable
 *                           BatchCommand.
 */
import {
  listStencils,
  NodeFactory,
  AddNodeCommand,
  BatchCommand,
  type Stencil,
  type NodeTemplate,
} from '@grafloria/engine';
import { getShape } from '@grafloria/renderer';
import { ensureStencilKitStyles } from './styles';
import { getStencilBuilder } from './builders';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** The MIME the palette drags with — namespaced so a page's other DnD is untouched. */
const DND_TYPE = 'application/x-grafloria-master';

/** The bits of a diagram instance the palette needs (kept structural so any
 *  host — element, React, Vue — satisfies it without importing a class). */
export interface StencilPaletteApi {
  getEngine(): any;
  getModel(): any;
  viewport: { clientToWorld(x: number, y: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } };
}

export interface StencilPaletteOptions {
  /** Sections to show (default: every built-in stencil). */
  stencils?: Stencil[];
  /** Show the search box (default true). */
  search?: boolean;
  /** Stencil ids to render collapsed initially (default: all but the first). */
  collapsed?: string[];
  /** Data merged into every placed master (e.g. a default label). */
  data?: (master: NodeTemplate) => Record<string, unknown>;
  /** Called after a master is placed on the canvas. */
  onPlace?: (info: { master: NodeTemplate; nodeId: string; x: number; y: number }) => void;
  /**
   * Restyle the shapes per stencil WITHOUT editing any master — the seam that
   * makes stencil colour a host/theme decision instead of baked template data.
   * Keyed by stencil id (`flowchart`, `bpmn`, `uml`, `erd`); each entry
   * overrides the master's own `fill` / `stroke`. Pass `'theme'` for a value to
   * take it from the live theme instead of a literal.
   *
   *   bindStencilPalette(api, hosts, {
   *     notationTheme: { flowchart: { fill: 'theme', stroke: '#0f172a' } },
   *   })
   */
  notationTheme?: Record<string, { fill?: string; stroke?: string }>;
  /**
   * Opt a placed master INTO `useHTMLLayer`. Only set this when the host really
   * runs an HTML layer that paints `node.data._html` — with the plain SVG
   * renderer the flag makes the node render as an empty group.
   */
  htmlLayer?: boolean;
}

export interface StencilPaletteHandle {
  /** Filter the list programmatically (same as typing in the search box). */
  setSearch(query: string): void;
  /** Place a master at a WORLD point without dragging (keyboard / test path). */
  place(masterId: string, world: { x: number; y: number }): Promise<string | null>;
  /** Remove listeners and the palette DOM. */
  destroy(): void;
}


/**
 * Repaint a placed master from the host's per-notation palette.
 *
 * Colour used to live only in the 80 generated templates, so restyling meant
 * editing template data — impossible for an embedder. This applies the caller's
 * scheme on top, and `'theme'` resolves against the live theme so a colour-mode
 * swap carries the stencils with it.
 */
function applyNotationTheme(
  node: any,
  stencilId: string | undefined,
  scheme: Record<string, { fill?: string; stroke?: string }> | undefined,
  api: StencilPaletteApi
): void {
  if (!stencilId || !scheme) return;
  const want = scheme[stencilId];
  if (!want) return;
  const shape = { ...(node.getMetadata?.('shape') ?? {}) };
  const theme: any = (api as any).getTheme?.() ?? null;
  const resolve = (v: string | undefined, token: 'surface' | 'ink') =>
    v === 'theme'
      ? (token === 'surface' ? theme?.colors?.background?.paper : theme?.colors?.primary) ?? undefined
      : v;
  const fill = resolve(want.fill, 'surface');
  const stroke = resolve(want.stroke, 'ink');
  if (fill !== undefined) shape.fill = fill;
  if (stroke !== undefined) shape.stroke = stroke;
  node.setMetadata('shape', shape);
}

/** UML classifiers get a name compartment + a member compartment. */
const UML_CLASSIFIERS: Record<string, string | null> = {
  'uml-class': null, 'uml-abstract-class': '«abstract»', 'uml-interface': '«interface»',
  'uml-enumeration': '«enumeration»', 'uml-datatype': '«dataType»',
  'uml-primitivetype': '«primitive»', 'uml-signal': '«signal»', 'uml-object': null,
};

/** BPMN event types carry their trigger glyph inside the circle. */
const BPMN_EVENT_GLYPH: Record<string, string> = {
  'bpmn-message-event': '✉', 'bpmn-timer-event': '⏱', 'bpmn-error-event': '⚡',
};

/**
 * Give a placed master its notation furniture: UML compartments, or a BPMN
 * event trigger glyph. Both ride `metadata.panel`, so they paint in SVG and
 * survive export — see the note at the call site.
 */
function applyNotationPanel(node: any, masterId: string, master: NodeTemplate): void {
  const glyph = BPMN_EVENT_GLYPH[masterId];
  if (glyph) {
    node.setMetadata('panel', { icon: { glyph, size: 16, corner: 'tl' } });
    return;
  }
  if (!(masterId in UML_CLASSIFIERS)) return;
  const stereotype = UML_CLASSIFIERS[masterId];
  const name = (master as any).meta?.name ?? 'Class';
  // Placeholder members, so a dropped classifier looks like a UML card the user
  // can then edit rather than an empty box.
  const rows = masterId === 'uml-enumeration'
    ? [{ text: 'VALUE_A' }, { text: 'VALUE_B' }]
    : [{ text: '+ field: Type' }, { text: '+ method(): void' }];
  node.setMetadata('panel', {
    header: { text: stereotype ? `${stereotype} ${name}` : name },
    rows,
    rowHeight: 18,
  });
  // The header IS the classifier's name, so the node's own centred label would
  // simply repeat it in the gap between the compartments.
  node.setLabel?.('');
}

/** A thumbnail SVG for a master, drawn from its real outline + declared paint. */
function thumbnail(master: NodeTemplate, box = 34): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(box));
  svg.setAttribute('height', String(box));
  svg.setAttribute('viewBox', `0 0 ${box} ${box}`);
  svg.setAttribute('aria-hidden', 'true');

  const struct: any = (master as any).structure ?? {};
  const paint = struct.shape ?? {};
  // Preserve the master's aspect ratio inside the square, with a hairline inset
  // so a 2px stroke isn't clipped at the edges.
  const w0 = Number(struct.size?.width) || 100;
  const h0 = Number(struct.size?.height) || 60;
  const pad = 3;
  const s = Math.min((box - pad * 2) / w0, (box - pad * 2) / h0);
  const w = Math.max(6, w0 * s);
  const h = Math.max(6, h0 * s);

  let el: SVGElement;
  try {
    const spec = getShape(paint.type).outline(w, h);
    el = document.createElementNS(SVG_NS, spec.el as string);
    for (const [k, v] of Object.entries(spec.geom)) el.setAttribute(k, String(v));
  } catch {
    el = document.createElementNS(SVG_NS, 'rect');
    el.setAttribute('width', String(w));
    el.setAttribute('height', String(h));
    el.setAttribute('rx', '3');
  }
  el.setAttribute('fill', paint.fill ?? '#eef1fb');
  el.setAttribute('stroke', paint.stroke ?? '#3B52D9');
  el.setAttribute('stroke-width', String(Math.min(Number(paint.strokeWidth) || 1.5, 2)));

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('transform', `translate(${(box - w) / 2} ${(box - h) / 2})`);
  g.appendChild(el);
  svg.appendChild(g);
  return svg;
}

/** Root + descendants, so a multi-node master commits (and undoes) as a unit. */
function subtree(diagram: any, root: any): any[] {
  const out = [root];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    const ids: string[] = Array.from(n?.children ?? []);
    for (const id of ids) {
      const c = diagram.getNode(id);
      if (c) { out.push(c); stack.push(c); }
    }
  }
  return out;
}

/**
 * Build a stencil palette in `palette` that drops masters onto `canvas`.
 *
 * @param api     the diagram instance (engine + model + viewport)
 * @param hosts   `palette`: where the list renders · `canvas`: the drop target
 *                (the element the diagram is mounted in)
 */
export function bindStencilPalette(
  api: StencilPaletteApi,
  hosts: { palette: HTMLElement; canvas: HTMLElement },
  options: StencilPaletteOptions = {}
): StencilPaletteHandle {
  ensureStencilKitStyles(hosts.palette.ownerDocument ?? document);

  const stencils = options.stencils ?? listStencils();
  /** master id → stencil id, so a drop knows which notation it belongs to. */
  const stencilOf = new Map<string, string>();
  for (const st of stencils) for (const m of st.masters) stencilOf.set(m.id, st.id);
  const collapsed = new Set(options.collapsed ?? stencils.slice(1).map((s) => s.id));
  const { palette, canvas } = hosts;
  let query = '';

  palette.classList.add('gf-stencil');
  palette.innerHTML = '';

  // ── search ───────────────────────────────────────────────────────────────
  let input: HTMLInputElement | null = null;
  if (options.search !== false) {
    const wrap = document.createElement('div');
    wrap.className = 'gf-stencil-search';
    input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search shapes…';
    input.setAttribute('aria-label', 'Search shapes');
    input.addEventListener('input', () => { query = input!.value.trim().toLowerCase(); renderList(); });
    wrap.appendChild(input);
    palette.appendChild(wrap);
  }

  const body = document.createElement('div');
  body.className = 'gf-stencil-body';
  palette.appendChild(body);

  /** A master matches on its display name, its id, or any of its tags. */
  const matches = (m: NodeTemplate) => {
    if (!query) return true;
    const meta: any = (m as any).meta ?? {};
    const hay = [meta.name, m.id, ...(meta.tags ?? [])].join(' ').toLowerCase();
    return hay.includes(query);
  };

  function renderList(): void {
    body.innerHTML = '';
    let shown = 0;
    for (const stencil of stencils) {
      const hits = stencil.masters.filter(matches);
      if (hits.length === 0) continue;
      shown += hits.length;

      const group = document.createElement('details');
      group.className = 'gf-stencil-group';
      // A search always opens the sections that matched; otherwise honour the
      // caller's collapsed set.
      group.open = query ? true : !collapsed.has(stencil.id);
      group.addEventListener('toggle', () => {
        if (query) return;
        if (group.open) collapsed.delete(stencil.id); else collapsed.add(stencil.id);
      });

      const summary = document.createElement('summary');
      summary.append(stencil.name);
      const count = document.createElement('span');
      count.className = 'gf-stencil-count';
      count.textContent = String(hits.length);
      summary.appendChild(count);
      summary.title = stencil.description;
      group.appendChild(summary);

      const items = document.createElement('div');
      items.className = 'gf-stencil-items';
      for (const master of hits) items.appendChild(itemEl(master));
      group.appendChild(items);
      body.appendChild(group);
    }
    if (shown === 0) {
      const empty = document.createElement('div');
      empty.className = 'gf-stencil-empty';
      empty.textContent = query ? `No shapes match “${query}”.` : 'No stencils.';
      body.appendChild(empty);
    }
  }

  function itemEl(master: NodeTemplate): HTMLElement {
    const meta: any = (master as any).meta ?? {};
    const el = document.createElement('div');
    el.className = 'gf-stencil-item';
    el.draggable = true;
    el.dataset['masterId'] = master.id;
    el.title = meta.description ? `${meta.name} — ${meta.description}` : meta.name ?? master.id;
    el.appendChild(thumbnail(master));
    const label = document.createElement('span');
    label.className = 'gf-stencil-label';
    label.textContent = meta.name ?? master.id;
    el.appendChild(label);

    el.addEventListener('dragstart', (e) => {
      const dt = (e as DragEvent).dataTransfer;
      if (!dt) return;
      dt.setData(DND_TYPE, master.id);
      dt.setData('text/plain', meta.name ?? master.id); // so a stray drop is harmless text
      dt.effectAllowed = 'copy';
    });
    return el;
  }

  // ── drop-to-place on the canvas ──────────────────────────────────────────
  const heldMaster = (e: DragEvent): string | null => {
    const dt = e.dataTransfer;
    if (!dt) return null;
    // `getData` is empty during dragover in most browsers — the TYPE is the
    // reliable signal there, and the id itself is read on drop.
    return dt.types.includes(DND_TYPE) ? (dt.getData(DND_TYPE) || '') : null;
  };

  const onDragOver = (e: DragEvent) => {
    if (heldMaster(e) === null) return;
    e.preventDefault();                       // required, or the drop never fires
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    canvas.classList.add('gf-stencil-target');
  };
  const onDragLeave = (e: DragEvent) => {
    if (e.relatedTarget && canvas.contains(e.relatedTarget as Node)) return;
    canvas.classList.remove('gf-stencil-target');
  };
  const onDrop = (e: DragEvent) => {
    const id = heldMaster(e);
    canvas.classList.remove('gf-stencil-target');
    if (!id) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    void place(id, api.viewport.clientToWorld(e.clientX, e.clientY, rect));
  };

  canvas.addEventListener('dragover', onDragOver);
  canvas.addEventListener('dragleave', onDragLeave);
  canvas.addEventListener('drop', onDrop);

  /**
   * Stamp `masterId` centred on a world point, as ONE undo entry.
   *
   * `NodeFactory.createFromTemplate` adds straight to the model (no command), so
   * the created subtree is captured, taken back out, and re-applied through the
   * CommandManager — one Ctrl+Z removes the whole shape, and collab sees a
   * normal add.
   */
  async function place(masterId: string, world: { x: number; y: number }): Promise<string | null> {
    const engine = api.getEngine();
    const diagram = api.getModel();
    const registry = engine?.templateRegistry;
    const master: NodeTemplate | undefined = registry?.get(masterId);
    if (!master || !diagram) return null;

    const struct: any = (master as any).structure ?? {};
    const w = Number(struct.size?.width) || 100;
    const h = Number(struct.size?.height) || 60;
    const at = { x: world.x - w / 2, y: world.y - h / 2 };   // drop centres on the cursor

    // A master may resolve to a registered BUILDER (an ER entity / UML class is
    // a kit card, not a silhouette). Anything without one takes the template
    // path — see stencil-kit/builders.ts for why this is a registry and not an
    // id check inside the palette.
    const builder = getStencilBuilder(masterId);
    const built = builder ? builder({ api, master, at }) : null;

    const factory = built ? null : new NodeFactory(registry, diagram);
    const root = built ?? factory!.createFromTemplate(masterId, options.data?.(master) ?? {}, at);
    const created = built ? [built] : subtree(diagram, root);

    // NOTE: masters used to need `useHTMLLayer` stripped here or they rendered
    // as empty groups. That is fixed at the source now (NodeFactory no longer
    // sets the flag — see NodeFactory.html-contract.spec.ts), so the workaround
    // is gone. `htmlLayer: true` is still honoured for hosts that set the flag
    // themselves and DO run a layer that paints it.
    if (options.htmlLayer === true) {
      for (const n of created) n.setMetadata('useHTMLLayer', true);
    }

    // COMPARTMENTS & EVENT MARKERS. `metadata.panel` drives the renderer's
    // composite-panel overlay (header band + stacked rows + a corner glyph) —
    // a complete, themed, SVG-NATIVE subsystem that shipped with zero callers.
    // Using it here rather than the UML kit's `metadata.html` route is
    // deliberate: an HTML-layer card is not vector-exportable and depends on a
    // layer the plain SVG embed does not run — the exact dependency that made
    // every dropped master render blank.
    applyNotationPanel(root, masterId, master);
    applyNotationTheme(root, stencilOf.get(masterId), options.notationTheme, api);

    // Serialize into commands BEFORE detaching (AddNodeCommand snapshots in its
    // constructor), then detach and replay through the command manager.
    const cmds = created.map((n) => new AddNodeCommand(n));
    for (const n of [...created].reverse()) diagram.removeNode(n.id);
    await engine.commandManager.execute(new BatchCommand(`Place ${(master as any).meta?.name ?? masterId}`, cmds));

    options.onPlace?.({ master, nodeId: root.id, x: at.x, y: at.y });
    return root.id;
  }

  renderList();

  return {
    setSearch(q: string) { query = (q ?? '').trim().toLowerCase(); if (input) input.value = q ?? ''; renderList(); },
    place,
    destroy() {
      canvas.removeEventListener('dragover', onDragOver);
      canvas.removeEventListener('dragleave', onDragLeave);
      canvas.removeEventListener('drop', onDrop);
      canvas.classList.remove('gf-stencil-target');
      palette.classList.remove('gf-stencil');
      palette.innerHTML = '';
    },
  };
}
