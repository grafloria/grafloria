import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

export interface SlotDefinition {
  id: string;
  name: string;
  description?: string;
  defaultContent?: string;
  required?: boolean;
  multiple?: boolean;
}

export interface SlotsConfig {
  slots: SlotDefinition[];
}

@Component({
    selector: 'app-slot-config-editor',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="slot-config-editor" [style.font-family]="tokens.typography.fontFamily">
      <div class="header">
        <div>
          <h3 [style.color]="tokens.colors.text.primary" [style.margin]="0">
            Slots Configuration
          </h3>
          <p class="description" [style.color]="tokens.colors.text.secondary" [style.margin]="'4px 0 0 0'">
            Define content insertion points for child elements
          </p>
        </div>
        <button
          type="button"
          class="add-button"
          (click)="addSlot()"
          [style.background]="tokens.colors.primary[500]"
          [style.color]="'#ffffff'">
          + Add Slot
        </button>
      </div>

      <!-- Info Card -->
      <div class="info-card" [style.background]="tokens.colors.info.light" [style.border-color]="tokens.colors.info.light">
        <div class="info-icon" [style.color]="tokens.colors.info.main">💡</div>
        <div>
          <div class="info-title" [style.color]="tokens.colors.info.dark">
            What are Slots?
          </div>
          <div class="info-text" [style.color]="tokens.colors.info.main">
            Slots are named insertion points where child content can be injected. Similar to Vue/Web Components slots.
          </div>
        </div>
      </div>

      <div *ngIf="config.slots.length === 0" class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-title" [style.color]="tokens.colors.text.primary">
          No slots defined
        </div>
        <div class="empty-text" [style.color]="tokens.colors.text.secondary">
          Add slots to allow dynamic content injection
        </div>
      </div>

      <div class="slots-list">
        <div
          *ngFor="let slot of config.slots; let i = index"
          class="slot-card"
          [style.background]="tokens.colors.background.secondary"
          [style.border-color]="tokens.colors.border.primary">

          <div class="slot-header">
            <div class="slot-indicator">
              <span class="slot-icon">🎯</span>
              <span class="slot-index" [style.color]="tokens.colors.text.secondary">
                Slot {{ i + 1 }}
              </span>
            </div>
            <button
              type="button"
              class="delete-button"
              (click)="removeSlot(i)"
              [style.color]="tokens.colors.error.main"
              title="Remove slot">
              ✕
            </button>
          </div>

          <div class="slot-body">
            <!-- Name -->
            <div class="form-group">
              <label class="label" [style.color]="tokens.colors.text.primary">
                Slot Name *
                <span class="hint" [style.color]="tokens.colors.text.secondary">
                  (use 'default' for unnamed slot)
                </span>
              </label>
              <input
                type="text"
                class="text-input"
                [(ngModel)]="slot.name"
                (ngModelChange)="emitChange()"
                placeholder="default, header, footer, content"
                [style.background]="tokens.colors.background.primary"
                [style.border-color]="tokens.colors.border.primary"
                [style.color]="tokens.colors.text.primary" />
            </div>

            <!-- Description -->
            <div class="form-group">
              <label class="label" [style.color]="tokens.colors.text.primary">
                Description
                <span class="hint" [style.color]="tokens.colors.text.secondary">(optional)</span>
              </label>
              <input
                type="text"
                class="text-input"
                [(ngModel)]="slot.description"
                (ngModelChange)="emitChange()"
                placeholder="What content goes in this slot?"
                [style.background]="tokens.colors.background.primary"
                [style.border-color]="tokens.colors.border.primary"
                [style.color]="tokens.colors.text.primary" />
            </div>

            <!-- Default Content -->
            <div class="form-group">
              <label class="label" [style.color]="tokens.colors.text.primary">
                Default Content
                <span class="hint" [style.color]="tokens.colors.text.secondary">
                  (fallback if no content provided)
                </span>
              </label>
              <textarea
                class="textarea-input"
                [(ngModel)]="slot.defaultContent"
                (ngModelChange)="emitChange()"
                placeholder="<div>Default content here...</div>"
                rows="3"
                [style.background]="tokens.colors.background.primary"
                [style.border-color]="tokens.colors.border.primary"
                [style.color]="tokens.colors.text.primary">
              </textarea>
            </div>

            <!-- Flags -->
            <div class="flags-row">
              <label class="checkbox-label" [style.color]="tokens.colors.text.primary">
                <input
                  type="checkbox"
                  [(ngModel)]="slot.required"
                  (ngModelChange)="emitChange()" />
                <span>Required</span>
                <span class="flag-hint" [style.color]="tokens.colors.text.secondary">
                  (must provide content)
                </span>
              </label>

              <label class="checkbox-label" [style.color]="tokens.colors.text.primary">
                <input
                  type="checkbox"
                  [(ngModel)]="slot.multiple"
                  (ngModelChange)="emitChange()" />
                <span>Multiple</span>
                <span class="flag-hint" [style.color]="tokens.colors.text.secondary">
                  (allow multiple children)
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Common Slot Patterns -->
      <div class="patterns-section" *ngIf="config.slots.length > 0">
        <div class="patterns-title" [style.color]="tokens.colors.text.primary">
          Common Slot Patterns:
        </div>
        <div class="patterns-grid">
          <button
            *ngFor="let pattern of slotPatterns"
            type="button"
            class="pattern-card"
            (click)="addSlotFromPattern(pattern)"
            [style.background]="tokens.colors.background.secondary"
            [style.border-color]="tokens.colors.border.primary">
            <div class="pattern-name" [style.color]="tokens.colors.text.primary">
              {{ pattern.name }}
            </div>
            <div class="pattern-desc" [style.color]="tokens.colors.text.secondary">
              {{ pattern.description }}
            </div>
          </button>
        </div>
      </div>

      <!-- Usage Example -->
      <div class="example-section" *ngIf="config.slots.length > 0">
        <div class="example-title" [style.color]="tokens.colors.text.primary">
          Usage Example:
        </div>
        <div class="code-block" [style.background]="tokens.colors.background.tertiary" [style.color]="tokens.colors.text.primary">
          <pre>{{ getUsageExample() }}</pre>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .slot-config-editor {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      height: 100%;
      overflow-y: auto;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }

    .header h3 {
      font-size: 16px;
      font-weight: 600;
    }

    .description {
      font-size: 13px;
      line-height: 1.5;
    }

    .add-button {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
    }

    .add-button:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .info-card {
      padding: 12px;
      border: 1px solid;
      border-radius: 8px;
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .info-icon {
      font-size: 20px;
      line-height: 1;
    }

    .info-title {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 4px;
    }

    .info-text {
      font-size: 13px;
      line-height: 1.5;
    }

    .empty-state {
      text-align: center;
      padding: 48px 16px;
    }

    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .empty-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .empty-text {
      font-size: 14px;
    }

    .slots-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .slot-card {
      padding: 16px;
      border: 1px solid;
      border-radius: 8px;
    }

    .slot-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .slot-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .slot-icon {
      font-size: 20px;
    }

    .slot-index {
      font-size: 12px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .delete-button {
      width: 24px;
      height: 24px;
      border: none;
      background: none;
      font-size: 16px;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .delete-button:hover {
      background: rgba(239, 68, 68, 0.1);
    }

    .slot-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .label {
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .hint {
      font-size: 11px;
      font-weight: 400;
    }

    .text-input,
    .textarea-input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid;
      border-radius: 4px;
      font-size: 13px;
      font-family: inherit;
    }

    .textarea-input {
      resize: vertical;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
    }

    .text-input:focus,
    .textarea-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .flags-row {
      display: flex;
      gap: 24px;
      padding: 8px 0;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .checkbox-label input[type="checkbox"] {
      width: 16px;
      height: 16px;
      cursor: pointer;
    }

    .flag-hint {
      font-size: 11px;
      margin-left: 4px;
    }

    .patterns-section,
    .example-section {
      padding-top: 16px;
      border-top: 1px solid #e0e0e0;
    }

    .patterns-title,
    .example-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .patterns-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px;
    }

    .pattern-card {
      padding: 12px;
      border: 1px solid;
      border-radius: 6px;
      text-align: left;
      cursor: pointer;
      transition: all 0.2s;
    }

    .pattern-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      border-color: #3b82f6;
    }

    .pattern-name {
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 4px;
    }

    .pattern-desc {
      font-size: 11px;
      line-height: 1.4;
    }

    .code-block {
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
    }

    .code-block pre {
      margin: 0;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.6;
    }
  `]
})
export class SlotConfigEditorComponent implements OnInit {
  @Input() config: SlotsConfig = { slots: [] };
  @Output() configChange = new EventEmitter<SlotsConfig>();

  tokens = DESIGN_TOKENS;

  slotPatterns = [
    { name: 'default', description: 'Main content slot' },
    { name: 'header', description: 'Header section' },
    { name: 'footer', description: 'Footer section' },
    { name: 'sidebar', description: 'Side panel content' },
    { name: 'actions', description: 'Action buttons' },
    { name: 'content', description: 'Body content' }
  ];

  ngOnInit(): void {
    if (!this.config.slots) {
      this.config.slots = [];
    }
  }

  addSlot(): void {
    const newSlot: SlotDefinition = {
      id: `slot_${Date.now()}`,
      name: 'default',
      description: '',
      defaultContent: '',
      required: false,
      multiple: false
    };
    this.config.slots.push(newSlot);
    this.emitChange();
  }

  removeSlot(index: number): void {
    this.config.slots.splice(index, 1);
    this.emitChange();
  }

  addSlotFromPattern(pattern: any): void {
    const newSlot: SlotDefinition = {
      id: `slot_${Date.now()}`,
      name: pattern.name,
      description: pattern.description,
      defaultContent: '',
      required: false,
      multiple: false
    };
    this.config.slots.push(newSlot);
    this.emitChange();
  }

  getUsageExample(): string {
    if (this.config.slots.length === 0) {
      return '// No slots defined';
    }

    const examples: string[] = [];
    examples.push('<!-- In component template -->');

    this.config.slots.forEach(slot => {
      if (slot.name === 'default') {
        examples.push(`<slot></slot>`);
      } else {
        examples.push(`<slot name="${slot.name}"></slot>`);
      }
    });

    examples.push('');
    examples.push('<!-- Usage -->');
    examples.push('<my-component>');

    this.config.slots.forEach(slot => {
      if (slot.name === 'default') {
        examples.push('  <p>Content for default slot</p>');
      } else {
        examples.push(`  <template #${slot.name}>`);
        examples.push(`    <p>Content for ${slot.name} slot</p>`);
        examples.push('  </template>');
      }
    });

    examples.push('</my-component>');

    return examples.join('\n');
  }

  emitChange(): void {
    this.configChange.emit({ ...this.config });
  }
}
