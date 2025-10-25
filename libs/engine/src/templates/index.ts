/**
 * Template System - Public API
 *
 * Template-driven node creation system for declarative diagram building
 */

// Type definitions
export * from './NodeTemplate';

// Core services
export { TemplateLoader } from './TemplateLoader';
export { TemplateRegistry } from './TemplateRegistry';
export { NodeFactory } from './NodeFactory';

// Re-export for convenience
export type {
  NodeTemplate,
  NodeStructureDefinition,
  TemplateMetadata,
  PortConfig,
  PortRenderingConfig,
  PortsConfig,
  HtmlConfig,
  FlexLayoutConfig,
  GridLayoutConfig,
  LayoutConfig,
  DragHandlerConfig,
  DataBindConfig,
  RepeaterConfig,
  ConnectionValidator,
  ValidationResult,
} from './NodeTemplate';
