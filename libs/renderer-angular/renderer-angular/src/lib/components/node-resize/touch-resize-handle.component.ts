import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

@Component({
    selector: 'grafloria-touch-resize-handle',
    imports: [CommonModule],
    template: `
    <div
      class="touch-resize-handle"
      [attr.data-position]="position"
      (touchstart)="onTouchStart($event)"
      (touchmove)="onTouchMove($event)"
      (touchend)="onTouchEnd($event)"
    >
      <div class="handle-dot"></div>
    </div>
  `,
    styles: [`
    .touch-resize-handle {
      position: absolute;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: move;
      z-index: 10;
    }

    /* Position handles */
    .touch-resize-handle[data-position="nw"] {
      top: -22px;
      left: -22px;
      cursor: nwse-resize;
    }

    .touch-resize-handle[data-position="n"] {
      top: -22px;
      left: 50%;
      transform: translateX(-50%);
      cursor: ns-resize;
    }

    .touch-resize-handle[data-position="ne"] {
      top: -22px;
      right: -22px;
      cursor: nesw-resize;
    }

    .touch-resize-handle[data-position="e"] {
      top: 50%;
      right: -22px;
      transform: translateY(-50%);
      cursor: ew-resize;
    }

    .touch-resize-handle[data-position="se"] {
      bottom: -22px;
      right: -22px;
      cursor: nwse-resize;
    }

    .touch-resize-handle[data-position="s"] {
      bottom: -22px;
      left: 50%;
      transform: translateX(-50%);
      cursor: ns-resize;
    }

    .touch-resize-handle[data-position="sw"] {
      bottom: -22px;
      left: -22px;
      cursor: nesw-resize;
    }

    .touch-resize-handle[data-position="w"] {
      top: 50%;
      left: -22px;
      transform: translateY(-50%);
      cursor: ew-resize;
    }

    .handle-dot {
      width: 16px;
      height: 16px;
      background: #667eea;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }
  `],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TouchResizeHandleComponent {
  @Input() position!: HandlePosition;
  @Output() resize = new EventEmitter<{ deltaX: number; deltaY: number }>();
  @Output() resizeStart = new EventEmitter<void>();
  @Output() resizeEnd = new EventEmitter<void>();

  private startX = 0;
  private startY = 0;

  onTouchStart(event: TouchEvent) {
    event.preventDefault();
    event.stopPropagation();

    const touch = event.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;

    this.resizeStart.emit();
  }

  onTouchMove(event: TouchEvent) {
    event.preventDefault();
    event.stopPropagation();

    const touch = event.touches[0];
    const deltaX = touch.clientX - this.startX;
    const deltaY = touch.clientY - this.startY;

    this.resize.emit({ deltaX, deltaY });

    this.startX = touch.clientX;
    this.startY = touch.clientY;
  }

  onTouchEnd(event: TouchEvent) {
    event.preventDefault();
    event.stopPropagation();

    this.resizeEnd.emit();
  }
}
