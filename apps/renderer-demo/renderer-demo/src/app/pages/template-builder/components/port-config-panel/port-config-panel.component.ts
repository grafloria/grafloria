import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../shared/components/button/button.component';

/**
 * Port Configuration
 */
export interface PortConfig {
  enabled: boolean;
  type?: 'input' | 'output' | 'both';
  maxConnections?: number;
}

/**
 * Ports Configuration
 */
export interface PortsConfig {
  enabled?: boolean;
  defaultVisibility?: 'always' | 'on-hover' | 'never';
  left?: PortConfig;
  right?: PortConfig;
  top?: PortConfig;
  bottom?: PortConfig;
}

/**
 * Port Configuration Panel Component
 *
 * Visual editor for configuring node ports without JSON.
 * Features:
 * - Visual port toggles (4 sides)
 * - Port type selector (input/output/both)
 * - Visibility mode
 * - Max connections
 * - Port preview overlay
 *
 * Usage:
 * <app-port-config-panel
 *   [portsConfig]="currentPorts"
 *   (portsConfigChange)="onPortsChange($event)">
 * </app-port-config-panel>
 */
@Component({
  selector: 'app-port-config-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  template: `
    <div class="port-config-panel">
      <!-- Header -->
      <div class="panel-header">
        <h3 class="panel-title">Port Configuration</h3>
        <div class="panel-actions">
          <app-button
            variant="ghost"
            size="sm"
            [icon]="previewMode ? '👁️' : '👁️‍🗨️'"
            (clicked)="togglePreview()">
            {{ previewMode ? 'Hide' : 'Show' }} Preview
          </app-button>
        </div>
      </div>

      <!-- Global Settings -->
      <div class="config-section">
        <div class="section-header">Global Settings</div>

        <div class="config-row">
          <label class="config-label">
            <input
              type="checkbox"
              [(ngModel)]="localConfig.enabled"
              (ngModelChange)="emitChange()"
              class="config-checkbox">
            <span>Enable Ports</span>
          </label>
        </div>

        <div class="config-row" *ngIf="localConfig.enabled">
          <label class="config-label">Visibility:</label>
          <select
            [(ngModel)]="localConfig.defaultVisibility"
            (ngModelChange)="emitChange()"
            class="config-select">
            <option value="always">Always Visible</option>
            <option value="on-hover">On Hover</option>
            <option value="never">Never (Hidden)</option>
          </select>
        </div>
      </div>

      <!-- Visual Port Selector -->
      <div class="config-section" *ngIf="localConfig.enabled">
        <div class="section-header">Port Positions</div>

        <div class="port-visual">
          <!-- Top Port -->
          <div class="port-button port-top">
            <button
              class="port-toggle"
              [class.active]="localConfig.top?.enabled"
              (click)="togglePort('top')"
              title="Toggle top port">
              {{ localConfig.top?.enabled ? '🟢' : '⚪' }}
            </button>
            <span class="port-label">Top</span>
          </div>

          <!-- Left and Right Ports -->
          <div class="port-middle">
            <div class="port-button port-left">
              <button
                class="port-toggle"
                [class.active]="localConfig.left?.enabled"
                (click)="togglePort('left')"
                title="Toggle left port">
                {{ localConfig.left?.enabled ? '🟢' : '⚪' }}
              </button>
              <span class="port-label">Left</span>
            </div>

            <div class="port-center">
              <div class="port-node-visual">
                NODE
              </div>
            </div>

            <div class="port-button port-right">
              <button
                class="port-toggle"
                [class.active]="localConfig.right?.enabled"
                (click)="togglePort('right')"
                title="Toggle right port">
                {{ localConfig.right?.enabled ? '🟢' : '⚪' }}
              </button>
              <span class="port-label">Right</span>
            </div>
          </div>

          <!-- Bottom Port -->
          <div class="port-button port-bottom">
            <button
              class="port-toggle"
              [class.active]="localConfig.bottom?.enabled"
              (click)="togglePort('bottom')"
              title="Toggle bottom port">
              {{ localConfig.bottom?.enabled ? '🟢' : '⚪' }}
            </button>
            <span class="port-label">Bottom</span>
          </div>
        </div>
      </div>

      <!-- Port Details -->
      <div class="config-section" *ngIf="localConfig.enabled && selectedPort">
        <div class="section-header">
          {{ selectedPort | titlecase }} Port Settings
        </div>

        <div class="config-row">
          <label class="config-label">Type:</label>
          <select
            [(ngModel)]="getPortConfig(selectedPort).type"
            (ngModelChange)="emitChange()"
            class="config-select">
            <option value="input">Input (receives)</option>
            <option value="output">Output (sends)</option>
            <option value="both">Both (bidirectional)</option>
          </select>
        </div>

        <div class="config-row">
          <label class="config-label">Max Connections:</label>
          <input
            type="number"
            [(ngModel)]="getPortConfig(selectedPort).maxConnections"
            (ngModelChange)="emitChange()"
            min="1"
            max="999"
            class="config-input"
            placeholder="Unlimited">
        </div>
      </div>

      <!-- Port Presets -->
      <div class="config-section" *ngIf="localConfig.enabled">
        <div class="section-header">Quick Presets</div>

        <div class="preset-buttons">
          <app-button
            variant="secondary"
            size="sm"
            (clicked)="applyPreset('horizontal')">
            Horizontal Flow
          </app-button>
          <app-button
            variant="secondary"
            size="sm"
            (clicked)="applyPreset('vertical')">
            Vertical Flow
          </app-button>
          <app-button
            variant="secondary"
            size="sm"
            (clicked)="applyPreset('all')">
            All Sides
          </app-button>
          <app-button
            variant="secondary"
            size="sm"
            (clicked)="applyPreset('none')">
            None
          </app-button>
        </div>
      </div>

      <!-- Port Summary -->
      <div class="port-summary" *ngIf="localConfig.enabled">
        <div class="summary-title">Active Ports</div>
        <div class="summary-content">
          <span *ngIf="!hasAnyPort()" class="summary-empty">No ports enabled</span>
          <div *ngIf="localConfig.left?.enabled" class="summary-item">
            <span class="summary-position">Left</span>
            <span class="summary-type">{{ getPortConfig('left').type || 'input' }}</span>
          </div>
          <div *ngIf="localConfig.right?.enabled" class="summary-item">
            <span class="summary-position">Right</span>
            <span class="summary-type">{{ getPortConfig('right').type || 'output' }}</span>
          </div>
          <div *ngIf="localConfig.top?.enabled" class="summary-item">
            <span class="summary-position">Top</span>
            <span class="summary-type">{{ getPortConfig('top').type || 'input' }}</span>
          </div>
          <div *ngIf="localConfig.bottom?.enabled" class="summary-item">
            <span class="summary-position">Bottom</span>
            <span class="summary-type">{{ getPortConfig('bottom').type || 'output' }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .port-config-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
      border-radius: 8px;
      overflow-y: auto;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
      position: sticky;
      top: 0;
      z-index: 10;
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

    .config-section {
      padding: 16px;
      border-bottom: 1px solid #e5e7eb;
    }

    .section-header {
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .config-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .config-row:last-child {
      margin-bottom: 0;
    }

    .config-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.875rem;
      color: #374151;
      cursor: pointer;
      user-select: none;
      min-width: 120px;
    }

    .config-checkbox {
      cursor: pointer;
    }

    .config-select, .config-input {
      flex: 1;
      padding: 6px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.875rem;
      background: white;
    }

    .config-select {
      cursor: pointer;
    }

    .config-select:focus, .config-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .config-input[type="number"] {
      max-width: 120px;
    }

    /* Visual Port Selector */
    .port-visual {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 20px;
      background: #f9fafb;
      border-radius: 8px;
      border: 2px dashed #d1d5db;
    }

    .port-button {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .port-toggle {
      width: 40px;
      height: 40px;
      border: 2px solid #d1d5db;
      border-radius: 50%;
      background: white;
      cursor: pointer;
      font-size: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 150ms ease;
    }

    .port-toggle:hover {
      border-color: #667eea;
      transform: scale(1.1);
    }

    .port-toggle.active {
      border-color: #10b981;
      background: #f0fdf4;
    }

    .port-label {
      font-size: 0.75rem;
      color: #6b7280;
      font-weight: 500;
    }

    .port-middle {
      display: flex;
      align-items: center;
      gap: 20px;
      width: 100%;
      justify-content: space-between;
    }

    .port-center {
      flex: 1;
      display: flex;
      justify-content: center;
    }

    .port-node-visual {
      width: 100px;
      height: 60px;
      border: 2px solid #667eea;
      border-radius: 8px;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 600;
      color: #667eea;
    }

    /* Preset Buttons */
    .preset-buttons {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }

    /* Port Summary */
    .port-summary {
      padding: 16px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
    }

    .summary-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 12px;
    }

    .summary-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .summary-empty {
      font-size: 0.875rem;
      color: #9ca3af;
      font-style: italic;
    }

    .summary-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: white;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }

    .summary-position {
      font-size: 0.875rem;
      font-weight: 600;
      color: #111827;
    }

    .summary-type {
      font-size: 0.75rem;
      color: #6b7280;
      background: #f3f4f6;
      padding: 2px 8px;
      border-radius: 4px;
    }
  `]
})
export class PortConfigPanelComponent implements OnChanges {
  @Input() portsConfig: PortsConfig = { enabled: false };
  @Output() portsConfigChange = new EventEmitter<PortsConfig>();

  localConfig: PortsConfig = { enabled: false };
  selectedPort: 'left' | 'right' | 'top' | 'bottom' | null = null;
  previewMode = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['portsConfig']) {
      this.localConfig = JSON.parse(JSON.stringify(this.portsConfig || { enabled: false }));
      this.ensurePortConfigs();
    }
  }

  /**
   * Ensure all port configs exist
   */
  private ensurePortConfigs(): void {
    if (!this.localConfig.left) {
      this.localConfig.left = { enabled: false, type: 'input' };
    }
    if (!this.localConfig.right) {
      this.localConfig.right = { enabled: false, type: 'output' };
    }
    if (!this.localConfig.top) {
      this.localConfig.top = { enabled: false, type: 'input' };
    }
    if (!this.localConfig.bottom) {
      this.localConfig.bottom = { enabled: false, type: 'output' };
    }
  }

  /**
   * Toggle a port
   */
  togglePort(position: 'left' | 'right' | 'top' | 'bottom'): void {
    const port = this.getPortConfig(position);
    port.enabled = !port.enabled;

    if (port.enabled) {
      this.selectedPort = position;
    } else if (this.selectedPort === position) {
      this.selectedPort = this.getFirstEnabledPort();
    }

    this.emitChange();
  }

  /**
   * Get port configuration
   */
  getPortConfig(position: 'left' | 'right' | 'top' | 'bottom'): PortConfig {
    if (!this.localConfig[position]) {
      const defaultType = (position === 'left' || position === 'top') ? 'input' : 'output';
      this.localConfig[position] = { enabled: false, type: defaultType };
    }
    return this.localConfig[position]!;
  }

  /**
   * Get first enabled port
   */
  private getFirstEnabledPort(): 'left' | 'right' | 'top' | 'bottom' | null {
    const positions: Array<'left' | 'right' | 'top' | 'bottom'> = ['left', 'right', 'top', 'bottom'];
    for (const pos of positions) {
      if (this.localConfig[pos]?.enabled) {
        return pos;
      }
    }
    return null;
  }

  /**
   * Check if any port is enabled
   */
  hasAnyPort(): boolean {
    return !!(
      this.localConfig.left?.enabled ||
      this.localConfig.right?.enabled ||
      this.localConfig.top?.enabled ||
      this.localConfig.bottom?.enabled
    );
  }

  /**
   * Apply a preset
   */
  applyPreset(preset: 'horizontal' | 'vertical' | 'all' | 'none'): void {
    this.ensurePortConfigs();

    switch (preset) {
      case 'horizontal':
        this.localConfig.left!.enabled = true;
        this.localConfig.left!.type = 'input';
        this.localConfig.right!.enabled = true;
        this.localConfig.right!.type = 'output';
        this.localConfig.top!.enabled = false;
        this.localConfig.bottom!.enabled = false;
        this.selectedPort = 'left';
        break;

      case 'vertical':
        this.localConfig.top!.enabled = true;
        this.localConfig.top!.type = 'input';
        this.localConfig.bottom!.enabled = true;
        this.localConfig.bottom!.type = 'output';
        this.localConfig.left!.enabled = false;
        this.localConfig.right!.enabled = false;
        this.selectedPort = 'top';
        break;

      case 'all':
        this.localConfig.left!.enabled = true;
        this.localConfig.left!.type = 'input';
        this.localConfig.right!.enabled = true;
        this.localConfig.right!.type = 'output';
        this.localConfig.top!.enabled = true;
        this.localConfig.top!.type = 'both';
        this.localConfig.bottom!.enabled = true;
        this.localConfig.bottom!.type = 'both';
        this.selectedPort = 'left';
        break;

      case 'none':
        this.localConfig.left!.enabled = false;
        this.localConfig.right!.enabled = false;
        this.localConfig.top!.enabled = false;
        this.localConfig.bottom!.enabled = false;
        this.selectedPort = null;
        break;
    }

    this.emitChange();
  }

  /**
   * Toggle preview mode
   */
  togglePreview(): void {
    this.previewMode = !this.previewMode;
    // In real implementation, this would show/hide port overlay on preview
  }

  /**
   * Emit configuration change
   */
  emitChange(): void {
    this.portsConfigChange.emit(JSON.parse(JSON.stringify(this.localConfig)));
  }
}
