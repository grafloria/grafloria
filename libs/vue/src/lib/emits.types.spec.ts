/**
 * The emits carry their PAYLOAD TYPES, so `vue-tsc` (templates) and `tsc` (`h()`,
 * render functions) check a handler against what the component really hands it.
 *
 * This file is mostly a COMPILE-TIME test: ts-jest type-checks it, and every
 * `@ts-expect-error` below must find an error. With the old string-array emits
 * every handler was typed `(...args: any[]) => any`, nothing was ever rejected, and
 * the directives themselves failed the build as unused.
 */
import { h } from 'vue';
import type { LinkModel, NodeModel, SyncAdapter } from '@grafloria/engine';
import type { DiagramInstance, EdgeSpec, NodeSpec } from '@grafloria/renderer';
import type { DashboardHandle, DashboardWidgetSpec } from '@grafloria/element';
import { GrafloriaFlow } from './grafloria-flow';
import { GrafloriaDiagram } from './grafloria-diagram';
import { GrafloriaDashboard } from './grafloria-dashboard';
import { GrafloriaCommentPanel } from './grafloria-comment-panel';
import type { SelectionChange } from './composables';

describe('Vue emits are typed with their payloads', () => {
  it('handlers of the right shape compile', () => {
    const vnodes = [
      h(GrafloriaFlow, {
        'onUpdate:nodes': (nodes: NodeSpec[]) => nodes.length,
        'onUpdate:edges': (edges: EdgeSpec[]) => edges.length,
        onInit: (instance: DiagramInstance) => instance.fitView(),
        onSelectionChange: (change: SelectionChange) => change.nodes.length + change.edges.length,
        onConnect: (change: { link: LinkModel }) => change.link.id,
        onNodeClick: (change: { node: NodeModel; world: { x: number; y: number } }) => change.world.x,
        onEdgeClick: (change: { edge: LinkModel; world: { x: number; y: number } }) => change.edge.id,
        onLayoutDone: (result: unknown) => result,
        onCollabReady: (session: SyncAdapter) => session.flush(),
      }),
      h(GrafloriaDiagram, { spec: { nodes: [], edges: [] }, onReady: (instance: DiagramInstance) => instance.fitView() }),
      h(GrafloriaDashboard, {
        'onUpdate:activeView': (view: string) => view.length,
        onReady: (handle: DashboardHandle) => handle.views.length,
        onLayoutChange: (change: { viewId: string; widgets: DashboardWidgetSpec[] }) => change.widgets.length,
      }),
      h(GrafloriaCommentPanel, { store: {} as never, onSelect: (threadId: string | null) => threadId?.length }),
    ];
    expect(vnodes).toHaveLength(4);
  });

  it('handlers of the wrong shape are type errors', () => {
    const vnodes = [
      // @ts-expect-error — selectionChange hands a { nodes, edges } change, not a number
      h(GrafloriaFlow, { onSelectionChange: (n: number) => n.toFixed() }),
      // @ts-expect-error — init hands the DiagramInstance, not a string
      h(GrafloriaFlow, { onInit: (s: string) => s.trim() }),
      // @ts-expect-error — update:nodes hands NodeSpec[], not a single spec
      h(GrafloriaFlow, { 'onUpdate:nodes': (node: { id: number }) => node.id }),
      // @ts-expect-error — ready hands the DiagramInstance
      h(GrafloriaDiagram, { spec: { nodes: [], edges: [] }, onReady: (n: number) => n.toFixed() }),
      // @ts-expect-error — the dashboard's ready hands the DashboardHandle
      h(GrafloriaDashboard, { onReady: (n: number) => n.toFixed() }),
      // @ts-expect-error — select hands the thread id (a string, or null)
      h(GrafloriaCommentPanel, { store: {} as never, onSelect: (n: number) => n.toFixed() }),
    ];
    expect(vnodes).toHaveLength(6);
  });
});
