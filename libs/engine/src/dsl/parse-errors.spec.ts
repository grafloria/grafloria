// Mermaid text that is NOT what it claims to be must be reportable before it
// replaces anything.
//
// The flowchart parser recovers line by line (one bad line must not lose the whole
// diagram, and it never manufactures nodes from one). But it threw the errors away,
// so `flowchart\n a[[[ -->` parsed "cleanly" to nothing and even validate() said
// valid; a header typo (`flowchrt`) became a node; and empty text crashed with a
// TypeError. These pin the reporting side; parse() itself stays best-effort.
import { DSL } from './DSL';
import { DiagramModel } from '../models/DiagramModel';
import { adoptTextGrammarMetadata, TEXT_GRAMMAR_METADATA_KEYS } from './mermaid';
import { importDiagramText } from '../serialization/TextFormat';

const dsl = () => new DSL({ autoLayout: false });

describe('DSL — parse errors are reported, not swallowed', () => {
  it('validate() reports a line the parser had to skip, with its position', () => {
    const v = dsl().validate('flowchart\n a[[[ -->');
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
    expect(v.errors[0]).toMatch(/line 2/i);
  });

  it('parseDetailed() lists the skipped lines too (parse() still recovers)', () => {
    const result = dsl().parseDetailed('flowchart LR\n  A --> B\n  B -->\n  B --> E');
    expect((result as { errors?: string[] }).errors?.length).toBeGreaterThan(0);
    // The good lines are still there: recovery is unchanged.
    expect(result.diagram.getNodes().map((n) => n.id).sort()).toEqual(['A', 'B', 'E']);
  });

  it('validate() rejects a header typo instead of reading it as a node', () => {
    const v = dsl().validate('flowchrt\n  A --> B');
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toContain('"flowchrt"');
    expect(v.errors[0]).toContain('flowchart');
  });

  it('empty text is a clear validation error, and parse() returns an empty diagram (no TypeError)', () => {
    for (const text of ['', '   \n  ', '%% only a comment\n']) {
      const v = dsl().validate(text);
      expect(v.valid).toBe(false);
      expect(v.errors[0]).toMatch(/empty/i);
    }
    expect(() => dsl().parse('')).not.toThrow();
    expect(dsl().parse('').getNodes()).toHaveLength(0);
  });

  it('a header after a leading comment or blank line is still the header (direction kept)', () => {
    const diagram = dsl().parseDetailed('%%{init: {"theme": "dark"}}%%\n\nflowchart LR\n  A --> B');
    expect(diagram.errors).toEqual([]);
    expect(diagram.ast.direction).toBe('LR');
  });

  it('valid text of every supported type validates clean', () => {
    const samples = [
      'flowchart LR\n  a --> b\n  b -->|yes| c[(DB)]\n  style a fill:#f9a\n  classDef hot fill:#fa0\n  class b hot\n  click a "https://example.com"',
      'graph TD\n  A-->B',
      '%%{init: {"theme": "dark"}}%%\nflowchart TD\n  A --> B',
      'erDiagram\n    CUSTOMER ||--o{ ORDER : places',
      'classDiagram\n    Animal <|-- Duck\n    class Duck {\n      +swim()\n    }',
      'stateDiagram-v2\n    [*] --> Still\n    Still --> Moving',
      'block-beta\n  columns 2\n  a b',
      'architecture-beta\n    group api(cloud)[API]\n    service db(database)[Database] in api',
    ];
    for (const text of samples) {
      const v = dsl().validate(text);
      expect({ text, ...v }).toEqual({ text, valid: true, errors: [] });
    }
  });
});

// An unclosed bracket or quote used to swallow the NEXT line silently: the label
// reader ran on across the newline to the next line's `]`, so
// `A[Start] --> B[Middle` + `B --> C[End]` gave A and B — C gone, no error.
// Mermaid itself refuses that text. A label may still span lines (Mermaid takes
// a quoted multi-line label, and a plain one that closes), but a label that runs
// into another shape, or to the end of the text, is reported at the line where
// its bracket opened — and recovery resumes on the next line.
describe('DSL — an unclosed bracket or quote is an error at its own line', () => {
  const cases: Array<[string, string, string]> = [
    ['[', 'flowchart TD\n  A[Start] --> B[Middle\n  B --> C[End]\n', '"["'],
    ['(', 'flowchart TD\n  A[Start] --> B(Middle\n  B --> C[End]\n', '"("'],
    ['{', 'flowchart TD\n  A[Start] --> B{Middle\n  B --> C[End]\n', '"{"'],
    ['"', 'flowchart TD\n  A[Start] --> B["Middle]\n  B --> C[End]\n', 'quote'],
    ['[ at the end of the text', 'flowchart TD\n  A[Start] --> B[Middle\n  B --> C\n', '"["'],
  ];
  for (const [what, text, named] of cases) {
    it(`an unclosed ${what} is reported at line 2, naming it`, () => {
      const v = dsl().validate(text);
      expect(v.valid).toBe(false);
      expect(v.errors).toHaveLength(1);
      expect(v.errors[0]).toMatch(/line 2\b/i);
      expect(v.errors[0]).toContain(named);
      expect(v.errors[0]).toMatch(/never closed/);
    });
  }

  it('best-effort parse() drops the broken line only: the next line still parses', () => {
    const result = dsl().parseDetailed('flowchart TD\n  A[Start] --> B[Middle\n  B --> C[End]\n');
    expect(result.errors).toHaveLength(1);
    expect(result.diagram.getNodes().map((n) => n.id).sort()).toEqual(['B', 'C']);
  });

  it('labels Mermaid takes across lines stay valid', () => {
    for (const text of [
      'flowchart TD\n  A["line one\n  line two"] --> B\n',
      'flowchart TD\n  A["`**bold**\n  next`"] --> B\n',
      'flowchart TD\n  A[line one\n  line two] --> B\n',
      'flowchart TD\n  A(round one\n  round two) --> B{yes\n  or no}\n',
    ]) {
      const v = dsl().validate(text);
      expect({ text, ...v }).toEqual({ text, valid: true, errors: [] });
    }
  });
});

describe('adoptTextGrammarMetadata — what loading text INTO a model must carry', () => {
  it('copies the grammar keys the source has and clears the ones it lacks', () => {
    const er = dsl().parse('erDiagram\n    CUSTOMER ||--o{ ORDER : places');
    const target = new DiagramModel('live');
    adoptTextGrammarMetadata(target, er);
    expect(target.getMetadata('diagramType')).toBe('erDiagram');
    expect(target.getMetadata('erSpec')).toBeDefined();

    const flow = dsl().parse('flowchart LR\n  a --> b');
    adoptTextGrammarMetadata(target, flow);
    for (const key of TEXT_GRAMMAR_METADATA_KEYS) {
      expect(target.getMetadata(key)).toBe(flow.getMetadata(key));
    }
    expect(target.getMetadata('diagramType')).not.toBe('erDiagram');
    expect(target.getMetadata('erSpec')).toBeUndefined();
  });
});

// P0-5a (Atloria brief 2026-10-19). A state id cannot contain spaces: Mermaid
// reads `Release for Approval` as three states and draws garbage; we used to
// drop the line in silence — `errors: []`, and a fence made only of such lines
// loaded as an EMPTY diagram. Every graph-type line the parser skips must reach
// `validate()`, `parseDetailed().errors` and `importDiagramText().errors`.
describe('stateDiagram — a line the parser skips is an error, never a silent drop', () => {
  // The real corpus fence `invoice-lifecycle#1` (PAMS manual), verbatim.
  const INVOICE_LIFECYCLE =
    'stateDiagram-v2\n' +
    '    Draft --> Release for Approval: Request approval\n' +
    '    Release for Approval --> Approved: Approve\n' +
    '    Approved --> Due: Consider as sent to client/principal\n' +
    '    Due --> Overdue: payment period overdue\n' +
    '    Due --> Paid: due amount ≤ 0\n' +
    '    Approved --> Draft: Consider as not approved\n';

  it('invoice-lifecycle#1: one error per spaced line, naming lines 2 and 3', () => {
    const v = dsl().validate(INVOICE_LIFECYCLE);
    expect(v.valid).toBe(false);
    expect(v.errors).toHaveLength(2);
    expect(v.errors[0]).toMatch(/^Line 2\b/);
    expect(v.errors[1]).toMatch(/^Line 3\b/);
    for (const e of v.errors) {
      expect(e).toContain('cannot contain spaces');
      expect(e).toContain('state "Release for Approval" as');
    }
  });

  it('importDiagramText reports the same errors (it used to say errors: [])', () => {
    const r = importDiagramText(INVOICE_LIFECYCLE);
    expect(r.errors?.map((e) => e.slice(0, 7))).toEqual(['Line 2:', 'Line 3:']);
    // Best effort is unchanged: the readable lines are still in the diagram.
    expect(r.diagram.getLinks().length).toBe(4);
  });

  it('parseDetailed lists them too', () => {
    expect(dsl().parseDetailed(INVOICE_LIFECYCLE).errors).toHaveLength(2);
  });

  it('a fence made ONLY of spaced lines is an error, not a silent empty diagram', () => {
    const r = importDiagramText(
      'stateDiagram-v2\n    Draft --> Release for Approval\n    Release for Approval --> Sent to Client: Send\n'
    );
    expect(r.diagram.getNodes()).toHaveLength(0);
    expect(r.errors).toHaveLength(2);
    expect(r.errors![1]).toMatch(/^Line 3\b/);
    // Both spaced ids of line 3 are named.
    expect(r.errors![1]).toContain('"Release for Approval"');
    expect(r.errors![1]).toContain('"Sent to Client"');
  });

  it('a spaced id in a description line, or on a line of its own, is named the same way', () => {
    const v = dsl().validate('stateDiagram-v2\n    [*] --> Draft\n    Waiting for Payment: the client pays\n    Paid in Full\n');
    expect(v.errors.map((e) => e.slice(0, 7))).toEqual(['Line 3:', 'Line 4:']);
    expect(v.errors[0]).toContain('"Waiting for Payment"');
    expect(v.errors[1]).toContain('"Paid in Full"');
  });

  it('any other line it cannot read is reported with its text', () => {
    const v = dsl().validate('stateDiagram-v2\n    [*] --> A\n    A ==> B\n');
    expect(v.valid).toBe(false);
    expect(v.errors).toHaveLength(1);
    expect(v.errors[0]).toMatch(/^Line 3\b/);
    expect(v.errors[0]).toContain('A ==> B');
  });

  it('valid Mermaid it reads but does not draw is NOT an error', () => {
    const text =
      'stateDiagram-v2\n' +
      '    hide empty description\n' +
      '    scale 350 width\n' +
      '    [*] --> Draft\n' +
      '    Draft --> Sent : send\n' +
      '    state "Long name" as L\n' +
      '    L : more words\n' +
      '    note right of Draft : a note\n' +
      '    note "a floating note" as N1\n' +
      '    classDef bad fill:#f00\n' +
      '    class Sent bad\n' +
      '    style Draft fill:#ff0\n' +
      '    click Draft "https://example.com"\n' +
      '    Sent --> [*];\n';
    expect(dsl().validate(text)).toEqual({ valid: true, errors: [] });
    expect(importDiagramText(text).errors).toEqual([]);
  });
});

