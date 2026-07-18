/**
 * UML class-diagram kit — typed builders for the full relationship vocabulary.
 *
 * The packaged form of demos/diagrams/class-uml.html + uml-relationships.html:
 * three-compartment class cards («stereotype», name, attributes, methods) and
 * every standard relationship with its real notation:
 *
 *   inheritance          ── solid,  hollow triangle at the parent
 *   realization          ┄┄ dashed, hollow triangle at the interface
 *   association          ── plain line (multiplicity chips optional)
 *   directed-association ── open arrow at the target
 *   aggregation          ── hollow diamond at the whole (source)
 *   composition          ── FILLED diamond at the whole (source)
 *   dependency           ┄┄ dashed, open arrow («uses»)
 *
 * ```ts
 * const spec = umlDiagram({
 *   classes: [{ id: 'Shape', abstract: true, attributes: ['# x: float'], methods: ['+ area(): float'] }],
 *   relationships: [{ from: 'Circle', to: 'Shape', kind: 'inheritance' }],
 * });
 * const api = render(spec, container);
 * spec.finalize(api); // attaches multiplicity chips (needs the live model)
 * ```
 */
import { ensureDiagramKitStyles } from './styles';
import { bindRowInteractions } from './rows';

const LINE_H = 19;
const NAME_H = 30;
const STEREO_H = 14;
const PAD = 8;
const DEFAULT_WIDTH = 200;

export interface UmlClassSpec {
  id: string;
  /** Displayed name. Defaults to the id. */
  name?: string;
  /** Renders as «stereotype» above the name (e.g. 'interface', 'abstract', 'enum'). */
  stereotype?: string;
  /** Italicises the name (also set automatically for stereotype 'abstract'/'interface'). */
  abstract?: boolean;
  attributes?: string[];
  methods?: string[];
  position?: { x: number; y: number };
  width?: number;
  /** Fixed card height — smaller than the content makes the compartments scroll. */
  height?: number;
}

export type UmlRelationKind =
  | 'inheritance'
  | 'realization'
  | 'association'
  | 'directed-association'
  | 'aggregation'
  | 'composition'
  | 'dependency';

export type UmlSide = 'left' | 'right' | 'top' | 'bottom';

export interface UmlRelationshipSpec {
  from: string;
  to: string;
  /** Default 'association'. */
  kind?: UmlRelationKind;
  label?: string;
  /** Multiplicity / role chips at the [from, to] ends (e.g. ['0..*', '1']). */
  multiplicity?: [string, string];
  fromSide?: UmlSide;
  toSide?: UmlSide;
  id?: string;
}

export interface UmlDiagramOptions {
  classes: UmlClassSpec[];
  relationships?: UmlRelationshipSpec[];
  /**
   * Members are selectable by default: click one to select it (painted with
   * .axk-row-selected; axk:row-click / axk:row-select CustomEvents fire on the
   * container). Set false to opt out.
   */
  rowSelection?: boolean;
}

interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  arrowHead: { type: string; size: number; filled: boolean };
  arrowTail?: { type: string; size: number; filled: boolean };
}

const STROKE = '#475569';
const DASH = '6,4';

/**
 * The notation table. Every kind sets arrowHead EXPLICITLY — a plain line must
 * carry `arrowHead: none`, or the renderer paints its default arrow (the
 * stray-arrowhead bug the demos hit live).
 */
function edgeStyleFor(kind: UmlRelationKind): EdgeStyle {
  const none = { type: 'none', size: 0, filled: false };
  switch (kind) {
    case 'inheritance':
      return { stroke: STROKE, strokeWidth: 1.5, arrowHead: { type: 'generalization', size: 16, filled: false }, arrowTail: none };
    case 'realization':
      return { stroke: STROKE, strokeWidth: 1.5, strokeDasharray: DASH, arrowHead: { type: 'generalization', size: 16, filled: false }, arrowTail: none };
    case 'association':
      return { stroke: STROKE, strokeWidth: 1.5, arrowHead: none, arrowTail: none };
    case 'directed-association':
      return { stroke: STROKE, strokeWidth: 1.5, arrowHead: { type: 'open-arrow', size: 12, filled: false }, arrowTail: none };
    case 'aggregation':
      return { stroke: STROKE, strokeWidth: 1.5, arrowHead: none, arrowTail: { type: 'hollow-diamond', size: 14, filled: false } };
    case 'composition':
      return { stroke: STROKE, strokeWidth: 1.5, arrowHead: none, arrowTail: { type: 'filled-diamond', size: 14, filled: true } };
    case 'dependency':
      return { stroke: STROKE, strokeWidth: 1.5, strokeDasharray: DASH, arrowHead: { type: 'open-arrow', size: 12, filled: false }, arrowTail: none };
  }
}

const classCard = (cls: UmlClassSpec) => {
  const attrs = cls.attributes ?? [];
  const methods = cls.methods ?? [];
  const italic = cls.abstract || cls.stereotype === 'abstract' || cls.stereotype === 'interface';
  return {
    content: {
      tag: 'div',
      className: 'axk-uml',
      children: [
        {
          tag: 'div',
          className: 'axk-uml-name' + (italic ? ' axk-abstract' : ''),
          children: [
            ...(cls.stereotype ? [{ tag: 'span', className: 'axk-uml-stereo', text: `«${cls.stereotype}»` }] : []),
            { tag: 'span', text: cls.name ?? cls.id },
          ],
        },
        {
          tag: 'div',
          className: cls.height != null ? 'axk-uml-body axk-scroll' : 'axk-uml-body',
          children: [
            {
              tag: 'div',
              className: 'axk-uml-comp' + (attrs.length ? '' : ' axk-empty'),
              children: attrs.map((a) => ({ tag: 'div', className: 'axk-member', text: a })),
            },
            {
              tag: 'div',
              className: 'axk-uml-comp' + (methods.length ? '' : ' axk-empty'),
              children: methods.map((m) => ({ tag: 'div', className: 'axk-member', text: m })),
            },
          ],
        },
      ],
    },
  };
};

/** Multiplicity chip, positioned near an edge end. */
const chip = (text: string, slot: 'start' | 'end') => ({
  text,
  slot,
  offset: { x: 0, y: -7 },
  style: { fontSize: 11, fontWeight: '600', color: '#0f172a', background: '#ffffffdd', padding: 1, borderRadius: 2 },
});

/**
 * Build a render() spec for a UML class diagram. Call `spec.finalize(api)`
 * after render() — multiplicity chips are positioned labels, which only the
 * live model's `link.addLabel` can express.
 */
export function umlDiagram(options: UmlDiagramOptions): {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  finalize: (api: unknown) => void;
} {
  ensureDiagramKitStyles();

  const nodes = options.classes.map((cls, i) => {
    const attrs = cls.attributes ?? [];
    const methods = cls.methods ?? [];
    const height =
      cls.height ?? NAME_H + (cls.stereotype ? STEREO_H : 0) + (attrs.length + methods.length) * LINE_H + PAD * 2 + 12; // + html wrapper padding & borders, measured live
    return {
      id: cls.id,
      position: cls.position ?? { x: 80 + (i % 3) * 320, y: 60 + Math.floor(i / 3) * 260 },
      size: { width: cls.width ?? DEFAULT_WIDTH, height },
      // interactive: members are real DOM targets (hover, row selection);
      // node drag/select stay geometric in the binder.
      metadata: { html: { ...classCard(cls), interactive: true }, kitClass: cls },
      shape: { type: 'rect', fill: 'none', stroke: 'none' },
      style: { fill: 'transparent', stroke: 'transparent', strokeWidth: 0 },
    };
  });

  const rels = options.relationships ?? [];
  const edges = rels.map((rel, i) => ({
    id: rel.id ?? `uml-rel-${i + 1}`,
    source: rel.from,
    target: rel.to,
    label: rel.label,
    type: 'orthogonal',
    ...(rel.fromSide ? { sourceHandle: rel.fromSide } : {}),
    ...(rel.toSide ? { targetHandle: rel.toSide } : {}),
    style: edgeStyleFor(rel.kind ?? 'association'),
  }));

  // finalize is idempotent per api: render() auto-runs it, and a demo may also
  // call it — chips must not be added twice.
  const finalized = new WeakSet<object>();
  const finalize = (api: unknown): void => {
    const a0 = api as { container?: HTMLElement; getModel?: () => { getNode: (id: string) => { setBehavior?: (b: { resizable: boolean }) => void } | undefined } };
    // Own card ring only — suppress the node resize handles on the live model
    // (the render-input path does not honour a spec-level `behavior`).
    const m0 = a0?.getModel?.();
    if (m0) for (const cls of options.classes) m0.getNode?.(cls.id)?.setBehavior?.({ resizable: false });
    if (options.rowSelection !== false) {
      const a = api as { container?: HTMLElement };
      // bindRowInteractions disposes any prior binding for the container, so it
      // is safe to run twice.
      if (a?.container) bindRowInteractions(a as never);
    }
    if (api && typeof api === 'object') {
      if (finalized.has(api)) return;
      finalized.add(api);
    }
    const model = (api as { getModel?: () => { getLink: (id: string) => { addLabel: (l: unknown) => void } | null } })?.getModel?.();
    if (!model) return;
    let added = false;
    rels.forEach((rel, i) => {
      if (!rel.multiplicity) return;
      const link = model.getLink((edges[i] as { id: string }).id);
      if (!link) return;
      link.addLabel(chip(rel.multiplicity[0], 'start'));
      link.addLabel(chip(rel.multiplicity[1], 'end'));
      added = true;
    });
    if (added) (api as { renderNow?: () => void })?.renderNow?.();
  };

  return { nodes, edges, finalize };
}
