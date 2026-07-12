import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorPickerComponent, type Color } from '../color-picker/color-picker.component';
import { GradientBuilderComponent, type GradientConfig } from '../gradient-builder/gradient-builder.component';
import { ShapePickerComponent, type ShapeType, type ShapeConfig } from '../shape-picker/shape-picker.component';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

/**
 * Style properties configuration
 */
export interface StyleProperties {
  // Fill
  fillType: 'color' | 'gradient' | 'none';
  fillColor?: Color;
  fillGradient?: GradientConfig;

  // Stroke
  strokeEnabled: boolean;
  strokeColor?: Color;
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  strokeDashArray?: string;

  // Shadow
  shadowEnabled: boolean;
  shadowColor?: Color;
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
  shadowSpread: number;

  // Border Radius
  borderRadius: number;
  borderRadiusUnit: 'px' | '%';

  // Opacity
  opacity: number;

  // Filters
  blur: number;
  brightness: number;
  contrast: number;
  saturate: number;
  hueRotate: number;
  grayscale: number;
  invert: number;
  sepia: number;

  // Shape
  shape: ShapeType;

  // CSS Output
  cssStyles: string;
}

/**
 * Style Properties Panel Component
 *
 * A comprehensive style editor with:
 * - Fill (solid color, gradient, or none)
 * - Stroke (color, width, style)
 * - Shadow (box-shadow)
 * - Border radius
 * - Opacity
 * - CSS Filters (blur, brightness, contrast, etc.)
 * - Shape selection
 * - Live CSS output
 * - Reset to defaults
 *
 * Usage:
 * ```html
 * <app-style-properties-panel
 *   [properties]="styleProps"
 *   (propertiesChange)="onStyleChange($event)">
 * </app-style-properties-panel>
 * ```
 */
@Component({
    selector: 'app-style-properties-panel',
    imports: [
        CommonModule,
        FormsModule,
        ColorPickerComponent,
        GradientBuilderComponent,
        ShapePickerComponent
    ],
    template: `
    <div class="style-panel" [style.font-family]="tokens.typography.fontFamily">
      <!-- Panel Header -->
      <div class="panel-header">
        <h3>Style Properties</h3>
        <button class="reset-btn" (click)="resetToDefaults()" title="Reset to defaults">
          ↺
        </button>
      </div>

      <!-- Live Preview -->
      <div class="preview-section">
        <div class="preview-label">Preview</div>
        <div
          class="style-preview"
          [style]="getPreviewStyles()"
        ></div>
      </div>

      <!-- CSS Output -->
      <div class="css-section">
        <div class="css-header">
          <span>CSS Output</span>
          <button class="copy-btn" (click)="copyCSSToClipboard()" title="Copy CSS">
            📋
          </button>
        </div>
        <textarea
          class="css-output"
          readonly
          [value]="properties.cssStyles"
          rows="4"
        ></textarea>
      </div>

      <!-- Accordion Sections -->
      <div class="accordion">
        <!-- Fill Section -->
        <div class="accordion-item" [class.expanded]="expandedSections.fill">
          <div class="accordion-header" (click)="toggleSection('fill')">
            <span>🎨 Fill</span>
            <span class="accordion-icon">{{ expandedSections.fill ? '▼' : '▶' }}</span>
          </div>
          <div class="accordion-content" *ngIf="expandedSections.fill">
            <div class="fill-type-selector">
              <button
                *ngFor="let type of fillTypes"
                class="type-btn"
                [class.active]="properties.fillType === type"
                (click)="setFillType(type)"
              >
                {{ type }}
              </button>
            </div>

            <div *ngIf="properties.fillType === 'color' && properties.fillColor" class="fill-content">
              <app-color-picker
                [color]="properties.fillColor"
                (colorChange)="onFillColorChange($event)"
                [showAlpha]="true"
              ></app-color-picker>
            </div>

            <div *ngIf="properties.fillType === 'gradient' && properties.fillGradient" class="fill-content">
              <app-gradient-builder
                [gradient]="properties.fillGradient"
                (gradientChange)="onFillGradientChange($event)"
              ></app-gradient-builder>
            </div>
          </div>
        </div>

        <!-- Stroke Section -->
        <div class="accordion-item" [class.expanded]="expandedSections.stroke">
          <div class="accordion-header" (click)="toggleSection('stroke')">
            <span>✏️ Stroke</span>
            <span class="accordion-icon">{{ expandedSections.stroke ? '▼' : '▶' }}</span>
          </div>
          <div class="accordion-content" *ngIf="expandedSections.stroke">
            <div class="toggle-control">
              <label>
                <input
                  type="checkbox"
                  [(ngModel)]="properties.strokeEnabled"
                  (change)="updateCSS()"
                />
                <span>Enable Stroke</span>
              </label>
            </div>

            <div *ngIf="properties.strokeEnabled">
              <!-- Stroke Width -->
              <div class="control-group">
                <label>Width</label>
                <div class="slider-control">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="0.5"
                    [(ngModel)]="properties.strokeWidth"
                    (input)="updateCSS()"
                  />
                  <input
                    type="number"
                    min="0"
                    max="20"
                    step="0.5"
                    [(ngModel)]="properties.strokeWidth"
                    (input)="updateCSS()"
                    class="number-input"
                  />
                  <span class="unit">px</span>
                </div>
              </div>

              <!-- Stroke Style -->
              <div class="control-group">
                <label>Style</label>
                <select [(ngModel)]="properties.strokeStyle" (change)="updateCSS()">
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                </select>
              </div>

              <!-- Stroke Color -->
              <div class="control-group">
                <label>Color</label>
                <app-color-picker
                  *ngIf="properties.strokeColor"
                  [color]="properties.strokeColor"
                  (colorChange)="onStrokeColorChange($event)"
                  [showAlpha]="true"
                ></app-color-picker>
              </div>
            </div>
          </div>
        </div>

        <!-- Shadow Section -->
        <div class="accordion-item" [class.expanded]="expandedSections.shadow">
          <div class="accordion-header" (click)="toggleSection('shadow')">
            <span>🌑 Shadow</span>
            <span class="accordion-icon">{{ expandedSections.shadow ? '▼' : '▶' }}</span>
          </div>
          <div class="accordion-content" *ngIf="expandedSections.shadow">
            <div class="toggle-control">
              <label>
                <input
                  type="checkbox"
                  [(ngModel)]="properties.shadowEnabled"
                  (change)="updateCSS()"
                />
                <span>Enable Shadow</span>
              </label>
            </div>

            <div *ngIf="properties.shadowEnabled">
              <!-- Shadow X -->
              <div class="control-group">
                <label>Offset X</label>
                <div class="slider-control">
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    [(ngModel)]="properties.shadowX"
                    (input)="updateCSS()"
                  />
                  <input
                    type="number"
                    min="-50"
                    max="50"
                    [(ngModel)]="properties.shadowX"
                    (input)="updateCSS()"
                    class="number-input"
                  />
                  <span class="unit">px</span>
                </div>
              </div>

              <!-- Shadow Y -->
              <div class="control-group">
                <label>Offset Y</label>
                <div class="slider-control">
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    [(ngModel)]="properties.shadowY"
                    (input)="updateCSS()"
                  />
                  <input
                    type="number"
                    min="-50"
                    max="50"
                    [(ngModel)]="properties.shadowY"
                    (input)="updateCSS()"
                    class="number-input"
                  />
                  <span class="unit">px</span>
                </div>
              </div>

              <!-- Shadow Blur -->
              <div class="control-group">
                <label>Blur</label>
                <div class="slider-control">
                  <input
                    type="range"
                    min="0"
                    max="50"
                    [(ngModel)]="properties.shadowBlur"
                    (input)="updateCSS()"
                  />
                  <input
                    type="number"
                    min="0"
                    max="50"
                    [(ngModel)]="properties.shadowBlur"
                    (input)="updateCSS()"
                    class="number-input"
                  />
                  <span class="unit">px</span>
                </div>
              </div>

              <!-- Shadow Spread -->
              <div class="control-group">
                <label>Spread</label>
                <div class="slider-control">
                  <input
                    type="range"
                    min="-20"
                    max="20"
                    [(ngModel)]="properties.shadowSpread"
                    (input)="updateCSS()"
                  />
                  <input
                    type="number"
                    min="-20"
                    max="20"
                    [(ngModel)]="properties.shadowSpread"
                    (input)="updateCSS()"
                    class="number-input"
                  />
                  <span class="unit">px</span>
                </div>
              </div>

              <!-- Shadow Color -->
              <div class="control-group">
                <label>Color</label>
                <app-color-picker
                  *ngIf="properties.shadowColor"
                  [color]="properties.shadowColor"
                  (colorChange)="onShadowColorChange($event)"
                  [showAlpha]="true"
                ></app-color-picker>
              </div>
            </div>
          </div>
        </div>

        <!-- Border Radius Section -->
        <div class="accordion-item" [class.expanded]="expandedSections.borderRadius">
          <div class="accordion-header" (click)="toggleSection('borderRadius')">
            <span>⬜ Border Radius</span>
            <span class="accordion-icon">{{ expandedSections.borderRadius ? '▼' : '▶' }}</span>
          </div>
          <div class="accordion-content" *ngIf="expandedSections.borderRadius">
            <div class="control-group">
              <label>Radius</label>
              <div class="slider-control">
                <input
                  type="range"
                  min="0"
                  max="50"
                  [(ngModel)]="properties.borderRadius"
                  (input)="updateCSS()"
                />
                <input
                  type="number"
                  min="0"
                  [(ngModel)]="properties.borderRadius"
                  (input)="updateCSS()"
                  class="number-input"
                />
                <select [(ngModel)]="properties.borderRadiusUnit" (change)="updateCSS()" class="unit-select">
                  <option value="px">px</option>
                  <option value="%">%</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Opacity Section -->
        <div class="accordion-item" [class.expanded]="expandedSections.opacity">
          <div class="accordion-header" (click)="toggleSection('opacity')">
            <span>👁️ Opacity</span>
            <span class="accordion-icon">{{ expandedSections.opacity ? '▼' : '▶' }}</span>
          </div>
          <div class="accordion-content" *ngIf="expandedSections.opacity">
            <div class="control-group">
              <label>Opacity</label>
              <div class="slider-control">
                <input
                  type="range"
                  min="0"
                  max="100"
                  [(ngModel)]="opacityPercent"
                  (input)="onOpacityChange()"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  [(ngModel)]="opacityPercent"
                  (input)="onOpacityChange()"
                  class="number-input"
                />
                <span class="unit">%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Filters Section -->
        <div class="accordion-item" [class.expanded]="expandedSections.filters">
          <div class="accordion-header" (click)="toggleSection('filters')">
            <span>🎛️ Filters</span>
            <span class="accordion-icon">{{ expandedSections.filters ? '▼' : '▶' }}</span>
          </div>
          <div class="accordion-content" *ngIf="expandedSections.filters">
            <!-- Blur -->
            <div class="control-group">
              <label>Blur</label>
              <div class="slider-control">
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="0.5"
                  [(ngModel)]="properties.blur"
                  (input)="updateCSS()"
                />
                <input
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  [(ngModel)]="properties.blur"
                  (input)="updateCSS()"
                  class="number-input"
                />
                <span class="unit">px</span>
              </div>
            </div>

            <!-- Brightness -->
            <div class="control-group">
              <label>Brightness</label>
              <div class="slider-control">
                <input
                  type="range"
                  min="0"
                  max="200"
                  [(ngModel)]="properties.brightness"
                  (input)="updateCSS()"
                />
                <input
                  type="number"
                  min="0"
                  max="200"
                  [(ngModel)]="properties.brightness"
                  (input)="updateCSS()"
                  class="number-input"
                />
                <span class="unit">%</span>
              </div>
            </div>

            <!-- Contrast -->
            <div class="control-group">
              <label>Contrast</label>
              <div class="slider-control">
                <input
                  type="range"
                  min="0"
                  max="200"
                  [(ngModel)]="properties.contrast"
                  (input)="updateCSS()"
                />
                <input
                  type="number"
                  min="0"
                  max="200"
                  [(ngModel)]="properties.contrast"
                  (input)="updateCSS()"
                  class="number-input"
                />
                <span class="unit">%</span>
              </div>
            </div>

            <!-- Saturate -->
            <div class="control-group">
              <label>Saturation</label>
              <div class="slider-control">
                <input
                  type="range"
                  min="0"
                  max="200"
                  [(ngModel)]="properties.saturate"
                  (input)="updateCSS()"
                />
                <input
                  type="number"
                  min="0"
                  max="200"
                  [(ngModel)]="properties.saturate"
                  (input)="updateCSS()"
                  class="number-input"
                />
                <span class="unit">%</span>
              </div>
            </div>

            <!-- Hue Rotate -->
            <div class="control-group">
              <label>Hue Rotate</label>
              <div class="slider-control">
                <input
                  type="range"
                  min="0"
                  max="360"
                  [(ngModel)]="properties.hueRotate"
                  (input)="updateCSS()"
                />
                <input
                  type="number"
                  min="0"
                  max="360"
                  [(ngModel)]="properties.hueRotate"
                  (input)="updateCSS()"
                  class="number-input"
                />
                <span class="unit">°</span>
              </div>
            </div>

            <!-- Grayscale -->
            <div class="control-group">
              <label>Grayscale</label>
              <div class="slider-control">
                <input
                  type="range"
                  min="0"
                  max="100"
                  [(ngModel)]="properties.grayscale"
                  (input)="updateCSS()"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  [(ngModel)]="properties.grayscale"
                  (input)="updateCSS()"
                  class="number-input"
                />
                <span class="unit">%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Shape Section -->
        <div class="accordion-item" [class.expanded]="expandedSections.shape">
          <div class="accordion-header" (click)="toggleSection('shape')">
            <span>🔷 Shape</span>
            <span class="accordion-icon">{{ expandedSections.shape ? '▼' : '▶' }}</span>
          </div>
          <div class="accordion-content" *ngIf="expandedSections.shape">
            <app-shape-picker
              [selectedShape]="properties.shape"
              (shapeChange)="onShapeChange($event)"
            ></app-shape-picker>
          </div>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .style-panel {
      padding: 16px;
      background: white;
      border-radius: 8px;
      width: 100%;
      max-width: 450px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 18px;
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

    .preview-section {
      margin-bottom: 16px;
    }

    .preview-label {
      font-size: 12px;
      font-weight: 600;
      color: #666;
      margin-bottom: 8px;
    }

    .style-preview {
      width: 100%;
      height: 120px;
      background-image:
        linear-gradient(45deg, #f0f0f0 25%, transparent 25%),
        linear-gradient(-45deg, #f0f0f0 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #f0f0f0 75%),
        linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
      background-size: 20px 20px;
      background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
      border-radius: 8px;
      border: 2px solid #e0e0e0;
    }

    .css-section {
      margin-bottom: 16px;
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

    .accordion {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .accordion-item {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
      transition: all 0.2s;
    }

    .accordion-item.expanded {
      border-color: #667eea;
    }

    .accordion-header {
      padding: 12px 16px;
      background: #f9f9f9;
      cursor: pointer;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
      font-weight: 600;
      color: #333;
      transition: background 0.2s;
    }

    .accordion-header:hover {
      background: #f0f0f0;
    }

    .accordion-icon {
      font-size: 12px;
      color: #999;
    }

    .accordion-content {
      padding: 16px;
      background: white;
    }

    .fill-type-selector {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .type-btn {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
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

    .fill-content {
      margin-top: 12px;
    }

    .toggle-control {
      margin-bottom: 16px;
    }

    .toggle-control label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 13px;
      color: #333;
    }

    .toggle-control input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
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

    .unit-select {
      padding: 6px 8px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      background: white;
      cursor: pointer;
    }

    .control-group select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      background: white;
      cursor: pointer;
    }

    .control-group select:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
  `]
})
export class StylePropertiesPanelComponent implements OnInit {
  @Input() properties: StyleProperties = this.createDefaultProperties();
  @Output() propertiesChange = new EventEmitter<StyleProperties>();

  tokens = DESIGN_TOKENS;
  fillTypes: Array<'color' | 'gradient' | 'none'> = ['color', 'gradient', 'none'];
  opacityPercent = 100;

  expandedSections = {
    fill: true,
    stroke: false,
    shadow: false,
    borderRadius: false,
    opacity: false,
    filters: false,
    shape: false
  };

  ngOnInit(): void {
    this.opacityPercent = this.properties.opacity * 100;
    this.updateCSS();
  }

  /**
   * Toggle accordion section
   */
  toggleSection(section: keyof typeof this.expandedSections): void {
    this.expandedSections[section] = !this.expandedSections[section];
  }

  /**
   * Set fill type
   */
  setFillType(type: 'color' | 'gradient' | 'none'): void {
    this.properties.fillType = type;
    this.updateCSS();
  }

  /**
   * Handle fill color change
   */
  onFillColorChange(color: Color): void {
    this.properties.fillColor = color;
    this.updateCSS();
  }

  /**
   * Handle fill gradient change
   */
  onFillGradientChange(gradient: GradientConfig): void {
    this.properties.fillGradient = gradient;
    this.updateCSS();
  }

  /**
   * Handle stroke color change
   */
  onStrokeColorChange(color: Color): void {
    this.properties.strokeColor = color;
    this.updateCSS();
  }

  /**
   * Handle shadow color change
   */
  onShadowColorChange(color: Color): void {
    this.properties.shadowColor = color;
    this.updateCSS();
  }

  /**
   * Handle opacity change
   */
  onOpacityChange(): void {
    this.properties.opacity = this.opacityPercent / 100;
    this.updateCSS();
  }

  /**
   * Handle shape change
   */
  onShapeChange(shape: ShapeConfig): void {
    this.properties.shape = shape.type;
    if (shape.borderRadius) {
      this.properties.borderRadius = parseInt(shape.borderRadius) || 0;
    }
    this.updateCSS();
  }

  /**
   * Reset to default properties
   */
  resetToDefaults(): void {
    this.properties = this.createDefaultProperties();
    this.opacityPercent = 100;
    this.updateCSS();
  }

  /**
   * Copy CSS to clipboard
   */
  copyCSSToClipboard(): void {
    navigator.clipboard.writeText(this.properties.cssStyles).then(() => {
      console.log('CSS copied to clipboard');
    });
  }

  /**
   * Get preview styles
   */
  getPreviewStyles(): string {
    return this.properties.cssStyles;
  }

  /**
   * Update CSS styles
   */
  updateCSS(): void {
    const styles: string[] = [];

    // Background/Fill
    if (this.properties.fillType === 'color' && this.properties.fillColor) {
      styles.push(`background: ${this.properties.fillColor.rgba}`);
    } else if (this.properties.fillType === 'gradient' && this.properties.fillGradient) {
      styles.push(`background: ${this.properties.fillGradient.cssValue}`);
    } else {
      styles.push('background: transparent');
    }

    // Border/Stroke
    if (this.properties.strokeEnabled && this.properties.strokeColor) {
      const borderStyle = `${this.properties.strokeWidth}px ${this.properties.strokeStyle} ${this.properties.strokeColor.rgba}`;
      styles.push(`border: ${borderStyle}`);
    }

    // Box Shadow
    if (this.properties.shadowEnabled && this.properties.shadowColor) {
      const shadow = `${this.properties.shadowX}px ${this.properties.shadowY}px ${this.properties.shadowBlur}px ${this.properties.shadowSpread}px ${this.properties.shadowColor.rgba}`;
      styles.push(`box-shadow: ${shadow}`);
    }

    // Border Radius
    if (this.properties.borderRadius > 0) {
      styles.push(`border-radius: ${this.properties.borderRadius}${this.properties.borderRadiusUnit}`);
    }

    // Opacity
    if (this.properties.opacity < 1) {
      styles.push(`opacity: ${this.properties.opacity}`);
    }

    // Filters
    const filters: string[] = [];
    if (this.properties.blur > 0) filters.push(`blur(${this.properties.blur}px)`);
    if (this.properties.brightness !== 100) filters.push(`brightness(${this.properties.brightness}%)`);
    if (this.properties.contrast !== 100) filters.push(`contrast(${this.properties.contrast}%)`);
    if (this.properties.saturate !== 100) filters.push(`saturate(${this.properties.saturate}%)`);
    if (this.properties.hueRotate !== 0) filters.push(`hue-rotate(${this.properties.hueRotate}deg)`);
    if (this.properties.grayscale > 0) filters.push(`grayscale(${this.properties.grayscale}%)`);

    if (filters.length > 0) {
      styles.push(`filter: ${filters.join(' ')}`);
    }

    this.properties.cssStyles = styles.join('; ') + ';';
    this.propertiesChange.emit(this.properties);
  }

  /**
   * Create default properties
   */
  private createDefaultProperties(): StyleProperties {
    return {
      fillType: 'color',
      fillColor: {
        r: 102,
        g: 126,
        b: 234,
        a: 1,
        hex: '#667EEA',
        rgba: 'rgba(102, 126, 234, 1)',
        hsv: { h: 229, s: 56, v: 92 }
      },
      strokeEnabled: false,
      strokeColor: {
        r: 0,
        g: 0,
        b: 0,
        a: 1,
        hex: '#000000',
        rgba: 'rgba(0, 0, 0, 1)',
        hsv: { h: 0, s: 0, v: 0 }
      },
      strokeWidth: 2,
      strokeStyle: 'solid',
      shadowEnabled: false,
      shadowColor: {
        r: 0,
        g: 0,
        b: 0,
        a: 0.3,
        hex: '#000000',
        rgba: 'rgba(0, 0, 0, 0.3)',
        hsv: { h: 0, s: 0, v: 0 }
      },
      shadowX: 0,
      shadowY: 4,
      shadowBlur: 12,
      shadowSpread: 0,
      borderRadius: 8,
      borderRadiusUnit: 'px',
      opacity: 1,
      blur: 0,
      brightness: 100,
      contrast: 100,
      saturate: 100,
      hueRotate: 0,
      grayscale: 0,
      invert: 0,
      sepia: 0,
      shape: 'rectangle',
      cssStyles: ''
    };
  }
}
