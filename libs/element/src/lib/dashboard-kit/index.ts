export {
  bindDashboardGrid,
  type DashboardGridApi,
  type DashboardGridOptions,
  type DashboardGridHandle,
  type DashboardResponsiveOptions,
} from './grid-binder';
export {
  rowHeightFor,
  boardHeightFor,
  columnUnitFor,
  cellToRect,
  pointToCell,
  sizeToSpan,
  spanWidthPx,
  gridItemFromCell,
  cellFromGridItem,
  buildCommitCommands,
  type CellRect,
  type WorldRect,
  type DashboardGridGeometry,
  type TileDelta,
} from './grid-mapping';
export { ensureDashboardKitStyles, DASHBOARD_KIT_STYLE_ID } from './styles';

// The DATA-FIRST authoring API (the erDiagram/umlDiagram equivalent).
export {
  dashboard,
  type DashboardOptions,
  type DashboardSpec,
  type DashboardSnapshot,
  type DashboardHandle,
  type DashboardViewSpec,
  type DashboardWidgetSpec,
  type WidgetHandle,
} from './dashboard';

// The built-in renderers behind `kind` — dashboard()'s default renderWidget.
export {
  defaultWidgetRenderer,
  renderKpiWidget,
  renderLineWidget,
  renderBarWidget,
  renderDonutWidget,
  renderFunnelWidget,
  renderTableWidget,
  BUILT_IN_WIDGET_KINDS,
  type WidgetRenderer,
  type KpiWidgetData,
  type LineWidgetData,
  type LineSeries,
  type BarWidgetData,
  type DonutWidgetData,
  type FunnelWidgetData,
  type TableWidgetData,
} from './widgets';
