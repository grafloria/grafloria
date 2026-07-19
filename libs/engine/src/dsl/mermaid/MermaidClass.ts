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
 */
import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { significantLines, unquote } from './lines';

export type UmlVisibility = '+' | '-' | '#' | '~';

export interface MermaidClassMember {
  /** The member exactly as written (minus the visibility marker's whitespace). */
  raw: string;
  visibility?: UmlVisibility;
  name: string;
  isMethod: boolean;
  /** `$` (static) / `*` (abstract) classifier suffixes Mermaid supports. */
  classifier?: '$' | '*';
}

export interface MermaidClassDef {
  id: string;
  /** Display name — `class Foo["Bar"]` label, else the id (generics included). */
  name: string;
  /** `<<interface>>` / `<<abstract>>` / `<<enum>>` / … */
  stereotype?: string;
  /** `class Square~Shape~` generic parameter. */
  generic?: string;
  attributes: MermaidClassMember[];
  methods: MermaidClassMember[];
  /** `:::css` style classes applied to the node. */
  cssClasses: string[];
}

/** The literal Mermaid operator, kept so generation is not a guess. */
export type UmlOperator =
  | '<|--' | '--|>' | '<|..' | '..|>'
  | '*--' | '--*' | 'o--' | '--o'
  | '-->' | '<--' | '..>' | '<..'
  | '<-->' | '<|--|>' | '<..>'
  | '--' | '..';

/** The diagram kit's relationship vocabulary. */
export type UmlKind =
  | 'inheritance' | 'realization' | 'association' | 'directed-association'
  | 'aggregation' | 'composition' | 'dependency';

export interface MermaidClassRelationship {
  /** Left operand, exactly as written. */
  from: string;
  /** Right operand, exactly as written. */
  to: string;
  operator: UmlOperator;
  label?: string;
  /** Multiplicity as written: [left-of-operator, right-of-operator]. */
  multiplicity?: [string, string];
}

export interface MermaidClassModel {
  classes: MermaidClassDef[];
  relationships: MermaidClassRelationship[];
  direction?: string;
  /** `note "text"` / `note for X "text"` — kept so export does not drop them. */
  notes: Array<{ for?: string; text: string }>;
}

/**
 * Operator → (kit kind, whether the kit's ends are the REVERSE of Mermaid's).
 * The reverse flag is the whole subtlety: Mermaid writes the arrowhead end
 * FIRST for `<|--`, `<--`, `<..`, and LAST for `--|>`, `-->`, `..>`; the
 * diamond kinds are the mirror of that (the diamond marks the *whole*).
 */
const OPERATORS: Record<UmlOperator, { kind: UmlKind; reversed: boolean }> = {
  '<|--': { kind: 'inheritance', reversed: true },
  '--|>': { kind: 'inheritance', reversed: false },
  '<|..': { kind: 'realization', reversed: true },
  '..|>': { kind: 'realization', reversed: false },
  '*--': { kind: 'composition', reversed: false },
  '--*': { kind: 'composition', reversed: true },
  'o--': { kind: 'aggregation', reversed: false },
  '--o': { kind: 'aggregation', reversed: true },
  '-->': { kind: 'directed-association', reversed: false },
  '<--': { kind: 'directed-association', reversed: true },
  '..>': { kind: 'dependency', reversed: false },
  '<..': { kind: 'dependency', reversed: true },
  '--': { kind: 'association', reversed: false },
  '..': { kind: 'association', reversed: false },
  // TWO-WAY forms. Real Mermaid accepts all three, and dropping them meant the
  // line was skipped ENTIRELY — both classes vanished from the diagram, which
  // is worse than a lossy render. The kit's notation table has no both-ends
  // kind, so the SECOND arrowhead is lost; the structure is right, the literal
  // operator is preserved for re-export, and the loss is documented in the gap
  // analysis rather than hidden.
  '<-->': { kind: 'directed-association', reversed: false },
  '<|--|>': { kind: 'inheritance', reversed: false },
  '<..>': { kind: 'dependency', reversed: false },
};

/** Longest-first, so `<|--` never matches as `<--` and `*--` never as `--`. */
const OPERATOR_ALTERNATION = (Object.keys(OPERATORS) as UmlOperator[])
  .sort((a, b) => b.length - a.length)
  .map((op) => op.replace(/[.*|]/g, (c) => '\\' + c))
  .join('|');

const CLASS_REF = '(?:[A-Za-z0-9_\\u00c0-\\uffff][A-Za-z0-9_\\u00c0-\\uffff]*(?:~[^~]*~)?)';
const REL_RE = new RegExp(
  `^(${CLASS_REF})\\s*(?:"([^"]*)"\\s*)?(${OPERATOR_ALTERNATION})\\s*(?:"([^"]*)"\\s*)?(${CLASS_REF})\\s*(?::\\s*(.*))?$`
);
// `class Foo`, `class Foo~T~`, `class Foo["Label"]`, `class Foo:::css {`
const CLASS_DECL_RE =
  /^class\s+([A-Za-z0-9_\u00C0-\uFFFF]+)(?:~([^~]*)~)?(?:\["([^"]*)"\])?((?::::[A-Za-z0-9_-]+)*)\s*(\{?)\s*$/;
// `Animal : +int age` — the colon member form (checked AFTER relationships).
const MEMBER_RE = /^([A-Za-z0-9_\u00C0-\uFFFF]+)(?:~[^~]*~)?\s*:\s*(.+)$/;
// A free-standing annotation: `<<Interface>> Shape`
const ANNOTATION_RE = /^<<([^>]+)>>\s+([A-Za-z0-9_\u00C0-\uFFFF]+)\s*$/;

function parseMember(raw: string): MermaidClassMember | null {
  const text = raw.trim();
  if (!text) return null;
  let rest = text;
  let visibility: UmlVisibility | undefined;
  if (/^[+\-#~]/.test(rest)) {
    visibility = rest[0] as UmlVisibility;
    rest = rest.slice(1).trim();
  }
  const isMethod = /\(/.test(rest);
  let classifier: '$' | '*' | undefined;
  // Classifiers trail the member: `+area()*` abstract, `+count$` static.
  const classifierMatch = rest.match(/([$*])\s*$/);
  if (classifierMatch) classifier = classifierMatch[1] as '$' | '*';
  // `+String beakColor` (type first) and `+age: int` (name first) are BOTH
  // Mermaid; the name is the last token before any `:`.
  const beforeColon = rest.split(':')[0].trim();
  const name = isMethod
    ? (rest.match(/([A-Za-z0-9_\u00C0-\uFFFF]+)\s*\(/)?.[1] ?? rest)
    : (beforeColon.split(/\s+/).filter(Boolean).pop() ?? rest);
  return {
    raw: text,
    ...(visibility ? { visibility } : {}),
    name,
    isMethod,
    ...(classifier ? { classifier } : {}),
  };
}

/**
 * Parse a `classDiagram` body. Unknown lines (`click`, `style`, `namespace`,
 * `callback`, future syntax) are skipped — never turned into a class.
 */
export function parseMermaidClass(text: string): MermaidClassModel {
  const lines = significantLines(text, ['classDiagram', 'classDiagram-v2']);
  const classes = new Map<string, MermaidClassDef>();
  const relationships: MermaidClassRelationship[] = [];
  const notes: MermaidClassModel['notes'] = [];
  let direction: string | undefined;

  const touch = (rawId: string): MermaidClassDef => {
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
    const def: MermaidClassDef = {
      id,
      name: generic ? `${id}~${generic[2]}~` : id,
      ...(generic ? { generic: generic[2] } : {}),
      attributes: [],
      methods: [],
      cssClasses: [],
    };
    classes.set(id, def);
    return def;
  };

  const addMember = (def: MermaidClassDef, raw: string): void => {
    const stereotype = raw.trim().match(/^<<([^>]+)>>$/);
    if (stereotype) {
      def.stereotype = stereotype[1].trim();
      return;
    }
    const member = parseMember(raw);
    if (!member) return;
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
      if (forMatch) notes.push({ for: forMatch[1], text: forMatch[2] });
      else if (plain) notes.push({ text: plain[1] });
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
      if (label) def.name = label;
      if (cssRaw) {
        for (const c of cssRaw.split(':::').filter(Boolean)) def.cssClasses.push(c);
      }
      if (brace === '{') {
        let j = i + 1;
        for (; j < lines.length; j++) {
          if (lines[j].text.startsWith('}')) break;
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
      relationships.push({
        from: fromDef.id,
        to: toDef.id,
        operator: operator as UmlOperator,
        ...(label !== undefined && label.trim() ? { label: unquote(label.trim()) } : {}),
        ...(leftMult !== undefined || rightMult !== undefined
          ? { multiplicity: [leftMult ?? '', rightMult ?? ''] as [string, string] }
          : {}),
      });
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

  return {
    classes: [...classes.values()],
    relationships,
    notes,
    ...(direction ? { direction } : {}),
  };
}

// ── The kit spec (what `umlDiagram()` in libs/element consumes) ─────────────

export interface UmlSpecClass {
  id: string;
  name: string;
  stereotype?: string;
  abstract?: boolean;
  attributes: string[];
  methods: string[];
}

export interface UmlSpecRelationship {
  from: string;
  to: string;
  kind: UmlKind;
  label?: string;
  multiplicity?: [string, string];
}

export interface UmlSpec {
  classes: UmlSpecClass[];
  relationships: UmlSpecRelationship[];
}

/**
 * Project onto `umlDiagram()` options — this is where Mermaid's
 * arrowhead-first operators are flipped into the kit's from→to convention.
 */
export function umlSpecFrom(model: MermaidClassModel): UmlSpec {
  return {
    classes: model.classes.map((c) => ({
      id: c.id,
      name: c.name,
      ...(c.stereotype ? { stereotype: c.stereotype } : {}),
      ...(c.stereotype && /^(abstract|interface)$/i.test(c.stereotype) ? { abstract: true } : {}),
      attributes: c.attributes.map((a) => a.raw),
      methods: c.methods.map((m) => m.raw),
    })),
    relationships: model.relationships.map((r) => {
      const { kind, reversed } = OPERATORS[r.operator];
      const multiplicity = r.multiplicity;
      return {
        from: reversed ? r.to : r.from,
        to: reversed ? r.from : r.to,
        kind,
        ...(r.label ? { label: r.label } : {}),
        ...(multiplicity
          ? { multiplicity: (reversed ? [multiplicity[1], multiplicity[0]] : multiplicity) as [string, string] }
          : {}),
      };
    }),
  };
}

// ── Model building ─────────────────────────────────────────────────────────

const CARD_W = 200;

function classHeight(def: MermaidClassDef): number {
  const rows = def.attributes.length + def.methods.length;
  return 34 + (def.stereotype ? 14 : 0) + rows * 20 + 24;
}

export function classModelToDiagram(model: MermaidClassModel): DiagramModel {
  const diagram = new DiagramModel('UML Class Diagram');
  diagram.setMetadata('diagramType', 'classDiagram');
  if (model.direction) diagram.setMetadata('direction', model.direction);
  diagram.setMetadata('umlSpec', umlSpecFrom(model));
  if (model.notes.length) diagram.setMetadata('umlNotes', model.notes);

  const nodes = new Map<string, NodeModel>();
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
    if (!source || !target) continue;
    const link = diagram.createSmartLink(source, target, 'orthogonal');
    if (!link) continue;
    if (rel.label) link.setLabel(rel.label);
    link.setMetadata('umlRelationship', rel);
    link.setMetadata('umlKind', OPERATORS[rel.operator].kind);
  }

  return diagram;
}

export function classModelFromDiagram(diagram: DiagramModel): MermaidClassModel {
  const classes: MermaidClassDef[] = [];
  for (const node of diagram.getNodes()) {
    const stored = node.getMetadata('umlClass') as MermaidClassDef | undefined;
    if (stored) classes.push({ ...stored, id: node.id });
    else {
      classes.push({
        id: node.id,
        name: (node.getLabel?.() as string) ?? node.id,
        attributes: [],
        methods: [],
        cssClasses: [],
      });
    }
  }
  const relationships: MermaidClassRelationship[] = [];
  for (const link of diagram.getLinks()) {
    const stored = link.getMetadata('umlRelationship') as MermaidClassRelationship | undefined;
    const from = link.sourceNodeId;
    const to = link.targetNodeId;
    if (!from || !to) continue;
    const label = (link.getMetadata('label') as string) ?? stored?.label;
    relationships.push({
      from,
      to,
      operator: stored?.operator ?? '-->',
      ...(label ? { label } : {}),
      ...(stored?.multiplicity ? { multiplicity: stored.multiplicity } : {}),
    });
  }
  const direction = diagram.getMetadata('direction') as string | undefined;
  const notes = (diagram.getMetadata('umlNotes') as MermaidClassModel['notes']) ?? [];
  return { classes, relationships, notes, ...(direction ? { direction } : {}) };
}

// ── Generation ─────────────────────────────────────────────────────────────

export function generateMermaidClass(model: MermaidClassModel): string {
  const lines = ['classDiagram'];
  if (model.direction) lines.push(`    direction ${model.direction}`);
  for (const def of model.classes) {
    const head = def.generic ? `${def.id}~${def.generic}~` : def.id;
    const css = def.cssClasses.map((c) => `:::${c}`).join('');
    const hasBody = def.stereotype || def.attributes.length || def.methods.length;
    if (!hasBody) {
      lines.push(`    class ${head}${css}`);
      continue;
    }
    lines.push(`    class ${head}${css} {`);
    if (def.stereotype) lines.push(`        <<${def.stereotype}>>`);
    for (const a of def.attributes) lines.push(`        ${a.raw}`);
    for (const m of def.methods) lines.push(`        ${m.raw}`);
    lines.push('    }');
  }
  for (const rel of model.relationships) {
    const left = rel.multiplicity?.[0] ? ` "${rel.multiplicity[0]}"` : '';
    const right = rel.multiplicity?.[1] ? ` "${rel.multiplicity[1]}"` : '';
    const label = rel.label ? ` : ${rel.label}` : '';
    lines.push(`    ${rel.from}${left} ${rel.operator}${right} ${rel.to}${label}`);
  }
  for (const note of model.notes) {
    lines.push(note.for ? `    note for ${note.for} "${note.text}"` : `    note "${note.text}"`);
  }
  return lines.join('\n') + '\n';
}

export function generateClassFromDiagram(diagram: DiagramModel): string {
  return generateMermaidClass(classModelFromDiagram(diagram));
}
