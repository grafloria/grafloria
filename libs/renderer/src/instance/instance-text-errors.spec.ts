/**
 * `instance.loadText` refuses text it cannot read — leaving the canvas as it was —
 * and loads the other Mermaid types so they export as what they are.
 *
 * The docs review found:
 *   (a) `flowchart\n a[[[ -->` loaded as 0 nodes, reported success, and WIPED the canvas;
 *   (b) a header typo (`flowchrt`) became a node, and empty text threw a TypeError;
 *   (c) after loadText of erDiagram / stateDiagram / block-beta / architecture-beta,
 *       exportText wrote a flowchart, and a classDiagram lost its members.
 */
import { createDiagram } from './create-diagram';
import type { DiagramInstance } from './create-diagram';

beforeAll(() => {
  Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

describe('loadText', () => {
  let container: HTMLElement;
  let instance: DiagramInstance;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    instance = createDiagram(container, {
      nodes: [
        { id: 'plan', position: { x: 60, y: 90 }, size: { width: 150, height: 66 }, label: 'Plan' },
        { id: 'build', position: { x: 300, y: 90 }, size: { width: 150, height: 66 }, label: 'Build' },
      ],
      edges: [{ id: 'e1', source: 'plan', target: 'build' }],
    });
  });

  afterEach(() => {
    instance.dispose();
    container.remove();
  });

  const snapshot = () => ({
    nodes: instance.getModel().getNodes().map((n) => n.id).sort(),
    links: instance.getModel().getLinks().length,
  });

  describe('(a)/(b) refuses what it cannot read and leaves the canvas as it was', () => {
    const cases: Array<[string, string, RegExp]> = [
      ['a parse error', 'flowchart\n a[[[ -->', /line 2/i],
      ['a line it had to skip', 'flowchart LR\n  plan --> build\n  build -->', /line 3/i],
      ['a header typo', 'flowchrt\n  A --> B', /"flowchrt" is not a diagram type/],
      ['empty text', '', /empty/i],
      ['blank text', '  \n\t\n', /empty/i],
      ['an unclosed bracket that would swallow the next line', 'flowchart TD\n  A[Start] --> B[Middle\n  B --> C[End]\n', /line 2\b[\s\S]*"\[" is never closed/i],
      ['an unclosed quote', 'flowchart TD\n  A[Start] --> B["Middle]\n  B --> C[End]\n', /line 2\b[\s\S]*quote[\s\S]*never closed/i],
      ['an unsupported diagram type', 'sequenceDiagram\n  A->>B: hi', /sequenceDiagram[\s\S]*flowchart[\s\S]*erDiagram/],
    ];
    for (const [what, text, message] of cases) {
      it(`refuses ${what}`, () => {
        const before = snapshot();
        let caught: unknown;
        try {
          instance.loadText(text);
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(Error);
        expect(caught).not.toBeInstanceOf(TypeError);
        expect((caught as Error).message).toMatch(message);
        expect(snapshot()).toEqual(before);
      });
    }

    it('still loads good text after refusing bad text', () => {
      expect(() => instance.loadText('flowchart\n a[[[ -->')).toThrow();
      instance.loadText('flowchart LR\n  x[X] --> y[Y]');
      expect(snapshot()).toEqual({ nodes: ['x', 'y'], links: 1 });
    });
  });

  describe('(c) the diagram type survives the round trip', () => {
    const roundTrip = (text: string): string => {
      instance.loadText(text);
      return instance.exportText({ lossless: false });
    };

    it('erDiagram exports as erDiagram, attributes and cardinality included', () => {
      const out = roundTrip(
        'erDiagram\n    CUSTOMER ||--o{ ORDER : places\n    CUSTOMER {\n        string name\n        int id PK\n    }'
      );
      expect(out.trimStart().startsWith('erDiagram')).toBe(true);
      expect(out).toContain('||--o{');
      expect(out).toMatch(/string name/);
    });

    it('classDiagram keeps its members', () => {
      const out = roundTrip(
        'classDiagram\n    Animal <|-- Duck\n    class Duck {\n        +String beak\n        +swim()\n    }'
      );
      expect(out.trimStart().startsWith('classDiagram')).toBe(true);
      expect(out).toContain('+String beak');
      expect(out).toContain('+swim()');
    });

    it('stateDiagram exports as stateDiagram', () => {
      const out = roundTrip('stateDiagram-v2\n    [*] --> Still\n    Still --> Moving\n    Moving --> [*]');
      expect(out.trimStart()).toMatch(/^stateDiagram/);
      expect(out).toContain('Still --> Moving');
    });

    it('block-beta exports as block-beta', () => {
      const out = roundTrip('block-beta\n  columns 3\n  a["Frontend"] b["API"] c[("Database")]\n  a --> b');
      expect(out.trimStart().startsWith('block-beta')).toBe(true);
      expect(out).toMatch(/columns 3/);
    });

    it('architecture-beta exports as architecture-beta', () => {
      const out = roundTrip(
        'architecture-beta\n    group api(cloud)[API]\n    service db(database)[Database] in api\n    service server(server)[Server] in api\n    db:L -- R:server'
      );
      expect(out.trimStart().startsWith('architecture-beta')).toBe(true);
      expect(out).toMatch(/service db/);
    });

    it('a flowchart loaded after an erDiagram exports as a flowchart again', () => {
      roundTrip('erDiagram\n    CUSTOMER ||--o{ ORDER : places');
      const out = roundTrip('flowchart LR\n  a --> b');
      expect(out.trimStart()).toMatch(/^(flowchart|graph)/);
    });

    it('the lossless round trip (export with sidecar, load it back) keeps the type too', () => {
      instance.loadText('erDiagram\n    CUSTOMER ||--o{ ORDER : places');
      const text = instance.exportText();
      instance.loadText('flowchart LR\n  a --> b');
      instance.loadText(text);
      expect(instance.exportText({ lossless: false }).trimStart().startsWith('erDiagram')).toBe(true);
    });
  });
});
