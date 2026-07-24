import { AfterViewInit, Component, OnDestroy, viewChild } from '@angular/core';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { registerConnectionValidator, clearConnectionValidators } from '@grafloria/renderer';
import { markReady } from '../demo-ready';

/** A DAG that stays acyclic: a validator walks the live directed edges and
 *  refuses any connection whose target can already reach its source, so
 *  a→b→c→d can never close into a loop. */
@Component({
  standalone: true,
  imports: [DiagramCanvasComponent],
  template: `
    <div style="padding:8px 24px;font:12px/1.5 ui-monospace,monospace;opacity:.8;border-bottom:1px solid rgba(127,127,127,.25)">acyclic guard active on a→b→c→d</div>
    <grafloria-diagram-canvas [(nodes)]="nodes" [(edges)]="edges" style="display:block;height:calc(100vh - 40px)" />
  `,
})
export class PreventingCyclesComponent implements AfterViewInit, OnDestroy {
  canvas = viewChild.required(DiagramCanvasComponent);
  nodes: any[] = ['a', 'b', 'c', 'd'].map((id, i) => ({
    id, position: { x: 60 + i * 170, y: 120 }, size: { width: 110, height: 46 }, label: id.toUpperCase(),
  }));
  edges: any[] = [
    { id: 'ab', source: 'a', target: 'b' },
    { id: 'bc', source: 'b', target: 'c' },
    { id: 'cd', source: 'c', target: 'd' },
  ];
  private dispose?: () => void;

  ngAfterViewInit() {
    const model = this.canvas().activeEngine()?.getDiagram() as any;
    const reaches = (fromId: string, toId: string) => {
      const nodeOf = (portId: string, cached: string) => model.getNodeByPortId(portId)?.id ?? cached;
      const seen = new Set<string>(); const stack = [fromId];
      while (stack.length) {
        const cur = stack.pop()!;
        if (cur === toId) return true;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const link of model.getLinks()) {
          if (nodeOf(link.sourcePortId, link.sourceNodeId) === cur) stack.push(nodeOf(link.targetPortId, link.targetNodeId));
        }
      }
      return false;
    };
    clearConnectionValidators();
    this.dispose = registerConnectionValidator(({ sourceNode, targetNode }: any) => {
      if (!sourceNode || !targetNode || !model) return true;
      if (reaches(targetNode.id, sourceNode.id)) return 'Refused: would create a cycle';
      return true;
    }) as any;
    this.canvas().activeEngine()?.setInteractionConfig({ portVisibility: 'always' as never });
    markReady();
  }

  ngOnDestroy() { this.dispose?.(); clearConnectionValidators(); }
}
