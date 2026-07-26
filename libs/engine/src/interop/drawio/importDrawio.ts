// .drawio (mxGraph XML) IMPORT — import-only, bounded, honest about loss.
//
// draw.io / diagrams.net is the largest installed base of free diagramming in
// existence, and its files are the migration on-ramp: a team does not adopt a
// new engine by retyping its diagrams. This module reads both shapes of the
// format —
//
//   (a) plain `<mxGraphModel>` XML (what "uncompressed" saves and most
//       programmatic exporters emit), and
//   (b) the `<mxfile><diagram>…</diagram></mxfile>` wrapper whose page payload
//       is base64 → raw-deflate → URI-encoded XML (draw.io's DEFAULT save
//       format; decoded with `DecompressionStream('deflate-raw')`, global in
//       Node ≥ 18 and every modern browser)
//
// — and maps the mxGraph cell tree onto the engine's own models.
//
// THE HONESTY CONTRACT. mxGraph expresses more than this importer maps (exotic
// stencil shapes, collapsed containers, layers). Nothing unmapped is dropped in
// silence: every dropped construct appends a NAMED warning to the result, so a
// user can see exactly what their file lost — the same "never hide the loss"
// stance TextFormat.ts takes for Mermaid.
//
// COORDINATES. mxGraph child geometry is RELATIVE TO ITS PARENT cell; the
// engine's node positions are world-absolute. The importer walks each cell's
// parent chain and sums origins, so a node 20px inside a container that sits
// at (300,80) lands at (320,…) — nested containers nest the sum. Edge
// waypoints live in the EDGE's parent space and get the same conversion.
//
// MULTI-PAGE. A file with more than one `<diagram>` returns every page under
// `pages[]`, each decoded and compiled INDEPENDENTLY — one corrupt page fails
// alone with its own `error` entry instead of sinking the file. The top-level
// `diagram` stays page 1 (back-compatible), and the top-level warnings are
// page 1's plus the file-level ones.

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { GroupModel } from '../../models/GroupModel';
import type { LinkModel } from '../../models/LinkModel';
import type { ArrowStyle, LinkStyle, LabelStyle, Point } from '../../types';
import { parseXml, XmlElement } from './xml';

/** One page of a multi-page file, decoded and compiled on its own. */
export interface DrawioPage {
  /** The page's `name` attribute, or "Page N" when the file has none. */
  name: string;
  /** Zero-based position of the page in the file. */
  index: number;
  /** The page's imported diagram — absent when `error` is set. */
  diagram?: DiagramModel;
  /** This page's own named-loss warnings. */
  warnings: string[];
  /** Fatal FOR THIS PAGE only: the page payload is not readable. */
  error?: string;
}

export interface DrawioImportResult {
  /** The imported diagram (page 1 of a multi-page file) — absent when `error` is set. */
  diagram?: DiagramModel;
  /**
   * Every construct the import dropped or approximated, one NAMED entry each.
   * Empty means the file mapped cleanly. For a multi-page file: page 1's
   * warnings plus the file-level ones (including any later page's failure).
   */
  warnings: string[];
  /** Fatal: the text is not a readable .drawio document. Never thrown. */
  error?: string;
  /**
   * Present ONLY when the file carries more than one `<diagram>` page.
   * `diagram === pages[0].diagram`; every page imports independently.
   */
  pages?: DrawioPage[];
}

// ---------------------------------------------------------------------------
// The normalized cell — one flat record per mxCell, wrappers unwrapped.
// ---------------------------------------------------------------------------

interface RawGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  relative: boolean;
}

interface RawCell {
  id: string;
  parent?: string;
  vertex: boolean;
  edge: boolean;
  source?: string;
  target?: string;
  style: string;
  /** Label text, HTML already stripped. */
  value: string;
  /** UserObject `link` attribute (a hyperlink), when wrapped. */
  link?: string;
  /** Remaining UserObject attributes — custom data, kept not dropped. */
  data?: Record<string, string>;
  geometry?: RawGeometry;
  /** Manual edge waypoints from `<Array as="points">`, in the edge's PARENT space. */
  waypoints?: Array<{ x: number; y: number }>;
  collapsed: boolean;
  /** `<mxRectangle as="alternateBounds">` — the EXPANDED size of a collapsed container. */
  alternate?: { width: number; height: number };
}

// ---------------------------------------------------------------------------
// Style strings — `key=value;bareToken;…`
// ---------------------------------------------------------------------------

interface ParsedStyle {
  /** key → value for `k=v` tokens; bare tokens map to ''. Order preserved by Map. */
  tokens: Map<string, string>;
  /** The leading BARE token (`ellipse;…`, `swimlane;…`) — mxGraph's shape slot. */
  first?: string;
}

function parseStyle(style: string): ParsedStyle {
  const tokens = new Map<string, string>();
  let first: string | undefined;
  let index = 0;
  for (const part of style.split(';')) {
    const token = part.trim();
    if (!token) continue;
    const eq = token.indexOf('=');
    if (eq === -1) {
      if (index === 0) first = token;
      tokens.set(token, '');
    } else {
      tokens.set(token.slice(0, eq), token.slice(eq + 1));
    }
    index++;
  }
  return { tokens, first };
}

/**
 * mxGraph shape token → engine shape-registry name. The engine's registry
 * (renderer shape-library) uses its own vocabulary — `rhombus` there is
 * `diamond` here. Only tokens with a REAL counterpart are mapped; anything
 * else falls back to `rect` WITH a warning naming the token, because a wrong
 * silhouette that looks deliberate is worse than a rectangle that looks like
 * a fallback.
 */
const SHAPE_MAP: Record<string, string> = {
  ellipse: 'ellipse',
  rhombus: 'diamond',
  triangle: 'triangle',
  hexagon: 'hexagon',
  cylinder: 'cylinder',
  cylinder3: 'cylinder', // draw.io's current cylinder is shape=cylinder3
};

/**
 * mxGraph edge-marker token → the engine's ArrowStyle vocabulary. Only tokens
 * with a REAL counterpart are mapped; an unknown token keeps the engine's
 * default marker WITH a warning naming it. The `Thin` variants share their
 * base silhouette — the engine does not model barb thickness.
 */
const ARROW_MAP: Record<string, ArrowStyle['type']> = {
  classic: 'arrow',
  classicThin: 'arrow',
  block: 'arrow',
  blockThin: 'arrow',
  open: 'open-arrow',
  openThin: 'open-arrow',
  openAsync: 'open-arrow',
  oval: 'oval',
  diamond: 'diamond',
  diamondThin: 'diamond',
  cross: 'cross',
  dash: 'bar',
  box: 'square',
  circle: 'circle',
  circlePlus: 'circle',
  // ER notation — draw.io's ER endpoints map 1:1 onto the engine's ERD arrows.
  ERone: 'one',
  ERmandOne: 'one',
  ERmany: 'crow-foot',
  ERoneToMany: 'one-or-many',
  ERzeroToOne: 'zero-or-one',
  ERzeroToMany: 'zero-or-many',
  none: 'none',
};

/** Markers that are outlines by construction — `startFill`/`endFill` cannot fill them. */
const OPEN_ARROW_TOKENS = new Set(['open', 'openThin', 'openAsync', 'cross', 'dash']);

/**
 * Style keys the importer CONSUMES (mapped into the model). Everything else
 * lands in one aggregated "unmapped style keys" warning — deduped, because a
 * 200-cell file repeating `html=1` should say it once, not 200 times.
 */
const CONSUMED_STYLE_KEYS = new Set([
  'shape',
  'rounded',
  'arcSize',
  'absoluteArcSize',
  'fillColor',
  'strokeColor',
  'strokeWidth',
  'opacity',
  'dashed',
  'fontColor',
  'fontSize',
  'edgeStyle',
  'curved',
  'startArrow',
  'endArrow',
  'startFill',
  'endFill',
  'text',
  'swimlane',
  'group',
  'edgeLabel',
  ...Object.keys(SHAPE_MAP),
]);

// ---------------------------------------------------------------------------
// Label text — draw.io `value` attributes are HTML fragments
// ---------------------------------------------------------------------------

/**
 * `value="<b>Start</b><br>here"` must become "Start here", not carry markup
 * into the label canon. Block/line-break boundaries turn into single spaces so
 * words do not fuse.
 *
 * Entities are decoded a SECOND time here, after the tags are gone. The XML
 * reader already decoded one level — but with `html=1` (draw.io's default) the
 * value is an HTML FRAGMENT, so an author's literal `&` was double-encoded on
 * save (`&amp;amp;`) and one decode still leaves `&amp;` in the label.
 */
export function stripHtmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(div|p|li|tr|h[1-6])>/gi, ' ')
      .replace(/<[^>]*>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return HTML_ENTITIES[body] ?? whole; // unknown names stay literal, never vanish
  });
}

// ---------------------------------------------------------------------------
// The compressed <diagram> payload
// ---------------------------------------------------------------------------

/**
 * base64 → raw-deflate → URI-encoded XML. This is `Graph.decompress` from
 * draw.io itself, expressed with web-standard primitives only: `atob`,
 * `DecompressionStream('deflate-raw')`, `TextDecoder`, `decodeURIComponent` —
 * all global in Node ≥ 18 and modern browsers, so the headless engine needs
 * no dependency and no DOM. Feature-detected: a runtime without
 * DecompressionStream gets an error NAMING the missing API, not a crash.
 */
async function inflateDrawioPayload(b64: string): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      "this runtime has no DecompressionStream('deflate-raw') — compressed .drawio pages need Node >= 18 or a modern browser; export the file uncompressed (File > Properties > Compressed: off) as a workaround"
    );
  }
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const inflated = await new Response(stream).arrayBuffer();
  // The inflated bytes are the ASCII of an encodeURIComponent()'d string; the
  // URI-decode is what restores the actual UTF-8 characters.
  return decodeURIComponent(new TextDecoder().decode(inflated));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Import a .drawio / mxGraph XML document.
 *
 * Accepts plain `<mxGraphModel>` XML or a full `<mxfile>` (compressed or not).
 * A multi-page file imports EVERY page: `diagram` is page 1 (back-compatible)
 * and `pages[]` — present only when the file has more than one `<diagram>` —
 * carries each page's own diagram, warnings, and (for a corrupt page) error.
 * Never throws: unreadable input comes back as `{ error }`.
 */
export async function importDrawio(text: string): Promise<DrawioImportResult> {
  const unreadable = (e: unknown): string =>
    `not a readable .drawio document: ${(e as Error).message}`;

  let root: XmlElement;
  try {
    root = parseXml(text.trim());
  } catch (e) {
    return { warnings: [], error: unreadable(e) };
  }

  // (a) A bare model — one page by construction.
  if (root.tag === 'mxGraphModel') {
    const warnings: string[] = [];
    try {
      return { diagram: buildDiagram(root, warnings), warnings };
    } catch (e) {
      return { warnings, error: unreadable(e) };
    }
  }

  if (root.tag !== 'mxfile') {
    return {
      warnings: [],
      error: `not a readable .drawio document: root element is <${root.tag}>, expected <mxGraphModel> or <mxfile>`,
    };
  }
  const pageEls = root.children.filter((c) => c.tag === 'diagram');
  if (pageEls.length === 0) {
    return { warnings: [], error: 'not a readable .drawio document: <mxfile> contains no <diagram> page' };
  }

  // (b) Single-page <mxfile> — the classic path, no pages[] array.
  if (pageEls.length === 1) {
    const warnings: string[] = [];
    try {
      return { diagram: buildDiagram(await resolvePageModel(pageEls[0]), warnings), warnings };
    } catch (e) {
      return { warnings, error: unreadable(e) };
    }
  }

  // (c) MULTI-PAGE: each page decodes and compiles INDEPENDENTLY, so one
  // corrupt page fails alone (its own error entry) instead of sinking the file.
  const pages: DrawioPage[] = [];
  for (let index = 0; index < pageEls.length; index++) {
    const el = pageEls[index];
    const name = el.attrs['name'] ?? `Page ${index + 1}`;
    const warnings: string[] = [];
    try {
      pages.push({ name, index, diagram: buildDiagram(await resolvePageModel(el), warnings), warnings });
    } catch (e) {
      pages.push({
        name,
        index,
        warnings,
        error: `page ${index + 1} ("${name}") is not readable: ${(e as Error).message}`,
      });
    }
  }
  const first = pages[0];
  const warnings = [
    `page 1 of ${pages.length} ("${first.name}") is the primary diagram; all ${pages.length} pages imported under pages[]`,
    ...first.warnings,
    // A later page's failure is file-level news, named once here too.
    ...pages.slice(1).flatMap((p) => (p.error ? [p.error] : [])),
  ];
  return {
    ...(first.diagram ? { diagram: first.diagram } : {}),
    warnings,
    ...(first.error ? { error: first.error } : {}),
    pages,
  };
}

/** Resolve one `<diagram>` element to its `<mxGraphModel>` (inflating a compressed payload). */
async function resolvePageModel(page: XmlElement): Promise<XmlElement> {
  // Uncompressed save: the model is a literal child element of <diagram>.
  const inline = page.children.find((c) => c.tag === 'mxGraphModel');
  if (inline) return inline;
  // Compressed save: the model travels as the element's TEXT payload.
  if (!page.text) throw new Error('the <diagram> page is empty');
  const xml = await inflateDrawioPayload(page.text);
  const inner = parseXml(xml.trim());
  if (inner.tag !== 'mxGraphModel') {
    throw new Error(`the decompressed page is <${inner.tag}>, expected <mxGraphModel>`);
  }
  return inner;
}

// ---------------------------------------------------------------------------
// Cell tree → engine models
// ---------------------------------------------------------------------------

function num(v: string | undefined, fallback = 0): number {
  const n = v === undefined ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Read one cell element (or a UserObject/object wrapper around one) into a RawCell. */
function readCell(el: XmlElement): RawCell | undefined {
  let cellEl = el;
  let value = el.attrs['value'] ?? '';
  let link: string | undefined;
  let data: Record<string, string> | undefined;

  // UserObject / object wrappers: draw.io moves the label (and any custom
  // attributes) OUT to the wrapper and nests the mxCell inside. Unwrap; keep
  // label + link; carry the remaining attributes as data rather than losing them.
  if (el.tag !== 'mxCell') {
    const inner = el.children.find((c) => c.tag === 'mxCell');
    if (!inner) return undefined; // not a cell-shaped element at all
    cellEl = inner;
    value = el.attrs['label'] ?? '';
    link = el.attrs['link'];
    const rest = Object.entries(el.attrs).filter(([k]) => !['id', 'label', 'link'].includes(k));
    if (rest.length > 0) data = Object.fromEntries(rest);
  }

  const cell: RawCell = {
    id: el.attrs['id'] ?? cellEl.attrs['id'] ?? '',
    parent: cellEl.attrs['parent'],
    vertex: cellEl.attrs['vertex'] === '1',
    edge: cellEl.attrs['edge'] === '1',
    source: cellEl.attrs['source'],
    target: cellEl.attrs['target'],
    style: cellEl.attrs['style'] ?? '',
    value: stripHtmlToText(value),
    link,
    data,
    collapsed: cellEl.attrs['collapsed'] === '1',
  };

  const geo = cellEl.children.find((c) => c.tag === 'mxGeometry' && c.attrs['as'] === 'geometry');
  if (geo) {
    cell.geometry = {
      x: num(geo.attrs['x']),
      y: num(geo.attrs['y']),
      width: num(geo.attrs['width']),
      height: num(geo.attrs['height']),
      relative: geo.attrs['relative'] === '1',
    };
    const points = geo.children.find((c) => c.tag === 'Array' && c.attrs['as'] === 'points');
    if (points) {
      cell.waypoints = points.children
        .filter((c) => c.tag === 'mxPoint')
        .map((p) => ({ x: num(p.attrs['x']), y: num(p.attrs['y']) }));
    }
    const alt = geo.children.find((c) => c.tag === 'mxRectangle' && c.attrs['as'] === 'alternateBounds');
    if (alt) cell.alternate = { width: num(alt.attrs['width']), height: num(alt.attrs['height']) };
  }
  return cell;
}

function buildDiagram(model: XmlElement, warnings: string[]): DiagramModel {
  const rootEl = model.children.find((c) => c.tag === 'root');
  if (!rootEl) throw new Error('<mxGraphModel> has no <root>');

  const cells = new Map<string, RawCell>();
  for (const el of rootEl.children) {
    const cell = readCell(el);
    if (cell && cell.id) cells.set(cell.id, cell);
  }

  // STRUCTURE. The mxGraph tree is: one root cell (no parent) → layer cells
  // (parent = root) → content (parent = a layer, or a container vertex, or —
  // for edge labels — an edge).
  const rootId = [...cells.values()].find((c) => c.parent === undefined)?.id;
  const layerIds = new Set(
    [...cells.values()].filter((c) => c.parent !== undefined && c.parent === rootId).map((c) => c.id)
  );
  const namedLayers = [...layerIds].filter((id) => !cells.get(id)!.vertex && !cells.get(id)!.edge);
  if (namedLayers.length > 1) {
    warnings.push(`${namedLayers.length} layers flattened onto one canvas; layers pending`);
  }

  // Which cells do other cells name as parent? Those vertices are CONTAINERS.
  const parentRefs = new Set<string>();
  for (const c of cells.values()) {
    if (c.parent && !layerIds.has(c.parent) && c.parent !== rootId) parentRefs.add(c.parent);
  }

  const isStructural = (c: RawCell): boolean => c.id === rootId || layerIds.has(c.id);
  const isContainer = (c: RawCell): boolean => {
    if (!c.vertex || isStructural(c)) return false;
    const style = parseStyle(c.style);
    return style.first === 'swimlane' || style.tokens.has('group') || parentRefs.has(c.id);
  };
  const isEdgeLabel = (c: RawCell): boolean => {
    if (!c.vertex || !c.parent) return false;
    const parent = cells.get(c.parent);
    return !!parent?.edge || parseStyle(c.style).tokens.has('edgeLabel');
  };

  // ABSOLUTE ORIGIN of a cell's coordinate space = the summed positions of its
  // ancestor CONTAINERS. Root and layers contribute nothing; a broken parent
  // ref contributes nothing rather than exploding.
  const originMemo = new Map<string, { x: number; y: number }>();
  const absoluteOrigin = (parentId: string | undefined, hops = 0): { x: number; y: number } => {
    if (!parentId || hops > cells.size) return { x: 0, y: 0 };
    const parent = cells.get(parentId);
    if (!parent || isStructural(parent) || !parent.geometry) return { x: 0, y: 0 };
    const memo = originMemo.get(parentId);
    if (memo) return memo;
    const above = absoluteOrigin(parent.parent, hops + 1);
    const origin = { x: above.x + parent.geometry.x, y: above.y + parent.geometry.y };
    originMemo.set(parentId, origin);
    return origin;
  };

  const diagram = new DiagramModel('drawio-import');
  const unmappedStyleKeys = new Set<string>();
  const groupsById = new Map<string, GroupModel>();
  const nodesById = new Map<string, NodeModel>();
  const edgeCells: RawCell[] = [];

  // -- pass 1: containers → GroupModels (parents must exist before membership) --
  for (const cell of cells.values()) {
    if (!isContainer(cell) || isEdgeLabel(cell)) continue;
    const origin = absoluteOrigin(cell.parent);
    const geo = cell.geometry ?? { x: 0, y: 0, width: 200, height: 160, relative: false };
    // A collapsed container's live geometry is its COLLAPSED pill;
    // alternateBounds carries the expanded frame. Imported expanded.
    let { width, height } = geo;
    if (cell.collapsed) {
      if (cell.alternate) ({ width, height } = cell.alternate);
      warnings.push(`collapsed container "${cell.id}" imported expanded; collapse state pending`);
    }
    const group = new GroupModel({ id: cell.id, name: cell.value || 'Group' });
    diagram.addGroup(group);
    group.setFrame({ x: origin.x + geo.x, y: origin.y + geo.y, width, height });
    collectUnmappedStyleKeys(cell.style, unmappedStyleKeys);
    groupsById.set(cell.id, group);
  }

  // -- pass 2: vertices → NodeModels ------------------------------------------
  for (const cell of cells.values()) {
    if (!cell.vertex || isStructural(cell) || groupsById.has(cell.id)) continue;
    if (isEdgeLabel(cell)) continue; // consumed by its edge in pass 4
    if (cell.geometry?.relative) {
      warnings.push(`cell "${cell.id}" has relative geometry outside an edge; imported at its parent's origin`);
    }
    const origin = absoluteOrigin(cell.parent);
    const geo = cell.geometry ?? { x: 0, y: 0, width: 0, height: 0, relative: false };
    const node = new NodeModel({
      id: cell.id,
      type: 'default',
      position: { x: origin.x + geo.x, y: origin.y + geo.y },
      size: { width: geo.width || 100, height: geo.height || 50 },
    });
    applyVertexStyle(node, cell, warnings, unmappedStyleKeys);
    if (cell.value) node.setLabel(cell.value);
    if (cell.link) node.setMetadata('drawioLink', cell.link);
    if (cell.data) node.setMetadata('drawioData', cell.data);
    diagram.addNode(node);
    nodesById.set(cell.id, node);
  }

  // -- pass 3: membership (groups and nodes both exist now) -------------------
  for (const cell of cells.values()) {
    const parentGroup = cell.parent ? groupsById.get(cell.parent) : undefined;
    if (!parentGroup || cell.id === rootId) continue;
    if (groupsById.has(cell.id) || nodesById.has(cell.id)) {
      parentGroup.addMember(cell.id, diagram);
    }
  }

  // -- pass 4: edges → LinkModels ---------------------------------------------
  for (const cell of cells.values()) {
    if (cell.edge) edgeCells.push(cell);
  }

  /** World-space center of whatever an endpoint id resolves to (node or container frame). */
  const endpointCenter = (id: string | undefined): Point | undefined => {
    if (!id) return undefined;
    const n = nodesById.get(id);
    if (n) return { x: n.position.x + n.size.width / 2, y: n.position.y + n.size.height / 2 };
    const g = groupsById.get(id);
    if (g) {
      const f = g.getOuterBounds();
      return { x: f.x + f.width / 2, y: f.y + f.height / 2 };
    }
    return undefined;
  };

  for (const cell of edgeCells) {
    // Waypoints are authored in the EDGE's parent space — same conversion as
    // vertex geometry (an edge inside a container carries container-relative
    // waypoints).
    const edgeOrigin = absoluteOrigin(cell.parent);
    const absWaypoints = (cell.waypoints ?? []).map((p) => ({
      x: p.x + edgeOrigin.x,
      y: p.y + edgeOrigin.y,
    }));

    const endpointExists = (id: string | undefined): boolean =>
      !!id && (nodesById.has(id) || groupsById.has(id));
    if (!endpointExists(cell.source) || !endpointExists(cell.target)) {
      warnings.push(`edge "${cell.id}" skipped: ${describeMissingEndpoint(cell, nodesById)}`);
      continue;
    }

    // CONTAINER ENDPOINTS. draw.io lets an edge end ON a container. The
    // engine's links connect node ports, and a GroupModel is a frame, not a
    // node — so the importer synthesizes an INVISIBLE 1×1 anchor node pinned
    // to the container frame's perimeter nearest the other endpoint (or the
    // adjacent manual waypoint, which is where draw.io actually aimed the
    // line). The anchor is group-owned and marked metadata.drawioContainerAnchor,
    // so round-trips and tooling can tell it from authored content.
    const resolveEndpoint = (side: 'source' | 'target'): NodeModel => {
      const id = (side === 'source' ? cell.source : cell.target)!;
      const direct = nodesById.get(id);
      if (direct) return direct;
      const group = groupsById.get(id)!;
      const frame = group.getOuterBounds();
      const toward =
        (side === 'source' ? absWaypoints[0] : absWaypoints[absWaypoints.length - 1]) ??
        endpointCenter(side === 'source' ? cell.target : cell.source) ??
        { x: frame.x + frame.width / 2, y: frame.y - 20 };
      const pin = nearestPerimeterPoint(frame, toward);
      const anchor = new NodeModel({
        id: `drawio-anchor:${cell.id}:${side}`,
        type: 'default',
        position: { x: pin.x - 0.5, y: pin.y - 0.5 },
        size: { width: 1, height: 1 },
      });
      anchor.setMetadata('shape', { type: 'rect', fill: 'none', stroke: 'none' });
      anchor.setMetadata('drawioContainerAnchor', group.id);
      diagram.addNode(anchor);
      group.addMember(anchor.id, diagram);
      return anchor;
    };

    const source = resolveEndpoint('source');
    const target = resolveEndpoint('target');

    const style = parseStyle(cell.style);
    // draw.io's default connector is orthogonal; only carry that hint over —
    // everything else routes as the engine's default smooth path. curved=1 is
    // draw.io's "draw this as a curve" flag, whatever the routing style.
    const orthogonal =
      style.tokens.get('edgeStyle')?.toLowerCase().includes('orthogonal') === true &&
      style.tokens.get('curved') !== '1';
    const link = diagram.createSmartLink(source, target, orthogonal ? 'orthogonal' : 'smooth');
    if (!link) {
      warnings.push(`edge "${cell.id}" skipped: no connectable ports between "${cell.source}" and "${cell.target}"`);
      continue;
    }
    link.setMetadata('drawioId', cell.id);

    const labelCell = findEdgeLabelChild(cell.id, cells);
    const labelText = cell.value || labelCell?.value || '';
    if (labelText) link.setLabel(labelText);
    applyEdgeStyle(link, cell, labelCell, labelText, warnings, unmappedStyleKeys);

    if (absWaypoints.length > 0) {
      // MANUAL WAYPOINTS APPLY. The full polyline is the routed attach points
      // with the author's waypoints between them; hasManualWaypoints makes the
      // router respect it (and the layout invalidation clears it the moment a
      // layout moves an endpoint — the contract that makes applying safe).
      // The authored points stay under metadata.drawioWaypoints as provenance.
      link.setMetadata('drawioWaypoints', cell.waypoints);
      const routed = link.points;
      const start = routed[0] ?? endpointCenter(source.id)!;
      const end = routed[routed.length - 1] ?? endpointCenter(target.id)!;
      link.setPoints([{ ...start }, ...absWaypoints, { ...end }]);
      link.setMetadata('hasManualWaypoints', true);
    }
    collectUnmappedStyleKeys(cell.style, unmappedStyleKeys);
  }

  if (unmappedStyleKeys.size > 0) {
    warnings.push(`unmapped style keys dropped: ${[...unmappedStyleKeys].sort().join(', ')}`);
  }
  return diagram;
}

/** The closest point ON the PERIMETER of a rectangle to `toward` (inside or out). */
function nearestPerimeterPoint(
  frame: { x: number; y: number; width: number; height: number },
  toward: Point
): Point {
  const left = frame.x;
  const right = frame.x + frame.width;
  const top = frame.y;
  const bottom = frame.y + frame.height;
  const cx = Math.min(Math.max(toward.x, left), right);
  const cy = Math.min(Math.max(toward.y, top), bottom);
  if (toward.x !== cx || toward.y !== cy) return { x: cx, y: cy }; // outside: clamp lands on the edge
  // Inside: push to the nearest of the four edges.
  const candidates: Array<{ d: number; p: Point }> = [
    { d: cx - left, p: { x: left, y: cy } },
    { d: right - cx, p: { x: right, y: cy } },
    { d: cy - top, p: { x: cx, y: top } },
    { d: bottom - cy, p: { x: cx, y: bottom } },
  ];
  candidates.sort((a, b) => a.d - b.d);
  return candidates[0].p;
}

/** Human wording for WHY an edge endpoint failed to resolve. */
function describeMissingEndpoint(cell: RawCell, nodes: Map<string, NodeModel>): string {
  const side = (name: 'source' | 'target', id: string | undefined): string | undefined => {
    if (!id) return `no ${name}`;
    if (nodes.has(id)) return undefined;
    return `${name} "${id}" does not exist`;
  };
  return [side('source', cell.source), side('target', cell.target)].filter(Boolean).join('; ');
}

/** The label a draw.io edge stores as a CHILD cell (style edgeLabel, parent = the edge). */
function findEdgeLabelChild(edgeId: string, cells: Map<string, RawCell>): RawCell | undefined {
  for (const c of cells.values()) {
    if (c.parent === edgeId && c.vertex && c.value) return c;
  }
  return undefined;
}

/**
 * `startArrow`/`endArrow` token → the engine's ArrowStyle. `undefined` (token
 * absent) keeps the engine default — which matches draw.io's own defaults
 * (classic arrow at the target, nothing at the source). Unknown tokens keep
 * the default too, WITH a warning naming them.
 */
function mapArrowToken(
  token: string | undefined,
  fillAttr: string | undefined,
  edgeId: string,
  end: 'start' | 'end',
  warnings: string[]
): ArrowStyle | undefined {
  if (token === undefined || token === '') return undefined;
  const mapped = ARROW_MAP[token];
  if (!mapped) {
    warnings.push(`unknown ${end}Arrow token "${token}" on edge "${edgeId}"; engine default kept`);
    return undefined;
  }
  const filled = mapped !== 'none' && !OPEN_ARROW_TOKENS.has(token) && fillAttr !== '0';
  return { type: mapped, size: 10, filled };
}

/**
 * Edge visuals: markers, stroke paints, curvature/corner hints, label style.
 * Everything here PAINTS through LinkStyle — the renderer's own vocabulary —
 * rather than riding as inert metadata.
 */
function applyEdgeStyle(
  link: LinkModel,
  cell: RawCell,
  labelCell: RawCell | undefined,
  labelText: string,
  warnings: string[],
  unmapped: Set<string>
): void {
  const t = parseStyle(cell.style).tokens;
  const styleBag: Partial<LinkStyle> = {};

  // Markers. endArrow → arrowHead (target), startArrow → arrowTail (source) —
  // draw.io edges run source → target exactly like the engine's links.
  const head = mapArrowToken(t.get('endArrow'), t.get('endFill'), cell.id, 'end', warnings);
  if (head) styleBag.arrowHead = head;
  const tail = mapArrowToken(t.get('startArrow'), t.get('startFill'), cell.id, 'start', warnings);
  if (tail && tail.type !== 'none') styleBag.arrowTail = tail;

  // Stroke paints.
  const strokeColor = t.get('strokeColor');
  if (strokeColor && strokeColor.toLowerCase() !== 'none') styleBag.stroke = strokeColor;
  if (t.get('strokeWidth')) styleBag.strokeWidth = num(t.get('strokeWidth'), 1);
  if (t.get('dashed') === '1') styleBag.strokeDasharray = '6,4';
  if (t.get('opacity')) styleBag.opacity = num(t.get('opacity'), 100) / 100;

  // rounded=1 on an ORTHOGONAL edge = rounded elbows; rounded=0 explicitly
  // asks for hard corners. Absent = the engine's default look. For rounded
  // LINES mxGraph reads arcSize as an absolute diameter (LINE_ARCSIZE
  // fallback), so radius = arcSize / 2.
  if (link.pathType === 'orthogonal') {
    const rounded = t.get('rounded');
    if (rounded === '1') {
      link.setConnector('rounded');
      if (t.get('arcSize')) styleBag.cornerRadius = num(t.get('arcSize'), 20) / 2;
    } else if (rounded === '0') {
      link.setConnector('straight');
    }
  }

  // Label style: the edge's own fontColor/fontSize, else the label CHILD
  // cell's. Carried on a positioned LinkLabel because that is the label model
  // that owns a style bag (the canonical metadata label is plain text).
  if (labelText) {
    const lt = labelCell ? parseStyle(labelCell.style).tokens : undefined;
    const fontColor = t.get('fontColor') ?? lt?.get('fontColor');
    const fontSize = t.get('fontSize') ?? lt?.get('fontSize');
    if (fontColor || fontSize) {
      const labelStyle: LabelStyle = {};
      if (fontColor) labelStyle.color = fontColor;
      if (fontSize) labelStyle.fontSize = num(fontSize, 12);
      link.addLabel({ text: labelText, position: 0.5, style: labelStyle });
    }
  }

  if (Object.keys(styleBag).length > 0) {
    link.style = { ...link.style, ...styleBag };
  }
}

/**
 * mxGraph's rounded-rect corner radius, faithfully (mxRectangleShape.paintBackground):
 *   absoluteArcSize=1 → r = min(w/2, h/2, arcSize/2)   (arcSize is a DIAMETER in px)
 *   else              → r = min(w,h) · (arcSize/100)   (percentage, default 15,
 *                        geometrically capped at min(w,h)/2)
 * No arcSize and no absolute flag keeps the import's classic fixed 8px, which
 * reads as "rounded" at every size (draw.io's own default factor is 15%).
 */
function roundedCornerRadius(
  t: Map<string, string>,
  width: number,
  height: number
): number {
  const arc = t.get('arcSize');
  if (arc === undefined) return 8;
  if (t.get('absoluteArcSize') === '1') {
    return Math.min(width / 2, height / 2, num(arc, 20) / 2);
  }
  const factor = num(arc, 15) / 100;
  return Math.min(Math.min(width, height) * factor, Math.min(width, height) / 2);
}

/** Style tokens → metadata.shape (+ typed node.style for the paints the renderer honours). */
function applyVertexStyle(
  node: NodeModel,
  cell: RawCell,
  warnings: string[],
  unmapped: Set<string>
): void {
  const style = parseStyle(cell.style);
  const t = style.tokens;

  // The shape slot: `shape=X` wins, else the bare leading token, else rect.
  let shape = 'rect';
  let cornerRadius: number | undefined;
  const token = t.get('shape') || (style.first && !t.has('text') ? style.first : undefined);
  if (token && token !== 'rect' && token !== 'rectangle') {
    const mapped = SHAPE_MAP[token];
    if (mapped) {
      shape = mapped;
    } else {
      warnings.push(`unknown shape token "${token}" on cell "${cell.id}"; imported as rect`);
    }
  }
  if (t.get('rounded') === '1' && shape === 'rect') {
    cornerRadius = roundedCornerRadius(t, cell.geometry?.width || 100, cell.geometry?.height || 50);
  }

  const shapeMeta: Record<string, unknown> = { type: shape };
  if (cornerRadius !== undefined) shapeMeta['cornerRadius'] = cornerRadius;
  if (t.get('fillColor')) shapeMeta['fill'] = t.get('fillColor');
  if (t.get('strokeColor')) shapeMeta['stroke'] = t.get('strokeColor');
  if (t.get('strokeWidth')) shapeMeta['strokeWidth'] = num(t.get('strokeWidth'), 1);

  // A `text` style cell is a free-standing LABEL, not a box: no fill, no border.
  if (t.has('text')) {
    shapeMeta['fill'] = 'none';
    shapeMeta['stroke'] = 'none';
  }
  node.setMetadata('shape', shapeMeta);

  // Paints the typed style bag expresses directly — these actually PAINT
  // (style-cascade honours node.style), rather than riding as inert data.
  const styleBag: Record<string, unknown> = {};
  if (t.get('dashed') === '1') styleBag['strokeDasharray'] = '6,4';
  if (t.get('fontColor')) styleBag['color'] = t.get('fontColor');
  if (t.get('opacity')) styleBag['opacity'] = num(t.get('opacity'), 100) / 100;
  if (Object.keys(styleBag).length > 0) {
    node.style = { ...(node.style ?? {}), ...styleBag };
  }

  collectUnmappedStyleKeys(cell.style, unmapped);
}

/** Aggregate the style keys the importer does not consume — one deduped warning per import. */
function collectUnmappedStyleKeys(styleString: string, into: Set<string>): void {
  const { tokens, first } = parseStyle(styleString);
  for (const key of tokens.keys()) {
    if (CONSUMED_STYLE_KEYS.has(key)) continue;
    if (key === first) continue; // the shape slot is handled (mapped or warned) above
    into.add(key);
  }
}
