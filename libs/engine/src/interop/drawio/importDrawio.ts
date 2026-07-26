// .drawio (mxGraph XML) IMPORT — v1: import-only, bounded, honest about loss.
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
// THE HONESTY CONTRACT. mxGraph expresses more than v1 maps (manual edge
// waypoints, exotic shape styles, collapsed containers, multiple pages).
// Nothing unmapped is dropped in silence: every dropped construct appends a
// NAMED warning to the result, so a user can see exactly what their file lost
// — the same "never hide the loss" stance TextFormat.ts takes for Mermaid.
//
// COORDINATES. mxGraph child geometry is RELATIVE TO ITS PARENT cell; the
// engine's node positions are world-absolute. The importer walks each cell's
// parent chain and sums origins, so a node 20px inside a container that sits
// at (300,80) lands at (320,…) — nested containers nest the sum.

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { GroupModel } from '../../models/GroupModel';
import { parseXml, XmlElement } from './xml';

export interface DrawioImportResult {
  /** The imported diagram — absent when `error` is set. */
  diagram?: DiagramModel;
  /**
   * Every construct the import dropped or approximated, one NAMED entry each.
   * Empty means the file mapped cleanly.
   */
  warnings: string[];
  /** Fatal: the text is not a readable .drawio document. Never thrown. */
  error?: string;
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
  /** Manual edge waypoints from `<Array as="points">`. */
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
 * Style keys the importer CONSUMES (mapped into the model). Everything else
 * lands in one aggregated "unmapped style keys" warning — deduped, because a
 * 200-cell file repeating `html=1` should say it once, not 200 times.
 */
const CONSUMED_STYLE_KEYS = new Set([
  'shape',
  'rounded',
  'fillColor',
  'strokeColor',
  'strokeWidth',
  'opacity',
  'dashed',
  'fontColor',
  'edgeStyle',
  'curved',
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
 * words do not fuse; entity decoding already happened in the XML reader.
 */
export function stripHtmlToText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(div|p|li|tr|h[1-6])>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
 * Multi-page files import the FIRST page (with a warning). Never throws:
 * unreadable input comes back as `{ error }`.
 */
export async function importDrawio(text: string): Promise<DrawioImportResult> {
  const warnings: string[] = [];
  try {
    const root = parseXml(text.trim());
    const model = await resolveModelElement(root, warnings);
    const diagram = buildDiagram(model, warnings);
    return { diagram, warnings };
  } catch (e) {
    return { warnings, error: `not a readable .drawio document: ${(e as Error).message}` };
  }
}

/** Find the `<mxGraphModel>` element, unwrapping `<mxfile><diagram>` (and inflating) as needed. */
async function resolveModelElement(root: XmlElement, warnings: string[]): Promise<XmlElement> {
  if (root.tag === 'mxGraphModel') return root;
  if (root.tag !== 'mxfile') {
    throw new Error(`root element is <${root.tag}>, expected <mxGraphModel> or <mxfile>`);
  }
  const pages = root.children.filter((c) => c.tag === 'diagram');
  if (pages.length === 0) throw new Error('<mxfile> contains no <diagram> page');
  if (pages.length > 1) {
    warnings.push(`page 1 of ${pages.length} imported ("${pages[0].attrs['name'] ?? 'unnamed'}"); multi-page import pending`);
  }
  const page = pages[0];
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
    // alternateBounds carries the expanded frame. v1 imports expanded.
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
  let waypointEdges = 0;
  for (const cell of edgeCells) {
    const source = cell.source ? nodesById.get(cell.source) : undefined;
    const target = cell.target ? nodesById.get(cell.target) : undefined;
    if (!source || !target) {
      warnings.push(`edge "${cell.id}" skipped: ${describeMissingEndpoint(cell, nodesById, groupsById)}`);
      continue;
    }
    const style = parseStyle(cell.style);
    // draw.io's default connector is orthogonal; only carry that hint over —
    // everything else routes as the engine's default smooth path.
    const orthogonal =
      style.tokens.get('edgeStyle')?.toLowerCase().includes('orthogonal') === true &&
      style.tokens.get('curved') !== '1';
    const link = diagram.createSmartLink(source, target, orthogonal ? 'orthogonal' : 'smooth');
    if (!link) {
      warnings.push(`edge "${cell.id}" skipped: no connectable ports between "${cell.source}" and "${cell.target}"`);
      continue;
    }
    link.setMetadata('drawioId', cell.id);
    const labelText = cell.value || findEdgeLabelChild(cell.id, cells);
    if (labelText) link.setLabel(labelText);
    if (cell.waypoints && cell.waypoints.length > 0) {
      // v1: auto-routing owns the polyline. Writing mxGraph waypoints into
      // link.points would be overwritten by the first routing pass anyway —
      // so they are PRESERVED as metadata and honestly reported, not faked.
      link.setMetadata('drawioWaypoints', cell.waypoints);
      waypointEdges++;
    }
    collectUnmappedStyleKeys(cell.style, unmappedStyleKeys);
  }
  if (waypointEdges > 0) {
    warnings.push(
      `manual waypoints on ${waypointEdges} edge(s) ignored (auto-routing owns the polyline); originals kept under link metadata.drawioWaypoints`
    );
  }

  if (unmappedStyleKeys.size > 0) {
    warnings.push(`unmapped style keys dropped: ${[...unmappedStyleKeys].sort().join(', ')}`);
  }
  return diagram;
}

/** Human wording for WHY an edge endpoint failed to resolve. */
function describeMissingEndpoint(
  cell: RawCell,
  nodes: Map<string, NodeModel>,
  groups: Map<string, GroupModel>
): string {
  const side = (name: 'source' | 'target', id: string | undefined): string | undefined => {
    if (!id) return `no ${name}`;
    if (nodes.has(id)) return undefined;
    if (groups.has(id)) return `${name} "${id}" is a container (container endpoints pending)`;
    return `${name} "${id}" does not exist`;
  };
  return [side('source', cell.source), side('target', cell.target)].filter(Boolean).join('; ');
}

/** The label a draw.io edge stores as a CHILD cell (style edgeLabel, parent = the edge). */
function findEdgeLabelChild(edgeId: string, cells: Map<string, RawCell>): string {
  for (const c of cells.values()) {
    if (c.parent === edgeId && c.vertex && c.value) return c.value;
  }
  return '';
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
    // mxGraph's arcSize is a PERCENTAGE unless absoluteArcSize=1 — a subtlety
    // not worth modelling in v1. A fixed 8px reads as "rounded" at every size.
    cornerRadius = 8;
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

/** Aggregate the style keys v1 does not consume — one deduped warning per import. */
function collectUnmappedStyleKeys(styleString: string, into: Set<string>): void {
  const { tokens, first } = parseStyle(styleString);
  for (const key of tokens.keys()) {
    if (CONSUMED_STYLE_KEYS.has(key)) continue;
    if (key === first) continue; // the shape slot is handled (mapped or warned) above
    into.add(key);
  }
}
