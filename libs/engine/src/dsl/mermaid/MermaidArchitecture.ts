/**
 * Mermaid `architecture-beta` — services and groups, joined by lines that NAME
 * THEIR SIDES.
 *
 *   architecture-beta
 *     group api(cloud)[API]
 *     service db(database)[Database] in api
 *     service server(server)[Server] in api
 *     junction j in api
 *     db:L -- R:server          the server sits to the database's LEFT
 *     server:B --> T:disk       the disk sits BELOW the server, arrow at the disk
 *     a{group}:R <-[sync]-> L:b{group}
 *
 * A side is a relation — exactly what the architecture layout reads — so the
 * import IS the composition: groups as regions, services in rows, lines straight.
 * The groups, services and edges are handed to the flowchart pipeline as
 * flowchart text (a subgraph per group, a node per service); sides, arrows,
 * icons and junctions are then put on the model and it is laid out. A matched
 * triple like the other graph types: parse, build, generate.
 */
import { significantLines } from './lines';
import type { DiagramModel } from '../../models/DiagramModel';
import type { LinkModel } from '../../models/LinkModel';
import { layoutArchitecture } from '../../layout/architecture/architecture-layout';

export type ArchSide = 'T' | 'B' | 'L' | 'R';

export interface MermaidArchGroup {
  id: string;
  icon?: string;
  title?: string;
  parent?: string;
}
export type MermaidArchService = MermaidArchGroup;
export interface MermaidArchJunction {
  id: string;
  parent?: string;
}
export interface MermaidArchEdge {
  from: string;
  fromSide: ArchSide;
  to: string;
  toSide: ArchSide;
  arrowFrom: boolean;
  arrowTo: boolean;
  label?: string;
  /** `{group}`: the line joins the GROUP the service is in, at its edge. */
  fromGroup?: boolean;
  toGroup?: boolean;
}
export interface MermaidArchitectureModel {
  groups: MermaidArchGroup[];
  services: MermaidArchService[];
  junctions: MermaidArchJunction[];
  edges: MermaidArchEdge[];
}

/** Mermaid's built-in icons — drawn by Grafloria's own line icons. */
export const ARCHITECTURE_ICONS = ['cloud', 'database', 'disk', 'internet', 'server'] as const;

const DECL = /^(group|service)\s+([\w-]+)(?:\(([^)]*)\))?(?:\[([^\]]*)\])?(?:\s+in\s+([\w-]+))?$/;
const JUNCTION = /^junction\s+([\w-]+)(?:\s+in\s+([\w-]+))?$/;
const EDGE = /^([\w-]+)(\{group\})?\s*:\s*([TBLR])\s+(<)?-(?:-|\[([^\]]*)\]-)(>)?\s+([TBLR])\s*:\s*([\w-]+)(\{group\})?$/;
const SIDE: Record<ArchSide, 'top' | 'bottom' | 'left' | 'right'> = { T: 'top', B: 'bottom', L: 'left', R: 'right' };
const LETTER: Record<string, ArchSide> = { top: 'T', bottom: 'B', left: 'L', right: 'R' };

export function parseMermaidArchitecture(text: string): MermaidArchitectureModel {
  const model: MermaidArchitectureModel = { groups: [], services: [], junctions: [], edges: [] };
  for (const { text: line } of significantLines(text, 'architecture-beta')) {
    const decl = DECL.exec(line);
    if (decl) {
      const item: MermaidArchGroup = { id: decl[2]! };
      if (decl[3]) item.icon = decl[3].trim();
      if (decl[4] !== undefined) item.title = decl[4].trim();
      if (decl[5]) item.parent = decl[5];
      (decl[1] === 'group' ? model.groups : model.services).push(item);
      continue;
    }
    const j = JUNCTION.exec(line);
    if (j) {
      model.junctions.push(j[2] ? { id: j[1]!, parent: j[2] } : { id: j[1]! });
      continue;
    }
    const e = EDGE.exec(line);
    if (e) {
      const edge: MermaidArchEdge = { from: e[1]!, fromSide: e[3] as ArchSide, to: e[8]!, toSide: e[7] as ArchSide, arrowFrom: !!e[4], arrowTo: !!e[6] };
      if (e[5] !== undefined) edge.label = e[5].trim();
      if (e[2]) edge.fromGroup = true;
      if (e[9]) edge.toGroup = true;
      model.edges.push(edge);
    }
    // anything else (a directive we do not know) is skipped, never an entity
  }
  return model;
}

const q = (s: string) => `"${s.replace(/"/g, '#quot;')}"`;

/** The same diagram as Grafloria flowchart text: a subgraph per group (nested), a node per service. */
export function architectureModelToFlowchart(model: MermaidArchitectureModel): string {
  const lines = ['flowchart LR'];
  const inGroup = (parent: string | undefined, pad: string) => {
    for (const g of model.groups.filter((x) => x.parent === parent)) {
      lines.push(`${pad}subgraph ${g.id}[${q(g.title ?? g.id)}]`);
      inGroup(g.id, pad + '  ');
      lines.push(`${pad}end`);
    }
    for (const s of model.services.filter((x) => x.parent === parent)) lines.push(`${pad}${s.id}[${q(s.title ?? s.id)}]`);
    for (const j of model.junctions.filter((x) => x.parent === parent)) lines.push(`${pad}${j.id}((" "))`);
  };
  inGroup(undefined, '  ');
  for (const e of model.edges) {
    const arrow = e.arrowFrom && e.arrowTo ? '<-->' : e.arrowTo ? '-->' : '---';
    lines.push(`  ${e.from} ${arrow}${e.label ? `|${q(e.label)}|` : ''} ${e.to}`);
  }
  return lines.join('\n');
}

const ARROW = { type: 'arrow', size: 8, filled: true };

/** Put sides, arrows, icons, group frames and junctions on the model the flowchart pipeline built — and lay it out. */
export function applyArchitectureModel(diagram: DiagramModel, model: MermaidArchitectureModel): void {
  for (const g of model.groups) {
    const group = diagram.getGroup(g.id);
    if (!group) continue;
    group.name = g.title ?? g.id;
    if (g.icon) group.setMetadata('icon', g.icon);
    group.setMetadata('frameStyle', { fill: '#f8fafc', stroke: '#94a3b8', strokeDasharray: '6 4', borderRadius: 6, color: '#334155', fontWeight: '600', fontSize: 12 });
    group.headerHeight = 0;
  }
  for (const s of model.services) {
    const node = diagram.getNode(s.id);
    if (!node) continue;
    if (s.icon) {
      node.setMetadata('icon', s.icon);
      if ((ARCHITECTURE_ICONS as readonly string[]).includes(s.icon)) node.setMetadata('panel', { icon: { name: s.icon, size: 20, corner: 'tl' } });
    }
  }
  for (const j of model.junctions) {
    const node = diagram.getNode(j.id);
    if (!node) continue;
    node.setLabel('');
    node.setMetadata('junction', true);
    node.setMetadata('sizing', { fixed: true });
    node.setSize(10, 10);
  }
  const links = diagram.getLinks();
  model.edges.forEach((e, i) => {
    const link = links[i];
    if (!link) return;
    link.setMetadata('sourceSide', SIDE[e.fromSide]);
    link.setMetadata('targetSide', SIDE[e.toSide]);
    if (e.fromGroup) link.setMetadata('fromGroup', true);
    if (e.toGroup) link.setMetadata('toGroup', true);
    link.updateStyle({ arrowHead: e.arrowTo ? { ...ARROW } : { type: 'none' }, arrowTail: e.arrowFrom ? { ...ARROW } : { type: 'none' } } as never);
  });
  diagram.setMetadata('diagramType', 'architecture-beta');
  diagram.setMetadata('direction', 'LR');
  diagram.setMetadata('layout', 'architecture');
  layoutArchitecture(diagram);
}

/** Which side a line leaves `from` by, when it names none: from where the boxes sit. */
function inferSide(diagram: DiagramModel, l: LinkModel, end: 'source' | 'target'): ArchSide {
  const named = l.getMetadata(end === 'source' ? 'sourceSide' : 'targetSide') as string | undefined;
  if (named && LETTER[named]) return LETTER[named]!;
  const a = diagram.getNode((end === 'source' ? l.sourceNodeId : l.targetNodeId) ?? '');
  const b = diagram.getNode((end === 'source' ? l.targetNodeId : l.sourceNodeId) ?? '');
  if (!a || !b) return end === 'source' ? 'R' : 'L';
  const dx = b.position.x + b.size.width / 2 - (a.position.x + a.size.width / 2);
  const dy = b.position.y + b.size.height / 2 - (a.position.y + a.size.height / 2);
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'R' : 'L') : dy >= 0 ? 'B' : 'T';
}

/** Write an architecture-beta diagram back as architecture-beta: groups, services, junctions, sided edges. */
export function generateArchitectureFromDiagram(diagram: DiagramModel): string {
  const lines = ['architecture-beta'];
  const title = (s: string) => s.replace(/[[\]]/g, '');
  const groups = diagram.getGroups();
  const depth = (id: string | undefined): number => (id ? 1 + depth(diagram.getGroup(id)?.parentGroupId) : 0);
  for (const g of [...groups].sort((a, b) => depth(a.parentGroupId) - depth(b.parentGroupId))) {
    const icon = (g.getMetadata('icon') as string | undefined) ?? 'cloud';
    lines.push(`  group ${g.id}(${icon})[${title(g.name || g.id)}]${g.parentGroupId ? ` in ${g.parentGroupId}` : ''}`);
  }
  const parentOf = (id: string) => {
    let best: string | undefined;
    for (const g of groups) if (g.members.has(id) && (!best || depth(g.id) > depth(best))) best = g.id;
    return best;
  };
  for (const n of diagram.getNodes()) {
    const inG = parentOf(n.id);
    const where = inG ? ` in ${inG}` : '';
    if (n.getMetadata('junction') === true) lines.push(`  junction ${n.id}${where}`);
    else lines.push(`  service ${n.id}(${(n.getMetadata('icon') as string | undefined) ?? 'server'})[${title(n.getLabel() ?? n.id)}]${where}`);
  }
  for (const l of diagram.getLinks()) {
    if (!l.sourceNodeId || !l.targetNodeId) continue;
    const head = l.style?.arrowHead as { type?: string } | undefined;
    const tail = l.style?.arrowTail as { type?: string } | undefined;
    const to = head !== undefined && head.type !== 'none';
    const from = tail !== undefined && tail.type !== 'none';
    const label = l.getLabel();
    const mid = label ? `-[${title(label)}]-` : '--';
    const fg = l.getMetadata('fromGroup') === true ? '{group}' : '';
    const tg = l.getMetadata('toGroup') === true ? '{group}' : '';
    lines.push(`  ${l.sourceNodeId}${fg}:${inferSide(diagram, l, 'source')} ${from ? '<' : ''}${mid}${to ? '>' : ''} ${inferSide(diagram, l, 'target')}:${l.targetNodeId}${tg}`);
  }
  return lines.join('\n') + '\n';
}
