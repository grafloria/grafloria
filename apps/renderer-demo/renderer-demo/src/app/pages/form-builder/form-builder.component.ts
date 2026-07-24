import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { DiagramEngine, NodeModel } from '@grafloria/engine';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

@Component({
    imports: [CommonModule, DiagramCanvasComponent],
    selector: 'app-form-builder',
    templateUrl: './form-builder.component.html',
    styleUrl: './form-builder.component.css'
})
export class FormBuilderComponent implements OnInit {
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1200, height: 800 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  ngOnInit() {
    this.initializeEngine();
    this.createSampleForm();
  }

  private initializeEngine(): void {
    this.engine = new DiagramEngine();
  }

  private createSampleForm(): void {
    const diagram = this.engine.createDiagram('Form');

    // Enable automatic link rerouting when nodes move (Observer Pattern)
    this.engine.enableLiveRerouting();

    // Create form field nodes
    const fields = [
      { label: 'Text Input: Name', type: 'text', y: 100 },
      { label: 'Email Input: Email', type: 'email', y: 200 },
      { label: 'Dropdown: Country', type: 'select', y: 300 },
      { label: 'Checkbox: Subscribe', type: 'checkbox', y: 400 },
      { label: 'Submit Button', type: 'button', y: 500 }
    ];

    fields.forEach(field => {
      const node = new NodeModel({
        type: 'form-field',
        position: { x: 200, y: field.y },
        size: { width: 350, height: 60 }
      });
      node.setMetadata('label', field.label);
      node.setMetadata('fieldType', field.type);
      diagram.addNode(node);
    });

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
