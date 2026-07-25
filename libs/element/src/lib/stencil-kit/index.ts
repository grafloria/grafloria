export { bindStencilPalette } from './palette';
export type {
  StencilPaletteApi,
  StencilPaletteOptions,
  StencilPaletteHandle,
} from './palette';
export { bindShapeDataPanel } from './shape-data';
export type { ShapeDataPanelApi, ShapeDataPanelOptions, ShapeDataPanelHandle } from './shape-data';
export { ensureStencilKitStyles } from './styles';
export {
  registerStencilBuilder, getStencilBuilder, unregisterStencilBuilder, registeredStencilBuilders,
} from './builders';
export type { StencilBuilder, StencilBuildContext } from './builders';
import { registerCardBuilders } from './card-builders';
// The ER/UML card builders ship registered — dropping "Entity" gives a real,
// editable table out of the box.
registerCardBuilders();
