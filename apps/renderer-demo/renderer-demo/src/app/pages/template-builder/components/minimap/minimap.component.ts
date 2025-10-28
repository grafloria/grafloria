import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramEngine } from '@grafloria/engine';
import { type Rectangle } from '@grafloria/renderer';
import {
  type PreviewNodeInfo,
  type ConnectionInfo
} from '../../models/multi-node-state.model';

/**
 * Minimap Component
 *
 * Provides a bird's-eye view of the entire canvas with nodes and connections.
 * Allows quick navigation by clicking or dragging the viewport indicator.
 *
 * Phase 8 Feature: Mini-Map Navigation
 *
 * Features:
 * - Canvas2D rendering for performance
 * - Visual viewport indicator
 * - Click-to-navigate
 * - Drag viewport to pan
 * - Node thumbnails
 * - Connection lines
 * - Toggle visibility
 *
 * ~300 lines
 */
@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-minimap',
  template: `
    <div class="minimap-container" *ngIf="visible && nodes.size > 0">
      <div class="minimap-header">
        <span class="minimap-title">🗺️ Mini-Map</span>
        <button class="minimap-close" (click)="toggleVisibility()" title="Hide Minimap">×</button>
      </div>
      <canvas
        #minimapCanvas
        class="minimap-canvas"
        [width]="canvasWidth"
        [height]="canvasHeight"
        (mousedown)="onMinimapMouseDown($event)"
        (mousemove)="onMinimapMouseMove($event)"
        (mouseup)="onMinimapMouseUp()"
        (mouseleave)="onMinimapMouseUp()">
      </canvas>
      <div class="minimap-stats">
        {{ nodes.size }} nodes, {{ connections.size }} links
      </div>
    </div>
  `,
  styles: [`
    .minimap-container {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 220px;
      background: rgba(255, 255, 255, 0.98);
      border: 2px solid #3498db;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      z-index: 1000;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }

    .minimap-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: linear-gradient(135deg, #3498db, #2980b9);
      color: white;
      font-size: 12px;
      font-weight: 600;
    }

    .minimap-title {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .minimap-close {
      background: transparent;
      border: none;
      color: white;
      font-size: 20px;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .minimap-close:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .minimap-canvas {
      display: block;
      width: 100%;
      cursor: pointer;
      background: #fafafa;
    }

    .minimap-stats {
      padding: 6px 12px;
      background: #f5f5f5;
      border-top: 1px solid #e0e0e0;
      font-size: 10px;
      color: #666;
      text-align: center;
    }
  `]
})
export class MinimapComponent implements OnChanges, AfterViewInit, OnDestroy {

  @Input() engine!: DiagramEngine;
  @Input() nodes: Map<string, PreviewNodeInfo> = new Map();
  @Input() connections: Map<string, ConnectionInfo> = new Map();
  @Input() viewport!: Rectangle;
  @Input() zoom: number = 1;
  @Input() visible = true;

  @Output() viewportChange = new EventEmitter<{ x: number; y: number }>();
  @Output() visibilityChange = new EventEmitter<boolean>();

  @ViewChild('minimapCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  canvasWidth = 220;
  canvasHeight = 165;

  private isDragging = false;
  private animationFrameId: number | null = null;

  ngAfterViewInit(): void {
    this.renderMinimap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['nodes'] || changes['connections'] || changes['viewport']) {
      this.scheduleRender();
    }
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  /**
   * Schedule minimap render (throttled with requestAnimationFrame)
   */
  private scheduleRender(): void {
    if (this.animationFrameId) {
      return; // Already scheduled
    }

    this.animationFrameId = requestAnimationFrame(() => {
      this.renderMinimap();
      this.animationFrameId = null;
    });
  }

  /**
   * Render the minimap with nodes, connections, and viewport indicator
   */
  private renderMinimap(): void {
    if (!this.canvasRef) return;

    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Fill background
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.nodes.size === 0) return;

    // Calculate bounds of all nodes
    const bounds = this.calculateNodesBounds();
    if (!bounds) return;

    // Calculate scale to fit all nodes with padding
    const padding = 20;
    const scaleX = (canvas.width - padding * 2) / bounds.width;
    const scaleY = (canvas.height - padding * 2) / bounds.height;
    const scale = Math.min(scaleX, scaleY);

    // Calculate offset to center the minimap content
    const offsetX = padding + (canvas.width - padding * 2 - bounds.width * scale) / 2;
    const offsetY = padding + (canvas.height - padding * 2 - bounds.height * scale) / 2;

    // Render connections first (under nodes)
    this.renderConnections(ctx, bounds, scale, offsetX, offsetY);

    // Render nodes
    this.renderNodes(ctx, bounds, scale, offsetX, offsetY);

    // Render viewport indicator (on top)
    this.renderViewportIndicator(ctx, bounds, scale, offsetX, offsetY);
  }

  /**
   * Render all nodes as small rectangles
   */
  private renderNodes(
    ctx: CanvasRenderingContext2D,
    bounds: { minX: number; minY: number; width: number; height: number },
    scale: number,
    offsetX: number,
    offsetY: number
  ): void {
    this.nodes.forEach(nodeInfo => {
      const node = nodeInfo.nodeModel;
      const x = offsetX + (node.position.x - bounds.minX) * scale;
      const y = offsetY + (node.position.y - bounds.minY) * scale;
      const width = Math.max(3, node.size.width * scale);
      const height = Math.max(3, node.size.height * scale);

      // Get node color from metadata or use default
      const shapeMetadata = node.getMetadata('shape');
      const fillColor = shapeMetadata?.fill || '#3498db';
      const strokeColor = shapeMetadata?.stroke || '#2980b9';

      // Fill
      ctx.fillStyle = fillColor;
      ctx.fillRect(x, y, width, height);

      // Stroke
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, width, height);
    });
  }

  /**
   * Render all connections as lines
   */
  private renderConnections(
    ctx: CanvasRenderingContext2D,
    bounds: { minX: number; minY: number; width: number; height: number },
    scale: number,
    offsetX: number,
    offsetY: number
  ): void {
    this.connections.forEach(connection => {
      const sourceNode = this.nodes.get(connection.sourceNodeId);
      const targetNode = this.nodes.get(connection.targetNodeId);

      if (!sourceNode || !targetNode) return;

      // Calculate center points of nodes
      const x1 = offsetX + (sourceNode.nodeModel.position.x + sourceNode.nodeModel.size.width / 2 - bounds.minX) * scale;
      const y1 = offsetY + (sourceNode.nodeModel.position.y + sourceNode.nodeModel.size.height / 2 - bounds.minY) * scale;
      const x2 = offsetX + (targetNode.nodeModel.position.x + targetNode.nodeModel.size.width / 2 - bounds.minX) * scale;
      const y2 = offsetY + (targetNode.nodeModel.position.y + targetNode.nodeModel.size.height / 2 - bounds.minY) * scale;

      ctx.strokeStyle = '#95a5a6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
  }

  /**
   * Render viewport indicator rectangle
   */
  private renderViewportIndicator(
    ctx: CanvasRenderingContext2D,
    bounds: { minX: number; minY: number; width: number; height: number },
    scale: number,
    offsetX: number,
    offsetY: number
  ): void {
    const viewportWorldWidth = this.viewport.width / this.zoom;
    const viewportWorldHeight = this.viewport.height / this.zoom;

    const x = offsetX + (this.viewport.x - bounds.minX) * scale;
    const y = offsetY + (this.viewport.y - bounds.minY) * scale;
    const width = viewportWorldWidth * scale;
    const height = viewportWorldHeight * scale;

    // Fill with semi-transparent red
    ctx.fillStyle = 'rgba(231, 76, 60, 0.15)';
    ctx.fillRect(x, y, width, height);

    // Stroke with solid red
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    // Add corner handles
    const handleSize = 4;
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(x - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
    ctx.fillRect(x + width - handleSize / 2, y - handleSize / 2, handleSize, handleSize);
    ctx.fillRect(x - handleSize / 2, y + height - handleSize / 2, handleSize, handleSize);
    ctx.fillRect(x + width - handleSize / 2, y + height - handleSize / 2, handleSize, handleSize);
  }

  /**
   * Calculate bounding box of all nodes
   */
  private calculateNodesBounds(): { minX: number; minY: number; width: number; height: number } | null {
    if (this.nodes.size === 0) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    this.nodes.forEach(nodeInfo => {
      const node = nodeInfo.nodeModel;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + node.size.width);
      maxY = Math.max(maxY, node.position.y + node.size.height);
    });

    // Add padding around bounds
    const padding = 100;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    return {
      minX,
      minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Handle mouse down on minimap (start dragging or navigate)
   */
  onMinimapMouseDown(event: MouseEvent): void {
    this.isDragging = true;
    this.updateViewportFromMinimap(event);
  }

  /**
   * Handle mouse move on minimap (continue dragging)
   */
  onMinimapMouseMove(event: MouseEvent): void {
    if (!this.isDragging) return;
    this.updateViewportFromMinimap(event);
  }

  /**
   * Handle mouse up on minimap (stop dragging)
   */
  onMinimapMouseUp(): void {
    this.isDragging = false;
  }

  /**
   * Update viewport based on minimap click/drag position
   */
  private updateViewportFromMinimap(event: MouseEvent): void {
    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const bounds = this.calculateNodesBounds();
    if (!bounds) return;

    // Calculate scale (same as in renderMinimap)
    const padding = 20;
    const scaleX = (canvas.width - padding * 2) / bounds.width;
    const scaleY = (canvas.height - padding * 2) / bounds.height;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = padding + (canvas.width - padding * 2 - bounds.width * scale) / 2;
    const offsetY = padding + (canvas.height - padding * 2 - bounds.height * scale) / 2;

    // Convert minimap coordinates to world coordinates
    const worldX = bounds.minX + (x - offsetX) / scale;
    const worldY = bounds.minY + (y - offsetY) / scale;

    // Center the viewport on the clicked position
    const viewportWorldWidth = this.viewport.width / this.zoom;
    const viewportWorldHeight = this.viewport.height / this.zoom;

    const newViewportX = worldX - viewportWorldWidth / 2;
    const newViewportY = worldY - viewportWorldHeight / 2;

    // Emit viewport change
    this.viewportChange.emit({
      x: newViewportX,
      y: newViewportY
    });
  }

  /**
   * Toggle minimap visibility
   */
  toggleVisibility(): void {
    this.visible = !this.visible;
    this.visibilityChange.emit(this.visible);
  }
}
