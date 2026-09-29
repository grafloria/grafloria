/**
 * Mermaid `block-beta` — a GRID of blocks.
 *
 *   block-beta
 *     columns 3
 *     a["Frontend"] b["API"] c[("Database")]
 *     d["Cache"]:2 space
 *     block:grp:2
 *       columns 2
 *       x y
 *     end
 *     a --> b
 *
 * Blocks fill rows left to right, `columns N` to a row; `:N` spans N cells;
 * `space[:N]` leaves holes; `block[:id[:N]] … end` nests a grid of its own.
 *
 * Everything that is not the GRID — a block's shape and label, edges, `style`,
 * `classDef`, `class` — is the flowchart grammar already. So the parser splits
 * the grid out, hands the rest to the flowchart pipeline as flowchart text (one
 * node line per block, a subgraph per nested block), and `applyBlockGrid` puts
 * the grid on the model for the architecture layout's grid mode. A matched triple
 * like the other graph types: parse, build, generate.
 */
import { significantLines } from './lines';
import type { DiagramModel } from '../../models/DiagramModel';
import type { LinkModel } from '../../models/LinkModel';
import { layoutArchitecture } from '../../layout/architecture/architecture-layout';

export type BlockCell =
  /** `token` is what the flowchart grammar reads; `raw` is what was written (a block arrow differs). */
  | { kind: 'block'; id: string; token: string; span: number; raw?: string }
  | { kind: 'space'; span: number }
  | { kind: 'group'; id: string; span: number; columns?: number; cells: BlockCell[] };

export interface MermaidBlockModel {
  /** Blocks to a row; undefined = `auto` (one row). */
  columns?: number;
  cells: BlockCell[];
  /** Lines the flowchart grammar reads as they are: edges, style, classDef, class, linkStyle, %%grafloria. */
  passthrough: string[];
}

/** The grid a container carries for the architecture layout (`metadata.grid`). */
export interface BlockGridSpec {
  columns?: number;
  cells: Array<{ id?: string; span: number }>;
}

const DIRECTIVE = /^(style|classDef|class|linkStyle|click)\s/;
const ARROW_GLYPH: Record<string, string> = { right: '→', left: '←', up: '↑', down: '↓', x: '↔', y: '↕' };

/** Split a line of blocks on spaces outside quotes and brackets. */
function splitTokens(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  let quote = false;
  for (const ch of line) {
    if (ch === '"') quote = !quote;
    if (!quote) {
      if ('([{<'.includes(ch)) depth++;
      else if (')]}>'.includes(ch)) depth = Math.max(0, depth - 1);
    }
    if (!quote && depth === 0 && /\s/.test(ch)) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** An edge line: an arrow outside quotes and brackets. */
function isEdgeLine(line: string): boolean {
  const bare = line.replace(/"[^"]*"/g, '""').replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, '');
  return /--|==|-\.|~~~/.test(bare);
}

export function parseMermaidBlock(text: string): MermaidBlockModel {
  // `%%grafloria:` hints are comments to Mermaid, instructions to us: keep them.
  const hints = text.split('\n').map((l) => l.trim()).filter((l) => /^%%grafloria:/.test(l));
  const root: MermaidBlockModel = { cells: [], passthrough: [] };
  const stack: Array<{ columns?: number; cells: BlockCell[] }> = [root];
  let anon = 0;
  for (const { text: line } of significantLines(text, ['block-beta', 'block'])) {
    const top = stack[stack.length - 1]!;
    const cols = /^columns\s+(\d+|auto)$/i.exec(line);
    if (cols) {
      top.columns = cols[1]!.toLowerCase() === 'auto' ? undefined : Number(cols[1]);
      continue;
    }
    const block = /^block(?::([A-Za-z_][\w-]*))?(?::(\d+))?$/.exec(line);
    if (block) {
      const group: BlockCell = { kind: 'group', id: block[1] ?? `block_${++anon}`, span: block[2] ? Number(block[2]) : 1, cells: [] };
      top.cells.push(group);
      stack.push(group);
      continue;
    }
    if (line === 'end') {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (DIRECTIVE.test(line) || isEdgeLine(line)) {
      root.passthrough.push(line);
      continue;
    }
    for (const raw of splitTokens(line)) {
      const space = /^space(?::(\d+))?$/.exec(raw);
      if (space) {
        top.cells.push({ kind: 'space', span: space[1] ? Number(space[1]) : 1 });
        continue;
      }
      const spanned = /^(.*?[^:]):(\d+)$/.exec(raw);
      let token = spanned ? spanned[1]! : raw;
      const span = spanned ? Number(spanned[2]) : 1;
      const id = /^([A-Za-z0-9_][\w-]*)/.exec(token)?.[1];
      if (!id) continue;
      // A block arrow `id<["label"]>(right)` draws as its label and an arrow
      // pointing its way — words, no box (a text node).
      const arrow = /^([\w-]+)<\[(.*)\]>\((\w+)\)$/.exec(token);
      if (arrow) {
        const label = arrow[2]!.replace(/^"|"$/g, '').trim();
        const glyph = ARROW_GLYPH[arrow[3]!.toLowerCase()] ?? '→';
        const text = label ? `${label} ${glyph}` : glyph;
        top.cells.push({ kind: 'block', id, token: `${arrow[1]}@{ shape: text, label: "${text.replace(/"/g, '#quot;')}" }`, span, raw: token });
        continue;
      }
      top.cells.push({ kind: 'block', id, token, span });
    }
  }
  root.passthrough.push(...hints);
  return root;
}

/** The same diagram as Grafloria flowchart text: every block a node line, every nested block a subgraph. */
export function blockModelToFlowchart(model: MermaidBlockModel): string {
  const lines = ['flowchart LR'];
  const walk = (cells: BlockCell[], pad: string) => {
    for (const c of cells) {
      if (c.kind === 'block') lines.push(`${pad}${c.token}`);
      else if (c.kind === 'group') {
        lines.push(`${pad}subgraph ${c.id}`);
        walk(c.cells, pad + '  ');
        lines.push(`${pad}end`);
      }
    }
  };
  walk(model.cells, '  ');
  for (const l of model.passthrough) lines.push(`  ${l}`);
  return lines.join('\n');
}

/**
 * Put the grid on the model the flowchart pipeline built — `metadata.grid` on the
 * diagram and every nested block — mark it block-beta, and lay it out.
 */
export function applyBlockGrid(diagram: DiagramModel, model: MermaidBlockModel): void {
  const toSpec = (columns: number | undefined, cells: BlockCell[]): BlockGridSpec => ({
    ...(columns !== undefined ? { columns } : {}),
    cells: cells.map((c) => (c.kind === 'space' ? { span: c.span } : { id: c.id, span: c.span })),
  });
  diagram.setMetadata('grid', toSpec(model.columns, model.cells));
  const walk = (cells: BlockCell[]) => {
    for (const c of cells) {
      if (c.kind === 'block') {
        const n = diagram.getNode(c.id);
        if (n) {
          n.setMetadata('blockToken', c.raw ?? c.token);
          n.setMetadata('blockLabel', n.getLabel());
          if (c.raw) {
            // a block arrow: its words centred in its cell, a lone arrow drawn big
            n.setMetadata('blockArrow', true);
            n.setMetadata('textAlign', 'center');
            if ((n.getLabel() ?? '').length <= 1) n.style.fontSize = 22;
          }
        }
      } else if (c.kind === 'group') {
        const g = diagram.getGroup(c.id);
        if (g) {
          g.setMetadata('grid', toSpec(c.columns, c.cells));
          g.name = ''; // a nested block has no caption
          if (!g.getMetadata('frameStyle')) g.setMetadata('frameStyle', { fill: '#f8fafc', stroke: '#cbd5e1', borderRadius: 4 });
          g.headerHeight = 0;
        }
        walk(c.cells);
      }
    }
  };
  walk(model.cells);
  diagram.setMetadata('blockStyleLines', model.passthrough.filter((l) => DIRECTIVE.test(l)));
  diagram.setMetadata('diagramType', 'block-beta');
  diagram.setMetadata('layout', 'architecture');
  diagram.setMetadata('layoutCompact', true);
  layoutArchitecture(diagram);
}

const LINK_SYNTAX: Record<string, string> = {
  arrow: '-->',
  line: '---',
  'dotted-arrow': '-.->',
  'dotted-line': '-.-',
  'thick-arrow': '==>',
  'thick-line': '===',
  bidirectional: '<-->',
};

function edgeLine(l: LinkModel): string | null {
  if (!l.sourceNodeId || !l.targetNodeId) return null;
  const type = (l.getMetadata('dslLinkType') as string | undefined) ?? (l.style?.strokeDasharray ? 'dotted-arrow' : 'arrow');
  const arrow = LINK_SYNTAX[type] ?? '-->';
  const label = l.getLabel();
  if (label && arrow === '-->') return `${l.sourceNodeId} -- "${label.replace(/"/g, '#quot;')}" --> ${l.targetNodeId}`;
  if (label) return `${l.sourceNodeId} ${arrow}|"${label.replace(/"/g, '#quot;')}"| ${l.targetNodeId}`;
  return `${l.sourceNodeId} ${arrow} ${l.targetNodeId}`;
}

/** Write a block-beta diagram back as block-beta: its grid, its blocks as written, its edges and styles. */
export function generateBlockFromDiagram(diagram: DiagramModel): string {
  const lines = ['block-beta'];
  const placed = new Set<string>();
  const token = (id: string): string | null => {
    const n = diagram.getNode(id);
    if (!n) return null;
    placed.add(id);
    const raw = n.getMetadata('blockToken') as string | undefined;
    const label = n.getLabel() ?? id;
    if (raw && n.getMetadata('blockLabel') === label) return raw;
    return label === id ? id : `${id}["${label.replace(/"/g, '#quot;')}"]`;
  };
  const emit = (grid: BlockGridSpec | undefined, pad: string, members?: Set<string>) => {
    if (grid?.columns !== undefined) lines.push(`${pad}columns ${grid.columns}`);
    const cells = [...(grid?.cells ?? [])];
    // boxes added since the import come last in their container
    for (const n of diagram.getNodes()) {
      const inHere = members ? members.has(n.id) : !diagram.getGroups().some((g) => g.members.has(n.id));
      if (inHere && !cells.some((c) => c.id === n.id)) cells.push({ id: n.id, span: 1 });
    }
    const N = grid?.columns ?? Number.MAX_SAFE_INTEGER;
    let row: string[] = [];
    let used = 0;
    const flush = () => {
      if (row.length) lines.push(pad + row.join(' '));
      row = [];
      used = 0;
    };
    for (const c of cells) {
      if (used + c.span > N) flush();
      const g = c.id ? diagram.getGroup(c.id) : undefined;
      if (g) {
        flush();
        lines.push(`${pad}block:${g.id}${c.span > 1 ? `:${c.span}` : ''}`);
        emit(g.getMetadata('grid') as BlockGridSpec | undefined, pad + '  ', g.members);
        lines.push(`${pad}end`);
        continue;
      }
      const t = c.id ? token(c.id) : `space${c.span > 1 ? `:${c.span}` : ''}`;
      if (!t) continue;
      row.push(c.id && c.span > 1 ? `${t}:${c.span}` : t);
      used += c.span;
      if (used >= N) flush();
    }
    flush();
  };
  emit(diagram.getMetadata('grid') as BlockGridSpec | undefined, '  ');
  for (const l of diagram.getLinks()) {
    const e = edgeLine(l);
    if (e) lines.push(`  ${e}`);
  }
  for (const s of (diagram.getMetadata('blockStyleLines') as string[] | undefined) ?? []) lines.push(`  ${s}`);
  return lines.join('\n') + '\n';
}
