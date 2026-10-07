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
