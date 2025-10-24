import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { PropertyEditorBooleanComponent } from './property-editor-boolean.component';

describe('PropertyEditorBooleanComponent', () => {
  let component: PropertyEditorBooleanComponent;
  let fixture: ComponentFixture<PropertyEditorBooleanComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, PropertyEditorBooleanComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PropertyEditorBooleanComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Checkbox Mode', () => {
    it('should render checkbox by default', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
      };
      fixture.detectChanges();

      const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]');
      expect(checkbox).toBeTruthy();
      const label = fixture.nativeElement.querySelector('.checkbox-label');
      expect(label).toBeTruthy();
    });

    it('should display current value as checked state', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
      };
      component.value = true;
      component.ngOnInit();
      fixture.detectChanges();

      const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]');
      expect(checkbox.checked).toBe(true);
    });

    it('should display false value as unchecked', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
      };
      component.value = false;
      component.ngOnInit();
      fixture.detectChanges();

      const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]');
      expect(checkbox.checked).toBe(false);
    });
  });

  describe('Toggle Mode', () => {
    it('should render toggle switch when variant is toggle', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
        display: {
          variant: 'toggle',
        },
      };
      fixture.detectChanges();

      const toggleSwitch = fixture.nativeElement.querySelector('.toggle-switch');
      expect(toggleSwitch).toBeTruthy();
    });

    it('should not render checkbox when toggle mode', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
        display: {
          variant: 'toggle',
        },
      };
      fixture.detectChanges();

      const checkboxLabel = fixture.nativeElement.querySelector('.checkbox-label');
      expect(checkboxLabel).toBeFalsy();
    });
  });

  describe('Value Updates', () => {
    it('should emit valueChange when value changes', (done) => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
      };
      fixture.detectChanges();

      component.valueChange.subscribe((value: any) => {
        expect(value).toBe(true);
        done();
      });

      component.onValueChange(true);
    });

    it('should update currentValue when value input changes', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
      };
      component.value = false;
      component.ngOnInit();
      fixture.detectChanges();

      component.value = true;
      component.ngOnChanges({
        value: {
          currentValue: true,
          previousValue: false,
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(component.currentValue).toBe(true);
    });

    it('should convert truthy values to true', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
      };
      component.value = 1;
      component.ngOnInit();

      expect(component.currentValue).toBe(true);
    });

    it('should convert falsy values to false', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
      };
      component.value = 0;
      component.ngOnInit();

      expect(component.currentValue).toBe(false);
    });
  });

  describe('Readonly Mode', () => {
    it('should disable checkbox when readonly is true', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
      };
      component.readonly = true;
      fixture.detectChanges();

      const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]');
      expect(checkbox.disabled).toBe(true);
    });

    it('should disable toggle when readonly is true', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
        display: {
          variant: 'toggle',
        },
      };
      component.readonly = true;
      fixture.detectChanges();

      const toggle = fixture.nativeElement.querySelector('.toggle-input');
      expect(toggle.disabled).toBe(true);
    });
  });

  describe('Mode Detection', () => {
    it('should return true for toggle mode', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
        display: {
          variant: 'toggle',
        },
      };

      expect(component.isToggleMode()).toBe(true);
    });

    it('should return false for checkbox mode', () => {
      component.property = {
        key: 'enabled',
        label: 'Enabled',
        editor: 'boolean',
      };

      expect(component.isToggleMode()).toBe(false);
    });
  });

  describe('Accessibility', () => {
    it('should have id matching property key', () => {
      component.property = {
        key: 'isEnabled',
        label: 'Is Enabled',
        editor: 'boolean',
      };
      fixture.detectChanges();

      const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]');
      expect(checkbox.getAttribute('id')).toBe('isEnabled');
    });

    it('should have proper label association in toggle mode', () => {
      component.property = {
        key: 'isEnabled',
        label: 'Is Enabled',
        editor: 'boolean',
        display: {
          variant: 'toggle',
        },
      };
      fixture.detectChanges();

      const toggle = fixture.nativeElement.querySelector('.toggle-input');
      const label = fixture.nativeElement.querySelector('.toggle-label');
      expect(toggle.getAttribute('id')).toBe('isEnabled');
      expect(label.getAttribute('for')).toBe('isEnabled');
    });
  });
});
