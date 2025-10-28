import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

/**
 * Spacing configuration
 */
export interface SpacingConfig {
  // Padding
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  paddingLinked: boolean;

  // Margin
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  marginLinked: boolean;

  // Unit
  unit: 'px' | 'rem' | '%';

  // CSS output
  cssStyles: string;
}

/**
 * Spacing Editor Component
 *
 * A visual spacing (padding/margin) editor with:
 * - Individual side controls (top, right, bottom, left)
 * - Linked/unlinked mode (edit all sides at once)
 * - Visual box model preview
 * - Unit selector (px, rem, %)
 * - Quick presets (no spacing, small, medium, large)
 * - Live CSS output
 * - Reset functionality
 *
 * Usage:
 * ```html
 * <app-spacing-editor
 *   [spacing]="currentSpacing"
 *   (spacingChange)="onSpacingChange($event)">
 * </app-spacing-editor>
 * ```
 */
@Component({
  selector: 'app-spacing-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="spacing-editor" [style.font-family]="tokens.typography.fontFamily">
      <!-- Editor Header -->
      <div class="editor-header">
        <h3>Spacing Editor</h3>
        <div class="header-actions">
          <select [(ngModel)]="spacing.unit" (change)="updateCSS()" class="unit-selector">
            <option value="px">px</option>
            <option value="rem">rem</option>
            <option value="%">%</option>
          </select>
          <button class="reset-btn" (click)="resetSpacing()" title="Reset">
            ↺
          </button>
        </div>
      </div>

      <!-- Visual Box Model -->
      <div class="box-model">
        <!-- Margin Layer -->
        <div class="margin-layer">
          <div class="margin-label">Margin</div>

          <!-- Margin Top -->
          <div class="margin-top">
            <input
              type="number"
              [(ngModel)]="spacing.marginTop"
              (input)="onMarginChange('top')"
              class="spacing-input"
            />
          </div>

          <!-- Margin Left -->
          <div class="margin-left">
            <input
              type="number"
              [(ngModel)]="spacing.marginLeft"
              (input)="onMarginChange('left')"
              class="spacing-input"
            />
          </div>

          <!-- Margin Right -->
          <div class="margin-right">
            <input
              type="number"
              [(ngModel)]="spacing.marginRight"
              (input)="onMarginChange('right')"
              class="spacing-input"
            />
          </div>

          <!-- Margin Bottom -->
          <div class="margin-bottom">
            <input
              type="number"
              [(ngModel)]="spacing.marginBottom"
              (input)="onMarginChange('bottom')"
              class="spacing-input"
            />
          </div>

          <!-- Margin Link Toggle -->
          <button
            class="link-toggle margin-link"
            [class.linked]="spacing.marginLinked"
            (click)="toggleMarginLink()"
            [title]="spacing.marginLinked ? 'Unlink margins' : 'Link margins'"
          >
            {{ spacing.marginLinked ? '🔗' : '⛓️‍💥' }}
          </button>

          <!-- Padding Layer -->
          <div class="padding-layer">
            <div class="padding-label">Padding</div>

            <!-- Padding Top -->
            <div class="padding-top">
              <input
                type="number"
                [(ngModel)]="spacing.paddingTop"
                (input)="onPaddingChange('top')"
                class="spacing-input"
              />
            </div>

            <!-- Padding Left -->
            <div class="padding-left">
              <input
                type="number"
                [(ngModel)]="spacing.paddingLeft"
                (input)="onPaddingChange('left')"
                class="spacing-input"
              />
            </div>

            <!-- Padding Right -->
            <div class="padding-right">
              <input
                type="number"
                [(ngModel)]="spacing.paddingRight"
                (input)="onPaddingChange('right')"
                class="spacing-input"
              />
            </div>

            <!-- Padding Bottom -->
            <div class="padding-bottom">
              <input
                type="number"
                [(ngModel)]="spacing.paddingBottom"
                (input)="onPaddingChange('bottom')"
                class="spacing-input"
              />
            </div>

            <!-- Padding Link Toggle -->
            <button
              class="link-toggle padding-link"
              [class.linked]="spacing.paddingLinked"
              (click)="togglePaddingLink()"
              [title]="spacing.paddingLinked ? 'Unlink padding' : 'Link padding'"
            >
              {{ spacing.paddingLinked ? '🔗' : '⛓️‍💥' }}
            </button>

            <!-- Content Box -->
            <div class="content-box">
              <div class="content-label">Content</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Detailed Controls -->
      <div class="section">
        <label class="section-label">Padding</label>

        <!-- All Sides (if linked) -->
        <div class="control-group" *ngIf="spacing.paddingLinked">
          <label>All Sides</label>
          <div class="slider-control">
            <input
              type="range"
              min="0"
              max="64"
              [(ngModel)]="spacing.paddingTop"
              (input)="onPaddingChange('all')"
            />
            <input
              type="number"
              min="0"
              [(ngModel)]="spacing.paddingTop"
              (input)="onPaddingChange('all')"
              class="number-input"
            />
            <span class="unit">{{ spacing.unit }}</span>
          </div>
        </div>

        <!-- Individual Sides (if not linked) -->
        <div class="sides-grid" *ngIf="!spacing.paddingLinked">
          <div class="side-control">
            <label>Top</label>
            <input
              type="number"
              min="0"
              [(ngModel)]="spacing.paddingTop"
              (input)="updateCSS()"
              class="number-input"
            />
          </div>
          <div class="side-control">
            <label>Right</label>
            <input
              type="number"
              min="0"
              [(ngModel)]="spacing.paddingRight"
              (input)="updateCSS()"
              class="number-input"
            />
          </div>
          <div class="side-control">
            <label>Bottom</label>
            <input
              type="number"
              min="0"
              [(ngModel)]="spacing.paddingBottom"
              (input)="updateCSS()"
              class="number-input"
            />
          </div>
          <div class="side-control">
            <label>Left</label>
            <input
              type="number"
              min="0"
              [(ngModel)]="spacing.paddingLeft"
              (input)="updateCSS()"
              class="number-input"
            />
          </div>
        </div>
      </div>

      <div class="section">
        <label class="section-label">Margin</label>

        <!-- All Sides (if linked) -->
        <div class="control-group" *ngIf="spacing.marginLinked">
          <label>All Sides</label>
          <div class="slider-control">
            <input
              type="range"
              min="0"
              max="64"
              [(ngModel)]="spacing.marginTop"
              (input)="onMarginChange('all')"
            />
            <input
              type="number"
              min="0"
              [(ngModel)]="spacing.marginTop"
              (input)="onMarginChange('all')"
              class="number-input"
            />
            <span class="unit">{{ spacing.unit }}</span>
          </div>
        </div>

        <!-- Individual Sides (if not linked) -->
        <div class="sides-grid" *ngIf="!spacing.marginLinked">
          <div class="side-control">
            <label>Top</label>
            <input
              type="number"
              min="0"
              [(ngModel)]="spacing.marginTop"
              (input)="updateCSS()"
              class="number-input"
            />
          </div>
          <div class="side-control">
            <label>Right</label>
            <input
              type="number"
              min="0"
              [(ngModel)]="spacing.marginRight"
              (input)="updateCSS()"
              class="number-input"
            />
          </div>
          <div class="side-control">
            <label>Bottom</label>
            <input
              type="number"
              min="0"
              [(ngModel)]="spacing.marginBottom"
              (input)="updateCSS()"
              class="number-input"
            />
          </div>
          <div class="side-control">
            <label>Left</label>
            <input
              type="number"
              min="0"
              [(ngModel)]="spacing.marginLeft"
              (input)="updateCSS()"
              class="number-input"
            />
          </div>
        </div>
      </div>

      <!-- Quick Presets -->
      <div class="section">
        <label class="section-label">Quick Presets</label>
        <div class="presets-grid">
          <button
            *ngFor="let preset of presets"
            class="preset-btn"
            (click)="applyPreset(preset)"
          >
            {{ preset.name }}
          </button>
        </div>
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
          [value]="spacing.cssStyles"
          rows="4"
        ></textarea>
      </div>
    </div>
  `,
  styles: [`
    .spacing-editor {
      padding: 16px;
      background: white;
      border-radius: 8px;
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

    .header-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .unit-selector {
      padding: 6px 10px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 12px;
      background: white;
      cursor: pointer;
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

    .box-model {
      margin-bottom: 24px;
      padding: 12px;
      background: #f9f9f9;
      border-radius: 8px;
    }

    .margin-layer {
      position: relative;
      padding: 40px;
      background: #ffeaa7;
      border-radius: 8px;
      border: 2px dashed #fdcb6e;
    }

    .margin-label {
      position: absolute;
      top: 8px;
      left: 8px;
      font-size: 10px;
      font-weight: 600;
      color: #d63031;
      text-transform: uppercase;
    }

    .margin-top,
    .margin-right,
    .margin-bottom,
    .margin-left {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .margin-top {
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
    }

    .margin-right {
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
    }

    .margin-bottom {
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
    }

    .margin-left {
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
    }

    .margin-link {
      position: absolute;
      bottom: 8px;
      right: 8px;
    }

    .padding-layer {
      position: relative;
      padding: 40px;
      background: #a8e6cf;
      border-radius: 6px;
      border: 2px dashed #52c082;
    }

    .padding-label {
      position: absolute;
      top: 8px;
      left: 8px;
      font-size: 10px;
      font-weight: 600;
      color: #00b894;
      text-transform: uppercase;
    }

    .padding-top,
    .padding-right,
    .padding-bottom,
    .padding-left {
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .padding-top {
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
    }

    .padding-right {
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
    }

    .padding-bottom {
      bottom: 8px;
      left: 50%;
      transform: translateX(-50%);
    }

    .padding-left {
      left: 8px;
      top: 50%;
      transform: translateY(-50%);
    }

    .padding-link {
      position: absolute;
      bottom: 8px;
      right: 8px;
    }

    .content-box {
      background: #74b9ff;
      border-radius: 4px;
      border: 2px dashed #0984e3;
      min-height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .content-label {
      font-size: 12px;
      font-weight: 600;
      color: #0984e3;
      text-transform: uppercase;
    }

    .spacing-input {
      width: 40px;
      padding: 4px 6px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 11px;
      text-align: center;
      background: white;
      font-family: 'Monaco', 'Courier New', monospace;
    }

    .spacing-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
    }

    .link-toggle {
      width: 24px;
      height: 24px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }

    .link-toggle:hover {
      background: #f0f0f0;
      border-color: #667eea;
    }

    .link-toggle.linked {
      background: #667eea;
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
      min-width: 32px;
    }

    .sides-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .side-control {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .side-control label {
      font-size: 11px;
      font-weight: 600;
      color: #666;
    }

    .presets-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }

    .preset-btn {
      padding: 10px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.2s;
    }

    .preset-btn:hover {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
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
  `]
})
export class SpacingEditorComponent implements OnInit {
  @Input() spacing: SpacingConfig = this.createDefaultSpacing();
  @Output() spacingChange = new EventEmitter<SpacingConfig>();

  tokens = DESIGN_TOKENS;

  presets = [
    { name: 'None', padding: 0, margin: 0 },
    { name: 'Small', padding: 8, margin: 8 },
    { name: 'Medium', padding: 16, margin: 16 },
    { name: 'Large', padding: 24, margin: 24 }
  ];

  ngOnInit(): void {
    this.updateCSS();
  }

  /**
   * Toggle padding link
   */
  togglePaddingLink(): void {
    this.spacing.paddingLinked = !this.spacing.paddingLinked;
  }

  /**
   * Toggle margin link
   */
  toggleMarginLink(): void {
    this.spacing.marginLinked = !this.spacing.marginLinked;
  }

  /**
   * Handle padding change
   */
  onPaddingChange(side: 'top' | 'right' | 'bottom' | 'left' | 'all'): void {
    if (this.spacing.paddingLinked || side === 'all') {
      const value = this.spacing.paddingTop;
      this.spacing.paddingRight = value;
      this.spacing.paddingBottom = value;
      this.spacing.paddingLeft = value;
    }
    this.updateCSS();
  }

  /**
   * Handle margin change
   */
  onMarginChange(side: 'top' | 'right' | 'bottom' | 'left' | 'all'): void {
    if (this.spacing.marginLinked || side === 'all') {
      const value = this.spacing.marginTop;
      this.spacing.marginRight = value;
      this.spacing.marginBottom = value;
      this.spacing.marginLeft = value;
    }
    this.updateCSS();
  }

  /**
   * Apply preset
   */
  applyPreset(preset: { name: string; padding: number; margin: number }): void {
    this.spacing.paddingTop = preset.padding;
    this.spacing.paddingRight = preset.padding;
    this.spacing.paddingBottom = preset.padding;
    this.spacing.paddingLeft = preset.padding;
    this.spacing.marginTop = preset.margin;
    this.spacing.marginRight = preset.margin;
    this.spacing.marginBottom = preset.margin;
    this.spacing.marginLeft = preset.margin;
    this.updateCSS();
  }

  /**
   * Reset spacing
   */
  resetSpacing(): void {
    this.spacing = this.createDefaultSpacing();
    this.updateCSS();
  }

  /**
   * Copy CSS to clipboard
   */
  copyCSSToClipboard(): void {
    navigator.clipboard.writeText(this.spacing.cssStyles).then(() => {
      console.log('CSS copied to clipboard');
    });
  }

  /**
   * Update CSS styles
   */
  updateCSS(): void {
    const styles: string[] = [];
    const unit = this.spacing.unit;

    // Padding
    if (
      this.spacing.paddingTop === this.spacing.paddingRight &&
      this.spacing.paddingRight === this.spacing.paddingBottom &&
      this.spacing.paddingBottom === this.spacing.paddingLeft
    ) {
      styles.push(`padding: ${this.spacing.paddingTop}${unit}`);
    } else {
      styles.push(`padding: ${this.spacing.paddingTop}${unit} ${this.spacing.paddingRight}${unit} ${this.spacing.paddingBottom}${unit} ${this.spacing.paddingLeft}${unit}`);
    }

    // Margin
    if (
      this.spacing.marginTop === this.spacing.marginRight &&
      this.spacing.marginRight === this.spacing.marginBottom &&
      this.spacing.marginBottom === this.spacing.marginLeft
    ) {
      styles.push(`margin: ${this.spacing.marginTop}${unit}`);
    } else {
      styles.push(`margin: ${this.spacing.marginTop}${unit} ${this.spacing.marginRight}${unit} ${this.spacing.marginBottom}${unit} ${this.spacing.marginLeft}${unit}`);
    }

    this.spacing.cssStyles = styles.join('; ') + ';';
    this.spacingChange.emit(this.spacing);
  }

  /**
   * Create default spacing
   */
  private createDefaultSpacing(): SpacingConfig {
    return {
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
      paddingLinked: true,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginLinked: true,
      unit: 'px',
      cssStyles: ''
    };
  }
}
