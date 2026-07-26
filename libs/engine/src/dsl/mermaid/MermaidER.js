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
const LEFT_CARDINALITY = {
    '||': 'one',
    '|o': 'zero-or-one',
    '}o': 'zero-or-many',
    '}|': 'one-or-many',
};
const RIGHT_CARDINALITY = {
    '||': 'one',
    'o|': 'zero-or-one',
    'o{': 'zero-or-many',
    '|{': 'one-or-many',
};
/** Map a parsed cardinality pair onto the kit's explicit marker pair. */
export function erMarkers(rel) {
    return { tail: LEFT_CARDINALITY[rel.left], head: RIGHT_CARDINALITY[rel.right] };
}
// ── Parsing ────────────────────────────────────────────────────────────────
// An entity reference: a bare identifier or a "quoted name". Deliberately does
// NOT include the cardinality characters (| o { }), so a GLUED relationship
// (`CUSTOMER||--o{ORDER`) still splits correctly — Mermaid accepts both.
const REF = '(?:"[^"]*"|[A-Za-z0-9_\\u00c0-\\uffff][A-Za-z0-9_\\-\\u00c0-\\uffff]*)';
const REL_RE = new RegExp(`^(${REF})\\s*(\\|\\||\\|o|\\}o|\\}\\|)(--|\\.\\.)(\\|\\||o\\||o\\{|\\|\\{)\\s*(${REF})\\s*(?::\\s*(.*))?$`);
// `ENTITY {` or `ENTITY["Alias"] {` — the attribute-block opener.
const BLOCK_RE = new RegExp(`^(${REF})(?:\\[\\s*("[^"]*"|[^\\]]*)\\s*\\])?\\s*\\{\\s*(.*)$`);
// A bare entity declaration on its own line (v11): `CUSTOMER` / `p["Person"]`.
const BARE_RE = new RegExp(`^(${REF})(?:\\[\\s*("[^"]*"|[^\\]]*)\\s*\\])?\\s*$`);
function parseAttribute(line) {
    // A trailing "comment" is peeled off first so it cannot be mistaken for a key.
    let rest = line;
    let comment;
    const commentMatch = rest.match(/\s+"([^"]*)"\s*$/);
    if (commentMatch) {
        comment = commentMatch[1];
        rest = rest.slice(0, commentMatch.index).trim();
    }
    const parts = rest.split(/\s+/).filter(Boolean);
    // Mermaid requires BOTH a type and a name; a single token is not an
    // attribute, and inventing one from it is exactly the garbage Phase 0 bans.
    if (parts.length < 2)
        return null;
    const [type, name, ...tail] = parts;
    const keys = tail
        .join(' ')
        .split(/[,\s]+/)
        .map((k) => k.trim().toUpperCase())
        .filter((k) => k === 'PK' || k === 'FK' || k === 'UK');
    return Object.assign({ type, name, keys }, (comment !== undefined ? { comment } : {}));
}
/**
 * Parse an `erDiagram` body into the Mermaid-shaped model. Lines that are not
 * grammar (styling directives, future syntax) are SKIPPED, never nodified.
 */
export function parseMermaidEr(text) {
    const lines = significantLines(text, 'erDiagram');
    const entities = new Map();
    const relationships = [];
    let direction;
    /** Entities are declared by mention as well as by block — Mermaid's rule. */
    const touch = (rawId, alias) => {
        const id = unquote(rawId);
        const existing = entities.get(id);
        if (existing) {
            if (alias)
                existing.name = alias;
            return existing;
        }
        const entity = { id, name: alias !== null && alias !== void 0 ? alias : id, attributes: [] };
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
                left: left,
                right: right,
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
            const body = sameLineRest !== null && sameLineRest !== void 0 ? sameLineRest : '';
            if (body.includes('}')) {
                // `CUSTOMER {}` / `CUSTOMER { string name }` — opened and closed inline.
                const inlineAttribute = parseAttribute(body.slice(0, body.indexOf('}')).trim());
                if (inlineAttribute)
                    entity.attributes.push(inlineAttribute);
            }
            else {
                let j = i + 1;
                for (; j < lines.length; j++) {
                    const inner = lines[j].text;
                    if (inner.startsWith('}'))
                        break;
                    const attribute = parseAttribute(inner);
                    if (attribute)
                        entity.attributes.push(attribute);
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
    return Object.assign({ entities: [...entities.values()], relationships }, (direction ? { direction } : {}));
}
/** Project the Mermaid model onto the diagram kit's `erDiagram()` options. */
export function erSpecFrom(model) {
    return {
        entities: model.entities.map((e) => ({
            id: e.id,
            name: e.name,
            columns: e.attributes.map((a) => (Object.assign(Object.assign({ name: a.name, type: a.type }, (a.keys.includes('PK') ? { pk: true } : {})), (a.keys.includes('FK') ? { fk: true } : {})))),
        })),
        relationships: model.relationships.map((r) => (Object.assign(Object.assign(Object.assign({ from: r.from, to: r.to }, (r.label ? { label: r.label } : {})), { cardinality: erMarkers(r) }), (r.identifying ? {} : { dashed: true })))),
    };
}
// ── Model building ─────────────────────────────────────────────────────────
const CARD_W = 190;
const HEAD_H = 28;
const ROW_H = 25;
const SLACK = 9;
/** Build a DiagramModel from a parsed ER model. */
export function erModelToDiagram(model) {
    const diagram = new DiagramModel('ER Diagram');
    diagram.setMetadata('diagramType', 'erDiagram');
    if (model.direction)
        diagram.setMetadata('direction', model.direction);
    // The kit spec rides on the diagram so an embedder can hand it straight to
    // `erDiagram()` from libs/element without re-deriving anything.
    diagram.setMetadata('erSpec', erSpecFrom(model));
    const nodes = new Map();
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
        if (!source || !target)
            continue;
        const link = diagram.createSmartLink(source, target, 'orthogonal');
        if (!link)
            continue;
        if (rel.label)
            link.setLabel(rel.label);
        // Stored in MERMAID form (literal tokens, literal left/right order) so the
        // generator re-emits the author's syntax, not a normalized approximation.
        link.setMetadata('erRelationship', rel);
        link.setMetadata('erCardinality', erMarkers(rel));
    }
    return diagram;
}
/** Read the Mermaid ER model back off a DiagramModel (for generation). */
export function erModelFromDiagram(diagram) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const entities = [];
    for (const node of diagram.getNodes()) {
        const stored = node.getMetadata('erEntity');
        if (stored) {
            // The node id is authoritative — a rename in the model must reach the text.
            entities.push(Object.assign(Object.assign({}, stored), { id: node.id, name: (_b = (_a = node.getLabel) === null || _a === void 0 ? void 0 : _a.call(node)) !== null && _b !== void 0 ? _b : stored.name }));
        }
        else {
            entities.push({ id: node.id, name: (_d = (_c = node.getLabel) === null || _c === void 0 ? void 0 : _c.call(node)) !== null && _d !== void 0 ? _d : node.id, attributes: [] });
        }
    }
    const relationships = [];
    for (const link of diagram.getLinks()) {
        const stored = link.getMetadata('erRelationship');
        const from = link.sourceNodeId;
        const to = link.targetNodeId;
        if (!from || !to)
            continue;
        relationships.push({
            from,
            to,
            left: (_e = stored === null || stored === void 0 ? void 0 : stored.left) !== null && _e !== void 0 ? _e : '||',
            right: (_f = stored === null || stored === void 0 ? void 0 : stored.right) !== null && _f !== void 0 ? _f : 'o{',
            identifying: (_g = stored === null || stored === void 0 ? void 0 : stored.identifying) !== null && _g !== void 0 ? _g : true,
            label: (_j = (_h = link.getMetadata('label')) !== null && _h !== void 0 ? _h : stored === null || stored === void 0 ? void 0 : stored.label) !== null && _j !== void 0 ? _j : '',
        });
    }
    const direction = diagram.getMetadata('direction');
    return Object.assign({ entities, relationships }, (direction ? { direction } : {}));
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
export function generateMermaidEr(model) {
    var _a;
    const lines = ['erDiagram'];
    if (model.direction)
        lines.push(`    direction ${model.direction}`);
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
        const label = `"${((_a = rel.label) !== null && _a !== void 0 ? _a : '').replace(/"/g, "'")}"`;
        lines.push(`    ${rel.from} ${rel.left}${dash}${rel.right} ${rel.to} : ${label}`);
    }
    return lines.join('\n') + '\n';
}
/** Generate an `erDiagram` body directly from a DiagramModel. */
export function generateErFromDiagram(diagram) {
    return generateMermaidEr(erModelFromDiagram(diagram));
}
//# sourceMappingURL=MermaidER.js.map