/**
 * N9 (docs review v4): the interaction-config panel's selects showed the FIRST
 * option, not the engine's value — `[value]` on the <select> is applied before
 * its `*ngFor` options exist (the class of v3's A2, fixed for the property panel
 * in 77efa2ec). Every select in the panel must show the current value.
 */
import { TestBed } from '@angular/core/testing';
import { DiagramEngine } from '@grafloria/engine';
import { InteractionConfigPanelComponent } from './interaction-config-panel.component';

describe('InteractionConfigPanelComponent — every select shows the current value (N9)', () => {
  test('mode, port visibility and line style read back what the engine holds', async () => {
    await TestBed.configureTestingModule({ imports: [InteractionConfigPanelComponent] }).compileComponents();
    const engine = new DiagramEngine({
      interaction: { mode: 'deliberate', portVisibility: 'hidden', connectionLineStyle: 'straight' } as never,
    });
    const fixture = TestBed.createComponent(InteractionConfigPanelComponent);
    fixture.componentInstance.engine = engine;
    fixture.componentInstance.expanded = true;
    fixture.detectChanges();

    const selects = [...fixture.nativeElement.querySelectorAll('select')] as HTMLSelectElement[];
    expect(selects.map((s) => s.value)).toEqual(['deliberate', 'hidden', 'straight']);
    expect(selects.map((s) => s.selectedOptions[0]?.textContent?.trim())).toEqual(['Deliberate', 'Hidden', 'Straight Line']);

    // A change made through the panel is what it shows afterwards, the others stay.
    selects[0]!.value = 'smart';
    selects[0]!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(selects.map((s) => s.value)).toEqual(['smart', 'hidden', 'straight']);
    fixture.destroy();
    engine.destroy();
  });
});
