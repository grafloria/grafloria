import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { PropertyEditorStringComponent } from './property-editor-string.component';
import { PropertyDefinition } from '@grafloria/renderer';

describe('PropertyEditorStringComponent', () => {
  let component: PropertyEditorStringComponent;
  let fixture: ComponentFixture<PropertyEditorStringComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, PropertyEditorStringComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PropertyEditorStringComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Basic Rendering', () => {
    it('should render text input', () => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
      };
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="text"]');
      expect(input).toBeTruthy();
    });

    it('should display current value', async () => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
      };
      component.value = 'Test Value';
      component.ngOnInit();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="text"]');
      expect(input.value).toBe('Test Value');
    });

    it('should show placeholder from property validation', () => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        validation: {
          placeholder: 'Enter name',
        },
      };
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="text"]');
      expect(input.getAttribute('placeholder')).toBe('Enter name');
    });
  });

  describe('Value Updates', () => {
    it('should emit valueChange when value changes', (done) => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
      };
      fixture.detectChanges();

      component.valueChange.subscribe((value: any) => {
        expect(value).toBe('New Value');
        done();
      });

      component.onValueChange('New Value');
    });

    it('should update currentValue when value input changes', () => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
      };
      component.value = 'Initial';
      component.ngOnInit();
      fixture.detectChanges();

      component.value = 'Updated';
      component.ngOnChanges({
        value: {
          currentValue: 'Updated',
          previousValue: 'Initial',
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(component.currentValue).toBe('Updated');
    });
  });

  describe('Prefix and Suffix', () => {
    it('should render prefix when specified', () => {
      component.property = {
        key: 'price',
        label: 'Price',
        editor: 'string',
        validation: {
          prefix: '$',
        },
      };
      fixture.detectChanges();

      const prefix = fixture.nativeElement.querySelector('.input-prefix');
      expect(prefix).toBeTruthy();
      expect(prefix.textContent.trim()).toBe('$');
    });

    it('should render suffix when specified', () => {
      component.property = {
        key: 'width',
        label: 'Width',
        editor: 'string',
        validation: {
          suffix: 'px',
        },
      };
      fixture.detectChanges();

      const suffix = fixture.nativeElement.querySelector('.input-suffix');
      expect(suffix).toBeTruthy();
      expect(suffix.textContent.trim()).toBe('px');
    });

    it('should render both prefix and suffix', () => {
      component.property = {
        key: 'measurement',
        label: 'Measurement',
        editor: 'string',
        validation: {
          prefix: '~',
          suffix: 'mm',
        },
      };
      fixture.detectChanges();

      const prefix = fixture.nativeElement.querySelector('.input-prefix');
      const suffix = fixture.nativeElement.querySelector('.input-suffix');
      expect(prefix.textContent.trim()).toBe('~');
      expect(suffix.textContent.trim()).toBe('mm');
    });
  });

  describe('Character Count', () => {
    it('should show character count when maxLength is set', () => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        validation: {
          maxLength: 50,
        },
      };
      component.value = 'Test';
      component.ngOnInit();
      fixture.detectChanges();

      const charCount = fixture.nativeElement.querySelector('.character-count');
      expect(charCount).toBeTruthy();
      expect(charCount.textContent.trim()).toContain('4 / 50');
    });

    it('should not show character count when maxLength is not set', () => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
      };
      fixture.detectChanges();

      const charCount = fixture.nativeElement.querySelector('.character-count');
      expect(charCount).toBeFalsy();
    });

    it('should update character count as value changes', () => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        validation: {
          maxLength: 50,
        },
      };
      component.value = '';
      component.ngOnInit();
      fixture.detectChanges();

      let charCount = fixture.nativeElement.querySelector('.character-count');
      expect(charCount.textContent.trim()).toContain('0 / 50');

      component.currentValue = 'Testing';
      fixture.detectChanges();

      charCount = fixture.nativeElement.querySelector('.character-count');
      expect(charCount.textContent.trim()).toContain('7 / 50');
    });
  });

  describe('Readonly Mode', () => {
    it('should set readonly attribute when readonly is true', () => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
      };
      component.readonly = true;
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="text"]');
      expect(input.hasAttribute('readonly')).toBe(true);
    });

    it('should not set readonly attribute when readonly is false', () => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
      };
      component.readonly = false;
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="text"]');
      expect(input.hasAttribute('readonly')).toBe(false);
    });
  });

  describe('Validation', () => {
    it('should set maxlength attribute from validation', () => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        validation: {
          maxLength: 100,
        },
      };
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="text"]');
      expect(input.getAttribute('maxlength')).toBe('100');
    });
  });

  describe('Accessibility', () => {
    it('should have id matching property key', () => {
      component.property = {
        key: 'userName',
        label: 'User Name',
        editor: 'string',
      };
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="text"]');
      expect(input.getAttribute('id')).toBe('userName');
    });

    it('should apply proper CSS classes for styling', () => {
      component.property = {
        key: 'name',
        label: 'Name',
        editor: 'string',
        validation: {
          prefix: '$',
          suffix: 'px',
        },
      };
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="text"]');
      expect(input.classList.contains('form-input')).toBe(true);
      expect(input.classList.contains('has-prefix')).toBe(true);
      expect(input.classList.contains('has-suffix')).toBe(true);
    });
  });
});
