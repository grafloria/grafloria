/**
 * N9 (docs review v4, the A2 class): a select editor shows its CURRENT value,
 * for `validation.enum` (options rebuilt on every check) as for `options`.
 */
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PropertyDefinition } from '@grafloria/renderer';
import { PropertyEditorSelectComponent } from './property-editor-select.component';

@Component({
  imports: [PropertyEditorSelectComponent],
  template: `<property-editor-select [property]="enumProp" [value]="value()" />
    <property-editor-select [property]="optionsProp" [value]="value()" />`,
})
class Host {
  enumProp = { key: 'status', label: 'Status', type: 'select', validation: { enum: ['queued', 'running', 'done'] } } as unknown as PropertyDefinition;
  optionsProp = { key: 'status2', label: 'Status', type: 'select',
    validation: { options: [{ value: 'queued', label: 'Queued' }, { value: 'running', label: 'Running' }, { value: 'done', label: 'Done' }] } } as unknown as PropertyDefinition;
  value = signal('running');
}

describe('PropertyEditorSelectComponent — shows the current value (N9)', () => {
  test('first paint and after a change of value', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const selects = [...fixture.nativeElement.querySelectorAll('select')] as HTMLSelectElement[];
    expect(selects.map((s) => s.value)).toEqual(['running', 'running']);

    fixture.componentInstance.value.set('done');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(selects.map((s) => s.value)).toEqual(['done', 'done']);
    fixture.destroy();
  });
});
