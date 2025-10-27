import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

/**
 * Layout configuration
 */
export interface LayoutConfig {
  type: 'flexbox' | 'grid' | 'absolute' | 'none';

  // Flexbox properties
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  flexWrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
  justifyContent?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
  alignItems?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  alignContent?: 'start' | 'center' | 'end' | 'stretch' | 'space-between' | 'space-around';
  gap?: number;

  // Grid properties
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  gridAutoFlow?: 'row' | 'column' | 'dense' | 'row dense' | 'column dense';
  gridGap?: number;

  // Padding
  padding?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

/**
 * Layout Editor Component
 *
 * Visual editor for layout configuration
 * Phase 5: Nested Nodes & Layout System
 */
@Component({
  selector: 'app-layout-editor',
  standalone: true,
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
  @Input() layout: LayoutConfig = { type: 'none' };
  @Output() layoutChange = new EventEmitter<LayoutConfig>();

  tokens = DESIGN_TOKENS;

  ngOnInit(): void {}
  ngOnChanges(changes: SimpleChanges): void {}
}
