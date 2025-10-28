import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorPickerComponent, type Color } from '../color-picker/color-picker.component';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

/**
 * Gradient stop with color and position
 */
export interface GradientStop {
  id: string;
  color: Color;
  position: number; // 0-100
}

/**
 * Gradient configuration
 */
export interface GradientConfig {
  type: 'linear' | 'radial';
  angle?: number; // For linear gradients (0-360)
  stops: GradientStop[];
  cssValue: string; // Computed CSS value
}

/**
 * Gradient Builder Component
 *
 * A comprehensive gradient builder with:
 * - Linear and radial gradient support
 * - Multiple color stops (2-10)
 * - Angle control for linear gradients
 * - Interactive gradient preview
 * - Color stop management (add, remove, reorder)
 * - CSS output
 * - Gradient presets
 *
 * Usage:
 * ```html
 * <app-gradient-builder
 *   [gradient]="currentGradient"
 *   (gradientChange)="onGradientChange($event)">
 * </app-gradient-builder>
 * ```
 */
@Component({
  selector: 'app-gradient-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, ColorPickerComponent, ButtonComponent],
  template: `
    <div class="gradient-builder" [style.font-family]="tokens.typography.fontFamily">
      <!-- Gradient Preview -->
      <div class="preview-section">
        <div
          class="gradient-preview"
          [style.background]="gradient.cssValue"
        ></div>
        <div class="css-output">
          <label>CSS</label>
          <input
            type="text"
            readonly
            [value]="gradient.cssValue"
            (click)="copyToClipboard()"
            title="Click to copy"
          />
        </div>
      </div>

      <!-- Gradient Type Selector -->
      <div class="type-section">
        <label>Type</label>
        <div class="type-buttons">
          <app-button
            [variant]="gradient.type === 'linear' ? 'primary' : 'ghost'"
            size="sm"
            (clicked)="setType('linear')"
          >
            Linear
          </app-button>
          <app-button
            [variant]="gradient.type === 'radial' ? 'primary' : 'ghost'"
            size="sm"
            (clicked)="setType('radial')"
          >
            Radial
          </app-button>
        </div>
      </div>

      <!-- Angle Control (Linear only) -->
      <div class="angle-section" *ngIf="gradient.type === 'linear'">
        <label>Angle</label>
        <div class="angle-control">
          <input
            type="range"
            min="0"
            max="360"
            [(ngModel)]="gradient.angle"
            (input)="onAngleChange()"
          />
          <input
            type="number"
            min="0"
            max="360"
            [(ngModel)]="gradient.angle"
            (input)="onAngleChange()"
            class="angle-input"
          />
          <span class="angle-unit">°</span>
        </div>
      </div>

      <!-- Gradient Stops -->
      <div class="stops-section">
        <div class="stops-header">
          <label>Color Stops ({{ gradient.stops.length }})</label>
          <app-button
            variant="ghost"
            size="sm"
            icon="+"
            [disabled]="gradient.stops.length >= 10"
            (clicked)="addStop()"
          >
            Add Stop
          </app-button>
        </div>

        <!-- Gradient Bar with Stops -->
        <div class="gradient-bar-container">
          <div
            class="gradient-bar"
            [style.background]="gradient.cssValue"
          ></div>
          <div class="stops-track">
            <div
              *ngFor="let stop of gradient.stops; trackBy: trackByStopId"
              class="stop-marker"
              [class.active]="selectedStop?.id === stop.id"
              [style.left.%]="stop.position"
              [style.background]="stop.color.rgba"
              (click)="selectStop(stop)"
              (mousedown)="startDragStop($event, stop)"
            >
              <div class="stop-handle"></div>
            </div>
          </div>
        </div>

        <!-- Selected Stop Editor -->
        <div class="stop-editor" *ngIf="selectedStop">
          <div class="stop-editor-header">
            <span class="stop-label">Stop {{ getStopIndex(selectedStop) + 1 }}</span>
            <app-button
              variant="danger"
              size="sm"
              icon="×"
              [disabled]="gradient.stops.length <= 2"
              (clicked)="removeStop(selectedStop)"
            >
              Remove
            </app-button>
          </div>

          <!-- Position Slider -->
          <div class="position-control">
            <label>Position</label>
            <div class="position-slider">
              <input
                type="range"
                min="0"
                max="100"
                [(ngModel)]="selectedStop.position"
                (input)="onStopPositionChange()"
              />
              <input
                type="number"
                min="0"
                max="100"
                [(ngModel)]="selectedStop.position"
                (input)="onStopPositionChange()"
                class="position-input"
              />
              <span class="position-unit">%</span>
            </div>
          </div>

          <!-- Color Picker -->
          <div class="color-picker-container">
            <app-color-picker
              [color]="selectedStop.color"
              (colorChange)="onStopColorChange($event)"
              [showAlpha]="true"
              [showPresets]="true"
            ></app-color-picker>
          </div>
        </div>
      </div>

      <!-- Gradient Presets -->
      <div class="presets-section">
        <label>Presets</label>
        <div class="presets-grid">
          <div
            *ngFor="let preset of presets"
            class="preset-item"
            [style.background]="preset.cssValue"
            [title]="preset.name"
            (click)="applyPreset(preset)"
          ></div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .gradient-builder {
      padding: 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      width: 400px;
      max-height: 80vh;
      overflow-y: auto;
    }

    .preview-section {
      margin-bottom: 16px;
    }

    .gradient-preview {
      width: 100%;
      height: 120px;
      border-radius: 8px;
      border: 2px solid #e0e0e0;
      margin-bottom: 12px;
    }

    .css-output label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #666;
      margin-bottom: 4px;
      text-transform: uppercase;
    }

    .css-output input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 12px;
      font-family: 'Monaco', 'Courier New', monospace;
      background: #f9f9f9;
      cursor: pointer;
    }

    .css-output input:hover {
      background: #f0f0f0;
      border-color: #667eea;
    }

    .css-output input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .type-section,
    .angle-section,
    .stops-section,
    .presets-section {
      margin-bottom: 16px;
    }

    .type-section label,
    .angle-section label,
    .stops-section label,
    .presets-section label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      margin-bottom: 8px;
    }

    .type-buttons {
      display: flex;
      gap: 8px;
    }

    .angle-control {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .angle-control input[type="range"] {
      flex: 1;
      height: 24px;
      -webkit-appearance: none;
      appearance: none;
      background: #e0e0e0;
      border-radius: 12px;
      outline: none;
    }

    .angle-control input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .angle-control input[type="range"]::-moz-range-thumb {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .angle-input {
      width: 60px;
      padding: 6px 8px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      text-align: center;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .angle-unit {
      font-size: 13px;
      color: #666;
    }

    .stops-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .gradient-bar-container {
      position: relative;
      margin-bottom: 16px;
    }

    .gradient-bar {
      width: 100%;
      height: 40px;
      border-radius: 8px;
      border: 2px solid #e0e0e0;
    }

    .stops-track {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .stop-marker {
      position: absolute;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      cursor: grab;
      pointer-events: all;
      transition: transform 0.2s;
    }

    .stop-marker:hover {
      transform: translate(-50%, -50%) scale(1.2);
    }

    .stop-marker.active {
      border-color: #667eea;
      transform: translate(-50%, -50%) scale(1.3);
    }

    .stop-marker:active {
      cursor: grabbing;
    }

    .stop-handle {
      width: 100%;
      height: 100%;
      border-radius: 50%;
    }

    .stop-editor {
      padding: 16px;
      background: #f9f9f9;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .stop-editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .stop-label {
      font-size: 13px;
      font-weight: 600;
      color: #333;
    }

    .position-control label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #666;
      margin-bottom: 4px;
      text-transform: uppercase;
    }

    .position-slider {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .position-slider input[type="range"] {
      flex: 1;
      height: 24px;
      -webkit-appearance: none;
      appearance: none;
      background: #e0e0e0;
      border-radius: 12px;
      outline: none;
    }

    .position-slider input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .position-slider input[type="range"]::-moz-range-thumb {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #667eea;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .position-input {
      width: 60px;
      padding: 6px 8px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      text-align: center;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .position-unit {
      font-size: 13px;
      color: #666;
    }

    .color-picker-container {
      margin-top: 12px;
    }

    .presets-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }

    .preset-item {
      aspect-ratio: 2;
      border-radius: 8px;
      cursor: pointer;
      border: 2px solid #e0e0e0;
      transition: all 0.2s;
    }

    .preset-item:hover {
      transform: scale(1.05);
      border-color: #667eea;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    }
  `]
})
export class GradientBuilderComponent implements OnInit {
  @Input() gradient: GradientConfig = this.createDefaultGradient();
  @Output() gradientChange = new EventEmitter<GradientConfig>();

  tokens = DESIGN_TOKENS;
  selectedStop: GradientStop | null = null;

  // Gradient presets
  presets: Array<{ name: string; cssValue: string; config: Partial<GradientConfig> }> = [
    {
      name: 'Sunset',
      cssValue: 'linear-gradient(45deg, #FF6B6B 0%, #FFE66D 100%)',
      config: {
        type: 'linear',
        angle: 45,
        stops: [
          { id: '1', color: this.hexToColor('#FF6B6B'), position: 0 },
          { id: '2', color: this.hexToColor('#FFE66D'), position: 100 }
        ]
      }
    },
    {
      name: 'Ocean',
      cssValue: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)',
      config: {
        type: 'linear',
        angle: 135,
        stops: [
          { id: '1', color: this.hexToColor('#667EEA'), position: 0 },
          { id: '2', color: this.hexToColor('#764BA2'), position: 100 }
        ]
      }
    },
    {
      name: 'Forest',
      cssValue: 'linear-gradient(180deg, #11998E 0%, #38EF7D 100%)',
      config: {
        type: 'linear',
        angle: 180,
        stops: [
          { id: '1', color: this.hexToColor('#11998E'), position: 0 },
          { id: '2', color: this.hexToColor('#38EF7D'), position: 100 }
        ]
      }
    },
    {
      name: 'Fire',
      cssValue: 'linear-gradient(90deg, #F2994A 0%, #F2C94C 50%, #EB5757 100%)',
      config: {
        type: 'linear',
        angle: 90,
        stops: [
          { id: '1', color: this.hexToColor('#F2994A'), position: 0 },
          { id: '2', color: this.hexToColor('#F2C94C'), position: 50 },
          { id: '3', color: this.hexToColor('#EB5757'), position: 100 }
        ]
      }
    },
    {
      name: 'Purple Haze',
      cssValue: 'radial-gradient(circle, #A8EDEA 0%, #FED6E3 100%)',
      config: {
        type: 'radial',
        stops: [
          { id: '1', color: this.hexToColor('#A8EDEA'), position: 0 },
          { id: '2', color: this.hexToColor('#FED6E3'), position: 100 }
        ]
      }
    },
    {
      name: 'Peach',
      cssValue: 'radial-gradient(circle, #FFDEE9 0%, #B5FFFC 100%)',
      config: {
        type: 'radial',
        stops: [
          { id: '1', color: this.hexToColor('#FFDEE9'), position: 0 },
          { id: '2', color: this.hexToColor('#B5FFFC'), position: 100 }
        ]
      }
    },
    {
      name: 'Winter',
      cssValue: 'linear-gradient(225deg, #A8CABA 0%, #5D4E6D 100%)',
      config: {
        type: 'linear',
        angle: 225,
        stops: [
          { id: '1', color: this.hexToColor('#A8CABA'), position: 0 },
          { id: '2', color: this.hexToColor('#5D4E6D'), position: 100 }
        ]
      }
    },
    {
      name: 'Rainbow',
      cssValue: 'linear-gradient(90deg, #FF0000 0%, #FF7F00 16%, #FFFF00 33%, #00FF00 50%, #0000FF 67%, #4B0082 84%, #9400D3 100%)',
      config: {
        type: 'linear',
        angle: 90,
        stops: [
          { id: '1', color: this.hexToColor('#FF0000'), position: 0 },
          { id: '2', color: this.hexToColor('#FF7F00'), position: 16 },
          { id: '3', color: this.hexToColor('#FFFF00'), position: 33 },
          { id: '4', color: this.hexToColor('#00FF00'), position: 50 },
          { id: '5', color: this.hexToColor('#0000FF'), position: 67 },
          { id: '6', color: this.hexToColor('#4B0082'), position: 84 },
          { id: '7', color: this.hexToColor('#9400D3'), position: 100 }
        ]
      }
    }
  ];

  ngOnInit(): void {
    // Select first stop by default
    if (this.gradient.stops.length > 0) {
      this.selectedStop = this.gradient.stops[0];
    }
    this.updateGradientCSS();
  }

  /**
   * Set gradient type
   */
  setType(type: 'linear' | 'radial'): void {
    this.gradient.type = type;
    if (type === 'linear' && this.gradient.angle === undefined) {
      this.gradient.angle = 90;
    }
    this.updateGradientCSS();
    this.emitChange();
  }

  /**
   * Handle angle change
   */
  onAngleChange(): void {
    this.updateGradientCSS();
    this.emitChange();
  }

  /**
   * Add new gradient stop
   */
  addStop(): void {
    if (this.gradient.stops.length >= 10) return;

    // Find middle position between last two stops
    const lastStop = this.gradient.stops[this.gradient.stops.length - 1];
    const secondLastStop = this.gradient.stops[this.gradient.stops.length - 2];
    const position = secondLastStop
      ? (lastStop.position + secondLastStop.position) / 2
      : lastStop.position / 2;

    const newStop: GradientStop = {
      id: this.generateId(),
      color: { ...lastStop.color },
      position: Math.round(position)
    };

    this.gradient.stops.push(newStop);
    this.sortStops();
    this.selectedStop = newStop;
    this.updateGradientCSS();
    this.emitChange();
  }

  /**
   * Remove gradient stop
   */
  removeStop(stop: GradientStop): void {
    if (this.gradient.stops.length <= 2) return;

    const index = this.gradient.stops.findIndex(s => s.id === stop.id);
    if (index !== -1) {
      this.gradient.stops.splice(index, 1);

      // Select another stop
      if (this.selectedStop?.id === stop.id) {
        this.selectedStop = this.gradient.stops[Math.max(0, index - 1)];
      }

      this.updateGradientCSS();
      this.emitChange();
    }
  }

  /**
   * Select gradient stop
   */
  selectStop(stop: GradientStop): void {
    this.selectedStop = stop;
  }

  /**
   * Start dragging stop
   */
  startDragStop(event: MouseEvent, stop: GradientStop): void {
    event.preventDefault();
    this.selectedStop = stop;

    const container = (event.target as HTMLElement).closest('.gradient-bar-container') as HTMLElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();

    const mouseMoveHandler = (e: MouseEvent) => {
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      stop.position = Math.round((x / rect.width) * 100);
      this.sortStops();
      this.updateGradientCSS();
    };

    const mouseUpHandler = () => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
      this.emitChange();
    };

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  }

  /**
   * Handle stop position change
   */
  onStopPositionChange(): void {
    if (this.selectedStop) {
      this.selectedStop.position = Math.max(0, Math.min(100, this.selectedStop.position));
      this.sortStops();
      this.updateGradientCSS();
      this.emitChange();
    }
  }

  /**
   * Handle stop color change
   */
  onStopColorChange(color: Color): void {
    if (this.selectedStop) {
      this.selectedStop.color = color;
      this.updateGradientCSS();
      this.emitChange();
    }
  }

  /**
   * Apply preset gradient
   */
  applyPreset(preset: { name: string; cssValue: string; config: Partial<GradientConfig> }): void {
    this.gradient = {
      ...this.gradient,
      ...preset.config,
      cssValue: preset.cssValue
    } as GradientConfig;

    if (this.gradient.stops.length > 0) {
      this.selectedStop = this.gradient.stops[0];
    }

    this.updateGradientCSS();
    this.emitChange();
  }

  /**
   * Copy CSS to clipboard
   */
  copyToClipboard(): void {
    navigator.clipboard.writeText(this.gradient.cssValue).then(() => {
      console.log('Copied to clipboard:', this.gradient.cssValue);
    });
  }

  /**
   * Update gradient CSS value
   */
  private updateGradientCSS(): void {
    const stops = this.gradient.stops
      .map(stop => `${stop.color.rgba} ${stop.position}%`)
      .join(', ');

    if (this.gradient.type === 'linear') {
      this.gradient.cssValue = `linear-gradient(${this.gradient.angle}deg, ${stops})`;
    } else {
      this.gradient.cssValue = `radial-gradient(circle, ${stops})`;
    }
  }

  /**
   * Sort stops by position
   */
  private sortStops(): void {
    this.gradient.stops.sort((a, b) => a.position - b.position);
  }

  /**
   * Get stop index
   */
  getStopIndex(stop: GradientStop): number {
    return this.gradient.stops.findIndex(s => s.id === stop.id);
  }

  /**
   * Track by stop ID
   */
  trackByStopId(index: number, stop: GradientStop): string {
    return stop.id;
  }

  /**
   * Emit gradient change
   */
  private emitChange(): void {
    this.gradientChange.emit({ ...this.gradient });
  }

  /**
   * Create default gradient
   */
  private createDefaultGradient(): GradientConfig {
    return {
      type: 'linear',
      angle: 90,
      stops: [
        {
          id: '1',
          color: this.hexToColor('#667EEA'),
          position: 0
        },
        {
          id: '2',
          color: this.hexToColor('#764BA2'),
          position: 100
        }
      ],
      cssValue: 'linear-gradient(90deg, rgba(102, 126, 234, 1) 0%, rgba(118, 75, 162, 1) 100%)'
    };
  }

  /**
   * Convert HEX to Color object
   */
  private hexToColor(hex: string): Color {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    const rgb = result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };

    return {
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      a: 1,
      hex: hex.toUpperCase(),
      rgba: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`,
      hsv: { h: 0, s: 0, v: 0 } // Will be calculated if needed
    };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}
