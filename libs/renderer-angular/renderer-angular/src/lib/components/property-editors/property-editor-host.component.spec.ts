import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PropertyEditorHostComponent } from './property-editor-host.component';
import { PropertyEditorRegistryService } from '../../services/property-editor-registry.service';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { PropertyEditorComponent } from './property-editor.interface';
import { PropertyDefinition, ValidationError } from '@grafloria/renderer';

// Mock editor for testing
@Component({
  selector: 'test-mock-editor',
  template: '<div class="mock-editor">{{ value }}</div>',
  standalone: true,
})
class MockEditorComponent implements PropertyEditorComponent {
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;
  @Output() valueChange = new EventEmitter<any>();
  @Output() validationError = new EventEmitter<ValidationError | null>();
}

describe('PropertyEditorHostComponent', () => {
  let component: PropertyEditorHostComponent;
  let fixture: ComponentFixture<PropertyEditorHostComponent>;
  let registry: PropertyEditorRegistryService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PropertyEditorHostComponent],
      providers: [PropertyEditorRegistryService],
    }).compileComponents();

    registry = TestBed.inject(PropertyEditorRegistryService);
    fixture = TestBed.createComponent(PropertyEditorHostComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Editor Loading', () => {
    it('should load string editor for string property', () => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
      };
      component.value = 'Test';
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.componentRef).toBeTruthy();
    });

    it('should load number editor for number property', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
      };
      component.value = 25;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.componentRef).toBeTruthy();
    });

    it('should load boolean editor for boolean property', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
      };
      component.value = true;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.componentRef).toBeTruthy();
    });

    it('should load custom editor when registered', () => {
      registry.registerEditor('mock', MockEditorComponent);

      component.property = {
        key: 'custom',
        label: 'Custom',
        editor: 'mock',
      };
      component.value = 'test';
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.componentRef).toBeTruthy();
      expect(component.componentRef?.instance).toBeInstanceOf(MockEditorComponent);
    });

    it('should handle non-existent editor gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      component.property = {
        key: 'unknown',
        label: 'Unknown',
        editor: 'nonexistent',
      };
      component.ngOnInit();
      fixture.detectChanges();

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(component.componentRef).toBeFalsy();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Property Binding', () => {
    it('should pass value to editor component', () => {
      registry.registerEditor('mock', MockEditorComponent);

      component.property = {
        key: 'test',
        label: 'Test',
        editor: 'mock',
      };
      component.value = 'test value';
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.componentRef?.instance.value).toBe('test value');
    });

    it('should pass property definition to editor component', () => {
      registry.registerEditor('mock', MockEditorComponent);

      const propertyDef: PropertyDefinition = {
        key: 'test',
        label: 'Test',
        editor: 'mock',
      };

      component.property = propertyDef;
      component.value = 'test';
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.componentRef?.instance.property).toBe(propertyDef);
    });

    it('should pass readonly state to editor component', () => {
      registry.registerEditor('mock', MockEditorComponent);

      component.property = {
        key: 'test',
        label: 'Test',
        editor: 'mock',
      };
      component.value = 'test';
      component.readonly = true;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.componentRef?.instance.readonly).toBe(true);
    });
  });

  describe('Value Changes', () => {
    it('should emit valueChange from editor', (done) => {
      registry.registerEditor('mock', MockEditorComponent);

      component.property = {
        key: 'test',
        label: 'Test',
        editor: 'mock',
      };
      component.value = 'initial';
      component.ngOnInit();
      fixture.detectChanges();

      component.valueChange.subscribe((value) => {
        expect(value).toBe('new value');
        done();
      });

      // Simulate value change from editor
      component.componentRef?.instance.valueChange.emit('new value');
    });

    it('should emit validationError from editor', (done) => {
      registry.registerEditor('mock', MockEditorComponent);

      component.property = {
        key: 'test',
        label: 'Test',
        editor: 'mock',
      };
      component.ngOnInit();
      fixture.detectChanges();

      const error: ValidationError = { message: 'Test error' };

      component.validationError.subscribe((err) => {
        expect(err).toEqual(error);
        done();
      });

      // Simulate validation error from editor
      component.componentRef?.instance.validationError.emit(error);
    });
  });

  describe('Property Changes', () => {
    it('should reload editor when property changes', () => {
      registry.registerEditor('mock', MockEditorComponent);

      component.property = {
        key: 'test1',
        label: 'Test 1',
        editor: 'string',
      };
      component.ngOnInit();
      fixture.detectChanges();

      const firstEditor = component.componentRef;

      component.property = {
        key: 'test2',
        label: 'Test 2',
        editor: 'mock',
      };
      component.ngOnChanges({
        property: {
          currentValue: component.property,
          previousValue: firstEditor,
          firstChange: false,
          isFirstChange: () => false,
        },
      });
      fixture.detectChanges();

      expect(component.componentRef).not.toBe(firstEditor);
      expect(component.componentRef?.instance).toBeInstanceOf(MockEditorComponent);
    });

    it('should update existing editor when only value changes', () => {
      registry.registerEditor('mock', MockEditorComponent);

      component.property = {
        key: 'test',
        label: 'Test',
        editor: 'mock',
      };
      component.value = 'initial';
      component.ngOnInit();
      fixture.detectChanges();

      const editorInstance = component.componentRef;

      component.value = 'updated';
      component.ngOnChanges({
        value: {
          currentValue: 'updated',
          previousValue: 'initial',
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(component.componentRef).toBe(editorInstance);
      expect(component.componentRef?.instance.value).toBe('updated');
    });
  });

  describe('Component Lifecycle', () => {
    it('should destroy component on ngOnDestroy', () => {
      registry.registerEditor('mock', MockEditorComponent);

      component.property = {
        key: 'test',
        label: 'Test',
        editor: 'mock',
      };
      component.ngOnInit();
      fixture.detectChanges();

      const destroySpy = jest.spyOn(component.componentRef!, 'destroy');

      component.ngOnDestroy();

      expect(destroySpy).toHaveBeenCalled();
    });
  });
});
