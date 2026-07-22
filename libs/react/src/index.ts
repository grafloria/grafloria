/**
 * `@grafloria/react` — React bindings for the Grafloria diagram engine.
 *
 * A thin shell over `@grafloria/renderer`'s headless `createDiagram()`. There is no
 * diagram logic in this package: hit-testing, panning, zooming, dragging,
 * connecting, scheduling and rendering all live in the framework-agnostic core,
 * and this library binds them to React's lifecycle.
 *
 * ```tsx
 * const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
 * const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
 *
 * <GrafloriaProvider>
 *   <GrafloriaFlow
 *     nodes={nodes} edges={edges}
 *     onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
 *     nodeTypes={{ card: CardNode }}
 *     fitView
 *   />
 *   <Toolbar />   // useGrafloria() reaches the instance from out here
 * </GrafloriaProvider>
 * ```
 *
 * Supports React 17, 18 and 19: no `useSyncExternalStore` (18+), no `createRoot`
 * (18+) — custom nodes mount through `createPortal`, which behaves identically
 * on all three.
 */

export { GrafloriaFlow } from './lib/grafloria-flow';
export type { GrafloriaFlowProps, NodeProps, NodeTypes } from './lib/grafloria-flow';

export { GrafloriaProvider, GrafloriaContext, createGrafloriaStore, useGrafloriaStore } from './lib/context';
export type { GrafloriaProviderProps, GrafloriaStore } from './lib/context';

export {
  useGrafloria,
  useNodesState,
  useEdgesState,
  useOnSelectionChange,
  useSelection,
  useViewport,
} from './lib/hooks';
export type { NodesState, EdgesState, SelectionChange } from './lib/hooks';

// Re-exported so a React app never has to import from two packages to describe
// a diagram.
export type {
  DiagramInstance,
  NodeSpec,
  EdgeSpec,
  PortSpec,
  HydrationSnapshot,
  StaticRenderOptions,
  StaticRenderResult,
  Theme,
} from '@grafloria/renderer';
export { renderToStaticSVG, LIGHT_THEME, DARK_THEME } from '@grafloria/renderer';
// Tier 2 (advanced domains): the dashboard kit, the React way.
export { GrafloriaDashboard } from './lib/grafloria-dashboard';
export type { GrafloriaDashboardProps, WidgetProps, WidgetTypes } from './lib/grafloria-dashboard';
export { GrafloriaDiagram } from './lib/grafloria-diagram';
export type { GrafloriaDiagramProps } from './lib/grafloria-diagram';
