/**
 * Extended Diagram Types - BPMN, ERD, UML support
 *
 * Provides parsers and generators for extended diagram types
 * beyond basic flowcharts.
 */

// ERD (Entity Relationship Diagrams)
export { ERDParser, type ERDEntity, type ERDField, type ERDRelationship, type ERDDiagram } from './ERDParser';
export { ERDGenerator, type ERDGeneratorOptions } from './ERDGenerator';
export { ERDTransformer, type ERDTransformOptions } from './ERDTransformer';

// BPMN (Business Process Model and Notation)
export { BPMNParser, type BPMNNode, type BPMNFlow, type BPMNDiagram, type BPMNNodeType } from './BPMNParser';
export { BPMNGenerator, type BPMNGeneratorOptions } from './BPMNGenerator';

// UML (Unified Modeling Language)
export {
  UMLParser,
  type UMLClass,
  type UMLAttribute,
  type UMLMethod,
  type UMLParameter,
  type UMLRelationship,
  type UMLDiagram,
  type Visibility,
  type RelationshipType,
} from './UMLParser';
export { UMLGenerator, type UMLGeneratorOptions } from './UMLGenerator';
