import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { DiagramEngine, InteractionConfig } from '@grafloria/engine';

/**
 * Phase 4: InteractionConfigPanelComponent
 *
 * Configuration UI panel for interaction mode settings.
 * Allows users to customize interaction behavior at runtime.
 *
 * @example
 * ```html
 * <grafloria-interaction-config-panel
 *   [engine]="diagramEngine"
 *   [expanded]="true"
 *   (configChanged)="onConfigChange($event)">
 * </grafloria-interaction-config-panel>
 * ```
 */
@Component({
  selector: 'grafloria-interaction-config-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './interaction-config-panel.component.html',
  styleUrls: ['./interaction-config-panel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InteractionConfigPanelComponent implements OnInit, OnChanges {
  /**
   * Diagram engine instance (required)
   */
  @Input() engine!: DiagramEngine;

  /**
   * Whether the panel is expanded by default
   */
  @Input() expanded = false;

  /**
   * Panel title
   */
  @Input() title = 'Interaction Settings';

  /**
   * Show advanced settings
   */
  @Input() showAdvanced = true;

  /**
   * Emit config changes
   */
  @Output() configChanged = new EventEmitter<Partial<InteractionConfig>>();

  /**
   * Current configuration (local copy)
   */
  config!: InteractionConfig;

  /**
   * Panel collapsed state
   */
  isCollapsed = true;

  /**
   * Advanced settings collapsed state
   */
  isAdvancedCollapsed = true;

  /**
   * Interaction mode options
   */
  interactionModes = [
    { value: 'direct', label: 'Direct', description: 'Drag node body to move, drag port to connect' },
    { value: 'deliberate', label: 'Deliberate', description: 'Select node first, then drag to move' },
    { value: 'smart', label: 'Smart (Visio-style)', description: 'Hover-based port visibility with auto-connect' },
  ];

  /**
   * Port visibility options
   */
  portVisibilityOptions = [
    { value: 'always', label: 'Always Visible', description: 'Ports are always shown' },
    { value: 'on-hover', label: 'On Hover', description: 'Ports appear when hovering over node' },
    { value: 'hidden', label: 'Hidden', description: 'Ports only shown during connection' },
  ];

  /**
   * Connection line style options
   */
  connectionLineStyles = [
    { value: 'bezier', label: 'Bezier Curve', description: 'Smooth curved connections' },
    { value: 'straight', label: 'Straight Line', description: 'Direct line connections' },
  ];

  ngOnInit(): void {
    this.isCollapsed = !this.expanded;
    this.loadConfig();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['engine'] && !changes['engine'].firstChange) {
      this.loadConfig();
    }
  }

  /**
   * Load current configuration from engine
   */
  loadConfig(): void {
    if (this.engine) {
      this.config = this.engine.getInteractionConfig();
    }
  }

  /**
   * Toggle panel collapsed state
   */
  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
  }

  /**
   * Toggle advanced settings collapsed state
   */
  toggleAdvanced(): void {
    this.isAdvancedCollapsed = !this.isAdvancedCollapsed;
  }

  /**
   * Handle interaction mode change
   */
  onModeChange(mode: string): void {
    const update = { mode: mode as any };
    this.updateConfig(update);
  }

  /**
   * Handle port visibility change
   */
  onPortVisibilityChange(visibility: string): void {
    const update = { portVisibility: visibility as any };
    this.updateConfig(update);
  }

  /**
   * Handle connection line style change
   */
  onConnectionLineStyleChange(style: string): void {
    const update = { connectionLineStyle: style as any };
    this.updateConfig(update);
  }

  /**
   * Handle port radius change
   */
  onPortRadiusChange(radius: number): void {
    const update = { portDefaultRadius: radius };
    this.updateConfig(update);
  }

  /**
   * Handle port hover scale factor change
   */
  onPortHoverScaleChange(scale: number): void {
    const update = { portHoverScaleFactor: scale };
    this.updateConfig(update);
  }

  /**
   * Handle snap radius change
   */
  onSnapRadiusChange(radius: number): void {
    const update = { snapToPortRadius: radius };
    this.updateConfig(update);
  }

  /**
   * Handle toggle changes
   */
  onToggleChange(key: keyof InteractionConfig, value: boolean): void {
    const update = { [key]: value } as Partial<InteractionConfig>;
    this.updateConfig(update);
  }

  /**
   * Update configuration
   */
  private updateConfig(update: Partial<InteractionConfig>): void {
    // Update local config
    this.config = {
      ...this.config,
      ...update,
    };

    // Update engine config
    if (this.engine) {
      this.engine.setInteractionConfig(update);
    }

    // Emit change event
    this.configChanged.emit(update);
  }

  /**
   * Reset to default configuration
   */
  resetToDefaults(): void {
    if (this.engine) {
      // Get default config from engine
      const defaultConfig = {
        mode: 'smart' as any,
        portVisibility: 'on-hover' as any,
        portHoverScaleFactor: 1.5,
        portDefaultRadius: 6,
        snapToPortRadius: 30,
        showConnectionPreview: true,
        connectionLineStyle: 'bezier' as any,
        enableLinkReconnection: true,
        showLinkEndpointHandles: true,
        enableSmartAutoConnect: true,
        highlightValidTargets: true,
        animateConnectionPreview: true,
      };

      this.engine.setInteractionConfig(defaultConfig);
      this.loadConfig();
      this.configChanged.emit(defaultConfig);
    }
  }

  /**
   * Get description for current mode
   */
  getModeDescription(): string {
    const mode = this.interactionModes.find(m => m.value === this.config?.mode);
    return mode?.description || '';
  }

  /**
   * Get description for current port visibility
   */
  getPortVisibilityDescription(): string {
    const visibility = this.portVisibilityOptions.find(v => v.value === this.config?.portVisibility);
    return visibility?.description || '';
  }

  /**
   * Get description for current connection line style
   */
  getConnectionLineStyleDescription(): string {
    const style = this.connectionLineStyles.find(s => s.value === this.config?.connectionLineStyle);
    return style?.description || '';
  }
}
