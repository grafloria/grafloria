import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { PropertyEditorNumberComponent } from './property-editor-number.component';

describe('PropertyEditorNumberComponent', () => {
  let component: PropertyEditorNumberComponent;
  let fixture: ComponentFixture<PropertyEditorNumberComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, PropertyEditorNumberComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PropertyEditorNumberComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Basic Rendering', () => {
    it('should render number input', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
      };
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="number"]');
      expect(input).toBeTruthy();
    });

    it('should display current value', async () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
      };
      component.value = 25;
      component.ngOnInit();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="number"]');
      expect(input.value).toBe('25');
    });
  });

  describe('Min/Max/Step Attributes', () => {
    it('should set min attribute from validation', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
        validation: {
          min: 0,
        },
      };
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="number"]');
      expect(input.getAttribute('min')).toBe('0');
    });

    it('should set max attribute from validation', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
        validation: {
          max: 120,
        },
      };
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="number"]');
      expect(input.getAttribute('max')).toBe('120');
    });

    it('should set step attribute from validation', () => {
      component.property = {
        key: 'price',
        label: 'Price',
        editor: 'number',
        validation: {
          step: 0.01,
        },
      };
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="number"]');
      expect(input.getAttribute('step')).toBe('0.01');
    });

    it('should use step=1 for integer validation', () => {
      component.property = {
        key: 'count',
        label: 'Count',
        editor: 'number',
        validation: {
          integer: true,
        },
      };
      fixture.detectChanges();

      expect(component.getStep()).toBe(1);
    });

    it('should default to step=0.1 for non-integer', () => {
      component.property = {
        key: 'price',
        label: 'Price',
        editor: 'number',
      };
      fixture.detectChanges();

      expect(component.getStep()).toBe(0.1);
    });
  });

  describe('Stepper Buttons', () => {
    it('should render stepper buttons when not readonly', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
      };
      component.readonly = false;
      fixture.detectChanges();

      const stepperButtons = fixture.nativeElement.querySelector('.stepper-buttons');
      expect(stepperButtons).toBeTruthy();
      const buttons = stepperButtons.querySelectorAll('.stepper-btn');
      expect(buttons.length).toBe(2);
    });

    it('should not render stepper buttons when readonly', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
      };
      component.readonly = true;
      fixture.detectChanges();

      const stepperButtons = fixture.nativeElement.querySelector('.stepper-buttons');
      expect(stepperButtons).toBeFalsy();
    });

    it('should increment value when increment button clicked', (done) => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
        validation: {
          step: 1,
        },
      };
      component.value = 25;
      component.ngOnInit();
      fixture.detectChanges();

      component.valueChange.subscribe((value: any) => {
        expect(value).toBe(26);
        done();
      });

      component.increment();
    });

    it('should decrement value when decrement button clicked', (done) => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
        validation: {
          step: 1,
        },
      };
      component.value = 25;
      component.ngOnInit();
      fixture.detectChanges();

      component.valueChange.subscribe((value: any) => {
        expect(value).toBe(24);
        done();
      });

      component.decrement();
    });

    it('should not increment beyond max value', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
        validation: {
          max: 100,
          step: 1,
        },
      };
      component.value = 100;
      component.ngOnInit();
      fixture.detectChanges();

      const initialValue = component.currentValue;
      component.increment();
      expect(component.currentValue).toBe(initialValue);
    });

    it('should not decrement below min value', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
        validation: {
          min: 0,
          step: 1,
        },
      };
      component.value = 0;
      component.ngOnInit();
      fixture.detectChanges();

      const initialValue = component.currentValue;
      component.decrement();
      expect(component.currentValue).toBe(initialValue);
    });

    it('should disable increment button when max reached', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
        validation: {
          max: 100,
        },
      };
      component.value = 100;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.isMaxReached()).toBe(true);
    });

    it('should disable decrement button when min reached', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
        validation: {
          min: 0,
        },
      };
      component.value = 0;
      component.ngOnInit();
      fixture.detectChanges();

      expect(component.isMinReached()).toBe(true);
    });
  });

  describe('Prefix and Suffix', () => {
    it('should render prefix when specified', () => {
      component.property = {
        key: 'price',
        label: 'Price',
        editor: 'number',
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
        editor: 'number',
        validation: {
          suffix: 'px',
        },
      };
      fixture.detectChanges();

      const suffix = fixture.nativeElement.querySelector('.input-suffix');
      expect(suffix).toBeTruthy();
      expect(suffix.textContent.trim()).toBe('px');
    });
  });

  describe('Value Updates', () => {
    it('should emit valueChange when value changes', (done) => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
      };
      fixture.detectChanges();

      component.valueChange.subscribe((value: any) => {
        expect(value).toBe(30);
        done();
      });

      component.onValueChange(30);
    });

    it('should update currentValue when value input changes', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
      };
      component.value = 25;
      component.ngOnInit();
      fixture.detectChanges();

      component.value = 30;
      component.ngOnChanges({
        value: {
          currentValue: 30,
          previousValue: 25,
          firstChange: false,
          isFirstChange: () => false,
        },
      });

      expect(component.currentValue).toBe(30);
    });
  });

  describe('Readonly Mode', () => {
    it('should set readonly attribute when readonly is true', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
      };
      component.readonly = true;
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="number"]');
      expect(input.hasAttribute('readonly')).toBe(true);
    });
  });

  describe('Accessibility', () => {
    it('should have id matching property key', () => {
      component.property = {
        key: 'userAge',
        label: 'User Age',
        editor: 'number',
      };
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input[type="number"]');
      expect(input.getAttribute('id')).toBe('userAge');
    });

    it('should have aria-label on stepper buttons', () => {
      component.property = {
        key: 'age',
        label: 'Age',
        editor: 'number',
      };
      component.readonly = false;
      fixture.detectChanges();

      const buttons = fixture.nativeElement.querySelectorAll('.stepper-btn');
      expect(buttons[0].getAttribute('aria-label')).toBe('Increment');
      expect(buttons[1].getAttribute('aria-label')).toBe('Decrement');
    });
  });
});
