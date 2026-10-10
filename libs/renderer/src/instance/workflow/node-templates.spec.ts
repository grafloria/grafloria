import { SetNodeDataCommand } from '@grafloria/engine';
import type { PortModel } from '@grafloria/engine';
import { createDiagram } from '../create-diagram';
import type { CreateDiagramOptions, DiagramInstance } from '../create-diagram';
import type { NodeTemplate, NodeTemplateDef } from './node-templates';

function makeContainer(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800, right: 1200, bottom: 800 }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

/** A Switch card: a header, then one row per rule, each row marking its output port. */
const SWITCH: NodeTemplate = {
  render: (data) => {
    const rules = (data['rules'] as string[]) ?? [];
    return {
      html: `<div class="hd">Switch</div>${rules.map((r, i) => `<div class="row" data-port="sw:out${i}" data-row="${i}">${r}</div>`).join('')}`,
      ports: [{ id: 'sw:in', side: 'left', type: 'input' }, ...rules.map((r, i) => ({ id: `sw:out${i}`, side: 'right' as const, type: 'output' as const, index: i, label: { text: r } }))],
      size: { width: 200, height: 40 + rules.length * 30 },
    };
  },
  compact: (data) => `<div class="mini">⇄ ${(data['rules'] as string[]).length}</div>`,
};
const STEP: NodeTemplate = () => ({
  html: '<div class="step">Step</div>',
  ports: [{ id: 'in', side: 'left', type: 'input' }, { id: 'out', side: 'right', type: 'output' }],
  size: { width: 120, height: 60 },
});

/** jsdom lays nothing out: give each row the box a browser would (header 40, rows 30 tall). */
function layOutRows(): () => void {
  const real = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const host = this.closest('.grafloria-node-host') as HTMLElement | null;
    if (host && this === host) {
      const left = parseFloat(host.style.left) || 0;
      const top = parseFloat(host.style.top) || 0;
      return { left, top, width: parseFloat(host.style.width) || 0, height: parseFloat(host.style.height) || 0, right: 0, bottom: 0 } as DOMRect;
    }
    const row = this.getAttribute?.('data-row');
    if (host && row !== null && row !== undefined) {
      const left = parseFloat(host.style.left) || 0;
      const top = (parseFloat(host.style.top) || 0) + 40 + Number(row) * 30;
      return { left, top, width: 200, height: 30, right: left + 200, bottom: top + 30 } as DOMRect;
    }
    return real.call(this);
  };
  return () => {
    Element.prototype.getBoundingClientRect = real;
  };
}

describe('node templates: (data) → card, ports and size — re-derived on every data edit', () => {
  let container: HTMLElement;
  let d: DiagramInstance | undefined;
  let restore: (() => void) | undefined;
  beforeEach(() => {
    container = makeContainer();
    restore = layOutRows();
  });
  afterEach(() => {
    d?.dispose();
    d = undefined;
    container.remove();
    restore?.();
  });
  const mount = (extra: Partial<CreateDiagramOptions> = {}) => {
    d = createDiagram(container, {
      nodeTemplates: { switch: SWITCH, step: STEP },
      nodes: [
        { id: 'sw', type: 'switch', position: { x: 0, y: 0 }, data: { rules: ['a', 'b', 'c'] } } as never,
        { id: 'x', type: 'step', position: { x: 400, y: 0 } } as never,
      ],
      edges: [{ id: 'wire', source: 'sw', sourceHandle: 'sw:out2', target: 'x', targetHandle: 'in' }],
      ...extra,
    });
    return d;
  };
  const host = (id: string) => container.querySelector(`.grafloria-node-host[data-node-id="${id}"]`) as HTMLElement;
  const outs = () => ([...d!.getModel().getNode('sw')!.ports.values()] as PortModel[]).filter((p) => p.type === 'output').map((p) => p.id);

  it('paints the card from its data, with the template\'s ports and size; edges may name those ports', () => {
    mount();
    expect(host('sw').querySelectorAll('.row')).toHaveLength(3);
    expect(host('sw').getAttribute('data-lod')).toBe('full');
    expect(outs()).toEqual(['sw:out0', 'sw:out1', 'sw:out2']);
    expect(d!.getModel().getNode('sw')!.size.height).toBe(130);
    expect(d!.getModel().getLink('wire')!.sourcePortId).toBe('sw:out2');
  });

  it('a data edit repaints the card and re-derives ports in ONE undo step (wire on a dropped rule included)', async () => {
    mount();
    await d!.getEngine().commandManager.execute(new SetNodeDataCommand('sw', { rules: ['a', 'b', 'c', 'd'] }));
    d!.renderNow();
    expect(host('sw').querySelectorAll('.row')).toHaveLength(4);
    expect(outs()).toHaveLength(4);
    await d!.getEngine().commandManager.execute(new SetNodeDataCommand('sw', { rules: ['a'] }));
    d!.renderNow();
    expect(d!.getModel().getLink('wire')).toBeUndefined();
    await d!.getEngine().undo();
    d!.renderNow();
    expect(host('sw').querySelectorAll('.row')).toHaveLength(4);
    expect(outs()).toHaveLength(4);
    expect(d!.getModel().getLink('wire')!.sourcePortId).toBe('sw:out2');
  });

  it('anchors each output port on the right edge, level with its row', () => {
    mount();
    d!.renderNow();
    const port = (id: string) => d!.getModel().getNode('sw')!.getPort(id) as PortModel;
    expect(port('sw:out0').layout).toEqual({ strategy: 'absolute', args: { units: 'px', x: 200, y: 55 } });
    expect(port('sw:out2').layout).toEqual({ strategy: 'absolute', args: { units: 'px', x: 200, y: 115 } });
    expect(port('sw:in').layout).toBeUndefined(); // no row marks it: the side layout stays
  });

  it('a wire FOLLOWS its port when anchoring moves it — on the frames the library schedules, no renderNow()', async () => {
    mount();
    const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await frames();
    await frames();
    const start = () => {
      const d0 = container.querySelector('[data-link-id="wire"] path')?.getAttribute('d') ?? '';
      const m = /M\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(d0);
      return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
    };
    // sw:out2 is anchored to its row: right edge (x 200), y 40 + 2 × 30 + 15 = 115.
    expect(start()).toEqual({ x: 200, y: 115 });
  });

  it('data-port-anchor="element": a right port takes its x from its element too, and its wire starts there', () => {
    const marked: NodeTemplate = (data, c) => {
      const out = (SWITCH as NodeTemplateDef).render(data, c);
      return { ...out, html: String(out.html).replace('data-port="sw:out2"', 'data-port="sw:out2" data-port-anchor="element"') };
    };
    mount({ nodeTemplates: { switch: marked, step: STEP } });
    d!.renderNow();
    const port = (id: string) => d!.getModel().getNode('sw')!.getPort(id) as PortModel;
    // The row is 200 wide from the card's left: its centre is x 100, not the edge (200).
    expect(port('sw:out2').layout).toEqual({ strategy: 'absolute', args: { units: 'px', x: 100, y: 115 } });
    expect(port('sw:out0').layout).toEqual({ strategy: 'absolute', args: { units: 'px', x: 200, y: 55 } }); // unmarked: the edge
    d!.renderNow();
    const d0 = container.querySelector('[data-link-id="wire"] path')?.getAttribute('d') ?? '';
    const m = /M\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(d0);
    expect(m && { x: Number(m[1]), y: Number(m[2]) }).toEqual({ x: 100, y: 115 });
    // …and runs STRAIGHT to the box edge first: the card's own box is not an
    // obstacle for its inside port (it used to escape down and around).
    const pts = d!.getModel().getLink('wire')!.points;
    expect(pts[0]).toEqual({ x: 100, y: 115 });
    expect(pts[1]).toEqual({ x: 200, y: 115 });

    // A bend added to it keeps the user's waypoint and drops the box-edge point,
    // which would otherwise be a fixed waypoint, stale once the card moves.
    const link = d!.getModel().getLink('wire')!;
    link.points = [{ x: 100, y: 115 }, { x: 200, y: 115 }, { x: 300, y: 115 }, { x: 300, y: 30 }, { x: 400, y: 30 }];
    link.setMetadata('hasManualWaypoints', true);
    d!.renderNow();
    expect(link.points.map((p) => [p.x, p.y])).toEqual([[200, 115], [300, 115], [300, 30], [400, 30]]);
    const drawn = container.querySelector('[data-link-id="wire"] path')?.getAttribute('d') ?? '';
    expect(/^M\s*100[ ,]+115/.test(drawn)).toBe(true); // the lead is still drawn from the port
  });

  it("portAnchor: 'element' on the template does it for every marked port", () => {
    mount({ nodeTemplates: { switch: { ...(SWITCH as NodeTemplateDef), portAnchor: 'element' }, step: STEP } });
    d!.renderNow();
    const port = (id: string) => d!.getModel().getNode('sw')!.getPort(id) as PortModel;
    expect(port('sw:out0').layout).toEqual({ strategy: 'absolute', args: { units: 'px', x: 100, y: 55 } });
    expect(port('sw:out2').layout).toEqual({ strategy: 'absolute', args: { units: 'px', x: 100, y: 115 } });
  });

  it('below compactBelow the card draws its compact form (data-lod="compact"), and back', () => {
    mount({ compactBelow: 0.6 });
    d!.viewport.setZoom(0.5);
    d!.renderNow();
    expect(host('sw').querySelector('.mini')?.textContent).toBe('⇄ 3');
    expect(host('sw').getAttribute('data-lod')).toBe('compact');
    d!.viewport.setZoom(1);
    d!.renderNow();
    expect(host('sw').querySelectorAll('.row')).toHaveLength(3);
    expect(host('sw').getAttribute('data-lod')).toBe('full');
  });

  it('insertNodeOnLink with a templated type uses the template\'s ports', async () => {
    mount();
    const r = (await d!.insertNodeOnLink('wire', { id: 'mid', type: 'step' } as never))!;
    expect(d!.getModel().getLink(r.upstreamLinkId)!.targetPortId).toBe('in');
    expect(d!.getModel().getLink(r.downstreamLinkId)!.sourcePortId).toBe('out');
  });

  describe('a host that keeps its OWN state and reconciles with setNodes / setEdges', () => {
    const spec = (rules: string[], title = 'Switch') => [
      { id: 'sw', type: 'switch', position: { x: 0, y: 0 }, data: { rules, title } } as never,
      { id: 'x', type: 'step', position: { x: 400, y: 0 } } as never,
    ];

    it('a data change through setNodes REPAINTS the card — on the frame setNodes schedules, not only on renderNow()', async () => {
      mount();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      d!.setNodes(spec(['a', 'b', 'c', 'renamed']));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      expect(Array.from(host('sw').querySelectorAll('.row')).map((r) => r.textContent)).toEqual(['a', 'b', 'c', 'renamed']);
    });

    it('…re-derives the ports, so a following setEdges can name the new one', () => {
      mount();
      d!.setNodes(spec(['a', 'b', 'c', 'd']));
      expect(outs()).toEqual(['sw:out0', 'sw:out1', 'sw:out2', 'sw:out3']);
      expect(d!.getModel().getNode('sw')!.size.height).toBe(160);
      d!.setEdges([
        { id: 'wire', source: 'sw', sourceHandle: 'sw:out2', target: 'x', targetHandle: 'in' },
        { id: 'w4', source: 'sw', sourceHandle: 'sw:out3', target: 'x', targetHandle: 'in' },
      ]);
      expect(d!.getModel().getLink('w4')!.sourcePortId).toBe('sw:out3');
    });

    it('…drops the wire on a vanished port, and leaves NO undo entry (the host keeps its own undo)', () => {
      mount();
      const cm = d!.getEngine().commandManager;
      const before = cm.canUndo();
      d!.setNodes(spec(['a']));
      expect(outs()).toEqual(['sw:out0']);
      expect(d!.getModel().getLink('wire')).toBeUndefined();
      expect(cm.canUndo()).toBe(before);
    });
  });

  it('without nodeTemplates nothing changes: a node of that type keeps its spec ports', () => {
    d = createDiagram(container, { nodes: [{ id: 'sw', type: 'switch', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } } as never] });
    expect(d.getModel().getNode('sw')!.ports.size).toBe(4); // the four default side ports
    expect(host('sw')).toBeNull();
  });
});
