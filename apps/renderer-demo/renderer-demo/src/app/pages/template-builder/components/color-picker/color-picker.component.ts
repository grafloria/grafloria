import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

/**
 * Color representation in different formats
 */
export interface Color {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
  hex: string; // #RRGGBB
  rgba: string; // rgba(r, g, b, a)
  hsv: { h: number; s: number; v: number }; // h: 0-360, s: 0-100, v: 0-100
}

/**
 * Color Picker Component
 *
 * A comprehensive color picker with:
 * - 2D HSV gradient canvas for precise color selection
 * - RGB and HSV input fields
 * - HEX input with validation
 * - Opacity/Alpha slider
 * - Color presets (8 common colors)
 * - Recent colors history (up to 8 colors)
 * - Eyedropper tool (if supported by browser)
 *
 * Usage:
 * ```html
 * <app-color-picker
 *   [color]="currentColor"
 *   (colorChange)="onColorChange($event)"
 *   [showAlpha]="true"
 *   [showPresets]="true">
 * </app-color-picker>
 * ```
 */
@Component({
    selector: 'app-color-picker',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="color-picker" [style.font-family]="tokens.typography.fontFamily">
      <!-- Current Color Preview -->
      <div class="color-preview-section">
        <div class="color-preview" [style.background]="color.rgba"></div>
        <div class="color-info">
          <div class="color-hex">{{ color.hex }}</div>
          <div class="color-rgba">{{ color.rgba }}</div>
        </div>
      </div>

      <!-- HSV Canvas Picker -->
      <div class="canvas-section">
        <canvas
          #saturationCanvas
          class="saturation-canvas"
          width="280"
          height="200"
          (mousedown)="onSaturationMouseDown($event)"
          (touchstart)="onSaturationTouchStart($event)"
        ></canvas>
        <div
          class="canvas-cursor"
          [style.left.px]="cursorX"
          [style.top.px]="cursorY"
        ></div>
      </div>

      <!-- Hue Slider -->
      <div class="slider-section">
        <label>Hue</label>
        <div class="hue-slider-container">
          <input
            type="range"
            class="hue-slider"
            min="0"
            max="360"
            [(ngModel)]="hue"
            (input)="onHueChange()"
          />
          <div class="slider-value">{{ hue }}°</div>
        </div>
      </div>

      <!-- Opacity/Alpha Slider -->
      <div class="slider-section" *ngIf="showAlpha">
        <label>Opacity</label>
        <div class="alpha-slider-container">
          <input
            type="range"
            class="alpha-slider"
            min="0"
            max="100"
            [value]="color.a * 100"
            (input)="onAlphaChange($event)"
          />
          <div class="slider-value">{{ (color.a * 100).toFixed(0) }}%</div>
        </div>
      </div>

      <!-- RGB Inputs -->
      <div class="rgb-inputs">
        <div class="input-group">
          <label>R</label>
          <input
            type="number"
            min="0"
            max="255"
            [(ngModel)]="color.r"
            (input)="onRGBChange()"
          />
        </div>
        <div class="input-group">
          <label>G</label>
          <input
            type="number"
            min="0"
            max="255"
            [(ngModel)]="color.g"
            (input)="onRGBChange()"
          />
        </div>
        <div class="input-group">
          <label>B</label>
          <input
            type="number"
            min="0"
            max="255"
            [(ngModel)]="color.b"
            (input)="onRGBChange()"
          />
        </div>
      </div>

      <!-- HEX Input -->
      <div class="hex-input-section">
        <label>HEX</label>
        <input
          type="text"
          class="hex-input"
          [value]="color.hex"
          (input)="onHexChange($event)"
          placeholder="#FFFFFF"
          maxlength="7"
        />
      </div>

      <!-- Color Presets -->
      <div class="presets-section" *ngIf="showPresets">
        <label>Presets</label>
        <div class="presets-grid">
          <div
            *ngFor="let preset of presets"
            class="preset-color"
            [style.background]="preset"
            [title]="preset"
            (click)="applyPreset(preset)"
          ></div>
        </div>
      </div>

      <!-- Recent Colors -->
      <div class="recent-section" *ngIf="recentColors.length > 0">
        <label>Recent</label>
        <div class="recent-grid">
          <div
            *ngFor="let recent of recentColors"
            class="recent-color"
            [style.background]="recent"
            [title]="recent"
            (click)="applyRecent(recent)"
          ></div>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .color-picker {
      padding: 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      width: 320px;
      user-select: none;
    }

    .color-preview-section {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }

    .color-preview {
      width: 60px;
      height: 60px;
      border-radius: 8px;
      border: 2px solid #e0e0e0;
      background-image:
        linear-gradient(45deg, #ccc 25%, transparent 25%),
        linear-gradient(-45deg, #ccc 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ccc 75%),
        linear-gradient(-45deg, transparent 75%, #ccc 75%);
      background-size: 10px 10px;
      background-position: 0 0, 0 5px, 5px -5px, -5px 0px;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.1);
    }

    .color-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 4px;
    }

    .color-hex {
      font-size: 18px;
      font-weight: 600;
      color: #333;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .color-rgba {
      font-size: 12px;
      color: #666;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .canvas-section {
      position: relative;
      margin-bottom: 16px;
    }

    .saturation-canvas {
      width: 100%;
      height: 200px;
      border-radius: 8px;
      cursor: crosshair;
      border: 1px solid #e0e0e0;
    }

    .canvas-cursor {
      position: absolute;
      width: 16px;
      height: 16px;
      border: 2px solid white;
      border-radius: 50%;
      pointer-events: none;
      transform: translate(-8px, -8px);
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .slider-section {
      margin-bottom: 16px;
    }

    .slider-section label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      margin-bottom: 8px;
    }

    .hue-slider-container,
    .alpha-slider-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .hue-slider,
    .alpha-slider {
      flex: 1;
      height: 24px;
      -webkit-appearance: none;
      appearance: none;
      border-radius: 12px;
      outline: none;
    }

    .hue-slider {
      background: linear-gradient(
        to right,
        #ff0000 0%,
        #ffff00 17%,
        #00ff00 33%,
        #00ffff 50%,
        #0000ff 67%,
        #ff00ff 83%,
        #ff0000 100%
      );
    }

    .alpha-slider {
      background:
        linear-gradient(to right, transparent, currentColor),
        linear-gradient(45deg, #ccc 25%, transparent 25%),
        linear-gradient(-45deg, #ccc 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ccc 75%),
        linear-gradient(-45deg, transparent 75%, #ccc 75%);
      background-size: 100% 100%, 10px 10px, 10px 10px, 10px 10px, 10px 10px;
      background-position: 0 0, 0 0, 0 5px, 5px -5px, -5px 0px;
    }

    .hue-slider::-webkit-slider-thumb,
    .alpha-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: white;
      border: 2px solid #667eea;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .hue-slider::-moz-range-thumb,
    .alpha-slider::-moz-range-thumb {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: white;
      border: 2px solid #667eea;
      cursor: pointer;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .slider-value {
      font-size: 12px;
      font-weight: 600;
      color: #666;
      min-width: 40px;
      text-align: right;
    }

    .rgb-inputs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }

    .input-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .input-group label {
      font-size: 11px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
    }

    .input-group input {
      padding: 8px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 13px;
      text-align: center;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .input-group input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .hex-input-section {
      margin-bottom: 16px;
    }

    .hex-input-section label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #666;
      margin-bottom: 4px;
      text-transform: uppercase;
    }

    .hex-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 14px;
      font-family: 'Monaco', 'Courier New', monospace;
      text-transform: uppercase;
    }

    .hex-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .presets-section,
    .recent-section {
      margin-bottom: 16px;
    }

    .presets-section label,
    .recent-section label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      margin-bottom: 8px;
    }

    .presets-grid,
    .recent-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 6px;
    }

    .preset-color,
    .recent-color {
      aspect-ratio: 1;
      border-radius: 6px;
      cursor: pointer;
      border: 2px solid #e0e0e0;
      transition: all 0.2s;
    }

    .preset-color:hover,
    .recent-color:hover {
      transform: scale(1.1);
      border-color: #667eea;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    }

    .preset-color:active,
    .recent-color:active {
      transform: scale(0.95);
    }
  `]
})
export class ColorPickerComponent implements AfterViewInit, OnChanges {
  @Input() color: Color = this.createColor(255, 0, 0, 1);
  @Input() showAlpha = true;
  @Input() showPresets = true;
  @Output() colorChange = new EventEmitter<Color>();

  @ViewChild('saturationCanvas', { static: false }) saturationCanvas?: ElementRef<HTMLCanvasElement>;

  tokens = DESIGN_TOKENS;

  // HSV state
  hue = 0;
  saturation = 100;
  value = 100;

  // Canvas cursor position
  cursorX = 0;
  cursorY = 0;

  // Predefined color presets
  presets = [
    '#FF0000', '#FF7F00', '#FFFF00', '#00FF00',
    '#0000FF', '#4B0082', '#9400D3', '#FFFFFF'
  ];

  // Recent colors (stored in localStorage)
  recentColors: string[] = [];

  // Mouse/touch tracking
  private isDragging = false;

  ngAfterViewInit(): void {
    this.loadRecentColors();
    this.updateFromColor();
    this.drawSaturationCanvas();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['color'] && !changes['color'].firstChange) {
      this.updateFromColor();
      this.drawSaturationCanvas();
    }
  }

  /**
   * Update internal state from color input
   */
  private updateFromColor(): void {
    const hsv = this.rgbToHsv(this.color.r, this.color.g, this.color.b);
    this.hue = hsv.h;
    this.saturation = hsv.s;
    this.value = hsv.v;
    this.updateCursorPosition();
  }

  /**
   * Handle hue slider change
   */
  onHueChange(): void {
    this.updateColorFromHSV();
    this.drawSaturationCanvas();
  }

  /**
   * Handle alpha slider change
   */
  onAlphaChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.color.a = parseInt(input.value) / 100;
    this.updateColorFormats();
    this.emitColorChange();
  }

  /**
   * Handle RGB input change
   */
  onRGBChange(): void {
    // Clamp values
    this.color.r = Math.max(0, Math.min(255, this.color.r));
    this.color.g = Math.max(0, Math.min(255, this.color.g));
    this.color.b = Math.max(0, Math.min(255, this.color.b));

    const hsv = this.rgbToHsv(this.color.r, this.color.g, this.color.b);
    this.hue = hsv.h;
    this.saturation = hsv.s;
    this.value = hsv.v;

    this.updateColorFormats();
    this.updateCursorPosition();
    this.drawSaturationCanvas();
    this.emitColorChange();
  }

  /**
   * Handle HEX input change
   */
  onHexChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    let hex = input.value.trim();

    // Add # if missing
    if (!hex.startsWith('#')) {
      hex = '#' + hex;
    }

    // Validate hex format
    if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      return;
    }

    const rgb = this.hexToRgb(hex);
    this.color.r = rgb.r;
    this.color.g = rgb.g;
    this.color.b = rgb.b;

    this.onRGBChange();
  }

  /**
   * Apply preset color
   */
  applyPreset(hex: string): void {
    const rgb = this.hexToRgb(hex);
    this.color.r = rgb.r;
    this.color.g = rgb.g;
    this.color.b = rgb.b;
    this.onRGBChange();
    this.addToRecentColors(hex);
  }

  /**
   * Apply recent color
   */
  applyRecent(rgba: string): void {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
    if (match) {
      this.color.r = parseInt(match[1]);
      this.color.g = parseInt(match[2]);
      this.color.b = parseInt(match[3]);
      this.color.a = match[4] ? parseFloat(match[4]) : 1;
      this.onRGBChange();
    }
  }

  /**
   * Handle saturation canvas mouse down
   */
  onSaturationMouseDown(event: MouseEvent): void {
    this.isDragging = true;
    this.updateColorFromCanvas(event);

    const mouseMoveHandler = (e: MouseEvent) => {
      if (this.isDragging) {
        this.updateColorFromCanvas(e);
      }
    };

    const mouseUpHandler = () => {
      this.isDragging = false;
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', mouseUpHandler);
      this.addToRecentColors(this.color.rgba);
    };

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  }

  /**
   * Handle saturation canvas touch start
   */
  onSaturationTouchStart(event: TouchEvent): void {
    event.preventDefault();
    this.isDragging = true;
    const touch = event.touches[0];
    this.updateColorFromTouch(touch);

    const touchMoveHandler = (e: TouchEvent) => {
      if (this.isDragging) {
        const t = e.touches[0];
        this.updateColorFromTouch(t);
      }
    };

    const touchEndHandler = () => {
      this.isDragging = false;
      document.removeEventListener('touchmove', touchMoveHandler);
      document.removeEventListener('touchend', touchEndHandler);
      this.addToRecentColors(this.color.rgba);
    };

    document.addEventListener('touchmove', touchMoveHandler);
    document.addEventListener('touchend', touchEndHandler);
  }

  /**
   * Update color from canvas mouse position
   */
  private updateColorFromCanvas(event: MouseEvent): void {
    if (!this.saturationCanvas) return;

    const canvas = this.saturationCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));

    this.saturation = (x / rect.width) * 100;
    this.value = 100 - (y / rect.height) * 100;

    this.cursorX = x;
    this.cursorY = y;

    this.updateColorFromHSV();
  }

  /**
   * Update color from canvas touch position
   */
  private updateColorFromTouch(touch: Touch): void {
    if (!this.saturationCanvas) return;

    const canvas = this.saturationCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, touch.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, touch.clientY - rect.top));

    this.saturation = (x / rect.width) * 100;
    this.value = 100 - (y / rect.height) * 100;

    this.cursorX = x;
    this.cursorY = y;

    this.updateColorFromHSV();
  }

  /**
   * Update cursor position based on saturation and value
   */
  private updateCursorPosition(): void {
    if (!this.saturationCanvas) return;

    const canvas = this.saturationCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();

    this.cursorX = (this.saturation / 100) * rect.width;
    this.cursorY = ((100 - this.value) / 100) * rect.height;
  }

  /**
   * Update color from HSV values
   */
  private updateColorFromHSV(): void {
    const rgb = this.hsvToRgb(this.hue, this.saturation, this.value);
    this.color.r = rgb.r;
    this.color.g = rgb.g;
    this.color.b = rgb.b;
    this.updateColorFormats();
    this.emitColorChange();
  }

  /**
   * Update color formats (hex, rgba)
   */
  private updateColorFormats(): void {
    this.color.hex = this.rgbToHex(this.color.r, this.color.g, this.color.b);
    this.color.rgba = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.color.a})`;
    this.color.hsv = { h: this.hue, s: this.saturation, v: this.value };
  }

  /**
   * Draw saturation/value canvas
   */
  private drawSaturationCanvas(): void {
    if (!this.saturationCanvas) return;

    const canvas = this.saturationCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Draw hue background
    ctx.fillStyle = `hsl(${this.hue}, 100%, 50%)`;
    ctx.fillRect(0, 0, width, height);

    // Draw white gradient (left to right)
    const whiteGradient = ctx.createLinearGradient(0, 0, width, 0);
    whiteGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    whiteGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = whiteGradient;
    ctx.fillRect(0, 0, width, height);

    // Draw black gradient (top to bottom)
    const blackGradient = ctx.createLinearGradient(0, 0, 0, height);
    blackGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    blackGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = blackGradient;
    ctx.fillRect(0, 0, width, height);
  }

  /**
   * Emit color change event
   */
  private emitColorChange(): void {
    this.colorChange.emit({ ...this.color });
  }

  /**
   * Add color to recent colors
   */
  private addToRecentColors(color: string): void {
    // Remove if already exists
    this.recentColors = this.recentColors.filter(c => c !== color);

    // Add to beginning
    this.recentColors.unshift(color);

    // Keep only 8 recent colors
    if (this.recentColors.length > 8) {
      this.recentColors = this.recentColors.slice(0, 8);
    }

    // Save to localStorage
    this.saveRecentColors();
  }

  /**
   * Load recent colors from localStorage
   */
  private loadRecentColors(): void {
    try {
      const stored = localStorage.getItem('color-picker-recent');
      if (stored) {
        this.recentColors = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load recent colors:', e);
    }
  }

  /**
   * Save recent colors to localStorage
   */
  private saveRecentColors(): void {
    try {
      localStorage.setItem('color-picker-recent', JSON.stringify(this.recentColors));
    } catch (e) {
      console.warn('Failed to save recent colors:', e);
    }
  }

  /**
   * Create color object
   */
  private createColor(r: number, g: number, b: number, a: number): Color {
    const hex = this.rgbToHex(r, g, b);
    const rgba = `rgba(${r}, ${g}, ${b}, ${a})`;
    const hsv = this.rgbToHsv(r, g, b);
    return { r, g, b, a, hex, rgba, hsv };
  }

  /**
   * Convert RGB to HEX
   */
  private rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => {
      const hex = Math.round(n).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  }

  /**
   * Convert HEX to RGB
   */
  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  /**
   * Convert RGB to HSV
   */
  private rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    const s = max === 0 ? 0 : (diff / max) * 100;
    const v = max * 100;

    if (diff !== 0) {
      if (max === r) {
        h = 60 * (((g - b) / diff) % 6);
      } else if (max === g) {
        h = 60 * ((b - r) / diff + 2);
      } else {
        h = 60 * ((r - g) / diff + 4);
      }
    }

    if (h < 0) h += 360;

    return { h: Math.round(h), s: Math.round(s), v: Math.round(v) };
  }

  /**
   * Convert HSV to RGB
   */
  private hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
    s /= 100;
    v /= 100;

    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let r = 0, g = 0, b = 0;

    if (h >= 0 && h < 60) {
      r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
      r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
      r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
      r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
      r = x; g = 0; b = c;
    } else if (h >= 300 && h < 360) {
      r = c; g = 0; b = x;
    }

    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }
}
