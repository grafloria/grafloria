export { GrafloriaFlow } from './lib/grafloria-flow';
export type {
  GrafloriaFlowProps,
  GrafloriaLayoutRequest,
  GrafloriaCollabOptions,
  NodeProps,
  NodeTypes,
} from './lib/grafloria-flow';

// Re-export the shared spec vocabulary so Qwik apps need one import site.
export type { NodeSpec, EdgeSpec, DiagramInstance, Theme } from '@grafloria/renderer';
export { LIGHT_THEME, DARK_THEME } from '@grafloria/renderer';
// SSR: the server half of the resumable story. `renderToStaticSVG()` runs the
// real renderer in Node with no DOM; hand its result to `<GrafloriaFlow ssr>`.
export { renderToStaticSVG } from '@grafloria/renderer';
export type { StaticRenderOptions, StaticRenderResult, HydrationSnapshot } from '@grafloria/renderer';

export {
  GrafloriaProvider,
  GRAFLORIA_STORE,
  useGrafloria,
  useSelection,
  useOnSelectionChange$,
  useOnSelectionChangeQrl,
  useViewport,
} from './lib/hooks';
export type { GrafloriaStore, SelectionChange } from './lib/hooks';

// Tier 2 (advanced domains): the dashboard kit, the Qwik way.
export { GrafloriaDashboard } from './lib/grafloria-dashboard';
export type {
  GrafloriaDashboardProps,
  WidgetProps,
  WidgetTypes,
} from './lib/grafloria-dashboard';
export { GrafloriaDiagram } from './lib/grafloria-diagram';
export type { GrafloriaDiagramProps } from './lib/grafloria-diagram';
export { GrafloriaCommentPanel } from './lib/grafloria-comment-panel';
export type { GrafloriaCommentPanelProps } from './lib/grafloria-comment-panel';
