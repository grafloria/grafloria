import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DESIGN_TOKENS } from '../../design-system/design-tokens';

/**
 * Shape type definition
 */
export type ShapeType =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'circle'
  | 'ellipse'
  | 'diamond'
  | 'hexagon'
  | 'triangle'
  | 'star'
  | 'pentagon'
  | 'octagon'
  | 'parallelogram'
  | 'trapezoid';

/**
 * Shape configuration
 */
export interface ShapeConfig {
  type: ShapeType;
  name: string;
  svgPath: string;
  cssClipPath?: string;
  borderRadius?: string;
}

/**
 * Shape Picker Component
 *
 * A visual shape selector with:
 * - 12 predefined shapes
 * - SVG and CSS clip-path support
 * - Search/filter functionality
 * - Grid and list view
 * - Shape preview
 * - Custom shape support (via SVG path)
 *
 * Usage:
 * ```html
 * <app-shape-picker
 *   [selectedShape]="currentShape"
 *   (shapeChange)="onShapeChange($event)"
 *   [showSearch]="true">
 * </app-shape-picker>
 * ```
 */
@Component({
  selector: 'app-shape-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="shape-picker" [style.font-family]="tokens.typography.fontFamily">
      <!-- Header -->
      <div class="picker-header">
        <h3>Shape Picker</h3>
        <div class="view-toggle" *ngIf="showViewToggle">
          <button
            class="view-btn"
            [class.active]="viewMode === 'grid'"
            (click)="viewMode = 'grid'"
            title="Grid view"
          >
            ⊞
          </button>
          <button
            class="view-btn"
            [class.active]="viewMode === 'list'"
            (click)="viewMode = 'list'"
            title="List view"
          >
            ☰
          </button>
        </div>
      </div>

      <!-- Search -->
      <div class="search-section" *ngIf="showSearch">
        <input
          type="text"
          class="search-input"
          [(ngModel)]="searchQuery"
          (input)="filterShapes()"
          placeholder="Search shapes..."
        />
      </div>

      <!-- Shape Grid -->
      <div class="shapes-container" [class.list-mode]="viewMode === 'list'">
        <div
          *ngFor="let shape of filteredShapes"
          class="shape-item"
          [class.selected]="selectedShape === shape.type"
          (click)="selectShape(shape)"
        >
          <div class="shape-preview">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <path
                [attr.d]="shape.svgPath"
                [attr.fill]="selectedShape === shape.type ? tokens.colors.primary[500] : tokens.colors.gray[300]"
              />
            </svg>
          </div>
          <div class="shape-name">{{ shape.name }}</div>
        </div>
      </div>

      <!-- Selected Shape Info -->
      <div class="selected-info" *ngIf="getSelectedShapeConfig()">
        <div class="info-header">Selected Shape</div>
        <div class="info-content">
          <div class="info-row">
            <span class="info-label">Type:</span>
            <span class="info-value">{{ getSelectedShapeConfig()?.name }}</span>
          </div>
          <div class="info-row" *ngIf="getSelectedShapeConfig()?.cssClipPath">
            <span class="info-label">CSS Clip Path:</span>
            <div class="code-block">{{ getSelectedShapeConfig()?.cssClipPath }}</div>
          </div>
          <div class="info-row" *ngIf="getSelectedShapeConfig()?.borderRadius">
            <span class="info-label">Border Radius:</span>
            <div class="code-block">{{ getSelectedShapeConfig()?.borderRadius }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .shape-picker {
      padding: 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      width: 360px;
      max-height: 600px;
      display: flex;
      flex-direction: column;
    }

    .picker-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .picker-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #333;
    }

    .view-toggle {
      display: flex;
      gap: 4px;
    }

    .view-btn {
      width: 32px;
      height: 32px;
      border: 1px solid #e0e0e0;
      background: white;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }

    .view-btn:hover {
      background: #f5f5f5;
      border-color: #667eea;
    }

    .view-btn.active {
      background: #667eea;
      color: white;
      border-color: #667eea;
    }

    .search-section {
      margin-bottom: 16px;
    }

    .search-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      font-size: 14px;
    }

    .search-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .shapes-container {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
      overflow-y: auto;
      max-height: 400px;
      padding: 4px;
    }

    .shapes-container.list-mode {
      grid-template-columns: 1fr;
    }

    .shape-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      background: white;
    }

    .shapes-container.list-mode .shape-item {
      flex-direction: row;
      justify-content: flex-start;
    }

    .shape-item:hover {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.05);
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }

    .shape-item.selected {
      border-color: #667eea;
      background: rgba(102, 126, 234, 0.1);
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
    }

    .shape-preview {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .shapes-container.list-mode .shape-preview {
      width: 32px;
      height: 32px;
    }

    .shape-preview svg {
      width: 100%;
      height: 100%;
    }

    .shape-name {
      font-size: 11px;
      font-weight: 500;
      color: #666;
      text-align: center;
    }

    .shapes-container.list-mode .shape-name {
      font-size: 13px;
      text-align: left;
    }

    .selected-info {
      border-top: 1px solid #e0e0e0;
      padding-top: 16px;
    }

    .info-header {
      font-size: 12px;
      font-weight: 600;
      color: #666;
      margin-bottom: 12px;
      text-transform: uppercase;
    }

    .info-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .info-row {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .info-label {
      font-size: 11px;
      font-weight: 600;
      color: #999;
      text-transform: uppercase;
    }

    .info-value {
      font-size: 13px;
      color: #333;
      font-weight: 500;
    }

    .code-block {
      padding: 8px 12px;
      background: #f5f5f5;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      font-size: 11px;
      font-family: 'Monaco', 'Courier New', monospace;
      color: #666;
      overflow-x: auto;
      white-space: nowrap;
    }
  `]
})
export class ShapePickerComponent {
  @Input() selectedShape: ShapeType = 'rectangle';
  @Input() showSearch = true;
  @Input() showViewToggle = true;
  @Output() shapeChange = new EventEmitter<ShapeConfig>();

  tokens = DESIGN_TOKENS;
  searchQuery = '';
  viewMode: 'grid' | 'list' = 'grid';
  filteredShapes: ShapeConfig[] = [];

  /**
   * All available shapes
   */
  readonly shapes: ShapeConfig[] = [
    {
      type: 'rectangle',
      name: 'Rectangle',
      svgPath: 'M 10 10 L 90 10 L 90 90 L 10 90 Z',
      cssClipPath: 'none',
      borderRadius: '0'
    },
    {
      type: 'rounded-rectangle',
      name: 'Rounded Rectangle',
      svgPath: 'M 20 10 L 80 10 Q 90 10 90 20 L 90 80 Q 90 90 80 90 L 20 90 Q 10 90 10 80 L 10 20 Q 10 10 20 10 Z',
      cssClipPath: 'none',
      borderRadius: '12px'
    },
    {
      type: 'circle',
      name: 'Circle',
      svgPath: 'M 50 10 A 40 40 0 1 1 49.99 10 Z',
      cssClipPath: 'circle(50%)',
      borderRadius: '50%'
    },
    {
      type: 'ellipse',
      name: 'Ellipse',
      svgPath: 'M 50 15 A 35 30 0 1 1 49.99 15 Z',
      cssClipPath: 'ellipse(40% 30% at 50% 50%)',
      borderRadius: '50%'
    },
    {
      type: 'diamond',
      name: 'Diamond',
      svgPath: 'M 50 10 L 90 50 L 50 90 L 10 50 Z',
      cssClipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'
    },
    {
      type: 'hexagon',
      name: 'Hexagon',
      svgPath: 'M 50 10 L 85 30 L 85 70 L 50 90 L 15 70 L 15 30 Z',
      cssClipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'
    },
    {
      type: 'triangle',
      name: 'Triangle',
      svgPath: 'M 50 10 L 90 90 L 10 90 Z',
      cssClipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)'
    },
    {
      type: 'star',
      name: 'Star',
      svgPath: 'M 50 10 L 61 40 L 92 40 L 68 58 L 79 88 L 50 70 L 21 88 L 32 58 L 8 40 L 39 40 Z',
      cssClipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'
    },
    {
      type: 'pentagon',
      name: 'Pentagon',
      svgPath: 'M 50 10 L 90 40 L 75 85 L 25 85 L 10 40 Z',
      cssClipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)'
    },
    {
      type: 'octagon',
      name: 'Octagon',
      svgPath: 'M 35 10 L 65 10 L 90 35 L 90 65 L 65 90 L 35 90 L 10 65 L 10 35 Z',
      cssClipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)'
    },
    {
      type: 'parallelogram',
      name: 'Parallelogram',
      svgPath: 'M 25 10 L 90 10 L 75 90 L 10 90 Z',
      cssClipPath: 'polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)'
    },
    {
      type: 'trapezoid',
      name: 'Trapezoid',
      svgPath: 'M 30 10 L 70 10 L 90 90 L 10 90 Z',
      cssClipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)'
    }
  ];

  constructor() {
    this.filteredShapes = [...this.shapes];
  }

  /**
   * Select shape
   */
  selectShape(shape: ShapeConfig): void {
    this.selectedShape = shape.type;
    this.shapeChange.emit(shape);
  }

  /**
   * Get selected shape configuration
   */
  getSelectedShapeConfig(): ShapeConfig | undefined {
    return this.shapes.find(s => s.type === this.selectedShape);
  }

  /**
   * Filter shapes by search query
   */
  filterShapes(): void {
    const query = this.searchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredShapes = [...this.shapes];
    } else {
      this.filteredShapes = this.shapes.filter(shape =>
        shape.name.toLowerCase().includes(query) ||
        shape.type.toLowerCase().includes(query)
      );
    }
  }
}
