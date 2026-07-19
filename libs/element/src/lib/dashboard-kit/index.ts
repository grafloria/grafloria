export {
  bindDashboardGrid,
  type DashboardGridApi,
  type DashboardGridOptions,
  type DashboardGridHandle,
} from './grid-binder';
export {
  rowHeightFor,
  boardHeightFor,
  columnUnitFor,
  cellToRect,
  pointToCell,
  sizeToSpan,
  gridItemFromCell,
  cellFromGridItem,
  buildCommitCommands,
  type CellRect,
  type WorldRect,
  type DashboardGridGeometry,
  type TileDelta,
} from './grid-mapping';
export { ensureDashboardKitStyles, DASHBOARD_KIT_STYLE_ID } from './styles';
