/**
 * Mermaid `erDiagram` — parser, model builder and generator (Phase 3).
 *
 * Replaces the half-wired `extended/ERDParser` scaffolding, which read one
 * hand-shaped relationship form and produced a garbage node on canonical input
 * (`CUSTOMER ||--o{ ORDER : places` → a node literally named `CUSTOMER ||--o`).
 *
 * WHAT MADE THIS WORTH DOING NOW: the diagram kit's `erDiagram({entities,
 * relationships})` gives Mermaid's ER a REAL target representation — table
 * cards with typed columns, PK/FK badges and crow's-foot cardinality. So the
 * parse output here is shaped as the kit's spec (`erSpec` on the diagram
 * metadata) alongside the plain node/link graph, and the cardinality tokens map
 * onto the renderer's marker vocabulary ('one' | 'zero-or-one' |
 * 'zero-or-many' | 'one-or-many'), not onto invented names.
 *
 * The MERMAID form is what is stored on the model (literal left/right entity
 * order + the literal cardinality tokens), so generation re-emits the author's
 * own syntax rather than a normalized guess — that is what keeps the round-trip
 * honest and the exported body valid Mermaid.
 */
import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { significantLines, unquote } from './lines';

// ── The grammar's vocabulary ────────────────────────────────────────────────

/** Cardinality as Mermaid writes it on the LEFT of the line. */
export type ErLeftToken = '||' | '|o' | '}o' | '}|';
/** Cardinality as Mermaid writes it on the RIGHT of the line (mirrored). */
export type ErRightToken = '||' | 'o|' | 'o{' | '|{';
/** The renderer/kit marker vocabulary these tokens denote. */
export type ErCardinalityMarker = 'one' | 'zero-or-one' | 'zero-or-many' | 'one-or-many';

export interface MermaidErAttribute {
  type: string;
  name: string;
  /** PK / FK / UK, in source order. */
  keys: string[];
  comment?: string;
}

export interface MermaidErEntity {
  /** The identifier used in relationships. */
  id: string;
  /** Display name — the `ENTITY["alias"]` alias when given, else the id. */
  name: string;
  attributes: MermaidErAttribute[];
}

export interface MermaidErRelationship {
  /** Left-hand entity id, exactly as written. */
  from: string;
  /** Right-hand entity id, exactly as written. */
  to: string;
  left: ErLeftToken;
  right: ErRightToken;
  /**
   * `--` (identifying: the child cannot exist without the parent) vs `..`
   * (non-identifying). Mermaid renders the latter dashed.
   */
  identifying: boolean;
  label: string;
}

export interface MermaidErModel {
  entities: MermaidErEntity[];
  relationships: MermaidErRelationship[];
  direction?: string;
}

const LEFT_CARDINALITY: Record<ErLeftToken, ErCardinalityMarker> = {
  '||': 'one',
  '|o': 'zero-or-one',
  '}o': 'zero-or-many',
  '}|': 'one-or-many',
};

const RIGHT_CARDINALITY: Record<ErRightToken, ErCardinalityMarker> = {
  '||': 'one',
  'o|': 'zero-or-one',
  'o{': 'zero-or-many',
  '|{': 'one-or-many',
};

/** Map a parsed cardinality pair onto the kit's explicit marker pair. */
export function erMarkers(rel: MermaidErRelationship): { tail: ErCardinalityMarker; head: ErCardinalityMarker } {
  return { tail: LEFT_CARDINALITY[rel.left], head: RIGHT_CARDINALITY[rel.right] };
}

// ── Parsing ────────────────────────────────────────────────────────────────

// An entity reference: a bare identifier or a "quoted name". Deliberately does
// NOT include the cardinality characters (| o { }), so a GLUED relationship
// (`CUSTOMER||--o{ORDER`) still splits correctly — Mermaid accepts both.
const REF = '(?:"[^"]*"|[A-Za-z0-9_\\u00c0-\\uffff][A-Za-z0-9_\\-\\u00c0-\\uffff]*)';
const REL_RE = new RegExp(
  `^(${REF})\\s*(\\|\\||\\|o|\\}o|\\}\\|)(--|\\.\\.)(\\|\\||o\\||o\\{|\\|\\{)\\s*(${REF})\\s*(?::\\s*(.*))?$`
);
// `ENTITY {` or `ENTITY["Alias"] {` — the attribute-block opener.
const BLOCK_RE = new RegExp(`^(${REF})(?:\\[\\s*("[^"]*"|[^\\]]*)\\s*\\])?\\s*\\{\\s*(.*)$`);
// A bare entity declaration on its own line (v11): `CUSTOMER` / `p["Person"]`.
const BARE_RE = new RegExp(`^(${REF})(?:\\[\\s*("[^"]*"|[^\\]]*)\\s*\\])?\\s*$`);

function parseAttribute(line: string): MermaidErAttribute | null {
  // A trailing "comment" is peeled off first so it cannot be mistaken for a key.
  let rest = line;
  let comment: string | undefined;
  const commentMatch = rest.match(/\s+"([^"]*)"\s*$/);
  if (commentMatch) {
    comment = commentMatch[1];
    rest = rest.slice(0, commentMatch.index).trim();
  }
  const parts = rest.split(/\s+/).filter(Boolean);
  // Mermaid requires BOTH a type and a name; a single token is not an
  // attribute, and inventing one from it is exactly the garbage Phase 0 bans.
  if (parts.length < 2) return null;
  const [type, name, ...tail] = parts;
  const keys = tail
    .join(' ')
    .split(/[,\s]+/)
    .map((k) => k.trim().toUpperCase())
    .filter((k) => k === 'PK' || k === 'FK' || k === 'UK');
  return { type, name, keys, ...(comment !== undefined ? { comment } : {}) };
}

/**
 * Parse an `erDiagram` body into the Mermaid-shaped model. Lines that are not
 * grammar (styling directives, future syntax) are SKIPPED, never nodified.
 */
export function parseMermaidEr(text: string): MermaidErModel {
  const lines = significantLines(text, 'erDiagram');
  const entities = new Map<string, MermaidErEntity>();
  const relationships: MermaidErRelationship[] = [];
  let direction: string | undefined;

  /** Entities are declared by mention as well as by block — Mermaid's rule. */
  const touch = (rawId: string, alias?: string): MermaidErEntity => {
    const id = unquote(rawId);
    const existing = entities.get(id);
    if (existing) {
      if (alias) existing.name = alias;
      return existing;
    }
    const entity: MermaidErEntity = { id, name: alias ?? id, attributes: [] };
    entities.set(id, entity);
    return entity;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].text;

    const dir = line.match(/^direction\s+(TB|BT|LR|RL|TD)$/i);
    if (dir) {
      direction = dir[1].toUpperCase();
      continue;
    }

    // Relationships are tested BEFORE blocks: a relationship line can never
    // contain `{` outside a cardinality token, but `}o`/`o{` contain braces.
    const rel = line.match(REL_RE);
    if (rel) {
      const [, from, left, dash, right, to, label] = rel;
      touch(from);
      touch(to);
      relationships.push({
        from: unquote(from),
        to: unquote(to),
        left: left as ErLeftToken,
        right: right as ErRightToken,
        identifying: dash === '--',
        label: label === undefined ? '' : unquote(label.trim()),
      });
      continue;
    }

    const block = line.match(BLOCK_RE);
    if (block) {
      const [, rawId, rawAlias, sameLineRest] = block;
      const entity = touch(rawId, rawAlias ? unquote(rawAlias) : undefined);
      // `CUSTOMER {}` closes on its own line; otherwise consume until `}`.
      const body = sameLineRest ?? '';
      if (body.includes('}')) {
        // `CUSTOMER {}` / `CUSTOMER { string name }` — opened and closed inline.
        const inlineAttribute = parseAttribute(body.slice(0, body.indexOf('}')).trim());
        if (inlineAttribute) entity.attributes.push(inlineAttribute);
      } else {
        let j = i + 1;
        for (; j < lines.length; j++) {
          const inner = lines[j].text;
          if (inner.startsWith('}')) break;
          const attribute = parseAttribute(inner);
          if (attribute) entity.attributes.push(attribute);
        }
        i = j; // skip past the closing brace line
      }
      continue;
    }

    const bare = line.match(BARE_RE);
    if (bare) {
      touch(bare[1], bare[2] ? unquote(bare[2]) : undefined);
      continue;
    }
    // Anything else (style, classDef, click, future syntax) is ignored.
  }

  return { entities: [...entities.values()], relationships, ...(direction ? { direction } : {}) };
}

// ── The kit spec (what `erDiagram()` in libs/element consumes) ──────────────

export interface ErSpecEntity {
  id: string;
  name: string;
  columns: Array<{ name: string; type?: string; pk?: boolean; fk?: boolean }>;
}

export interface ErSpecRelationship {
  from: string;
  to: string;
  label?: string;
  cardinality: { tail: ErCardinalityMarker; head: ErCardinalityMarker };
  /** Non-identifying relationships (`..`) render dashed. */
  dashed?: boolean;
}

export interface ErSpec {
  entities: ErSpecEntity[];
  relationships: ErSpecRelationship[];
}

/** Project the Mermaid model onto the diagram kit's `erDiagram()` options. */
export function erSpecFrom(model: MermaidErModel): ErSpec {
  return {
    entities: model.entities.map((e) => ({
      id: e.id,
      name: e.name,
      columns: e.attributes.map((a) => ({
        name: a.name,
        type: a.type,
        ...(a.keys.includes('PK') ? { pk: true } : {}),
        ...(a.keys.includes('FK') ? { fk: true } : {}),
      })),
    })),
    relationships: model.relationships.map((r) => ({
      from: r.from,
      to: r.to,
      ...(r.label ? { label: r.label } : {}),
      cardinality: erMarkers(r),
      ...(r.identifying ? {} : { dashed: true }),
    })),
  };
}

// ── Model building ─────────────────────────────────────────────────────────

const CARD_W = 190;
const HEAD_H = 28;
const ROW_H = 25;
const SLACK = 9;

/** Build a DiagramModel from a parsed ER model. */
export function erModelToDiagram(model: MermaidErModel): DiagramModel {
  const diagram = new DiagramModel('ER Diagram');
  diagram.setMetadata('diagramType', 'erDiagram');
  if (model.direction) diagram.setMetadata('direction', model.direction);
  // The kit spec rides on the diagram so an embedder can hand it straight to
  // `erDiagram()` from libs/element without re-deriving anything.
  diagram.setMetadata('erSpec', erSpecFrom(model));

  const nodes = new Map<string, NodeModel>();
  model.entities.forEach((entity, i) => {
    const node = new NodeModel({
      id: entity.id,
      type: 'er:entity',
      position: { x: 60 + (i % 3) * 340, y: 60 + Math.floor(i / 3) * 280 },
      size: { width: CARD_W, height: HEAD_H + entity.attributes.length * ROW_H + SLACK },
    });
    node.setLabel(entity.name);
    node.setMetadata('erEntity', entity);
    node.setMetadata('dslShape', 'table');
    node.setMetadata('shape', { type: 'rect', cornerRadius: 2 });
    node.data['attributes'] = entity.attributes;
    diagram.addNode(node);
    nodes.set(entity.id, node);
  });

  for (const rel of model.relationships) {
    const source = nodes.get(rel.from);
    const target = nodes.get(rel.to);
    if (!source || !target) continue;
    const link = diagram.createSmartLink(source, target, 'orthogonal');
    if (!link) continue;
    if (rel.label) link.setLabel(rel.label);
    // Stored in MERMAID form (literal tokens, literal left/right order) so the
    // generator re-emits the author's syntax, not a normalized approximation.
    link.setMetadata('erRelationship', rel);
    link.setMetadata('erCardinality', erMarkers(rel));
  }

  return diagram;
}

/** Read the Mermaid ER model back off a DiagramModel (for generation). */
export function erModelFromDiagram(diagram: DiagramModel): MermaidErModel {
  const entities: MermaidErEntity[] = [];
  for (const node of diagram.getNodes()) {
    const stored = node.getMetadata('erEntity') as MermaidErEntity | undefined;
    if (stored) {
      // The node id is authoritative — a rename in the model must reach the text.
      entities.push({ ...stored, id: node.id, name: node.getLabel?.() ?? stored.name });
    } else {
      entities.push({ id: node.id, name: (node.getLabel?.() as string) ?? node.id, attributes: [] });
    }
  }
  const relationships: MermaidErRelationship[] = [];
  for (const link of diagram.getLinks()) {
    const stored = link.getMetadata('erRelationship') as MermaidErRelationship | undefined;
    const from = link.sourceNodeId;
    const to = link.targetNodeId;
    if (!from || !to) continue;
    relationships.push({
      from,
      to,
      left: stored?.left ?? '||',
      right: stored?.right ?? 'o{',
      identifying: stored?.identifying ?? true,
      label: (link.getMetadata('label') as string) ?? stored?.label ?? '',
    });
  }
  const direction = diagram.getMetadata('direction') as string | undefined;
  return { entities, relationships, ...(direction ? { direction } : {}) };
}

// ── Generation ─────────────────────────────────────────────────────────────

/**
 * Emit a valid Mermaid `erDiagram` body. Two rules here are not style choices —
 * both were found by running the export through real Mermaid 11.16 (the oracle):
 *
 *  - THE LABEL IS ALWAYS WRITTEN, AND ALWAYS QUOTED. It is not optional
 *    (`A ||--o{ B` is a parse error, so an unlabelled relationship needs `: ""`),
 *    and Mermaid's ER lexer treats `one`, `many`, `zero`, … as CARDINALITY
 *    keywords even in label position — `: one` fails, `: "one"` parses. Quoting
 *    unconditionally makes the whole reserved-word class disappear.
 *  - NO `id["alias"]` ENTITY ALIAS. We parse it (it is forward syntax), but
 *    Mermaid 11.16 rejects it, and emitting a body real Mermaid cannot read
 *    breaks the governing invariant. The display name rides in the `%%grafloria:`
 *    sidecar instead — Tier 3, exactly what it is for.
 */
export function generateMermaidEr(model: MermaidErModel): string {
  const lines = ['erDiagram'];
  if (model.direction) lines.push(`    direction ${model.direction}`);
  for (const entity of model.entities) {
    const head = entity.id;
    if (entity.attributes.length === 0) {
      lines.push(`    ${head}`);
      continue;
    }
    lines.push(`    ${head} {`);
    for (const a of entity.attributes) {
      const keys = a.keys.length ? ' ' + a.keys.join(', ') : '';
      const comment = a.comment !== undefined ? ` "${a.comment.replace(/"/g, "'")}"` : '';
      lines.push(`        ${a.type} ${a.name}${keys}${comment}`);
    }
    lines.push('    }');
  }
  for (const rel of model.relationships) {
    const dash = rel.identifying ? '--' : '..';
    const label = `"${(rel.label ?? '').replace(/"/g, "'")}"`;
    lines.push(`    ${rel.from} ${rel.left}${dash}${rel.right} ${rel.to} : ${label}`);
  }
  return lines.join('\n') + '\n';
}

/** Generate an `erDiagram` body directly from a DiagramModel. */
export function generateErFromDiagram(diagram: DiagramModel): string {
  return generateMermaidEr(erModelFromDiagram(diagram));
}
