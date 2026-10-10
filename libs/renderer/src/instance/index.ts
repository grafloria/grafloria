// The headless instance API: createDiagram() + the pieces it is built from.
// `diagram-instance` re-exports createDiagram and its types (and documents how
// the four wave-3 blockers were closed) — do NOT also `export * from
// './create-diagram'` here, or every symbol would arrive twice.
export * from './diagram-instance';
export * from './render-scheduler';
export * from './dom-event-binder';
export * from './model-input';
export * from './layers';
export { registerTextKit, textKitFor, type TextKit } from './text-kits';
// The workflow-editor features' public types (each feature is opt-in).
export type { RunOverlay, RunStatus } from './workflow/run-overlay';
export type { ClipboardHooks, PasteOptions } from './workflow/clipboard';
export type { InsertNodeOnLinkOptions, InsertNodeOnLinkResult } from './workflow/insert-on-link';
export type { FlowPlaceOptions, PlaceNodesOptions } from './workflow/flow-place';
export type { NodeTemplate, NodeTemplateDef, NodeTemplateFn, NodeTemplateContext, NodeTemplateOutput } from './workflow/node-templates';
export type { AffordanceOptions, PortAddRequest, LinkAddRequest } from './workflow/affordances';
export * from './load-text';
