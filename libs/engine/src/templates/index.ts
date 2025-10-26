/**
 * Template System - Public API
 *
 * Template-driven node creation system for declarative diagram building
 */

// Core services
export { TemplateLoader } from './TemplateLoader';
export { TemplateRegistry } from './TemplateRegistry';
export { NodeFactory } from './NodeFactory';

// Export only template-specific types (not layout types which are exported from ./types)
export type {
  NodeTemplate,
  NodeStructureDefinition,
  TemplateMetadata,
  PortConfig,
  PortRenderingConfig,
  PortsConfig,
  PortRenderingMode,
  PortVisibility,
  FlexDirection,
  NodeRole,
  ShapeType,
  ShapeConfig,
  HtmlConfig,
  DragHandlerConfig,
  DataBindConfig,
  RepeaterConfig,
  ConnectionValidator,
  ValidationResult,
} from './NodeTemplate';
