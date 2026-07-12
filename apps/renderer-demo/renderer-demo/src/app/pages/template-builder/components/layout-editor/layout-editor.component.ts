import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';
import { SerializedLayoutConfig } from '@grafloria/engine';

/**
 * Layout Editor Component
 *
 * Visual editor for layout configuration
 * Phase 5: Nested Nodes & Layout System
 */
@Component({
    selector: 'app-layout-editor',
    imports: [CommonModule, FormsModule],
    template: `
    <div class="layout-editor">
      <h3>Layout Configuration</h3>
      <p>Layout editor component</p>
    </div>
  `,
    styles: [`
    .layout-editor {
      padding: 16px;
    }
  `]
})
export class LayoutEditorComponent implements OnInit, OnChanges {
  @Input() layout: SerializedLayoutConfig = { type: 'none' };
  @Output() layoutChange = new EventEmitter<SerializedLayoutConfig>();

  tokens = DESIGN_TOKENS;

  ngOnInit(): void {}
  ngOnChanges(changes: SimpleChanges): void {}
}
