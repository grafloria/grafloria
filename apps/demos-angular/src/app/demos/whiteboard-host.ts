import type { DiagramCanvasComponent } from '@grafloria/angular';

/**
 * Assemble the `WhiteboardHost` slice the whiteboard tools need
 * (createDrawTool / createEraserTool / createRectangleTool / createStrokeEditTool)
 * from a live Angular `DiagramCanvasComponent`. The tools plug into the SAME
 * gesture arbitration the canvas already runs, via the global `registerTool`
 * seam — this object just hands them the model, viewport, container and repaint
 * hook, exactly as the JS `render()` instance does.
 */
export function whiteboardHost(canvas: DiagramCanvasComponent, container: HTMLElement): any {
  return {
    getModel: () => canvas.activeEngine()!.getDiagram()!,
    getEngine: () => canvas.activeEngine() ?? null,
    get viewport() { return canvas.viewportController(); },
    container,
    render: () => canvas.scheduleRender(),
  };
}
