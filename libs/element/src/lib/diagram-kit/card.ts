/**
 * Card building — the ONE source of truth for the ER/UML card HTML trees, the
 * layout constants and the size math.
 *
 * Both the builders (er.ts / uml.ts, which emit the initial render() spec) and
 * the live editor (update.ts, which regenerates a card after an edit) call
 * these. Keeping them here is what stops the two paths from drifting: an edited
 * card is byte-for-byte the card the builder would have produced for the same
 * data, so a re-rendered table looks identical to a freshly built one.
 *
 * `editable` threads through: when true the card grows the in-canvas editing
 * chrome (a per-row delete control and a trailing "add" affordance). That
 * chrome is DELIBERATELY not a `.axk-row`/`.axk-member` — the row-selection and
 * port-reconciliation code count those, and the affordance is neither a column
 * nor a member.
 */

import type { ErColumn, ErEntitySpec } from './er';
import type { UmlClassSpec } from './uml';

/** Row height / header height of the entity card — sizing is derived from these. */
export const ER_ROW_H = 25;
export const ER_HEAD_H = 28;
/**
 * Auto-height slack: the html wrapper's padding (8px) + the card's 1px
 * top/bottom borders + the head rendering slightly under ER_HEAD_H. Measured
 * live — with less, an auto-sized card overflows a few px, and the wheel
 * delegation would steal that much scroll on EVERY card.
 */
export const ER_BORDER_SLACK = 9;
/** The editable "add column" affordance row's height (excluded from row math). */
export const ER_ADD_H = 26;

/** UML compartment metrics (mirrors the pre-kit demos, measured live). */
export const UML_LINE_H = 19;
export const UML_NAME_H = 30;
export const UML_STEREO_H = 14;
export const UML_PAD = 8;

/** Node-local y of a row's centre (the +1 offsets past the card's top border). */
export function erRowCenterY(rowIndex: number): number {
  return ER_HEAD_H + rowIndex * ER_ROW_H + ER_ROW_H / 2 + 1;
}

/** Inverse of {@link erRowCenterY}: which column row a pinned port sits on. */
export function rowIndexFromY(y: number): number {
  return Math.round((y - ER_HEAD_H - ER_ROW_H / 2 - 1) / ER_ROW_H);
}

/** A node's html-content tree node (the shape the renderer's html layer eats). */
export interface HtmlNode {
  tag: string;
  className?: string;
  text?: string;
  children?: HtmlNode[];
}

/**
 * The `.axk-entity` content tree — the SAME tree er.ts ships and update.ts
 * regenerates. `editable` adds the delete control per row and the trailing add
 * affordance.
 */
export function entityCardContent(entity: ErEntitySpec, editable = false): HtmlNode {
  const rows: HtmlNode[] = entity.columns.map((c) => {
    const children: HtmlNode[] = [
      { tag: 'span', className: 'axk-key' + (c.fk ? ' axk-fk' : ''), text: c.pk ? 'PK' : c.fk ? 'FK' : '' },
      { tag: 'span', className: 'axk-col', text: c.name },
      { tag: 'span', className: 'axk-ty', text: c.type ?? '' },
    ];
    // The delete control is a real child so it survives re-renders (the card is
    // regenerated wholesale on every edit) and hover-reveals via CSS only.
    if (editable) children.push({ tag: 'span', className: 'axk-col-del', text: '×' });
    return { tag: 'div', className: 'axk-row' + (c.pk ? ' axk-pk' : ''), children };
  });

  const body: HtmlNode = {
    // Scroll is OPT-IN via an explicit height: an auto-sized card fits by
    // construction and must never trap the wheel, not even by a pixel.
    tag: 'div',
    className: entity.height != null ? 'axk-entity-body axk-scroll' : 'axk-entity-body',
    children: rows,
  };

  const children: HtmlNode[] = [
    { tag: 'div', className: 'axk-entity-head', text: entity.name ?? entity.id },
    body,
  ];
  // The affordance sits OUTSIDE the (scrollable) body so it is always reachable.
  if (editable) children.push({ tag: 'div', className: 'axk-entity-add', text: '＋ add column' });

  return { tag: 'div', className: 'axk-entity', children };
}

/** Card height for an entity — explicit height wins, else derived from columns. */
export function entityAutoHeight(entity: ErEntitySpec, editable = false): number {
  if (entity.height != null) return entity.height;
  return ER_HEAD_H + entity.columns.length * ER_ROW_H + ER_BORDER_SLACK + (editable ? ER_ADD_H : 0);
}

/* ---------------------------------------------------------------------------
 * Card WIDTH — the half of the sizing contract that was missing.
 *
 * Height has always been derived from content (entityAutoHeight above), but
 * width was a flat constant, so anything wider than the default simply fell off
 * the card — and every one of those overflows was SILENT. Measured on the
 * shipped demos: the ER head lost 125px of `A_VERY_LONG_TABLE_NAME…` with no
 * ellipsis, `from_warehouse_id` needed 221px against the 190 it got, and a UML
 * method signature needed 487px against 190 — 297px of it cut mid-glyph, on the
 * one line of a class diagram that carries the actual information.
 *
 * So a card now sizes to its content in BOTH axes. The constants below mirror
 * the stylesheet's box model exactly; if a rule there changes, change it here.
 * ------------------------------------------------------------------------- */

/** Horizontal padding shared by `.axk-row`, `.axk-entity-head`, `.axk-member`
 *  and `.axk-uml-name` — all of them are `padding: Npx 10px`. */
export const CARD_PAD_X = 20;
/** `.axk-row`'s `gap: 8px`. */
export const ER_ROW_GAP = 8;
/** `.axk-key`'s fixed `width: 22px`. */
export const ER_KEY_W = 22;
/** `.axk-ty`'s `min-width: 52px` — it never measures narrower than its target. */
export const ER_TYPE_MIN_W = 52;
/** `.axk-col-del`'s `width: 14px` (present only when editable). */
export const CARD_DEL_W = 14;
/**
 * Horizontal counterpart of ER_BORDER_SLACK: the html wrapper's padding
 * (`html.padding ?? 4`, so 8px across) plus the card's own 1px left/right
 * borders. The node's width is the OUTER box; the row only ever gets what is
 * left after these, so a derived width that ignored them came out 10px short
 * and truncated by a hair — which is exactly how it was first measured.
 */
export const CARD_SLACK_X = 10;
/** Defaults, and the floor every derived width is taken against. */
export const ER_DEFAULT_WIDTH = 190;
export const UML_DEFAULT_WIDTH = 200;
/**
 * Ceiling for a DERIVED width. A card that sized itself to a pathological
 * identifier would dominate the diagram, so past this the stylesheet's ellipsis
 * takes over — visibly, which is the point — and an author who needs the whole
 * string sets an explicit `width`. An explicit width is never clamped.
 */
export const CARD_MAX_AUTO_W = 420;

/* The exact CSS fonts the stylesheet paints these strings with. */
const FONT_COL = '12px system-ui, sans-serif';
const FONT_COL_PK = '600 12px system-ui, sans-serif';
const FONT_TYPE = '11px system-ui, sans-serif';
const FONT_HEAD = '600 11px system-ui, sans-serif';
const FONT_ADD = '600 11px system-ui, sans-serif';
const FONT_MEMBER = '11px ui-monospace, Menlo, monospace';
const FONT_UML_NAME = '700 12px system-ui, sans-serif';
const FONT_UML_STEREO = '500 10px system-ui, sans-serif';
/** `.axk-entity-head` is `letter-spacing: .3px`, which canvas does not apply. */
const HEAD_TRACKING = 0.3;

let measureCtx: CanvasRenderingContext2D | null | undefined;
const measureCache = new Map<string, number>();

/**
 * Width of `text` in CSS pixels, as the browser will really lay it out.
 *
 * Canvas `measureText` was calibrated against live `getBoundingClientRect()`
 * widths for these exact fonts and agreed to within 0.02px, which is what makes
 * deriving a card's width from its content safe rather than a guess.
 *
 * Outside a browser (jsdom, SSR) there is no 2d context and this falls back to
 * a per-character average. The fallback only has to be roughly right: it feeds
 * a `Math.max` against the default width, and anything it underestimates is
 * ellipsised by the stylesheet rather than lost.
 */
export function measureCardText(text: string, font: string, tracking = 0): number {
  if (!text) return 0;
  const key = `${font}\u0000${tracking}\u0000${text}`;
  const hit = measureCache.get(key);
  if (hit !== undefined) return hit;

  if (measureCtx === undefined) {
    // Feature-DETECT rather than probe: jsdom defines CanvasRenderingContext2D
    // only when node-canvas is installed, and calling getContext('2d') without
    // it logs a "not implemented" through the virtual console on every suite.
    measureCtx = null;
    if (typeof document !== 'undefined' && typeof CanvasRenderingContext2D !== 'undefined') {
      try {
        measureCtx = document.createElement('canvas').getContext('2d');
      } catch {
        measureCtx = null;
      }
    }
  }

  let width: number;
  if (measureCtx) {
    measureCtx.font = font;
    width = measureCtx.measureText(text).width + tracking * text.length;
  } else {
    const px = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '12');
    width = text.length * (px * 0.55 + tracking);
  }

  measureCache.set(key, width);
  return width;
}

/** Card width for an entity — explicit width wins, else derived from content. */
export function entityAutoWidth(entity: ErEntitySpec, editable = false): number {
  if (entity.width != null) return entity.width;

  // The head is uppercased and tracked by CSS, so measure what is PAINTED
  // rather than what the author typed.
  const title = (entity.name ?? entity.id).toUpperCase();
  let needed = CARD_PAD_X + measureCardText(title, FONT_HEAD, HEAD_TRACKING);

  for (const c of entity.columns) {
    const name = measureCardText(c.name, c.pk ? FONT_COL_PK : FONT_COL);
    const type = Math.max(ER_TYPE_MIN_W, measureCardText(c.type ?? '', FONT_TYPE));
    needed = Math.max(
      needed,
      CARD_PAD_X +
        ER_KEY_W +
        ER_ROW_GAP +
        name +
        ER_ROW_GAP +
        type +
        (editable ? ER_ROW_GAP + CARD_DEL_W : 0)
    );
  }

  if (editable) {
    needed = Math.max(needed, CARD_PAD_X + measureCardText('\uFF0B add column', FONT_ADD));
  }

  return Math.min(CARD_MAX_AUTO_W, Math.max(ER_DEFAULT_WIDTH, Math.ceil(needed + CARD_SLACK_X)));
}

/**
 * The `.axk-uml` content tree. `editable` adds a delete control per member and
 * a trailing add affordance in each compartment.
 */
export function classCardContent(cls: UmlClassSpec, editable = false): HtmlNode {
  const attrs = cls.attributes ?? [];
  const methods = cls.methods ?? [];
  const italic = cls.abstract || cls.stereotype === 'abstract' || cls.stereotype === 'interface';

  // Non-editable output stays BYTE-IDENTICAL to the pre-editing builder (a
  // member is a text div); editable additions are purely additive.
  const member = (text: string): HtmlNode =>
    editable
      ? {
          tag: 'div',
          className: 'axk-member',
          children: [
            { tag: 'span', className: 'axk-mtext', text },
            { tag: 'span', className: 'axk-col-del', text: '×' },
          ],
        }
      : { tag: 'div', className: 'axk-member', text };

  const compartment = (members: string[], section: 'attributes' | 'methods'): HtmlNode => {
    const children: HtmlNode[] = members.map(member);
    if (editable) {
      children.push({
        tag: 'div',
        className: 'axk-uml-add',
        text: section === 'attributes' ? '＋ attribute' : '＋ method',
      });
    }
    return {
      tag: 'div',
      className: 'axk-uml-comp' + (members.length ? '' : ' axk-empty'),
      children,
    };
  };

  const name: HtmlNode = {
    tag: 'div',
    className: 'axk-uml-name' + (italic ? ' axk-abstract' : ''),
    children: [
      ...(cls.stereotype ? [{ tag: 'span', className: 'axk-uml-stereo', text: `«${cls.stereotype}»` } as HtmlNode] : []),
      { tag: 'span', text: cls.name ?? cls.id },
    ],
  };

  return {
    tag: 'div',
    className: 'axk-uml',
    children: [
      name,
      {
        tag: 'div',
        className: cls.height != null ? 'axk-uml-body axk-scroll' : 'axk-uml-body',
        children: [compartment(attrs, 'attributes'), compartment(methods, 'methods')],
      },
    ],
  };
}

/** Card height for a class — explicit height wins, else derived from members. */
export function classAutoHeight(cls: UmlClassSpec, editable = false): number {
  if (cls.height != null) return cls.height;
  const attrs = cls.attributes ?? [];
  const methods = cls.methods ?? [];
  const addRows = editable ? 2 : 0; // one "add" affordance per compartment
  return (
    UML_NAME_H +
    (cls.stereotype ? UML_STEREO_H : 0) +
    (attrs.length + methods.length + addRows) * UML_LINE_H +
    UML_PAD * 2 +
    12
  );
}

/** Card width for a class — explicit width wins, else derived from content. */
export function classAutoWidth(cls: UmlClassSpec, editable = false): number {
  if (cls.width != null) return cls.width;

  // `.axk-member` goes flex only when editable, and it has NO gap — the delete
  // control sits straight against the text.
  const del = editable ? CARD_DEL_W : 0;

  let needed = CARD_PAD_X + measureCardText(cls.name ?? cls.id, FONT_UML_NAME);
  if (cls.stereotype) {
    needed = Math.max(
      needed,
      CARD_PAD_X + measureCardText(`\u00AB${cls.stereotype}\u00BB`, FONT_UML_STEREO)
    );
  }

  for (const m of [...(cls.attributes ?? []), ...(cls.methods ?? [])]) {
    needed = Math.max(needed, CARD_PAD_X + measureCardText(m, FONT_MEMBER) + del);
  }

  if (editable) {
    for (const label of ['\uFF0B attribute', '\uFF0B method']) {
      needed = Math.max(needed, CARD_PAD_X + measureCardText(label, FONT_ADD));
    }
  }

  return Math.min(CARD_MAX_AUTO_W, Math.max(UML_DEFAULT_WIDTH, Math.ceil(needed + CARD_SLACK_X)));
}

/**
 * Match old columns to new columns for port reconciliation. Returns a map from
 * OLD index → NEW index; an old index absent from the map is a REMOVED column
 * (its pinned ports and their edges are dropped).
 *
 * Three passes, most-certain first, so a single edit is always read the way a
 * human means it:
 *   1. object identity — reorder / add / remove that preserved references;
 *   2. name — a retype (same name, new object) or a rebuilt array;
 *   3. positional remainder — the leftovers matched in order, which is exactly
 *      what a rename is (one old + one new in the same slot). Without pass 3 a
 *      rename reads as remove+add and the edge is severed.
 */
export function matchColumns(oldCols: ErColumn[], newCols: ErColumn[]): Map<number, number> {
  const out = new Map<number, number>();
  const usedNew = new Set<number>();
  const matchedOld = new Set<number>();

  const claim = (oldIdx: number, newIdx: number) => {
    out.set(oldIdx, newIdx);
    usedNew.add(newIdx);
    matchedOld.add(oldIdx);
  };

  // Pass 1: object identity.
  oldCols.forEach((oc, oi) => {
    const ni = newCols.indexOf(oc);
    if (ni !== -1 && !usedNew.has(ni)) claim(oi, ni);
  });
  // Pass 2: by name, among the unmatched.
  oldCols.forEach((oc, oi) => {
    if (matchedOld.has(oi)) return;
    const ni = newCols.findIndex((nc, i) => !usedNew.has(i) && nc.name === oc.name);
    if (ni !== -1) claim(oi, ni);
  });
  // Pass 3: positional remainder (rename / retype-and-rename).
  const remOld = oldCols.map((_, i) => i).filter((i) => !matchedOld.has(i));
  const remNew = newCols.map((_, i) => i).filter((i) => !usedNew.has(i));
  const n = Math.min(remOld.length, remNew.length);
  for (let k = 0; k < n; k++) claim(remOld[k]!, remNew[k]!);

  return out;
}
