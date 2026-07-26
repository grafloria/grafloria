/**
 * Mermaid `classDiagram` — parser, model builder and generator (Phase 3).
 *
 * Replaces `extended/UMLParser`, which produced ZERO nodes on canonical input:
 * it only recognised `class X` when the `{` sat on the FOLLOWING line, ignored
 * the `Animal : +int age` member form entirely, and its relationship regex
 * could not tell `<|--` from `<--`.
 *
 * The target representation is the diagram kit's `umlDiagram({classes,
 * relationships})`: three-compartment cards and the full 7-kind notation
 * vocabulary. Two facts about the mapping are worth stating, because they are
 * where a naive port goes wrong:
 *
 *  1. MEMBERS ARE KEPT AS RAW TEXT. The kit renders `attributes: string[]` /
 *     `methods: string[]` verbatim, and Mermaid itself accepts several member
 *     spellings (`+int age`, `+age: int`, `+area() float`, `+area() : float`).
 *     Re-formatting them would silently rewrite the author's diagram; we parse
 *     visibility for structure and keep the text for display and re-emission.
 *  2. DIRECTION IS NORMALIZED FOR THE KIT, NOT FOR THE MODEL. Mermaid's
 *     `Animal <|-- Duck` puts the hollow triangle on the LEFT operand, while
 *     the kit's `inheritance` always draws it at `to`. So the kit spec flips
 *     the ends (and the multiplicity pair with them) while the model keeps the
 *     literal operator and operand order — which is what lets the generator
 *     re-emit the author's own syntax.
 *  3. THE OPERATOR SET IS DERIVED FROM THE GRAMMAR, NOT ENUMERATED. See
 *     `UmlOperator` below: Mermaid composes `relationType? lineType
 *     relationType?`, which is 72 legal spellings. Listing a subset by hand is
 *     how the lollipop family (`bar ()-- foo`) and every mixed operator
 *     (`A <|--* B`) came to be dropped in silence.
 */
import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { significantLines, unquote } from './lines';
const LEFT_MARKERS = {
    '<|': 'extension', '*': 'composition', 'o': 'aggregation', '<': 'dependency', '()': 'lollipop',
};
const RIGHT_MARKERS = {
    '|>': 'extension', '*': 'composition', 'o': 'aggregation', '>': 'dependency', '()': 'lollipop',
};
const LINE_TYPES = ['--', '..'];
/** Split an operator into its three grammar pieces. `<|` before `<`, `|>` before `>`. */
const OPERATOR_SHAPE_RE = /^(<\||\*|o|<|\(\))?(--|\.\.)(\|>|\*|o|>|\(\))?$/;
/**
 * A marker's kind, once the line type has had its say: a solid line makes the
 * triangle INHERITANCE and the arrow a DIRECTED ASSOCIATION, a dotted line
 * makes them REALIZATION and DEPENDENCY.
 *
 * LOLLIPOP → `realization`, and this is the one judgement call in the table.
 * The ball-and-socket notation is UML's compact spelling of interface
 * PROVISION: `bar ()-- foo` says "foo provides interface bar" — mermaid's own
 * `addRelation` proves it, calling `addInterface(id1, id2)` so that the operand
 * beside the `()` becomes the interface and the far operand becomes the class.
 * The long spelling of exactly that sentence is `foo ..|> bar`, i.e. the kit's
 * `realization` from the class to the interface. So a lollipop is a realization
 * whose interface end happens to be drawn as a ball; we keep the kind and lose
 * only the ball glyph (the kit has no lollipop marker — see the gap analysis).
 */
function markerKind(role, line) {
    switch (role) {
        case 'extension': return line === '..' ? 'realization' : 'inheritance';
        case 'dependency': return line === '..' ? 'dependency' : 'directed-association';
        case 'composition': return 'composition';
        case 'aggregation': return 'aggregation';
        case 'lollipop': return 'realization';
    }
}
/**
 * Kinds the kit draws with their distinguishing glyph at `from` rather than at
 * `to`. This is the whole subtlety of the direction flip: an arrowhead or a
 * triangle marks the TARGET, so Mermaid writing it first (`<|--`, `<--`, `<..`,
 * `()--`) means the kit's ends are reversed — but a diamond marks the *whole*,
 * which is the SOURCE, so the diamond kinds are the mirror of that.
 */
const MARKER_AT_FROM = new Set(['composition', 'aggregation']);
/**
 * Operator → (kit kind, whether the kit's ends are the REVERSE of Mermaid's),
 * derived from the grammar rather than enumerated. This reproduces the previous
 * 17-row table exactly and covers the other 55 spellings for free.
 */
export function umlRelationKind(operator) {
    const shape = OPERATOR_SHAPE_RE.exec(operator);
    // Unreachable for anything the parser produced (the alternation IS this
    // grammar); a plain association is the honest fallback for a hand-built model.
    if (!shape)
        return { kind: 'association', reversed: false };
    const [, left, line, right] = shape;
    const leftKind = left ? markerKind(LEFT_MARKERS[left], line) : undefined;
    const rightKind = right ? markerKind(RIGHT_MARKERS[right], line) : undefined;
    if (!leftKind && !rightKind)
        return { kind: 'association', reversed: false };
    // BOTH ends marked (`<-->`, `<|--|>`, `<..>`, `()--|>`, `*--o`, …). The kit's
    // notation table has no both-ends kind, so the RIGHT marker wins and the
    // second glyph is lost. Dropping the line instead would make both classes
    // vanish — a silent empty diagram, which is worse than a lossy one. The
    // literal operator is preserved, so export is still exact.
    const kind = rightKind !== null && rightKind !== void 0 ? rightKind : leftKind;
    const markerOnLeft = rightKind === undefined;
    return { kind, reversed: MARKER_AT_FROM.has(kind) ? !markerOnLeft : markerOnLeft };
}
/** Every spelling the grammar can produce: left? × line × right? = 72. */
const ALL_OPERATORS = [];
for (const left of ['', ...Object.keys(LEFT_MARKERS)]) {
    for (const line of LINE_TYPES) {
        for (const right of ['', ...Object.keys(RIGHT_MARKERS)]) {
            ALL_OPERATORS.push(`${left}${line}${right}`);
        }
    }
}
/** Longest-first, so `<|--` never matches as `<--` and `()--()` never as `()--`. */
const OPERATOR_ALTERNATION = [...ALL_OPERATORS]
    .sort((a, b) => b.length - a.length)
    .map((op) => op.replace(/[.*+?^${}()|[\]\\]/g, (c) => '\\' + c))
    .join('|');
const CLASS_REF = '(?:[A-Za-z0-9_\\u00c0-\\uffff][A-Za-z0-9_\\u00c0-\\uffff]*(?:~[^~]*~)?)';
const REL_RE = new RegExp(`^(${CLASS_REF})\\s*(?:"([^"]*)"\\s*)?(${OPERATOR_ALTERNATION})\\s*(?:"([^"]*)"\\s*)?(${CLASS_REF})\\s*(?::\\s*(.*))?$`);
// `class Foo`, `class Foo~T~`, `class Foo["Label"]`, `class Foo:::css {`
const CLASS_DECL_RE = /^class\s+([A-Za-z0-9_\u00C0-\uFFFF]+)(?:~([^~]*)~)?(?:\["([^"]*)"\])?((?::::[A-Za-z0-9_-]+)*)\s*(\{?)\s*$/;
// `Animal : +int age` — the colon member form (checked AFTER relationships).
const MEMBER_RE = /^([A-Za-z0-9_\u00C0-\uFFFF]+)(?:~[^~]*~)?\s*:\s*(.+)$/;
// A free-standing annotation: `<<Interface>> Shape`
const ANNOTATION_RE = /^<<([^>]+)>>\s+([A-Za-z0-9_\u00C0-\uFFFF]+)\s*$/;
function parseMember(raw) {
    var _a, _b, _c;
    const text = raw.trim();
    if (!text)
        return null;
    let rest = text;
    let visibility;
    if (/^[+\-#~]/.test(rest)) {
        visibility = rest[0];
        rest = rest.slice(1).trim();
    }
    const isMethod = /\(/.test(rest);
    let classifier;
    // Classifiers trail the member: `+area()*` abstract, `+count$` static.
    const classifierMatch = rest.match(/([$*])\s*$/);
    if (classifierMatch)
        classifier = classifierMatch[1];
    // `+String beakColor` (type first) and `+age: int` (name first) are BOTH
    // Mermaid; the name is the last token before any `:`.
    const beforeColon = rest.split(':')[0].trim();
    const name = isMethod
        ? ((_b = (_a = rest.match(/([A-Za-z0-9_\u00C0-\uFFFF]+)\s*\(/)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : rest)
        : ((_c = beforeColon.split(/\s+/).filter(Boolean).pop()) !== null && _c !== void 0 ? _c : rest);
    return Object.assign(Object.assign(Object.assign({ raw: text }, (visibility ? { visibility } : {})), { name,
        isMethod }), (classifier ? { classifier } : {}));
}
/**
 * Parse a `classDiagram` body. Unknown lines (`click`, `style`, `namespace`,
 * `callback`, future syntax) are skipped — never turned into a class.
 */
export function parseMermaidClass(text) {
    const lines = significantLines(text, ['classDiagram', 'classDiagram-v2']);
    const classes = new Map();
    const relationships = [];
    const notes = [];
    let direction;
    const touch = (rawId) => {
        // `Square~Shape~` in a relationship refers to the class `Square`.
        const generic = rawId.match(/^([^~]+)~([^~]*)~$/);
        const id = generic ? generic[1] : rawId;
        const existing = classes.get(id);
        if (existing) {
            if (generic && !existing.generic) {
                existing.generic = generic[2];
                existing.name = `${id}~${generic[2]}~`;
            }
            return existing;
        }
        const def = Object.assign(Object.assign({ id, name: generic ? `${id}~${generic[2]}~` : id }, (generic ? { generic: generic[2] } : {})), { attributes: [], methods: [], cssClasses: [] });
        classes.set(id, def);
        return def;
    };
    const addMember = (def, raw) => {
        const stereotype = raw.trim().match(/^<<([^>]+)>>$/);
        if (stereotype) {
            def.stereotype = stereotype[1].trim();
            return;
        }
        const member = parseMember(raw);
        if (!member)
            return;
        (member.isMethod ? def.methods : def.attributes).push(member);
    };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].text;
        const dir = line.match(/^direction\s+(TB|BT|LR|RL|TD)$/i);
        if (dir) {
            direction = dir[1].toUpperCase();
            continue;
        }
        if (/^note\b/.test(line)) {
            const forMatch = line.match(/^note\s+for\s+([A-Za-z0-9_\u00C0-\uFFFF]+)\s+"([^"]*)"/);
            const plain = line.match(/^note\s+"([^"]*)"/);
            if (forMatch)
                notes.push({ for: forMatch[1], text: forMatch[2] });
            else if (plain)
                notes.push({ text: plain[1] });
            continue;
        }
        const annotation = line.match(ANNOTATION_RE);
        if (annotation) {
            touch(annotation[2]).stereotype = annotation[1].trim();
            continue;
        }
        const decl = line.match(CLASS_DECL_RE);
        if (decl) {
            const [, id, generic, label, cssRaw, brace] = decl;
            const def = touch(generic !== undefined ? `${id}~${generic}~` : id);
            if (label)
                def.name = label;
            if (cssRaw) {
                for (const c of cssRaw.split(':::').filter(Boolean))
                    def.cssClasses.push(c);
            }
            if (brace === '{') {
                let j = i + 1;
                for (; j < lines.length; j++) {
                    if (lines[j].text.startsWith('}'))
                        break;
                    addMember(def, lines[j].text);
                }
                i = j;
            }
            continue;
        }
        // Relationships BEFORE the colon-member form: `A "1" *-- "n" B : label`
        // also contains a colon, and members never contain a relationship operator.
        const rel = line.match(REL_RE);
        if (rel) {
            const [, from, leftMult, operator, rightMult, to, label] = rel;
            const fromDef = touch(from);
            const toDef = touch(to);
            relationships.push(Object.assign(Object.assign({ from: fromDef.id, to: toDef.id, operator: operator }, (label !== undefined && label.trim() ? { label: unquote(label.trim()) } : {})), (leftMult !== undefined || rightMult !== undefined
                ? { multiplicity: [leftMult !== null && leftMult !== void 0 ? leftMult : '', rightMult !== null && rightMult !== void 0 ? rightMult : ''] }
                : {})));
            continue;
        }
        const member = line.match(MEMBER_RE);
        if (member) {
            addMember(touch(member[1]), member[2]);
            continue;
        }
        // A bare `ClassName` line declares a class in Mermaid too.
        if (/^[A-Za-z0-9_\u00C0-\uFFFF]+(?:~[^~]*~)?$/.test(line)) {
            touch(line);
            continue;
        }
        // Everything else is ignored on purpose.
    }
    return Object.assign({ classes: [...classes.values()], relationships,
        notes }, (direction ? { direction } : {}));
}
/**
 * Project onto `umlDiagram()` options — this is where Mermaid's
 * arrowhead-first operators are flipped into the kit's from→to convention.
 */
export function umlSpecFrom(model) {
    return {
        classes: model.classes.map((c) => (Object.assign(Object.assign(Object.assign({ id: c.id, name: c.name }, (c.stereotype ? { stereotype: c.stereotype } : {})), (c.stereotype && /^(abstract|interface)$/i.test(c.stereotype) ? { abstract: true } : {})), { attributes: c.attributes.map((a) => a.raw), methods: c.methods.map((m) => m.raw) }))),
        relationships: model.relationships.map((r) => {
            const { kind, reversed } = umlRelationKind(r.operator);
            const multiplicity = r.multiplicity;
            return Object.assign(Object.assign({ from: reversed ? r.to : r.from, to: reversed ? r.from : r.to, kind }, (r.label ? { label: r.label } : {})), (multiplicity
                ? { multiplicity: (reversed ? [multiplicity[1], multiplicity[0]] : multiplicity) }
                : {}));
        }),
    };
}
// ── Model building ─────────────────────────────────────────────────────────
const CARD_W = 200;
function classHeight(def) {
    const rows = def.attributes.length + def.methods.length;
    return 34 + (def.stereotype ? 14 : 0) + rows * 20 + 24;
}
export function classModelToDiagram(model) {
    const diagram = new DiagramModel('UML Class Diagram');
    diagram.setMetadata('diagramType', 'classDiagram');
    if (model.direction)
        diagram.setMetadata('direction', model.direction);
    diagram.setMetadata('umlSpec', umlSpecFrom(model));
    if (model.notes.length)
        diagram.setMetadata('umlNotes', model.notes);
    const nodes = new Map();
    model.classes.forEach((def, i) => {
        const node = new NodeModel({
            id: def.id,
            type: 'uml:class',
            position: { x: 80 + (i % 3) * 320, y: 60 + Math.floor(i / 3) * 260 },
            size: { width: CARD_W, height: classHeight(def) },
        });
        node.setLabel(def.name);
        node.setMetadata('umlClass', def);
        node.setMetadata('dslShape', 'rectangle');
        node.setMetadata('shape', { type: 'rect', cornerRadius: 0 });
        node.data['attributes'] = def.attributes.map((a) => a.raw);
        node.data['methods'] = def.methods.map((m) => m.raw);
        diagram.addNode(node);
        nodes.set(def.id, node);
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
        link.setMetadata('umlRelationship', rel);
        link.setMetadata('umlKind', umlRelationKind(rel.operator).kind);
    }
    return diagram;
}
export function classModelFromDiagram(diagram) {
    var _a, _b, _c, _d, _e;
    const classes = [];
    for (const node of diagram.getNodes()) {
        const stored = node.getMetadata('umlClass');
        if (stored)
            classes.push(Object.assign(Object.assign({}, stored), { id: node.id }));
        else {
            classes.push({
                id: node.id,
                name: (_b = (_a = node.getLabel) === null || _a === void 0 ? void 0 : _a.call(node)) !== null && _b !== void 0 ? _b : node.id,
                attributes: [],
                methods: [],
                cssClasses: [],
            });
        }
    }
    const relationships = [];
    for (const link of diagram.getLinks()) {
        const stored = link.getMetadata('umlRelationship');
        const from = link.sourceNodeId;
        const to = link.targetNodeId;
        if (!from || !to)
            continue;
        const label = (_c = link.getMetadata('label')) !== null && _c !== void 0 ? _c : stored === null || stored === void 0 ? void 0 : stored.label;
        relationships.push(Object.assign(Object.assign({ from,
            to, operator: (_d = stored === null || stored === void 0 ? void 0 : stored.operator) !== null && _d !== void 0 ? _d : '-->' }, (label ? { label } : {})), ((stored === null || stored === void 0 ? void 0 : stored.multiplicity) ? { multiplicity: stored.multiplicity } : {})));
    }
    const direction = diagram.getMetadata('direction');
    const notes = (_e = diagram.getMetadata('umlNotes')) !== null && _e !== void 0 ? _e : [];
    return Object.assign({ classes, relationships, notes }, (direction ? { direction } : {}));
}
// ── Generation ─────────────────────────────────────────────────────────────
export function generateMermaidClass(model) {
    var _a, _b;
    const lines = ['classDiagram'];
    if (model.direction)
        lines.push(`    direction ${model.direction}`);
    for (const def of model.classes) {
        const head = def.generic ? `${def.id}~${def.generic}~` : def.id;
        const css = def.cssClasses.map((c) => `:::${c}`).join('');
        const hasBody = def.stereotype || def.attributes.length || def.methods.length;
        if (!hasBody) {
            lines.push(`    class ${head}${css}`);
            continue;
        }
        lines.push(`    class ${head}${css} {`);
        if (def.stereotype)
            lines.push(`        <<${def.stereotype}>>`);
        for (const a of def.attributes)
            lines.push(`        ${a.raw}`);
        for (const m of def.methods)
            lines.push(`        ${m.raw}`);
        lines.push('    }');
    }
    for (const rel of model.relationships) {
        const left = ((_a = rel.multiplicity) === null || _a === void 0 ? void 0 : _a[0]) ? ` "${rel.multiplicity[0]}"` : '';
        const right = ((_b = rel.multiplicity) === null || _b === void 0 ? void 0 : _b[1]) ? ` "${rel.multiplicity[1]}"` : '';
        const label = rel.label ? ` : ${rel.label}` : '';
        lines.push(`    ${rel.from}${left} ${rel.operator}${right} ${rel.to}${label}`);
    }
    for (const note of model.notes) {
        lines.push(note.for ? `    note for ${note.for} "${note.text}"` : `    note "${note.text}"`);
    }
    return lines.join('\n') + '\n';
}
export function generateClassFromDiagram(diagram) {
    return generateMermaidClass(classModelFromDiagram(diagram));
}
//# sourceMappingURL=MermaidClass.js.map