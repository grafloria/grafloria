import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MonacoEditorComponent } from '../monaco-editor/monaco-editor.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import type { NodeTemplate } from '@grafloria/engine';

/**
 * Validation Error
 */
export interface ValidationError {
  path: string;
  message: string;
  value?: any;
  expected?: string;
}

/**
 * Data Testing Panel Component
 *
 * Allows users to test templates with live data.
 * Features:
 * - Live data editor (JSON)
 * - Schema validation
 * - Data presets
 * - Real-time preview updates
 *
 * Usage:
 * <app-data-testing-panel
 *   [template]="currentTemplate"
 *   [data]="testData"
 *   (dataChange)="onDataChange($event)">
 * </app-data-testing-panel>
 */
@Component({
  selector: 'app-data-testing-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MonacoEditorComponent, ButtonComponent],
  template: `
    <div class="data-testing-panel">
      <!-- Header -->
      <div class="panel-header">
        <h3 class="panel-title">Test Data</h3>
        <div class="panel-actions">
          <app-button
            variant="ghost"
            size="sm"
            icon="🔄"
            [disabled]="!hasChanges"
            (clicked)="resetToDefault()">
            Reset
          </app-button>
          <app-button
            variant="primary"
            size="sm"
            icon="✓"
            [disabled]="!isValidJson || !hasChanges"
            (clicked)="applyData()">
            Apply
          </app-button>
        </div>
      </div>

      <!-- Data Presets -->
      <div class="data-presets" *ngIf="presets.length > 0">
        <label class="preset-label">Presets:</label>
        <select
          class="preset-select"
          (change)="loadPreset($any($event.target).value)"
          [value]="selectedPreset">
          <option value="">Select a preset...</option>
          <option *ngFor="let preset of presets" [value]="preset.id">
            {{ preset.name }}
          </option>
        </select>
      </div>

      <!-- JSON Editor -->
      <div class="data-editor">
        <app-monaco-editor
          [content]="dataJson"
          [language]="'json'"
          [theme]="'vs'"
          [minimap]="false"
          [lineNumbers]="'on'"
          (contentChange)="onDataJsonChange($event)">
        </app-monaco-editor>
      </div>

      <!-- Validation Status -->
      <div class="validation-status" *ngIf="validationErrors.length > 0">
        <div class="status-header">
          <span class="status-icon error">❌</span>
          <span class="status-text">{{ validationErrors.length }} Validation Error(s)</span>
        </div>
        <div class="error-list">
          <div *ngFor="let error of validationErrors" class="error-item">
            <span class="error-path">{{ error.path }}</span>
            <span class="error-message">{{ error.message }}</span>
          </div>
        </div>
      </div>

      <div class="validation-status success" *ngIf="isValidJson && validationErrors.length === 0">
        <div class="status-header">
          <span class="status-icon">✅</span>
          <span class="status-text">Data is valid</span>
        </div>
      </div>

      <!-- Schema Info -->
      <div class="schema-info" *ngIf="template?.dataSchema">
        <div class="info-header" (click)="schemaExpanded = !schemaExpanded">
          <span class="expand-icon">{{ schemaExpanded ? '▼' : '▶' }}</span>
          <span class="info-title">Data Schema</span>
        </div>
        <div class="info-content" *ngIf="schemaExpanded">
          <pre class="schema-preview">{{ getSchemaPreview() }}</pre>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .data-testing-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
      border-radius: 8px;
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .panel-title {
      margin: 0;
      font-size: 1rem;
      font-weight: 600;
      color: #111827;
    }

    .panel-actions {
      display: flex;
      gap: 8px;
    }

    .data-presets {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: #ffffff;
    }

    .preset-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: #6b7280;
    }

    .preset-select {
      flex: 1;
      padding: 6px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.875rem;
      background: white;
      cursor: pointer;
    }

    .preset-select:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .data-editor {
      flex: 1;
      min-height: 200px;
      overflow: hidden;
    }

    .validation-status {
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
      background: #fef2f2;
    }

    .validation-status.success {
      background: #f0fdf4;
    }

    .status-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .status-icon {
      font-size: 1rem;
    }

    .status-text {
      font-size: 0.875rem;
      font-weight: 600;
      color: #111827;
    }

    .error-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 8px;
    }

    .error-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px;
      background: white;
      border-radius: 4px;
      border-left: 3px solid #ef4444;
    }

    .error-path {
      font-size: 0.75rem;
      font-weight: 600;
      color: #dc2626;
      font-family: monospace;
    }

    .error-message {
      font-size: 0.875rem;
      color: #6b7280;
    }

    .schema-info {
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .info-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      cursor: pointer;
      user-select: none;
    }

    .info-header:hover {
      background: #f3f4f6;
    }

    .expand-icon {
      font-size: 0.75rem;
      color: #6b7280;
    }

    .info-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #111827;
    }

    .info-content {
      padding: 12px 16px;
      max-height: 200px;
      overflow-y: auto;
    }

    .schema-preview {
      margin: 0;
      padding: 12px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: monospace;
      color: #374151;
      overflow-x: auto;
    }
  `]
})
export class DataTestingPanelComponent implements OnInit, OnChanges {
  @Input() template: NodeTemplate | null = null;
  @Input() data: any = {};

  @Output() dataChange = new EventEmitter<any>();

  dataJson = '{}';
  isValidJson = true;
  validationErrors: ValidationError[] = [];
  hasChanges = false;
  schemaExpanded = false;
  selectedPreset = '';

  presets: Array<{ id: string; name: string; data: any }> = [];

  ngOnInit(): void {
    this.initializePresets();
    this.updateDataJson();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && !changes['data'].firstChange) {
      this.updateDataJson();
    }

    if (changes['template'] && !changes['template'].firstChange) {
      this.initializePresets();
      this.validateData();
    }
  }

  /**
   * Initialize data presets based on template
   */
  private initializePresets(): void {
    this.presets = [];

    if (!this.template) return;

    // Default preset
    if (this.template.defaultData) {
      this.presets.push({
        id: 'default',
        name: 'Default Data',
        data: this.template.defaultData
      });
    }

    // Empty preset
    const emptyData = this.createEmptyData();
    if (emptyData) {
      this.presets.push({
        id: 'empty',
        name: 'Empty (Required Only)',
        data: emptyData
      });
    }

    // Sample preset (filled with examples)
    const sampleData = this.createSampleData();
    if (sampleData) {
      this.presets.push({
        id: 'sample',
        name: 'Sample Data',
        data: sampleData
      });
    }
  }

  /**
   * Create empty data with only required fields
   */
  private createEmptyData(): any {
    if (!this.template?.dataSchema) return null;

    const schema = this.template.dataSchema as any;
    if (schema.type !== 'object' || !schema.properties) return null;

    const data: any = {};
    const required = schema.required || [];

    required.forEach((field: string) => {
      const prop = schema.properties[field];
      data[field] = this.getDefaultValueForType(prop.type);
    });

    return Object.keys(data).length > 0 ? data : null;
  }

  /**
   * Create sample data with realistic values
   */
  private createSampleData(): any {
    if (!this.template?.dataSchema) return null;

    const schema = this.template.dataSchema as any;
    if (schema.type !== 'object' || !schema.properties) return null;

    const data: any = {};

    Object.keys(schema.properties).forEach(field => {
      const prop = schema.properties[field];
      data[field] = this.getSampleValueForProperty(field, prop);
    });

    return data;
  }

  /**
   * Get default value for JSON schema type
   */
  private getDefaultValueForType(type: string): any {
    switch (type) {
      case 'string': return '';
      case 'number': return 0;
      case 'boolean': return false;
      case 'array': return [];
      case 'object': return {};
      default: return null;
    }
  }

  /**
   * Get sample value for property
   */
  private getSampleValueForProperty(field: string, prop: any): any {
    if (prop.enum && prop.enum.length > 0) {
      return prop.enum[0];
    }

    if (prop.type === 'string') {
      if (prop.format === 'email') return 'user@example.com';
      if (prop.format === 'url') return 'https://example.com';
      if (prop.format === 'date') return new Date().toISOString().split('T')[0];
      if (field.toLowerCase().includes('name')) return 'John Doe';
      if (field.toLowerCase().includes('title')) return 'Sample Title';
      if (field.toLowerCase().includes('description')) return 'Sample description';
      return 'Sample text';
    }

    if (prop.type === 'number') {
      if (field.toLowerCase().includes('age')) return 25;
      if (field.toLowerCase().includes('price')) return 99.99;
      if (field.toLowerCase().includes('count')) return 10;
      return 100;
    }

    if (prop.type === 'boolean') {
      return true;
    }

    if (prop.type === 'array') {
      return [];
    }

    if (prop.type === 'object') {
      return {};
    }

    return this.getDefaultValueForType(prop.type);
  }

  /**
   * Update data JSON from object
   */
  private updateDataJson(): void {
    try {
      this.dataJson = JSON.stringify(this.data, null, 2);
      this.isValidJson = true;
      this.hasChanges = false;
      this.validateData();
    } catch (error) {
      console.error('Failed to stringify data:', error);
    }
  }

  /**
   * Handle data JSON change
   */
  onDataJsonChange(json: string): void {
    this.dataJson = json;
    this.hasChanges = true;

    try {
      JSON.parse(json);
      this.isValidJson = true;
    } catch (error) {
      this.isValidJson = false;
      this.validationErrors = [{
        path: 'JSON',
        message: 'Invalid JSON syntax'
      }];
    }

    if (this.isValidJson) {
      this.validateData();
    }
  }

  /**
   * Validate data against schema
   */
  private validateData(): void {
    this.validationErrors = [];

    if (!this.template?.dataSchema || !this.isValidJson) {
      return;
    }

    try {
      const data = JSON.parse(this.dataJson);
      const schema = this.template.dataSchema as any;

      // Basic validation (simplified - could use ajv library for full validation)
      if (schema.type === 'object' && schema.properties) {
        // Check required fields
        const required = schema.required || [];
        required.forEach((field: string) => {
          if (!(field in data) || data[field] === undefined || data[field] === null) {
            this.validationErrors.push({
              path: field,
              message: 'Required field is missing',
              expected: 'value'
            });
          }
        });

        // Check property types
        Object.keys(data).forEach(field => {
          const prop = schema.properties[field];
          if (!prop) {
            this.validationErrors.push({
              path: field,
              message: 'Unknown property (not in schema)',
              value: data[field]
            });
            return;
          }

          const value = data[field];
          const actualType = Array.isArray(value) ? 'array' : typeof value;

          if (actualType !== prop.type && value !== null) {
            this.validationErrors.push({
              path: field,
              message: `Wrong type: expected ${prop.type}, got ${actualType}`,
              value: value,
              expected: prop.type
            });
          }

          // Check enum
          if (prop.enum && !prop.enum.includes(value)) {
            this.validationErrors.push({
              path: field,
              message: `Value must be one of: ${prop.enum.join(', ')}`,
              value: value,
              expected: prop.enum.join(' | ')
            });
          }

          // Check string length
          if (prop.type === 'string' && typeof value === 'string') {
            if (prop.minLength && value.length < prop.minLength) {
              this.validationErrors.push({
                path: field,
                message: `String too short (min: ${prop.minLength})`,
                value: value.length
              });
            }
            if (prop.maxLength && value.length > prop.maxLength) {
              this.validationErrors.push({
                path: field,
                message: `String too long (max: ${prop.maxLength})`,
                value: value.length
              });
            }
          }

          // Check number range
          if (prop.type === 'number' && typeof value === 'number') {
            if (prop.minimum !== undefined && value < prop.minimum) {
              this.validationErrors.push({
                path: field,
                message: `Number too small (min: ${prop.minimum})`,
                value: value
              });
            }
            if (prop.maximum !== undefined && value > prop.maximum) {
              this.validationErrors.push({
                path: field,
                message: `Number too large (max: ${prop.maximum})`,
                value: value
              });
            }
          }
        });
      }
    } catch (error) {
      console.error('Validation error:', error);
    }
  }

  /**
   * Apply data changes
   */
  applyData(): void {
    if (!this.isValidJson) return;

    try {
      const data = JSON.parse(this.dataJson);
      this.dataChange.emit(data);
      this.hasChanges = false;
    } catch (error) {
      console.error('Failed to apply data:', error);
    }
  }

  /**
   * Reset to default data
   */
  resetToDefault(): void {
    if (this.template?.defaultData) {
      this.dataJson = JSON.stringify(this.template.defaultData, null, 2);
      this.isValidJson = true;
      this.hasChanges = true;
      this.validateData();
    }
  }

  /**
   * Load a preset
   */
  loadPreset(presetId: string): void {
    if (!presetId) return;

    const preset = this.presets.find(p => p.id === presetId);
    if (preset) {
      this.dataJson = JSON.stringify(preset.data, null, 2);
      this.isValidJson = true;
      this.hasChanges = true;
      this.selectedPreset = presetId;
      this.validateData();
    }
  }

  /**
   * Get schema preview text
   */
  getSchemaPreview(): string {
    if (!this.template?.dataSchema) return '';

    try {
      return JSON.stringify(this.template.dataSchema, null, 2);
    } catch (error) {
      return 'Error displaying schema';
    }
  }
}
