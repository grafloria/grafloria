import { AfterViewInit, Component, OnDestroy, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { SnapController } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

/** Delete B out of A→B→C and the chain HEALS: its two edges cascade away and a
 *  fresh A→C bridge is drawn. Select a node, press Delete/Backspace — the heal
 *  reads getIncomers × getOutgoers, removes the node, then commits one real,
 *  undoable bridge link through the shipped SnapController command. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges"
      style="display:block; height:100vh" />
  `,
})
export class DeleteMiddleNodeComponent implements AfterViewInit, OnDestroy {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes = [
    { id: 'a', position: { x: 60,  y: 120 }, size: { width: 160, height: 80 }, label: 'A' },
    { id: 'b', position: { x: 340, y: 120 }, size: { width: 160, height: 80 }, label: 'B (middle)' },
    { id: 'c', position: { x: 620, y: 120 }, size: { width: 160, height: 80 }, label: 'C' },
  ];
  edges = [
    { id: 'ab', source: 'a', target: 'b' },
    { id: 'bc', source: 'b', target: 'c' },
  ];
  private keyHandler?: (e: KeyboardEvent) => void;

  ngAfterViewInit() {
    const engine = this.canvas().activeEngine();
    const m = engine?.getDiagram();
    if (engine && m) {
      const snap = new SnapController();
      const eng = engine as any;
      const model = m as any;
      const healDelete = async (id: string) => {
        const links = model.getLinks();
        const incomers = [...new Set(links.filter((l: any) => l.targetNodeId === id).map((l: any) => l.sourceNodeId))] as string[];
        const outgoers = [...new Set(links.filter((l: any) => l.sourceNodeId === id).map((l: any) => l.targetNodeId))] as string[];
        await eng.removeNode(id);
        for (const s of incomers) for (const t of outgoers) {
          if (s === t) continue;
          const sn = model.getNode(s), tn = model.getNode(t);
          if (!sn || !tn) continue;
          if (model.getLinks().some((l: any) => l.sourceNodeId === s && l.targetNodeId === t)) continue;
          const candidate = {
            sourcePort: sn.getPortBySide('right') ?? sn.getPorts()[0],
            targetPort: tn.getPortBySide('left') ?? tn.getPorts()[0],
            sourceNodeId: s, targetNodeId: t, distance: 0,
          };
          eng.commandManager.execute(snap.buildProximityLinkCommand(candidate));
        }
      };
      this.keyHandler = (e: KeyboardEvent) => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        const sel = model.getSelectedNodes ? model.getSelectedNodes() : [];
        if (!sel.length) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        (async () => { for (const n of sel) await healDelete(n.id); })();
      };
      window.addEventListener('keydown', this.keyHandler, true);
    }
    markReady();
  }

  ngOnDestroy() {
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler, true);
  }
}
