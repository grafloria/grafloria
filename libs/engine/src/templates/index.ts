/**
 * Template System - Public API
 *
 * Template-driven node creation system for declarative diagram building
 */

// Core services
export { TemplateLoader } from './TemplateLoader';
export { TemplateRegistry } from './TemplateRegistry';
export { NodeFactory } from './NodeFactory';

// The 80 generated shape masters (BPMN / flowchart / UML / ERD) + their one-call
// bulk registrar — the bridge that un-orphans them into the registry/palette.
export { registerGeneratedTemplates, generatedTemplates } from './generated/register';

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
