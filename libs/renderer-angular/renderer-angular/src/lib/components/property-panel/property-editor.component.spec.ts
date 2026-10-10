/**
 * A `select` property shows its CURRENT value. `[value]` on the <select> was bound
 * before the `*ngFor` options existed, so the browser kept the first option: in the
 * docs review the panel read "Queued" for a node whose status was "Running".
 */
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { PropertyDefinition } from '@grafloria/renderer';
import { PropertyEditorComponent } from './property-editor.component';

@Component({
  imports: [PropertyEditorComponent],
  template: `<diagram-property-editor id="prop-status" [property]="property" [value]="value()" />`,
})
class Host {
  property = { key: 'status', label: 'Status', editor: 'select', validation: { enum: ['Queued', 'Running', 'Done'] } } as unknown as PropertyDefinition;
  value = signal('Running');
}

describe('PropertyEditorComponent — select', () => {
  it('shows the current value, and follows a change of it', async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('Running');

    fixture.componentInstance.value.set('Done');
    fixture.detectChanges();
    expect(select.value).toBe('Done');
    fixture.destroy();
  });
});
