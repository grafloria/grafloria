import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

// Simplified engine interface for mobile toolbar
export interface IMobileToolbarEngine {
  getZoom(): number;
  setZoom(zoom: number): void;
  zoomToFit?(options?: { maxScale?: number; padding?: number }): void;
  on?(event: string, handler: (data: any) => void): void;
  off?(event: string, handler: (data: any) => void): void;
}

export interface MobileToolbarAction {
  id: string;
  icon: string;
  label: string;
  onClick: () => void;
}

@Component({
  selector: 'grafloria-mobile-toolbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="mobile-toolbar" [class.expanded]="isExpanded">
      <!-- Main action button -->
      <button class="toolbar-toggle" (click)="toggleExpanded()" type="button">
        <i class="fa" [class.fa-times]="isExpanded" [class.fa-bars]="!isExpanded"></i>
      </button>

      <!-- Action buttons -->
      <div class="toolbar-actions" *ngIf="isExpanded">
        <button
          *ngFor="let action of actions"
          class="toolbar-action"
          (click)="handleAction(action)"
          type="button"
        >
          <i class="fa" [ngClass]="action.icon"></i>
          <span>{{ action.label }}</span>
        </button>
      </div>

      <!-- Zoom controls -->
      <div class="zoom-controls">
        <button class="zoom-btn" (click)="zoomIn()" type="button" aria-label="Zoom in">
          <i class="fa fa-plus"></i>
        </button>
        <span class="zoom-level">{{ zoomPercent }}%</span>
        <button class="zoom-btn" (click)="zoomOut()" type="button" aria-label="Zoom out">
          <i class="fa fa-minus"></i>
        </button>
        <button class="zoom-btn" (click)="zoomToFit()" type="button" aria-label="Zoom to fit">
          <i class="fa fa-expand"></i>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .mobile-toolbar {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-items: flex-end;
    }

    .toolbar-toggle {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: #667eea;
      color: white;
      border: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-size: 20px;
      cursor: pointer;
      transition: transform 0.2s ease, background 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .toolbar-toggle:active {
      transform: scale(0.95);
      background: #5568d3;
    }

    .toolbar-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .toolbar-action {
      min-width: 160px;
      padding: 14px 20px;
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 28px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 16px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .toolbar-action:active {
      transform: scale(0.98);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    }

    .toolbar-action i {
      font-size: 20px;
      color: #667eea;
    }

    .zoom-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      background: white;
      padding: 8px 12px;
      border-radius: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .zoom-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #f7fafc;
      border: 1px solid #e2e8f0;
      font-size: 18px;
      cursor: pointer;
      color: #334155;
      transition: background 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .zoom-btn:active {
      background: #e2e8f0;
    }

    .zoom-level {
      min-width: 50px;
      text-align: center;
      font-weight: 600;
      font-size: 14px;
      color: #334155;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileToolbarComponent implements OnInit {
  @Input() engine!: IMobileToolbarEngine;
  @Input() actions: MobileToolbarAction[] = [];
  @Output() actionClicked = new EventEmitter<MobileToolbarAction>();

  isExpanded = false;
  zoomPercent = 100;

  private zoomHandler?: (data: any) => void;

  ngOnInit() {
    if (this.engine) {
      // Update zoom display
      this.zoomHandler = () => {
        this.zoomPercent = Math.round(this.engine.getZoom() * 100);
      };

      if (this.engine.on) {
        this.engine.on('canvas:zoom', this.zoomHandler);
      }

      // Initialize zoom display
      this.zoomPercent = Math.round(this.engine.getZoom() * 100);
    }
  }

  ngOnDestroy() {
    if (this.engine && this.engine.off && this.zoomHandler) {
      this.engine.off('canvas:zoom', this.zoomHandler);
    }
  }

  toggleExpanded() {
    this.isExpanded = !this.isExpanded;
  }

  handleAction(action: MobileToolbarAction) {
    action.onClick();
    this.actionClicked.emit(action);
    this.isExpanded = false; // Collapse after action
  }

  zoomIn() {
    const current = this.engine.getZoom();
    this.engine.setZoom(Math.min(current * 1.2, 4));
    this.zoomPercent = Math.round(this.engine.getZoom() * 100);
  }

  zoomOut() {
    const current = this.engine.getZoom();
    this.engine.setZoom(Math.max(current / 1.2, 0.1));
    this.zoomPercent = Math.round(this.engine.getZoom() * 100);
  }

  zoomToFit() {
    if (this.engine.zoomToFit) {
      this.engine.zoomToFit({ maxScale: 1, padding: 50 });
      this.zoomPercent = Math.round(this.engine.getZoom() * 100);
    }
  }
}
