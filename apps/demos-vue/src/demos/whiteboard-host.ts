import type { DiagramInstance } from '@grafloria/vue';

/**
 * Assemble the `WhiteboardHost` slice the whiteboard tools need
 * (createDrawTool / createEraserTool / createRectangleTool / createStrokeEditTool)
 * from a live Vue DiagramInstance. The tools plug into the SAME gesture
 * arbitration the canvas already runs, via the global `registerTool` seam —
 * this object just hands them the model, viewport, container and repaint hook,
 * exactly as the JS `render()` instance does.
 */
export function whiteboardHost(instance: DiagramInstance, container: HTMLElement): any {
  return {
    getModel: () => instance.getEngine().getDiagram(),
    getEngine: () => instance.getEngine(),
    get viewport() {
      return (instance as unknown as { viewport: unknown }).viewport;
    },
    container,
    render: () => instance.renderNow(),
  };
}
