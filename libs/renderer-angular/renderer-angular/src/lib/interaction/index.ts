// Interaction arbitration — single-active-tool routing for the canvas' mouse
// ladder. (wave14/ng-touch: `pointer-input` is gone — PointerInputController
// was a dead "unified pipeline" nothing ever constructed; touch now routes to
// the shared TouchGestureController in @grafloria/renderer instead.)
export * from './tool-manager';
