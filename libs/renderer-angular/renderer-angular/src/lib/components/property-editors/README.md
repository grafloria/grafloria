# Property Editor Components

This directory contains 12 property editor components that provide a consistent interface for editing different types of property values in the Grafloria diagram editor.

## Overview

All property editors implement the `PropertyEditorComponent` interface, ensuring consistency across all editor types. The editors are dynamically loaded by the `PropertyEditorHostComponent` based on the property definition's `editor` field.

## Available Editors

### 1. String Editor (`property-editor-string`)
Single-line text input with support for:
- Placeholder text
- Prefix/suffix display (e.g., "$", "px")
- Character count (when maxLength is set)
- Max length validation
- Read-only mode

### 2. Number Editor (`property-editor-number`)
Numeric input with stepper controls:
- Number input field
- Increment/decrement buttons
- Min/max validation
- Integer vs decimal support
- Step control
- Prefix/suffix display
- Keyboard shortcuts (up/down arrows)

### 3. Boolean Editor (`property-editor-boolean`)
Checkbox or toggle switch:
- Checkbox mode (default)
- Toggle switch mode (via display.variant)
- Keyboard accessible
- Visual states (checked, unchecked, disabled)

### 4. Select Editor (`property-editor-select`)
Dropdown selection:
- Single selection
- Options from validation.options or validation.enum
- Placeholder support
- Disabled options

### 5. Multiselect Editor (`property-editor-multiselect`)
Multiple selection with checkboxes:
- Multiple option selection
- Chip display for selected items
- Select all / Deselect all buttons
- Search/filter support (planned)
- Max selections limit (optional)

### 6. Color Editor (`property-editor-color`)
Color picker:
- Native HTML5 color picker
- Visual color swatch
- Hex color input
- Preset colors (if configured)

### 7. Slider Editor (`property-editor-slider`)
Range slider:
- Range slider with thumb
- Min/max from validation
- Step from validation
- Current value display
- Min/max labels

### 8. Textarea Editor (`property-editor-textarea`)
Multi-line text input:
- Multi-line text field
- Auto-resize height (optional)
- Character count (when maxLength is set)
- Configurable rows
- Min/max length validation

### 9. Date Editor (`property-editor-date`)
Date picker:
- Native date input with calendar
- Min/max date validation
- Today button
- Clear button

### 10. Datetime Editor (`property-editor-datetime`)
Date and time picker:
- Native datetime-local input
- Min/max datetime validation
- Now button
- Clear button

### 11. File Editor (`property-editor-file`)
File upload:
- File input with drag-drop
- File type validation (accept attribute)
- File size validation
- Image preview
- Multiple files support (optional)

### 12. JSON Editor (`property-editor-json`)
JSON editor:
- Textarea with monospace font
- JSON syntax validation
- Auto-format button
- Minify button
- Error indicators

## Architecture

### PropertyEditorComponent Interface

All editors implement this common interface:

```typescript
export interface PropertyEditorComponent {
  value: any;                                    // Current value
  property: PropertyDefinition;                  // Property definition
  readonly: boolean;                             // Read-only mode
  valueChange: EventEmitter<any>;                // Value change event
  validationError: EventEmitter<ValidationError | null>;  // Validation error event
}
```

### PropertyEditorRegistry Service

Manages registration and lookup of editor components:

```typescript
@Injectable({ providedIn: 'root' })
export class PropertyEditorRegistryService {
  registerEditor(type: string, component: Type<any>): void
  getEditor(type: string): Type<any> | null
  hasEditor(type: string): boolean
  getEditorTypes(): string[]
}
```

Built-in editors are automatically registered. Custom editors can be registered using `registerEditor()`.

### PropertyEditorHost Component

Dynamically loads the appropriate editor component based on the property definition:

```typescript
<diagram-property-editor
  [property]="propertyDefinition"
  [value]="currentValue"
  [readonly]="false"
  (valueChange)="onValueChange($event)"
  (validationError)="onValidationError($event)">
</diagram-property-editor>
```

The host component:
1. Looks up the editor component from the registry
2. Creates an instance of the editor
3. Passes inputs (value, property, readonly)
4. Subscribes to outputs (valueChange, validationError)
5. Handles editor switching when property changes

## Usage

### Basic Usage

```typescript
import { PropertyEditorStringComponent } from '@grafloria/angular';

@Component({
  template: `
    <property-editor-string
      [value]="name"
      [property]="propertyDef"
      (valueChange)="onNameChange($event)">
    </property-editor-string>
  `
})
export class MyComponent {
  name = 'John Doe';
  propertyDef: PropertyDefinition = {
    key: 'name',
    label: 'Name',
    editor: 'string',
    validation: {
      required: true,
      minLength: 3,
      maxLength: 50
    }
  };

  onNameChange(newName: string) {
    this.name = newName;
  }
}
```

### Using PropertyEditorHost for Dynamic Loading

```typescript
import { PropertyEditorHostComponent } from '@grafloria/angular';

@Component({
  template: `
    <diagram-property-editor
      [property]="currentProperty"
      [value]="currentValue"
      (valueChange)="onValueChange($event)">
    </diagram-property-editor>
  `
})
export class MyComponent {
  currentProperty: PropertyDefinition = {
    key: 'age',
    label: 'Age',
    editor: 'number',
    validation: { min: 0, max: 120 }
  };

  currentValue = 25;

  onValueChange(newValue: any) {
    this.currentValue = newValue;
  }
}
```

### Registering Custom Editors

```typescript
import { PropertyEditorRegistryService } from '@grafloria/angular';

@Component({
  selector: 'custom-editor',
  template: '...',
  standalone: true
})
export class CustomEditorComponent implements PropertyEditorComponent {
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;
  @Output() valueChange = new EventEmitter<any>();
  @Output() validationError = new EventEmitter<ValidationError | null>();
}

// Register the custom editor
constructor(private registry: PropertyEditorRegistryService) {
  registry.registerEditor('custom', CustomEditorComponent);
}

// Use it in a property definition
const property: PropertyDefinition = {
  key: 'customField',
  label: 'Custom Field',
  editor: 'custom'
};
```

## Styling

All editors use CSS custom properties for theming:

```css
:root {
  --input-border: #ccc;
  --primary-color: #007bff;
  --text-primary: #333;
  --text-secondary: #666;
  --input-readonly-bg: #f5f5f5;
  --button-hover-bg: #f5f5f5;
  --error-color: #dc3545;
}
```

## Accessibility

All editors follow WCAG 2.1 Level AA guidelines:
- Keyboard navigation support
- Screen reader friendly
- Focus indicators
- ARIA attributes
- Proper label associations

## Testing

Each editor has comprehensive unit tests covering:
- Basic rendering
- Value updates
- Validation
- Readonly mode
- Accessibility
- Edge cases

Test files are located alongside component files with `.spec.ts` extension.

## Future Enhancements

- Search/filter for select and multiselect editors with >20 options
- Monaco Editor integration for JSON editor
- Rich text editor
- Code editor with syntax highlighting
- Time picker (separate from datetime)
- Duration picker
- Icon picker
- Font picker
- Advanced color picker with opacity
- File upload with progress indicator

## Contributing

When adding new editor types:
1. Implement the `PropertyEditorComponent` interface
2. Write comprehensive unit tests
3. Add to `PropertyEditorRegistry` built-in editors
4. Export from `index.ts`
5. Document in this README
6. Add Storybook story (if applicable)
