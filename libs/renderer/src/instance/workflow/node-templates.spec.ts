import { SetNodeDataCommand } from '@grafloria/engine';
import type { PortModel } from '@grafloria/engine';
import { createDiagram } from '../create-diagram';
import type { CreateDiagramOptions, DiagramInstance } from '../create-diagram';
import type { NodeTemplate } from './node-templates';

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

  it('without nodeTemplates nothing changes: a node of that type keeps its spec ports', () => {
    d = createDiagram(container, { nodes: [{ id: 'sw', type: 'switch', position: { x: 0, y: 0 }, size: { width: 100, height: 50 } } as never] });
    expect(d.getModel().getNode('sw')!.ports.size).toBe(4); // the four default side ports
    expect(host('sw')).toBeNull();
  });
});
