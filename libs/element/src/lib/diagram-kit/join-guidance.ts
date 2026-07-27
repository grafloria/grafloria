/**
 * Join guidance — live "which column should I join to?" scoring + tinting for
 * kit table cards, the feature a visual query builder is actually about.
 *
 * Ported verbatim from a production BI tool's Query Studio (the scoring is ~55
 * pure lines there too). While a connection drag is in progress, every column
 * on every OTHER table is scored against the drag's source column and its card
 * row is tinted by tier:
 *
 *   score 3 — PK↔FK naming convention: `orders.customer_id` ↔ `customers.id`
 *             (`<singular(table)>_id` on one end, `id` on the other), or exact
 *             FK column-name equality across tables;
 *   score 2 — a PK flag on one end and an FK flag on the other;
 *   score 1 — same column name, or both names end in "id";
 *   score 0 — same table, or nothing.
 *
 * Tiers: the single best candidate scoring >= 2 is `top` (gold, "★ BEST"),
 * every other >= 2 is `good` (green), 1 is `ok` (blue), 0 is `none` (dimmed).
 * The SOURCE table is never tinted, and every tint clears when the drag ends —
 * complete, cancelled or escaped.
 *
 * Split the same way the rest of the kit is:
 *   - `scoreMatch` / `matchTier` / `assignTiers` / `singularize` are PURE
 *     (unit-specced in the element suite);
 *   - `bindJoinGuidance(api)` is the runtime: it listens to the engine's own
 *     connection lifecycle events (`connection:start` / `:complete` /
 *     `:cancel`) and paints tier classes onto the kit's `.axk-row` elements.
 *
 * Row tints go on as DOM classes — the renderer's foreignObject subtrees are
 * patch-opaque, so classes survive the per-frame VNode patch. Port tints go in
 * as a generated per-drag <style> element keyed by `data-port-id`: port glyphs
 * ARE re-patched every frame, so a class added to the SVG element would be
 * wiped mid-drag, while a stylesheet wins the cascade and survives.
 */

export interface JoinColumn {
  name: string;
  pk?: boolean;
  fk?: boolean;
}

/** One end of a candidate join: a table (node) and one of its columns. */
export interface JoinEnd {
  table: string;
  column: JoinColumn;
}

export type MatchTier = 'top' | 'good' | 'ok' | 'none';

/** Naive English singular — enough for schema names (orders, categories, statuses). */
export function singularize(word: string): string {
  const w = word.toLowerCase();
  if (w.endsWith('ies') && w.length > 3) return w.slice(0, -3) + 'y';
  if (/(?:ses|xes|zes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** The PK↔FK naming convention: `a` is `<singular(b.table)>_id` and `b` is `id`. */
function conventionMatch(a: JoinEnd, b: JoinEnd): boolean {
  return (
    a.column.name.toLowerCase() === `${singularize(b.table)}_id` &&
    b.column.name.toLowerCase() === 'id'
  );
}

/**
 * Score a candidate join between two columns. Pure; the exact production
 * logic. Higher is better; 0 means "no reason to join these".
 */
export function scoreMatch(a: JoinEnd, b: JoinEnd): 0 | 1 | 2 | 3 {
  if (!a || !b || a.table === b.table) return 0;
  const an = a.column.name.toLowerCase();
  const bn = b.column.name.toLowerCase();

  // 3 — the naming convention (either direction), or exact FK-name equality.
  if (conventionMatch(a, b) || conventionMatch(b, a)) return 3;
  if (an === bn && an.endsWith('_id') && (a.column.fk === true || b.column.fk === true)) return 3;

  // 2 — PK flag on one end, FK flag on the other.
  if ((a.column.pk === true && b.column.fk === true) || (a.column.fk === true && b.column.pk === true)) return 2;

  // 1 — same name, or both look like identifiers.
  if (an === bn) return 1;
  if (an.endsWith('id') && bn.endsWith('id')) return 1;

  return 0;
}

/** Per-score tier (rank-free half; `assignTiers` promotes the single best to `top`). */
export function matchTier(score: number): Exclude<MatchTier, 'top'> {
  if (score >= 2) return 'good';
  if (score >= 1) return 'ok';
  return 'none';
}

/**
 * Tier every candidate score at once: the FIRST candidate holding the maximum
 * score is `top` when that maximum is >= 2 — exactly one gold row per drag.
 */
export function assignTiers(scores: number[]): MatchTier[] {
  const max = scores.reduce((m, s) => (s > m ? s : m), 0);
  let topIndex = -1;
  if (max >= 2) topIndex = scores.indexOf(max);
  return scores.map((s, i) => (i === topIndex ? 'top' : matchTier(s)));
}

// ---------------------------------------------------------------------------
// Runtime binding
// ---------------------------------------------------------------------------

const TIER_CLASS: Record<MatchTier, string> = {
  top: 'axk-match-top',
  good: 'axk-match-good',
  ok: 'axk-match-ok',
  none: 'axk-match-none',
};
const CHIP_CLASS = 'axk-match-chip';
const PORT_STYLE_ID = 'grafloria-join-guidance-ports';

export const JOIN_GUIDANCE_STYLE_ID = 'grafloria-join-guidance-styles';

/** The tier tints — the production palette, verbatim. */
const GUIDANCE_CSS = `
.axk-row.axk-match-top { background: #fffbeb;
  box-shadow: inset 4px 0 0 #f59e0b, inset 0 0 0 1px #fcd34d; }
.axk-row.axk-match-top .axk-col { font-weight: 800; color: #92600a; }
.axk-row.axk-match-good { background: #dcfce7; box-shadow: inset 4px 0 0 #16a34a; }
.axk-row.axk-match-good .axk-col { font-weight: 700; color: #14532d; }
.axk-row.axk-match-ok { background: #dbeafe; box-shadow: inset 4px 0 0 #2563eb; }
.axk-row.axk-match-none { opacity: .4; }
.${CHIP_CLASS} { font-size: 9px; font-weight: 800; text-transform: uppercase;
  background: #f59e0b; color: #4a2e05; border-radius: 4px; padding: 1px 4px;
  margin-left: 4px; flex: 0 0 auto; letter-spacing: .3px; }
`;

/** Inject the guidance tint stylesheet once. Safe to call repeatedly / in SSR. */
export function ensureJoinGuidanceStyles(
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
): void {
  if (!doc) return;
  if (doc.getElementById(JOIN_GUIDANCE_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = JOIN_GUIDANCE_STYLE_ID;
  style.textContent = GUIDANCE_CSS;
  doc.head.appendChild(style);
}

interface NodeLike {
  id: string;
  getMetadata?(key: string): unknown;
  getPorts?(): Array<{ id: string }>;
  getPort?(id: string): unknown;
}

/** The slice of DiagramInstance the binding needs (matches HandleApi's shape). */
export interface JoinGuidanceApi {
  container: HTMLElement;
  getModel(): {
    getNode(id: string): NodeLike | undefined;
    getNodes?(): NodeLike[];
  };
  getEngine?():
    | { eventBus?: { on(event: string, handler: (data: unknown) => void): () => void } }
    | undefined;
}

export interface JoinGuidanceOptions {
  /**
   * Resolve a PORT id to its table column. The default understands both the
   * ER kit's convention (`TABLE__col__side__n`) and the query-builder dot
   * convention (`table.col-in` / `table.col-out`), checked against the node's
   * actual `kitEntity` columns so an ambiguous name never mis-resolves.
   */
  resolvePort?: (portId: string, nodeId: string | undefined) => { nodeId: string; column: string } | null;
  /** Text of the gold chip on the best row. Default `'★ BEST'`. */
  chipText?: string;
  /**
   * Extra per-tier CSS for the target columns' PORT glyphs, injected per drag.
   * Default paints the production glows (gold/green/blue drop-shadows).
   */
  portCss?: (tier: MatchTier, selector: string) => string;
}

export interface JoinGuidanceHandle {
  /** nodeId → rowIndex → tier for the drag in progress (empty when idle). */
  activeTiers(): Map<string, Map<number, MatchTier>>;
  dispose(): void;
}

const esc = (value: string): string =>
  typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"');

/** The production port glows: gold 4px, green 3px, blue 2px; `none` recedes. */
function defaultPortCss(tier: MatchTier, selector: string): string {
  switch (tier) {
    case 'top':
      return `${selector} { fill: #f59e0b !important; stroke: #f59e0b !important; filter: drop-shadow(0 0 4px rgba(245,158,11,.4)) drop-shadow(0 0 2px rgba(245,158,11,.4)); }`;
    case 'good':
      return `${selector} { fill: #16a34a !important; stroke: #16a34a !important; filter: drop-shadow(0 0 3px rgba(22,163,74,.35)); }`;
    case 'ok':
      return `${selector} { fill: #2563eb !important; stroke: #2563eb !important; filter: drop-shadow(0 0 2px rgba(37,99,235,.3)); }`;
    default:
      return '';
  }
}

interface KitEntityMeta {
  columns?: JoinColumn[];
  name?: string;
}

/**
 * Bind live join guidance to a diagram instance. Listens to the engine's
 * connection lifecycle; while a drag is live, every kit-card row on every
 * other table wears its tier class (and the best one its "★ BEST" chip), and
 * the matching port glyphs glow via a generated stylesheet. Everything clears
 * when the drag ends, however it ends.
 */
export function bindJoinGuidance(api: JoinGuidanceApi, options: JoinGuidanceOptions = {}): JoinGuidanceHandle {
  ensureJoinGuidanceStyles(api.container.ownerDocument);

  const chipText = options.chipText ?? '★ BEST';
  const portCss = options.portCss ?? defaultPortCss;

  const kitOf = (node: NodeLike | undefined): KitEntityMeta | null => {
    const raw = node?.getMetadata?.('kitEntity');
    return raw && typeof raw === 'object' ? (raw as KitEntityMeta) : null;
  };

  const defaultResolve = (portId: string, nodeId: string | undefined): { nodeId: string; column: string } | null => {
    const model = api.getModel();
    const nodes = nodeId
      ? [model.getNode(nodeId)].filter((n): n is NodeLike => !!n)
      : (model.getNodes?.() ?? []).filter((n) => !!n.getPort?.(portId));
    for (const node of nodes) {
      const kit = kitOf(node);
      if (!kit?.columns) continue;
      for (const column of kit.columns) {
        if (
          portId === `${node.id}.${column.name}-in` ||
          portId === `${node.id}.${column.name}-out` ||
          portId.startsWith(`${node.id}__${column.name}__`)
        ) {
          return { nodeId: node.id, column: column.name };
        }
      }
    }
    return null;
  };
  const resolvePort = options.resolvePort ?? defaultResolve;

  const active = new Map<string, Map<number, MatchTier>>();
  let portStyle: HTMLStyleElement | null = null;

  const rowsOf = (nodeId: string): HTMLElement[] => {
    const group = api.container.querySelector(`[data-node-id="${esc(nodeId)}"]`);
    return group ? (Array.from(group.querySelectorAll('.axk-row')) as HTMLElement[]) : [];
  };

  const clear = (): void => {
    for (const cls of Object.values(TIER_CLASS)) {
      for (const el of Array.from(api.container.querySelectorAll(`.${cls}`))) el.classList.remove(cls);
    }
    for (const chip of Array.from(api.container.querySelectorAll(`.${CHIP_CLASS}`))) chip.remove();
    portStyle?.remove();
    portStyle = null;
    active.clear();
  };

  const portsForColumn = (node: NodeLike, column: string): string[] => {
    const ports = node.getPorts?.() ?? [];
    return ports
      .map((p) => p.id)
      .filter(
        (id) =>
          id === `${node.id}.${column}-in` ||
          id === `${node.id}.${column}-out` ||
          id.startsWith(`${node.id}__${column}__`)
      );
  };

  const onStart = (data: unknown): void => {
    clear();
    const payload = data as { sourcePort?: { id: string; nodeId?: string } } | undefined;
    const sourcePort = payload?.sourcePort;
    if (!sourcePort) return;
    const source = resolvePort(sourcePort.id, sourcePort.nodeId);
    if (!source) return;

    const model = api.getModel();
    const sourceNode = model.getNode(source.nodeId);
    const sourceKit = kitOf(sourceNode);
    const sourceColumn = sourceKit?.columns?.find((c) => c.name === source.column);
    if (!sourceColumn) return;
    const sourceEnd: JoinEnd = { table: source.nodeId, column: sourceColumn };

    // Every column of every OTHER kit table is a candidate, in node order.
    const candidates: Array<{ node: NodeLike; rowIndex: number; column: JoinColumn }> = [];
    for (const node of model.getNodes?.() ?? []) {
      if (node.id === source.nodeId) continue; // the source table is NEVER tinted
      const kit = kitOf(node);
      if (!kit?.columns) continue;
      kit.columns.forEach((column, rowIndex) => candidates.push({ node, rowIndex, column }));
    }
    if (candidates.length === 0) return;

    // The VALIDATOR outranks the score. A column can be the best textual
    // match and still be un-connectable (its table pair already joined, or a
    // custom validator refuses it) — the engine records those as
    // invalidTargetPorts at drag start, and the renderer paints them red on
    // hover. Tinting the same port gold would be the guidance lying about a
    // target the drop will refuse (caught by the demo gate: the seeded
    // customers⋈orders pair made customers.id both '★ BEST' and invalid).
    const invalid = ((): Set<string> => {
      try {
        const engine = api.getEngine?.() as
          | { getConnectionStateManager?: () => { getState?: () => { invalidTargetPorts?: Map<string, string> } } }
          | undefined;
        const map = engine?.getConnectionStateManager?.()?.getState?.()?.invalidTargetPorts;
        return new Set(map ? [...map.keys()] : []);
      } catch {
        return new Set();
      }
    })();
    const scores = candidates.map((c) => {
      const targetIn = `${c.node.id}.${c.column.name}-in`;
      if (invalid.has(targetIn)) return 0;
      const port = (c.node.getPort?.(targetIn) ?? null) as { id?: string } | null;
      if (port?.id && invalid.has(port.id)) return 0;
      return scoreMatch(sourceEnd, { table: c.node.id, column: c.column });
    });
    const tiers = assignTiers(scores);

    const cssRules: string[] = [];
    candidates.forEach((candidate, i) => {
      const tier = tiers[i]!;
      const byRow = active.get(candidate.node.id) ?? new Map<number, MatchTier>();
      byRow.set(candidate.rowIndex, tier);
      active.set(candidate.node.id, byRow);

      const row = rowsOf(candidate.node.id)[candidate.rowIndex];
      if (row) {
        row.classList.add(TIER_CLASS[tier]);
        if (tier === 'top') {
          const chip = api.container.ownerDocument.createElement('span');
          chip.className = CHIP_CLASS;
          chip.textContent = chipText;
          row.appendChild(chip);
        }
      }
      if (tier !== 'none') {
        for (const portId of portsForColumn(candidate.node, candidate.column.name)) {
          const rule = portCss(tier, `[data-port-id="${esc(portId)}"]`);
          if (rule) cssRules.push(rule);
        }
      }
    });

    if (cssRules.length > 0) {
      portStyle = api.container.ownerDocument.createElement('style');
      portStyle.id = PORT_STYLE_ID;
      portStyle.textContent = cssRules.join('\n');
      api.container.ownerDocument.head.appendChild(portStyle);
    }
  };

  const bus = api.getEngine?.()?.eventBus;
  const offs: Array<() => void> = [];
  if (bus) {
    offs.push(bus.on('connection:start', onStart));
    offs.push(bus.on('connection:complete', clear));
    offs.push(bus.on('connection:cancel', clear));
    // The event-type constant spells it 'cancelled'; the state manager emits
    // 'cancel'. Subscribe to both so a future spelling fix cannot leave tints on.
    offs.push(bus.on('connection:cancelled', clear));
  }

  return {
    activeTiers: () => {
      const copy = new Map<string, Map<number, MatchTier>>();
      for (const [nodeId, byRow] of active) copy.set(nodeId, new Map(byRow));
      return copy;
    },
    dispose: () => {
      for (const off of offs) off();
      clear();
    },
  };
}
