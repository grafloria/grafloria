import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

/**
 * Layout configuration
 */
export interface LayoutConfig {
  type: 'flex' | 'grid' | 'absolute' | 'relative' | 'static';

  // Flex properties
  flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'flex-start' | 'flex-end' | 'center' | 'baseline' | 'stretch';
  alignContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'stretch';
  gap?: number;

  // Grid properties
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridAutoFlow?: 'row' | 'column' | 'dense' | 'row dense' | 'column dense';
  gridAutoColumns?: string;
  gridAutoRows?: string;
  gridGap?: number;

  // Position properties
  position?: 'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  zIndex?: number;

  // Size properties
  width?: string;
  height?: string;
  minWidth?: string;
  minHeight?: string;
  maxWidth?: string;
  maxHeight?: string;

  // CSS output
  cssStyles: string;
}

/**
 * Layout Editor Component
 *
 * A comprehensive layout configuration tool with:
 * - Flexbox editor (direction, justify, align, wrap, gap)
 * - Grid editor (template columns/rows, auto-flow, gap)
 * - Absolute positioning editor (top, right, bottom, left, z-index)
 * - Size editor (width, height, min/max constraints)
 * - Visual layout preview
 * - Quick layout presets
 * - Live CSS output
 *
 * Usage:
 * ```html
 * <app-layout-editor
 *   [layout]="currentLayout"
 *   (layoutChange)="onLayoutChange($event)">
 * </app-layout-editor>
 * ```
 */
@Component({
  selector: 'app-layout-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="layout-editor" [style.font-family]="tokens.typography.fontFamily">
      <!-- Editor Header -->
      <div class="editor-header">
        <h3>Layout Editor</h3>
        <button class="reset-btn" (click)="resetLayout()" title="Reset">
          ↺
        </button>
      </div>

      <!-- Layout Type Selector -->
      <div class="section">
        <label class="section-label">Layout Type</label>
        <div class="type-selector">
          <button
            *ngFor="let type of layoutTypes"
            class="type-btn"
            [class.active]="layout.type === type"
            (click)="setLayoutType(type)"
          >
            {{ type }}
          </button>
        </div>
      </div>

      <!-- Flex Layout Settings -->
      <div class="section" *ngIf="layout.type === 'flex'">
        <label class="section-label">Flexbox Settings</label>

        <!-- Flex Direction -->
        <div class="control-group">
          <label>Direction</label>
          <div class="button-group">
            <button
              *ngFor="let dir of flexDirections"
              class="control-btn"
              [class.active]="layout.flexDirection === dir.value"
              (click)="setFlexDirection(dir.value)"
              [title]="dir.label"
            >
              {{ dir.icon }}
            </button>
          </div>
        </div>

        <!-- Justify Content -->
        <div class="control-group">
          <label>Justify Content</label>
          <select [(ngModel)]="layout.justifyContent" (change)="updateCSS()">
            <option value="flex-start">Start</option>
            <option value="flex-end">End</option>
            <option value="center">Center</option>
            <option value="space-between">Space Between</option>
            <option value="space-around">Space Around</option>
            <option value="space-evenly">Space Evenly</option>
          </select>
        </div>

        <!-- Align Items -->
        <div class="control-group">
          <label>Align Items</label>
          <select [(ngModel)]="layout.alignItems" (change)="updateCSS()">
            <option value="flex-start">Start</option>
            <option value="flex-end">End</option>
            <option value="center">Center</option>
            <option value="baseline">Baseline</option>
            <option value="stretch">Stretch</option>
          </select>
        </div>

        <!-- Flex Wrap -->
        <div class="control-group">
          <label>Wrap</label>
          <select [(ngModel)]="layout.flexWrap" (change)="updateCSS()">
            <option value="nowrap">No Wrap</option>
            <option value="wrap">Wrap</option>
            <option value="wrap-reverse">Wrap Reverse</option>
          </select>
        </div>

        <!-- Gap -->
        <div class="control-group">
          <label>Gap</label>
          <div class="slider-control">
            <input
              type="range"
              min="0"
              max="48"
              step="4"
              [(ngModel)]="layout.gap"
              (input)="updateCSS()"
            />
            <input
              type="number"
              min="0"
              [(ngModel)]="layout.gap"
              (input)="updateCSS()"
              class="number-input"
            />
            <span class="unit">px</span>
          </div>
        </div>

        <!-- Quick Presets -->
        <div class="control-group">
          <label>Quick Presets</label>
          <div class="preset-grid">
            <button
              *ngFor="let preset of flexPresets"
              class="preset-btn"
              (click)="applyFlexPreset(preset)"
              [title]="preset.name"
            >
              {{ preset.icon }}
            </button>
          </div>
        </div>
      </div>

      <!-- Grid Layout Settings -->
      <div class="section" *ngIf="layout.type === 'grid'">
        <label class="section-label">Grid Settings</label>

        <!-- Grid Template Columns -->
        <div class="control-group">
          <label>Template Columns</label>
          <input
            type="text"
            [(ngModel)]="layout.gridTemplateColumns"
            (input)="updateCSS()"
            placeholder="e.g., 1fr 1fr 1fr"
            class="text-input"
          />
        </div>

        <!-- Grid Template Rows -->
        <div class="control-group">
          <label>Template Rows</label>
          <input
            type="text"
            [(ngModel)]="layout.gridTemplateRows"
            (input)="updateCSS()"
            placeholder="e.g., auto auto"
            class="text-input"
          />
        </div>

        <!-- Grid Auto Flow -->
        <div class="control-group">
          <label>Auto Flow</label>
          <select [(ngModel)]="layout.gridAutoFlow" (change)="updateCSS()">
            <option value="row">Row</option>
            <option value="column">Column</option>
            <option value="dense">Dense</option>
            <option value="row dense">Row Dense</option>
            <option value="column dense">Column Dense</option>
          </select>
        </div>

        <!-- Grid Gap -->
        <div class="control-group">
          <label>Gap</label>
          <div class="slider-control">
            <input
              type="range"
              min="0"
              max="48"
              step="4"
              [(ngModel)]="layout.gridGap"
              (input)="updateCSS()"
            />
            <input
              type="number"
              min="0"
              [(ngModel)]="layout.gridGap"
              (input)="updateCSS()"
              class="number-input"
            />
            <span class="unit">px</span>
          </div>
        </div>

        <!-- Quick Presets -->
        <div class="control-group">
          <label>Quick Presets</label>
          <div class="preset-grid">
            <button
              *ngFor="let preset of gridPresets"
              class="preset-btn"
              (click)="applyGridPreset(preset)"
              [title]="preset.name"
            >
              {{ preset.icon }}
            </button>
          </div>
        </div>
      </div>

      <!-- Absolute/Relative Position Settings -->
      <div class="section" *ngIf="layout.type === 'absolute' || layout.type === 'relative'">
        <label class="section-label">Position Settings</label>

        <!-- Position Inputs -->
        <div class="position-grid">
          <div class="position-item">
            <label>Top</label>
            <input
              type="text"
              [(ngModel)]="layout.top"
              (input)="updateCSS()"
              placeholder="auto"
              class="text-input"
            />
          </div>
          <div class="position-item">
            <label>Right</label>
            <input
              type="text"
              [(ngModel)]="layout.right"
              (input)="updateCSS()"
              placeholder="auto"
              class="text-input"
            />
          </div>
          <div class="position-item">
            <label>Bottom</label>
            <input
              type="text"
              [(ngModel)]="layout.bottom"
              (input)="updateCSS()"
              placeholder="auto"
              class="text-input"
            />
          </div>
          <div class="position-item">
            <label>Left</label>
            <input
              type="text"
              [(ngModel)]="layout.left"
              (input)="updateCSS()"
              placeholder="auto"
              class="text-input"
            />
          </div>
        </div>

        <!-- Z-Index -->
        <div class="control-group">
          <label>Z-Index</label>
          <div class="slider-control">
            <input
              type="range"
              min="0"
              max="100"
              [(ngModel)]="layout.zIndex"
              (input)="updateCSS()"
            />
            <input
              type="number"
              min="0"
              [(ngModel)]="layout.zIndex"
              (input)="updateCSS()"
              class="number-input"
            />
          </div>
        </div>
      </div>

      <!-- Size Settings (All Types) -->
      <div class="section">
        <label class="section-label">Size Settings</label>

        <!-- Width -->
        <div class="control-group">
          <label>Width</label>
          <input
            type="text"
            [(ngModel)]="layout.width"
            (input)="updateCSS()"
            placeholder="auto"
            class="text-input"
          />
        </div>

        <!-- Height -->
        <div class="control-group">
          <label>Height</label>
          <input
            type="text"
            [(ngModel)]="layout.height"
            (input)="updateCSS()"
            placeholder="auto"
            class="text-input"
          />
        </div>

        <!-- Min/Max Sizes (Collapsible) -->
        <details>
          <summary>Min/Max Constraints</summary>
          <div class="constraints-grid">
            <div class="constraint-item">
              <label>Min Width</label>
              <input
                type="text"
                [(ngModel)]="layout.minWidth"
                (input)="updateCSS()"
                placeholder="auto"
                class="text-input"
              />
            </div>
            <div class="constraint-item">
              <label>Max Width</label>
              <input
                type="text"
                [(ngModel)]="layout.maxWidth"
                (input)="updateCSS()"
                placeholder="none"
                class="text-input"
              />
            </div>
            <div class="constraint-item">
              <label>Min Height</label>
              <input
                type="text"
                [(ngModel)]="layout.minHeight"
                (input)="updateCSS()"
                placeholder="auto"
                class="text-input"
              />
            </div>
            <div class="constraint-item">
              <label>Max Height</label>
              <input
                type="text"
                [(ngModel)]="layout.maxHeight"
                (input)="updateCSS()"
                placeholder="none"
                class="text-input"
              />
            </div>
          </div>
        </details>
      </div>

      <!-- CSS Output -->
      <div class="section">
        <div class="css-header">
          <span>CSS Output</span>
          <button class="copy-btn" (click)="copyCSSToClipboard()" title="Copy CSS">
            📋
          </button>
        </div>
        <textarea
          class="css-output"
          readonly
          [value]="layout.cssStyles"
          rows="6"
        ></textarea>
      </div>

      <!-- Visual Preview -->
      <div class="section">
        <label class="section-label">Preview</label>
        <div class="layout-preview">
          <div class="preview-container" [style]="getPreviewStyles()">
            <div class="preview-item" *ngFor="let i of [1,2,3]">
              Item {{ i }}
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .layout-editor {
      padding: 16px;
      background: white;
      border-radius: 8px;
      max-height: 90vh;
      overflow-y: auto;
      width: 100%;
      max-width: 450px;
    }

    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .editor-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .reset-btn {
      width: 32px;
      height: 32px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 18px;
      transition: all 0.2s;
    }

    .reset-btn:hover {
      background: #f5f5f5;
      border-color: #667eea;
    }

    .section {
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #f0f0f0;
    }

    .section:last-child {
      border-bottom: none;
    }

    .section-label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #333;
      margin-bottom: 12px;
    }

    .type-selector {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .type-btn {
      padding: 10px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      text-transform: capitalize;
      transition: all 0.2s;
    }

    .type-btn:hover {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
    }

    .type-btn.active {
      border-color: #667eea;
      background: #667eea;
      color: white;
    }

    .control-group {
      margin-bottom: 16px;
    }

    .control-group > label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      margin-bottom: 8px;
    }

    .button-group {
      display: flex;
      gap: 4px;
    }

    .control-btn {
      flex: 1;
      padding: 10px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.2s;
    }

    .control-btn:hover {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
    }

    .control-btn.active {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.1);
      color: #667eea;
    }

    .slider-control {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .slider-control input[type="range"] {
      flex: 1;
      height: 24px;
      -webkit-appearance: none;
      appearance: none;
      background: #e0e0e0;
      border-radius: 12px;
      outline: none;
    }

    .slider-control input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
    }

    .slider-control input[type="range"]::-moz-range-thumb {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
      border: none;
    }

    .number-input {
      width: 60px;
      padding: 6px 8px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      text-align: center;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .unit {
      font-size: 12px;
      color: #999;
      min-width: 24px;
    }

    select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      background: white;
      cursor: pointer;
    }

    select:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .text-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .text-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .preset-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
    }

    .preset-btn {
      aspect-ratio: 1;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .preset-btn:hover {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
      transform: scale(1.05);
    }

    .position-grid,
    .constraints-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .position-item,
    .constraint-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .position-item label,
    .constraint-item label {
      font-size: 11px;
      font-weight: 600;
      color: #666;
    }

    details {
      margin-top: 12px;
    }

    summary {
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      color: #667eea;
      padding: 8px 0;
    }

    summary:hover {
      color: #5568d3;
    }

    .css-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .css-header span {
      font-size: 12px;
      font-weight: 600;
      color: #666;
    }

    .copy-btn {
      border: none;
      background: none;
      cursor: pointer;
      font-size: 16px;
      opacity: 0.6;
      transition: opacity 0.2s;
    }

    .copy-btn:hover {
      opacity: 1;
    }

    .css-output {
      width: 100%;
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 11px;
      background: #f9f9f9;
      resize: vertical;
    }

    .layout-preview {
      padding: 12px;
      background: #f9f9f9;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      min-height: 150px;
    }

    .preview-container {
      width: 100%;
      height: 100%;
      min-height: 120px;
      background: white;
      border: 2px dashed #e0e0e0;
      border-radius: 4px;
    }

    .preview-item {
      padding: 12px;
      background: rgba(102, 126, 234, 0.1);
      border: 1px solid rgba(102, 126, 234, 0.3);
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      color: #667eea;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `]
})
export class LayoutEditorComponent implements OnInit {
  @Input() layout: LayoutConfig = this.createDefaultLayout();
  @Output() layoutChange = new EventEmitter<LayoutConfig>();

  tokens = DESIGN_TOKENS;

  layoutTypes: Array<'flex' | 'grid' | 'absolute' | 'relative' | 'static'> =
    ['flex', 'grid', 'absolute', 'relative', 'static'];

  flexDirections = [
    { value: 'row', icon: '→', label: 'Row' },
    { value: 'row-reverse', icon: '←', label: 'Row Reverse' },
    { value: 'column', icon: '↓', label: 'Column' },
    { value: 'column-reverse', icon: '↑', label: 'Column Reverse' }
  ];

  flexPresets = [
    { name: 'Center', icon: '⊕', config: { justifyContent: 'center', alignItems: 'center' } },
    { name: 'Space Between', icon: '⊔', config: { justifyContent: 'space-between', alignItems: 'center' } },
    { name: 'Start', icon: '⊏', config: { justifyContent: 'flex-start', alignItems: 'flex-start' } },
    { name: 'End', icon: '⊐', config: { justifyContent: 'flex-end', alignItems: 'flex-end' } }
  ];

  gridPresets = [
    { name: '2 Columns', icon: '⊞⊞', config: { gridTemplateColumns: '1fr 1fr' } },
    { name: '3 Columns', icon: '⊞⊞⊞', config: { gridTemplateColumns: '1fr 1fr 1fr' } },
    { name: '4 Columns', icon: '⊞⊞⊞⊞', config: { gridTemplateColumns: '1fr 1fr 1fr 1fr' } },
    { name: 'Auto Fit', icon: '⊟', config: { gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' } }
  ];

  ngOnInit(): void {
    this.updateCSS();
  }

  /**
   * Set layout type
   */
  setLayoutType(type: 'flex' | 'grid' | 'absolute' | 'relative' | 'static'): void {
    this.layout.type = type;

    // Set defaults for each type
    if (type === 'flex') {
      this.layout.flexDirection = this.layout.flexDirection || 'row';
      this.layout.justifyContent = this.layout.justifyContent || 'flex-start';
      this.layout.alignItems = this.layout.alignItems || 'flex-start';
      this.layout.flexWrap = this.layout.flexWrap || 'nowrap';
      this.layout.gap = this.layout.gap ?? 16;
    } else if (type === 'grid') {
      this.layout.gridTemplateColumns = this.layout.gridTemplateColumns || '1fr 1fr';
      this.layout.gridTemplateRows = this.layout.gridTemplateRows || 'auto';
      this.layout.gridAutoFlow = this.layout.gridAutoFlow || 'row';
      this.layout.gridGap = this.layout.gridGap ?? 16;
    }

    this.updateCSS();
  }

  /**
   * Set flex direction
   */
  setFlexDirection(direction: 'row' | 'row-reverse' | 'column' | 'column-reverse'): void {
    this.layout.flexDirection = direction;
    this.updateCSS();
  }

  /**
   * Apply flex preset
   */
  applyFlexPreset(preset: any): void {
    Object.assign(this.layout, preset.config);
    this.updateCSS();
  }

  /**
   * Apply grid preset
   */
  applyGridPreset(preset: any): void {
    Object.assign(this.layout, preset.config);
    this.updateCSS();
  }

  /**
   * Reset layout
   */
  resetLayout(): void {
    this.layout = this.createDefaultLayout();
    this.updateCSS();
  }

  /**
   * Copy CSS to clipboard
   */
  copyCSSToClipboard(): void {
    navigator.clipboard.writeText(this.layout.cssStyles).then(() => {
      console.log('CSS copied to clipboard');
    });
  }

  /**
   * Get preview styles
   */
  getPreviewStyles(): string {
    return this.layout.cssStyles;
  }

  /**
   * Update CSS styles
   */
  updateCSS(): void {
    const styles: string[] = [];

    // Display
    if (this.layout.type === 'flex') {
      styles.push('display: flex');
      if (this.layout.flexDirection) styles.push(`flex-direction: ${this.layout.flexDirection}`);
      if (this.layout.flexWrap) styles.push(`flex-wrap: ${this.layout.flexWrap}`);
      if (this.layout.justifyContent) styles.push(`justify-content: ${this.layout.justifyContent}`);
      if (this.layout.alignItems) styles.push(`align-items: ${this.layout.alignItems}`);
      if (this.layout.gap !== undefined) styles.push(`gap: ${this.layout.gap}px`);
    } else if (this.layout.type === 'grid') {
      styles.push('display: grid');
      if (this.layout.gridTemplateColumns) styles.push(`grid-template-columns: ${this.layout.gridTemplateColumns}`);
      if (this.layout.gridTemplateRows) styles.push(`grid-template-rows: ${this.layout.gridTemplateRows}`);
      if (this.layout.gridAutoFlow) styles.push(`grid-auto-flow: ${this.layout.gridAutoFlow}`);
      if (this.layout.gridGap !== undefined) styles.push(`gap: ${this.layout.gridGap}px`);
    }

    // Position
    if (this.layout.type === 'absolute' || this.layout.type === 'relative') {
      styles.push(`position: ${this.layout.type}`);
      if (this.layout.top) styles.push(`top: ${this.layout.top}`);
      if (this.layout.right) styles.push(`right: ${this.layout.right}`);
      if (this.layout.bottom) styles.push(`bottom: ${this.layout.bottom}`);
      if (this.layout.left) styles.push(`left: ${this.layout.left}`);
      if (this.layout.zIndex !== undefined) styles.push(`z-index: ${this.layout.zIndex}`);
    }

    // Size
    if (this.layout.width) styles.push(`width: ${this.layout.width}`);
    if (this.layout.height) styles.push(`height: ${this.layout.height}`);
    if (this.layout.minWidth) styles.push(`min-width: ${this.layout.minWidth}`);
    if (this.layout.minHeight) styles.push(`min-height: ${this.layout.minHeight}`);
    if (this.layout.maxWidth) styles.push(`max-width: ${this.layout.maxWidth}`);
    if (this.layout.maxHeight) styles.push(`max-height: ${this.layout.maxHeight}`);

    this.layout.cssStyles = styles.join('; ') + ';';
    this.layoutChange.emit(this.layout);
  }

  /**
   * Create default layout
   */
  private createDefaultLayout(): LayoutConfig {
    return {
      type: 'flex',
      flexDirection: 'row',
      flexWrap: 'nowrap',
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      gap: 16,
      cssStyles: ''
    };
  }
}
