/**
 * `<grafloria-diagram-canvas>.loadText` loads text the way `createDiagram().loadText`
 * does: it refuses what it cannot read (the canvas left as it was) and keeps the
 * diagram type, so `exportText` writes the grammar the text came in.
 *
 * The docs review found the Angular canvas had its own copy of loadText that never
 * received those fixes: bad text loaded silently, er/architecture/block exported back
 * as `flowchart`, and `loadText(stateDiagram)` + `exportText()` hung the tab.
 */
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { NodeSpec, EdgeSpec } from '@grafloria/renderer';
import { DiagramCanvasComponent } from './diagram-canvas.component';

@Component({
  imports: [DiagramCanvasComponent],
  template: `<grafloria-diagram-canvas style="display:block;width:800px;height:600px" [(nodes)]="nodes" [(edges)]="edges" />`,
})
class Host {
  nodes = signal<NodeSpec[]>([
    { id: 'plan', position: { x: 60, y: 90 }, size: { width: 150, height: 66 }, label: 'Plan' },
    { id: 'build', position: { x: 300, y: 90 }, size: { width: 150, height: 66 }, label: 'Build' },
  ]);
  edges = signal<EdgeSpec[]>([{ id: 'e1', source: 'plan', target: 'build' }]);
}

describe('DiagramCanvasComponent.loadText — same load path as the shared canvas', () => {
  let fixture: ComponentFixture<Host>;
  let canvas: DiagramCanvasComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    canvas = fixture.debugElement.query(By.directive(DiagramCanvasComponent)).componentInstance;
    (canvas as unknown as { renderNow(): void }).renderNow();
  });
  afterEach(() => fixture.destroy());

  const model = () => canvas.activeEngine()!.getDiagram()!;
  const snapshot = () => ({
    nodes: model().getNodes().map((n) => n.id).sort(),
    links: model().getLinks().length,
  });

  const refusals: Array<[string, string, RegExp]> = [
    ['a parse error', 'flowchart\n a[[[ -->', /line 2/i],
    ['a header typo', 'flowchrt\n  A --> B', /"flowchrt" is not a diagram type/],
    ['empty text', '', /empty/i],
    ['an unsupported diagram type', 'sequenceDiagram\n  A->>B: hi', /sequenceDiagram/],
  ];
  for (const [what, text, message] of refusals) {
    it(`refuses ${what} and leaves the canvas unchanged`, () => {
      const before = snapshot();
      expect(() => canvas.loadText(text)).toThrow(message);
      expect(snapshot()).toEqual(before);
    });
  }

  const roundTrip = (text: string): string => {
    canvas.loadText(text);
    return canvas.exportText({ lossless: false });
  };

  it('erDiagram exports as erDiagram', () => {
    const out = roundTrip('erDiagram\n    CUSTOMER ||--o{ ORDER : places\n    CUSTOMER {\n        string name\n    }');
    expect(out.trimStart().startsWith('erDiagram')).toBe(true);
    expect(out).toContain('||--o{');
  });

  it('block-beta exports as block-beta', () => {
    const out = roundTrip('block-beta\n  columns 3\n  a["Frontend"] b["API"] c[("Database")]\n  a --> b');
    expect(out.trimStart().startsWith('block-beta')).toBe(true);
  });

  it('architecture-beta exports as architecture-beta', () => {
    const out = roundTrip(
      'architecture-beta\n    group api(cloud)[API]\n    service db(database)[Database] in api\n    service server(server)[Server] in api\n    db:L -- R:server'
    );
    expect(out.trimStart().startsWith('architecture-beta')).toBe(true);
  });

  it('stateDiagram exports as stateDiagram (and does not hang)', () => {
    const out = roundTrip('stateDiagram-v2\n    [*] --> Still\n    Still --> Moving\n    Moving --> [*]');
    expect(out.trimStart()).toMatch(/^stateDiagram/);
    expect(out).toContain('Still --> Moving');
  });
});
