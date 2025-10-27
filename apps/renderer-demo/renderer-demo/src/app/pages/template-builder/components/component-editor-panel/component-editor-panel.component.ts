import { Component, Input, Output, EventEmitter, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';
import { ComponentModeEditorComponent, type ComponentModeConfig } from '../component-mode-editor/component-mode-editor.component';
import { PropsSchemaEditorComponent, type PropsSchema } from '../props-schema-editor/props-schema-editor.component';
import { SlotConfigEditorComponent, type SlotsConfig } from '../slot-config-editor/slot-config-editor.component';

export interface ComponentConfig {
  mode: ComponentModeConfig;
  props: PropsSchema;
  slots: SlotsConfig;
}

@Component({
  selector: 'app-component-editor-panel',
  standalone: true,
  imports: [
    CommonModule,
    ComponentModeEditorComponent,
    PropsSchemaEditorComponent,
    SlotConfigEditorComponent
  ],
  template: `
    <div class="component-editor-panel" [style.font-family]="tokens.typography.fontFamily">
      <div class="panel-header" [style.background]="tokens.colors.background.secondary">
        <h2 [style.color]="tokens.colors.text.primary" [style.margin]="0">
          Component Configuration
        </h2>
        <p class="panel-description" [style.color]="tokens.colors.text.secondary" [style.margin]="'4px 0 0 0'">
          Configure component mode, props, and slots for advanced reusability
        </p>
      </div>

      <div class="tabs" [style.background]="tokens.colors.background.secondary">
        <button
          *ngFor="let tab of tabs"
          type="button"
          class="tab"
          [class.active]="activeTab === tab.id"
          [style.border-color]="activeTab === tab.id ? tokens.colors.primary[500] : 'transparent'"
          [style.color]="activeTab === tab.id ? tokens.colors.primary[600] : tokens.colors.text.secondary"
          (click)="activeTab = tab.id">
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-label">{{ tab.label }}</span>
          <span
            *ngIf="getTabBadge(tab.id)"
            class="tab-badge"
            [style.background]="tokens.colors.primary[500]"
            [style.color]="'#ffffff'">
            {{ getTabBadge(tab.id) }}
          </span>
        </button>
      </div>

      <div class="panel-content">
        <!-- Mode Configuration -->
        <app-component-mode-editor
          *ngIf="activeTab === 'mode'"
          [config]="config.mode"
          (configChange)="onModeChange($event)">
        </app-component-mode-editor>

        <!-- Props Schema -->
        <app-props-schema-editor
          *ngIf="activeTab === 'props'"
          [schema]="config.props"
          (schemaChange)="onPropsChange($event)">
        </app-props-schema-editor>

        <!-- Slots Configuration -->
        <app-slot-config-editor
          *ngIf="activeTab === 'slots'"
          [config]="config.slots"
          (configChange)="onSlotsChange($event)">
        </app-slot-config-editor>
      </div>
    </div>
  `,
  styles: [`
    .component-editor-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .panel-header {
      padding: 16px;
      border-bottom: 1px solid #e0e0e0;
    }

    .panel-header h2 {
      font-size: 18px;
      font-weight: 600;
    }

    .panel-description {
      font-size: 13px;
      line-height: 1.5;
    }

    .tabs {
      display: flex;
      gap: 4px;
      padding: 8px 16px 0;
      border-bottom: 2px solid #e0e0e0;
      overflow-x: auto;
    }

    .tab {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      border: none;
      background: none;
      border-bottom: 3px solid;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
      position: relative;
    }

    .tab:hover {
      background: rgba(0, 0, 0, 0.03);
    }

    .tab.active {
      font-weight: 600;
    }

    .tab-icon {
      font-size: 16px;
    }

    .tab-label {
      font-size: 14px;
    }

    .tab-badge {
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      min-width: 18px;
      text-align: center;
    }

    .panel-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }
  `]
})
export class ComponentEditorPanelComponent implements OnInit, OnChanges {
  @Input() config: ComponentConfig = {
    mode: {
      mode: 'template',
      template: '',
      className: '',
      style: {}
    },
    props: { props: [] },
    slots: { slots: [] }
  };

  @Output() configChange = new EventEmitter<ComponentConfig>();

  tokens = DESIGN_TOKENS;
  activeTab: 'mode' | 'props' | 'slots' = 'mode';

  tabs = [
    { id: 'mode' as const, label: 'Mode', icon: '⚙️' },
    { id: 'props' as const, label: 'Props', icon: '📋' },
    { id: 'slots' as const, label: 'Slots', icon: '🎯' }
  ];

  ngOnInit(): void {
    this.ensureDefaults();
  }

  ngOnChanges(): void {
    this.ensureDefaults();
  }

  ensureDefaults(): void {
    if (!this.config.mode) {
      this.config.mode = {
        mode: 'template',
        template: '',
        className: '',
        style: {}
      };
    }
    if (!this.config.props) {
      this.config.props = { props: [] };
    }
    if (!this.config.slots) {
      this.config.slots = { slots: [] };
    }
  }

  getTabBadge(tabId: string): string | null {
    switch (tabId) {
      case 'props':
        return this.config.props.props.length > 0 ? String(this.config.props.props.length) : null;
      case 'slots':
        return this.config.slots.slots.length > 0 ? String(this.config.slots.slots.length) : null;
      default:
        return null;
    }
  }

  onModeChange(mode: ComponentModeConfig): void {
    this.config.mode = mode;
    this.emitChange();
  }

  onPropsChange(props: PropsSchema): void {
    this.config.props = props;
    this.emitChange();
  }

  onSlotsChange(slots: SlotsConfig): void {
    this.config.slots = slots;
    this.emitChange();
  }

  emitChange(): void {
    this.configChange.emit({ ...this.config });
  }
}
