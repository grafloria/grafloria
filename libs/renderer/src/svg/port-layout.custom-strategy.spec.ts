/**
 * S12 (docs review v4): `PortLayoutSpec.strategy` was a closed union of the
 * built-in names, so a strategy installed with `registerPortLayout('pinRow', …)`
 * could not be SELECTED without a cast — extend-connections-and-style overrode
 * the built-in `line` to dodge it. The field takes any registered name now (the
 * built-ins still autocomplete). This file is the type test: it does not
 * compile against the closed union.
 */
import type { PortSpec } from '../instance/model-input';
import { createDiagram } from '../instance/create-diagram';
import { registerPortLayout, runPortLayout, type PortLayoutSpec } from './port-layout';

registerPortLayout('pinRow', (input) => ({ x: ((input.rank + 1) * input.width) / (input.count + 1), y: input.height }));

describe('S12: a registered custom port layout is selectable without a cast', () => {
  it('PortLayoutSpec accepts the custom name and runPortLayout uses it', () => {
    const spec: PortLayoutSpec = { strategy: 'pinRow' };
    const p = runPortLayout(spec, { width: 120, height: 60, side: 'bottom', rank: 0, count: 3, shapeType: 'rect' });
    expect(p).toEqual({ x: 30, y: 60 });
  });

  it('a node spec port can name it', () => {
    const port: PortSpec = { id: 'p1', side: 'bottom', layout: { strategy: 'pinRow' } };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = createDiagram(container, {
      nodes: [{ id: 'n', position: { x: 0, y: 0 }, size: { width: 120, height: 60 }, ports: [port] }],
    });
    expect(instance.getModel().getNode('n')!.getPort('p1')!.layout).toEqual({ strategy: 'pinRow' });
    instance.dispose();
    container.remove();
  });
});
