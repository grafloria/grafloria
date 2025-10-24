import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface Column {
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isNullable: boolean;
}

export interface TableData {
  tableName: string;
  columns: Column[];
}

@Component({
  selector: 'app-table-node',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="table-node" *ngIf="data">
      <div class="table-header">
        <span class="table-icon">🗄️</span>
        <span class="table-name">{{ data.tableName }}</span>
      </div>
      <div class="columns-container">
        <div *ngFor="let column of data.columns" class="column-row">
          <span class="column-icon">{{ getColumnIcon(column) }}</span>
          <span class="column-name">{{ column.name }}</span>
          <span class="column-type">{{ column.dataType }}</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .table-node {
      background: white;
      border: 2px solid #3498db;
      border-radius: 8px;
      overflow: hidden;
      min-width: 280px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .table-header {
      background: linear-gradient(135deg, #3498db 0%, #2980b9 100%);
      color: white;
      padding: 0.75rem 1rem;
      font-weight: 700;
      font-size: 1.1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .table-icon {
      font-size: 1.25rem;
    }

    .table-name {
      flex: 1;
    }

    .columns-container {
      background: #f8f9fa;
    }

    .column-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem 1rem;
      border-bottom: 1px solid #e9ecef;
      transition: background 0.2s;
    }

    .column-row:last-child {
      border-bottom: none;
    }

    .column-row:hover {
      background: #e3f2fd;
    }

    .column-icon {
      font-size: 1rem;
      width: 20px;
      text-align: center;
    }

    .column-name {
      flex: 1;
      font-weight: 600;
      color: #2c3e50;
      font-size: 0.95rem;
    }

    .column-type {
      color: #7f8c8d;
      font-size: 0.85rem;
      font-family: 'Courier New', monospace;
    }
  `]
})
export class TableNodeComponent {
  @Input() data!: TableData;

  getColumnIcon(column: Column): string {
    if (column.isPrimaryKey) return '🔑';
    if (column.isForeignKey) return '🔗';
    return '📝';
  }
}
