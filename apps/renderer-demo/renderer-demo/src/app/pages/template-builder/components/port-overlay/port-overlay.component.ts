import { Component, Input, OnChanges, SimpleChanges, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NodeTemplate } from '@grafloria/engine';
import { PortAlignmentHelperService, PortPosition } from '../../services/port-alignment-helper.service';

/**
 * Port Overlay Component
 *
 * Visual overlay showing port positions on the preview panel.
 * Provides visual indicators for enabled ports and generates
 * CSS for aligning HTML elements with ports.
 *
 * Features:
 * - Port position indicators
 * - Hover tooltips
 * - Toggle visibility
 * - Keyboard shortcut (Ctrl+Shift+O)
 * - JSON-aware updates
 *
 * ~150 lines
 */
@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-port-overlay',
  template: `
    <div class="port-overlay" *ngIf="isVisible && portPositions.length > 0">
      <!-- Port Indicators -->
      <div
        *ngFor="let port of portPositions"
        class="port-indicator"
        [class.input-port]="port.type === 'input'"
        [class.output-port]="port.type === 'output'"
        [class.both-port]="port.type === 'both'"
        [class.hover-only]="port.visibility === 'hover'"
        [class.hidden-port]="port.visibility === 'never'"
        [style.left.px]="port.x - 8"
        [style.top.px]="port.y - 8"
        [title]="getPortTooltip(port)"
        (click)="onPortClick(port)">
        <div class="port-dot"></div>
        <div class="port-label">{{ port.side }}</div>
      </div>

      <!-- Grid Lines (optional) -->
      <div class="grid-lines" *ngIf="showGrid">
        <svg width="100%" height="100%">
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,0,0,0.05)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
    </div>

    <!-- Toggle Button -->
    <button
      class="toggle-overlay-btn"
      [class.active]="isVisible"
      (click)="toggleOverlay()"
      title="Toggle Port Overlay (Ctrl+Shift+O)">
      <span class="icon">🎯</span>
      <span class="label">{{ isVisible ? 'Hide' : 'Show' }} Ports</span>
    </button>

    <!-- Port Info Panel -->
    <div class="port-info-panel" *ngIf="isVisible && selectedPort">
      <div class="info-header">
        <h4>{{ selectedPort.side.toUpperCase() }} Port</h4>
        <button class="close-btn" (click)="clearSelection()">×</button>
      </div>
      <div class="info-content">
        <div class="info-row">
          <span class="label">Type:</span>
          <span class="value type-badge" [class]="selectedPort.type">
            {{ portHelper.getPortTypeLabel(selectedPort.type) }}
          </span>
        </div>
        <div class="info-row">
          <span class="label">Position:</span>
          <span class="value">x: {{ selectedPort.x }}px, y: {{ selectedPort.y }}px</span>
        </div>
        <div class="info-row">
          <span class="label">Visibility:</span>
          <span class="value">{{ portHelper.getPortVisibilityLabel(selectedPort.visibility) }}</span>
        </div>
        <div class="css-section">
          <div class="section-title">Alignment CSS:</div>
          <pre class="css-code">{{ getAlignmentCSS() }}</pre>
          <button class="copy-btn" (click)="copyCSS()" title="Copy CSS">
            📋 Copy
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .port-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 50;
    }

    .port-indicator {
      position: absolute;
      width: 16px;
      height: 16px;
      pointer-events: all;
      cursor: pointer;
      transition: transform 0.2s, opacity 0.2s;
    }

    .port-indicator:hover {
      transform: scale(1.3);
      z-index: 60;
    }

    .port-dot {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      transition: all 0.2s;
    }

    .port-indicator.input-port .port-dot {
      background: #10b981;
    }

    .port-indicator.output-port .port-dot {
      background: #3b82f6;
    }

    .port-indicator.both-port .port-dot {
      background: #8b5cf6;
    }

    .port-indicator.hover-only {
      opacity: 0.5;
    }

    .port-indicator.hover-only:hover {
      opacity: 1;
    }

    .port-indicator.hidden-port {
      opacity: 0.25;
    }

    .port-label {
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      white-space: nowrap;
      opacity: 0;
      transition: opacity 0.2s;
      pointer-events: none;
    }

    .port-indicator:hover .port-label {
      opacity: 1;
    }

    .grid-lines {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .toggle-overlay-btn {
      position: absolute;
      bottom: 16px;
      right: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      z-index: 100;
    }

    .toggle-overlay-btn:hover {
      background: #f5f5f5;
      border-color: #667eea;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    .toggle-overlay-btn.active {
      background: #667eea;
      color: white;
      border-color: #667eea;
    }

    .toggle-overlay-btn .icon {
      font-size: 16px;
    }

    .port-info-panel {
      position: absolute;
      bottom: 70px;
      right: 16px;
      width: 300px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 100;
      overflow: hidden;
    }

    .info-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
    }

    .info-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #333;
    }

    .close-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      font-size: 20px;
      color: #666;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: #e5e7eb;
      color: #333;
    }

    .info-content {
      padding: 16px;
    }

    .info-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .info-row .label {
      font-size: 12px;
      color: #666;
      font-weight: 600;
      min-width: 80px;
    }

    .info-row .value {
      font-size: 13px;
      color: #333;
    }

    .type-badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      color: white;
    }

    .type-badge.input {
      background: #10b981;
    }

    .type-badge.output {
      background: #3b82f6;
    }

    .type-badge.both {
      background: #8b5cf6;
    }

    .css-section {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .section-title {
      font-size: 12px;
      font-weight: 600;
      color: #666;
      margin-bottom: 8px;
    }

    .css-code {
      margin: 0;
      padding: 12px;
      background: #1e1e1e;
      color: #d4d4d4;
      border-radius: 4px;
      font-size: 11px;
      font-family: 'Courier New', monospace;
      overflow-x: auto;
      white-space: pre;
    }

    .copy-btn {
      margin-top: 8px;
      width: 100%;
      padding: 6px 12px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .copy-btn:hover {
      background: #5568d3;
    }
  `]
})
export class PortOverlayComponent implements OnChanges {

  @Input() template: NodeTemplate | null = null;
  @Input() showGrid = false;

  isVisible = true;
  portPositions: PortPosition[] = [];
  selectedPort: PortPosition | null = null;

  constructor(public portHelper: PortAlignmentHelperService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['template']) {
      this.updatePortPositions();
    }
  }

  /**
   * Listen for keyboard shortcut (Ctrl+Shift+O)
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    if (event.ctrlKey && event.shiftKey && event.key === 'O') {
      event.preventDefault();
      this.toggleOverlay();
    }
  }

  /**
   * Update port positions from template
   */
  private updatePortPositions(): void {
    this.portPositions = this.portHelper.calculatePortPositions(this.template);
    this.clearSelection(); // Clear selection when template changes
  }

  /**
   * Toggle overlay visibility
   */
  toggleOverlay(): void {
    this.isVisible = !this.isVisible;
  }

  /**
   * Handle port click
   */
  onPortClick(port: PortPosition): void {
    this.selectedPort = port;
  }

  /**
   * Clear port selection
   */
  clearSelection(): void {
    this.selectedPort = null;
  }

  /**
   * Get tooltip for port
   */
  getPortTooltip(port: PortPosition): string {
    return `${port.side.toUpperCase()} - ${this.portHelper.getPortTypeLabel(port.type)}\nPosition: (${port.x}, ${port.y})\nVisibility: ${this.portHelper.getPortVisibilityLabel(port.visibility)}`;
  }

  /**
   * Get alignment CSS for selected port
   */
  getAlignmentCSS(): string {
    if (!this.selectedPort) {
      return '';
    }

    // Example element size (can be customized)
    const elementSize = { width: 40, height: 40 };

    return this.portHelper.generatePortAlignmentCSS(this.selectedPort, elementSize);
  }

  /**
   * Copy CSS to clipboard
   */
  copyCSS(): void {
    const css = this.getAlignmentCSS();
    navigator.clipboard.writeText(css).then(
      () => console.log('✅ CSS copied to clipboard'),
      err => console.error('❌ Failed to copy CSS:', err)
    );
  }
}
