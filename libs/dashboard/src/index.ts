/**
 * @grafloria/dashboard — Grafloria Dashboards.
 *
 * The dashboard layout kit of the Grafloria engine, under its own name: the
 * same code as `@grafloria/element`'s dashboard kit, re-exported, so a project
 * that wants "a dashboard layout library" installs one package that says so.
 * `render` comes along because a board is rendered exactly like a diagram:
 * `render(dashboard({ widgets }), element)`.
 */
export {
  render,
  dashboard,
  bindDashboardGrid,
  fromDocument,
  ensureDashboardKitStyles,
  defaultWidgetRenderer,
  BUILT_IN_WIDGET_KINDS,
} from '@grafloria/element';
export type {
  DashboardOptions,
  DashboardSpec,
  DashboardSnapshot,
  DashboardHandle,
  DashboardViewSpec,
  DashboardWidgetSpec,
  WidgetHandle,
  WidgetRenderer,
  DragHandleOption,
  DragGripOptions,
  DashboardGridOptions,
  DashboardGridHandle,
} from '@grafloria/element';
