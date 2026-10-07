/**
 * The notation silhouettes the base registry was missing.
 *
 * Group B of the stencil fidelity audit: nine masters had no shape to point at,
 * so they fell back to a rectangle — a Delay looked like a Process, a Weak
 * Entity like a plain Entity, an ISA triangle like a box. Each is registered
 * through the PUBLIC `registerPathShape` seam (the same one the shapes demo uses
 * for its star), so links attach to the real outline rather than a bounding box.
 *
 * The double-outline family (weak entity / weak relationship / multivalued
 * attribute) is the Chen-notation convention for "existence-dependent": the
 * inner outline is inset by {@link DOUBLE_INSET} px.
 */
import {
  registerPathShape,
  hasShape,
  getShapeDefinition,
  type PathShapeOptions,
} from './shape-registry';

/** Gap between the two outlines of a "double" ERD shape. */
const DOUBLE_INSET = 5;

const rectPath = (x: number, y: number, w: number, h: number) =>
  `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;

const diamondPath = (x: number, y: number, w: number, h: number) =>
  `M ${x + w / 2} ${y} L ${x + w} ${y + h / 2} L ${x + w / 2} ${y + h} L ${x} ${y + h / 2} Z`;

/** An axis-aligned ellipse as two arcs (path form, so it composes with insets). */
const ellipsePath = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;

/** The same ellipse wound the OTHER way (sweep 1) — a nonzero-rule fill HOLE. */
const ellipsePathCCW = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy} Z`;

/** Register every notation shape that the base registry does not already own. */
export function registerNotationShapes(): void {
  // ── Flowchart ──────────────────────────────────────────────────────────────
  // Delay: a rectangle whose RIGHT edge is a half-round cap (ISO 5807).
  define('delay', (w, h) => {
    const r = h / 2;
    return `M 0 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w - r} ${h} L 0 ${h} Z`;
  });

  // Display: left edge swept inward, right edge rounded — the CRT/monitor glyph.
  define('display', (w, h) => {
    const r = h / 2;
    const lead = Math.min(w * 0.18, r);
    return `M ${lead} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w - r} ${h} L ${lead} ${h} Q 0 ${h / 2} ${lead} 0 Z`;
  });

  // Summing junction: a circle crossed by its two diagonals (✕).
  define('summing-junction', (w, h) => {
    const r = Math.min(w, h) / 2, cx = w / 2, cy = h / 2, d = r * Math.SQRT1_2;
    return `${ellipsePath(cx, cy, r, r)} M ${cx - d} ${cy - d} L ${cx + d} ${cy + d} M ${cx + d} ${cy - d} L ${cx - d} ${cy + d}`;
  });

  // OR: a circle crossed by its vertical and horizontal axes (✚).
  define('or-junction', (w, h) => {
    const r = Math.min(w, h) / 2, cx = w / 2, cy = h / 2;
    return `${ellipsePath(cx, cy, r, r)} M ${cx - r} ${cy} L ${cx + r} ${cy} M ${cx} ${cy - r} L ${cx} ${cy + r}`;
  });

  // ── UML activity ───────────────────────────────────────────────────────────
  // Fork / join: a solid synchronisation BAR, not a full-height box. Kept as a
  // band centred in the node box so the node can still be sized normally.
  define('sync-bar', (w, h) => {
    const t = Math.max(4, Math.min(h, 8));           // bar thickness
    const y = (h - t) / 2;
    return rectPath(0, y, w, t);
  });

  // ── ERD (Chen) double outlines ─────────────────────────────────────────────
  define('double-rect', (w, h) =>
    `${rectPath(0, 0, w, h)} ${rectPath(DOUBLE_INSET, DOUBLE_INSET, w - DOUBLE_INSET * 2, h - DOUBLE_INSET * 2)}`);

  define('double-diamond', (w, h) =>
    `${diamondPath(0, 0, w, h)} ${diamondPath(DOUBLE_INSET, DOUBLE_INSET, w - DOUBLE_INSET * 2, h - DOUBLE_INSET * 2)}`);

  define('double-ellipse', (w, h) =>
    `${ellipsePath(w / 2, h / 2, w / 2, h / 2)} ${ellipsePath(w / 2, h / 2, w / 2 - DOUBLE_INSET, h / 2 - DOUBLE_INSET)}`);

  // ── BPMN gateways ──────────────────────────────────────────────────────────
  // A gateway's IDENTITY is its inner marker, not its caption: exclusive = ✕,
  // inclusive = ◯ ring, parallel = ＋ (BPMN 2.0 §10.6). The markers are extra
  // subpaths of the diamond path: line subpaths have zero area, so `fill`
  // paints only the diamond while `stroke` draws the marker; the ring subpath
  // is wound the same direction as the diamond, so nonzero filling leaves it
  // an outline. Links, ports and the caption's geometry delegate to the plain
  // diamond so the marker never distorts attachment points.
  const diamondGeom = delegateTo('diamond');
  define('gateway-xor', (w, h) => {
    const cx = w / 2, cy = h / 2, a = Math.min(w, h) * 0.18;
    return `${diamondPath(0, 0, w, h)} M ${r3(cx - a)} ${r3(cy - a)} L ${r3(cx + a)} ${r3(cy + a)} M ${r3(cx + a)} ${r3(cy - a)} L ${r3(cx - a)} ${r3(cy + a)}`;
  }, diamondGeom);
  define('gateway-or', (w, h) => {
    const r = Math.min(w, h) * 0.22;
    return `${diamondPath(0, 0, w, h)} ${ellipsePath(w / 2, h / 2, r, r)}`;
  }, diamondGeom);
  define('gateway-and', (w, h) => {
    const cx = w / 2, cy = h / 2, a = Math.min(w, h) * 0.24;
    return `${diamondPath(0, 0, w, h)} M ${r3(cx - a)} ${cy} L ${r3(cx + a)} ${cy} M ${cx} ${r3(cy - a)} L ${cx} ${r3(cy + a)}`;
  }, diamondGeom);

  // ── BPMN events ────────────────────────────────────────────────────────────
  // An intermediate event is a DOUBLE ring (start = thin single, end = thick
  // single — those two stay `circle` and differ by strokeWidth, which is
  // template data). Same double-outline device as the Chen shapes; geometry
  // delegates to the plain circle.
  define('event-intermediate', (w, h) => {
    const r = Math.min(w, h) / 2, cx = w / 2, cy = h / 2;
    const inset = Math.max(3, r * 0.18);
    return `${ellipsePath(cx, cy, r, r)} ${ellipsePath(cx, cy, r - inset, r - inset)}`;
  }, delegateTo('circle'));

  // ── UML final node / final state ───────────────────────────────────────────
  // A BULLS-EYE: thin outer ring + solid inner dot — what tells a final node
  // apart from the initial node's plain filled disc. Painted from FILL alone by
  // WINDING: outer circle clockwise, ring-hole circle COUNTER-clockwise (the
  // nonzero rule leaves the band between them filled and the gap empty), inner
  // dot clockwise again. Works with any fill colour the template declares;
  // stroke should stay thin (it outlines each circle).
  define('final-node', (w, h) => {
    const r = Math.min(w, h) / 2, cx = w / 2, cy = h / 2;
    const band = Math.max(2, r * 0.16);          // outer ring line thickness
    return `${ellipsePath(cx, cy, r, r)} ${ellipsePathCCW(cx, cy, r - band, r - band)} ${ellipsePath(cx, cy, r * 0.5, r * 0.5)}`;
  }, delegateTo('circle'));
}

/** Round to 3 decimals, matching the registry's own vertex formatting. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Geometry options that delegate ports / link attachment / label box to an
 * already-registered base figure — used by shapes whose path carries interior
 * MARKER subpaths. `registerPathShape` otherwise derives anchors by sampling
 * every subpath, and a marker in the middle would pull them off the outline.
 */
function delegateTo(base: string): PathShapeOptions {
  const def = getShapeDefinition(base);
  return def
    ? { portAnchor: def.portAnchor, boundaryPoint: def.boundaryPoint, innerRect: def.innerRect }
    : {};
}

/** Register `type` unless something already owns that name (never clobber). */
function define(type: string, path: (w: number, h: number) => string, opts?: PathShapeOptions): void {
  if (hasShape(type)) return;
  registerPathShape(type, path, opts);
}
