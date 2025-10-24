/**
 * Property Editors Module
 *
 * This module exports all property editor components, the registry service,
 * and the host component for dynamic editor loading.
 *
 * @packageDocumentation
 */

// Core interface
export { PropertyEditorComponent } from './property-editor.interface';

// Individual editor components
export { PropertyEditorStringComponent } from './property-editor-string.component';
export { PropertyEditorNumberComponent } from './property-editor-number.component';
export { PropertyEditorBooleanComponent } from './property-editor-boolean.component';
export { PropertyEditorSelectComponent } from './property-editor-select.component';
export { PropertyEditorMultiselectComponent } from './property-editor-multiselect.component';
export { PropertyEditorColorComponent } from './property-editor-color.component';
export { PropertyEditorSliderComponent } from './property-editor-slider.component';
export { PropertyEditorTextareaComponent } from './property-editor-textarea.component';
export { PropertyEditorDateComponent } from './property-editor-date.component';
export { PropertyEditorDatetimeComponent } from './property-editor-datetime.component';
export { PropertyEditorFileComponent } from './property-editor-file.component';
export { PropertyEditorJsonComponent } from './property-editor-json.component';

// Host component for dynamic loading
export { PropertyEditorHostComponent } from './property-editor-host.component';
