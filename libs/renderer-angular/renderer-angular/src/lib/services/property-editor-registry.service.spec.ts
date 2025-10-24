import { TestBed } from '@angular/core/testing';
import { PropertyEditorRegistryService } from './property-editor-registry.service';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { PropertyEditorComponent } from '../components/property-editors/property-editor.interface';
import { PropertyDefinition, ValidationError } from '@grafloria/renderer';

// Mock custom editor for testing
@Component({
  selector: 'test-custom-editor',
  template: '<div>Custom Editor</div>',
  standalone: true,
})
class TestCustomEditorComponent implements PropertyEditorComponent {
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;
  @Output() valueChange = new EventEmitter<any>();
  @Output() validationError = new EventEmitter<ValidationError | null>();
}

describe('PropertyEditorRegistryService', () => {
  let service: PropertyEditorRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PropertyEditorRegistryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Built-in Editors', () => {
    it('should have all 12 built-in editors registered', () => {
      const editorTypes = [
        'string',
        'number',
        'boolean',
        'select',
        'multiselect',
        'color',
        'slider',
        'textarea',
        'date',
        'datetime',
        'file',
        'json',
      ];

      editorTypes.forEach((type) => {
        expect(service.hasEditor(type)).toBe(true);
      });
    });

    it('should return editor component for built-in types', () => {
      expect(service.getEditor('string')).toBeTruthy();
      expect(service.getEditor('number')).toBeTruthy();
      expect(service.getEditor('boolean')).toBeTruthy();
    });

    it('should return all editor types', () => {
      const types = service.getEditorTypes();
      expect(types.length).toBeGreaterThanOrEqual(12);
      expect(types).toContain('string');
      expect(types).toContain('number');
      expect(types).toContain('boolean');
    });
  });

  describe('Custom Editor Registration', () => {
    it('should allow registering custom editor', () => {
      service.registerEditor('custom', TestCustomEditorComponent);
      expect(service.hasEditor('custom')).toBe(true);
    });

    it('should return custom editor component', () => {
      service.registerEditor('custom', TestCustomEditorComponent);
      const editor = service.getEditor('custom');
      expect(editor).toBe(TestCustomEditorComponent);
    });

    it('should allow overwriting existing editor', () => {
      const originalEditor = service.getEditor('string');
      service.registerEditor('string', TestCustomEditorComponent);
      const newEditor = service.getEditor('string');
      expect(newEditor).toBe(TestCustomEditorComponent);
      expect(newEditor).not.toBe(originalEditor);
    });

    it('should include custom editor in editor types', () => {
      service.registerEditor('custom', TestCustomEditorComponent);
      const types = service.getEditorTypes();
      expect(types).toContain('custom');
    });
  });

  describe('Editor Lookup', () => {
    it('should return null for non-existent editor', () => {
      const editor = service.getEditor('nonexistent');
      expect(editor).toBeNull();
    });

    it('should return false for non-existent editor check', () => {
      expect(service.hasEditor('nonexistent')).toBe(false);
    });
  });
});
