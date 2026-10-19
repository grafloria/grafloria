// state-notation.spec.ts
//
// State-diagram NOTATION on import — what each Mermaid construct becomes in the
// model so the renderer can draw it the way Mermaid does:
//
//   [*] -->        a solid start dot in the diagram's INK (was #0f172a, near-
//                  invisible on a dark page)
//   --> [*]        a BULLSEYE (ring + dot) — was a hollow circle, i.e. a start
//                  dot with the fill forgotten
//   <<fork>>/<<join>>  a solid BAR, no text — was a rounded box reading
//                  "fork_state"
//   state X { }    a container whose CAPTION sits in its top band — was an opaque
//                  box with the name dead centre, under its own children, that
//                  also hid every line inside it
//   note … of X    a note box joined to X by a dashed line — was not drawn at all
//   classDef + :::  the class's paint on the state — was parsed and ignored
//
// Layout is NOT tested here (another lane owns placement); only what each element
// IS: kind, size, paint, label.

import { importDiagramText } from '../../serialization/TextFormat';
import { parseMermaidState, stateModelToDiagram, stateModelFromDiagram, generateStateFromDiagram } from './MermaidState';
import type { NodeModel } from '../../models/NodeModel';
import type { LinkModel } from '../../models/LinkModel';

const imp = (text: string) => importDiagramText(text).diagram;
const shape = (n: NodeModel) => n.getMetadata('shape') as Record<string, unknown>;

describe('state notation: start and end pseudo-states', () => {
  const d = imp('stateDiagram-v2\n  [*] --> Draft\n  Draft --> [*]');

  it('[*] --> X: a solid dot in the theme INK, never a hard-coded colour', () => {
    const start = d.getNode('__start__')!;
    expect(shape(start)['type']).toBe('circle');
    expect(shape(start)['ink']).toBe(true);
    expect(shape(start)['fill']).toBeUndefined(); // was '#0f172a' — invisible on a dark page
    expect(start.getMetadata('stateKind')).toBe('start');
  });

  it('X --> [*]: a BULLSEYE (ring + dot), not a hollow circle', () => {
    const end = d.getNode('__end__')!;
    expect(shape(end)['type']).toBe('final-node');
    expect(shape(end)['ink']).toBe(true);
    expect(end.getMetadata('stateKind')).toBe('end');
  });
});

describe('state notation: <<fork>> / <<join>>', () => {
  const FORK = 'stateDiagram-v2\n    state fork_state <<fork>>\n    [*] --> fork_state\n    fork_state --> Pack\n    fork_state --> Invoice\n    state join_state <<join>>\n    Pack --> join_state\n    Invoice --> join_state\n    join_state --> Ship';

  it('a solid ink BAR with no id painted on it', () => {
    const d = imp(FORK);
    for (const id of ['fork_state', 'join_state']) {
      const bar = d.getNode(id)!;
      expect(bar.getLabel() ?? '').toBe(''); // "fork_state" is an id, not a caption
      expect(bar.getMetadata('stateKind')).toBe(id === 'fork_state' ? 'fork' : 'join');
      expect(shape(bar)['type']).toBe('rect');
      expect(shape(bar)['ink']).toBe(true);
      // Across the flow: 70 wide × 8 thick in a top-to-bottom diagram.
      expect(bar.size.width).toBe(70);
      expect(bar.size.height).toBe(8);
    }
  });

  it('turns with the flow: 8 wide × 70 tall in an LR diagram', () => {
    const d = imp(FORK.replace('stateDiagram-v2\n', 'stateDiagram-v2\n    direction LR\n'));
    const bar = d.getNode('fork_state')!;
    expect(bar.size.width).toBe(8);
    expect(bar.size.height).toBe(70);
  });

  it('round-trips as <<fork>> / <<join>>', () => {
    const body = generateStateFromDiagram(imp(FORK));
    expect(body).toContain('state fork_state <<fork>>');
    expect(body).toContain('state join_state <<join>>');
  });
});

describe('state notation: composite states', () => {
  const COMPOSITE = 'stateDiagram-v2\n    [*] --> Active\n    state Active {\n      [*] --> Running\n      Running --> Paused: Pause\n      Paused --> Running: Resume\n    }\n    Active --> Closed: Close\n    Closed --> [*]';

  it('the composite node keeps its name and carries it as a HEADER caption in its top 22 px band', () => {
    const active = imp(COMPOSITE).getNode('Active')!;
    expect(active.getLabel()).toBe('Active');
    expect(active.getMetadata('labelPlacement')).toBe('header');
    expect(active.getMetadata('headerHeight')).toBe(22);
  });

  it('its group is containment only — the node draws the one frame (no double frame, no second caption)', () => {
    const group = imp(COMPOSITE).getGroup('group-Active')!;
    expect(group.getMetadata('frameChrome')).toBe('none');
  });

  it('a concurrent region is a see-through band (it used to be an opaque box over its own lines)', () => {
    const d = imp('stateDiagram-v2\n  state A {\n    [*] --> a1\n    --\n    [*] --> b1\n  }');
    const region = d.getNode('A.region1')!;
    expect(shape(region)['fill']).toBe('none');
    expect(region.getLabel() ?? '').toBe('');
  });
});

describe('state notation: notes', () => {
  const NOTES = 'stateDiagram-v2\n    Draft --> Sent: Send\n    note right of Draft : Editable until sent\n    note left of Sent\n      Locked for editing\n    end note';

  const notes = (d: ReturnType<typeof imp>) => d.getNodes().filter((n) => n.getMetadata('stateNote') === true);
  const noteLinks = (d: ReturnType<typeof imp>) => d.getLinks().filter((l) => l.getMetadata('noteLink') === true);

  it('each note becomes a note node carrying its text', () => {
    const d = imp(NOTES);
    const n = notes(d);
    expect(n.map((x) => x.getLabel()).sort()).toEqual(['Editable until sent', 'Locked for editing']);
    for (const note of n) {
      expect(shape(note)['type']).toBe('note');
      expect(note.getMetadata('noteTarget')).toBeDefined();
      // Sized to its text: wider than a dot, and wide enough for its words.
      expect(note.size.width).toBeGreaterThanOrEqual(80);
      expect(note.size.height).toBeGreaterThanOrEqual(30);
    }
    expect(n.find((x) => x.getLabel() === 'Editable until sent')!.getMetadata('notePosition')).toBe('right of');
  });

  it('joined to its state by a DASHED line with no arrowhead', () => {
    const d = imp(NOTES);
    const links = noteLinks(d);
    expect(links).toHaveLength(2);
    for (const link of links) {
      const note = d.getNode(link.sourceNodeId!)!;
      expect(note.getMetadata('stateNote')).toBe(true);
      expect(link.targetNodeId).toBe(note.getMetadata('noteTarget'));
      expect(link.style.strokeDasharray).toBeTruthy();
      expect((link.style.arrowHead as { type?: string } | undefined)?.type).toBe('none');
    }
  });

  it('a long note wraps: it grows taller, not endlessly wide', () => {
    const d = imp(`stateDiagram-v2\n  A --> B\n  note right of A : ${'word '.repeat(40).trim()}`);
    const note = notes(d)[0];
    expect(note.size.width).toBeLessThanOrEqual(240);
    expect(note.size.height).toBeGreaterThan(40);
  });

  it('notes are NOT states on export: no extra state, no extra transition, each note once', () => {
    const d = imp(NOTES);
    const model = stateModelFromDiagram(d);
    expect(model.states.map((s) => s.id).sort()).toEqual(['Draft', 'Sent']);
    expect(model.transitions).toHaveLength(1);
    const body = generateStateFromDiagram(d);
    expect(body.match(/^\s*note /gm)).toHaveLength(2);
  });
});

describe('state notation: classDef', () => {
  it('`classDef bad …` + `X:::bad` paints X like a flowchart classDef does', () => {
    const d = imp('stateDiagram-v2\n    classDef bad fill:#fdd,stroke:#c00\n    [*] --> Draft\n    Draft --> Rejected:::bad: Reject');
    const rejected = d.getNode('Rejected')!;
    expect(rejected.style.fill).toBe('#fdd');
    expect(rejected.style.stroke).toBe('#c00');
    expect(shape(rejected)['fill']).toBe('#fdd');
    // Draft carries no class: untouched.
    expect(d.getNode('Draft')!.style.fill).toBeUndefined();
  });

  it('the `class a, b name` statement applies it too, with text colour, weight and width', () => {
    const d = imp('stateDiagram-v2\n    classDef hot fill:#f00,color:#fff,font-weight:bold,stroke-width:3px\n    A --> B\n    B --> C\n    class A, C hot');
    for (const id of ['A', 'C']) {
      const n = d.getNode(id)!;
      expect(n.style.fill).toBe('#f00');
      expect(n.style.color).toBe('#fff');
      expect(n.style.fontWeight).toBe('bold');
      expect(n.style.strokeWidth).toBe(3);
    }
    expect(d.getNode('B')!.style.fill).toBeUndefined();
  });

  it('an unknown class is a no-op, and classDef lines never become states', () => {
    const model = parseMermaidState('stateDiagram-v2\n    classDef bad fill:#fdd\n    A --> B:::nope');
    expect(model.states.map((s) => s.id).sort()).toEqual(['A', 'B']);
    const d = stateModelToDiagram(model);
    expect(d.getNode('B')!.style.fill).toBeUndefined();
  });
});

describe('state notation: nothing a reader sees is lost to it', () => {
  it('every transition of a composite fence is still a link (none swallowed by the notation work)', () => {
    const d = imp('stateDiagram-v2\n    [*] --> Active\n    state Active {\n      [*] --> Running\n      Running --> Paused: Pause\n      Paused --> Running: Resume\n    }\n    Active --> Closed: Close\n    Closed --> [*]');
    const real = d.getLinks().filter((l: LinkModel) => !l.getMetadata('noteLink'));
    expect(real).toHaveLength(6);
  });
});
