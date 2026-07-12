import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { DiagramEngine, NodeModel } from '@grafloria/engine';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

@Component({
    imports: [CommonModule, DiagramCanvasComponent],
    selector: 'app-dashboard-builder',
    templateUrl: './dashboard-builder.component.html',
    styleUrl: './dashboard-builder.component.css'
})
export class DashboardBuilderComponent implements OnInit {
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1200, height: 800 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  ngOnInit() {
    this.initializeEngine();
    this.createSampleDashboard();
  }

  private initializeEngine(): void {
    this.engine = new DiagramEngine();
  }

  private createSampleDashboard(): void {
    const diagram = this.engine.createDiagram('Dashboard');

    // Enable automatic link rerouting when nodes move (Observer Pattern)
    this.engine.enableLiveRerouting();

    // Create dashboard widgets
    const chartNode1 = new NodeModel({
      type: 'widget',
      position: { x: 100, y: 100 },
      size: { width: 400, height: 250 }
    });
    chartNode1.setMetadata('widgetType', 'bar-chart');
    chartNode1.setMetadata('label', 'Sales by Region');

    const chartNode2 = new NodeModel({
      type: 'widget',
      position: { x: 550, y: 100 },
      size: { width: 400, height: 250 }
    });
    chartNode2.setMetadata('widgetType', 'line-chart');
    chartNode2.setMetadata('label', 'Revenue Trend');

    const tableNode = new NodeModel({
      type: 'widget',
      position: { x: 100, y: 400 },
      size: { width: 850, height: 300 }
    });
    tableNode.setMetadata('widgetType', 'data-table');
    tableNode.setMetadata('label', 'Recent Orders');

    diagram.addNode(chartNode1);
    diagram.addNode(chartNode2);
    diagram.addNode(tableNode);

    diagram.fitToView(100);
    this.updateViewportFromDiagram();
  }

  onViewportChanged(rect: Rectangle): void {
    this.viewport = rect;
  }

  onZoomChanged(newZoom: number): void {
    this.zoom = newZoom;
  }

  private updateViewportFromDiagram(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      const vp = diagram.getViewport();
      this.viewport = { x: vp.x, y: vp.y, width: vp.width, height: vp.height };
      this.zoom = vp.zoom;
    }
  }

  zoomIn(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.setZoom(Math.min(diagram.viewport.zoom * 1.1, 3.0));
      this.updateViewportFromDiagram();
    }
  }

  zoomOut(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.setZoom(Math.max(diagram.viewport.zoom / 1.1, 0.1));
      this.updateViewportFromDiagram();
    }
  }

  fitToView(): void {
    const diagram = this.engine.getDiagram();
    if (diagram) {
      diagram.fitToView(100);
      this.updateViewportFromDiagram();
    }
  }
}
