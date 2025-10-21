// erd.ts - ERD (Entity Relationship Diagram) type library

import type { TypeRegistry } from '../../validation/TypeRegistry';

/**
 * ERD node type identifiers
 */
export const ERDTypes = {
  // Entities
  ENTITY: 'erd:entity',
  WEAK_ENTITY: 'erd:weak-entity',

  // Relationships
  RELATIONSHIP: 'erd:relationship',
  WEAK_RELATIONSHIP: 'erd:weak-relationship',
  ISA_RELATIONSHIP: 'erd:isa',

  // Attributes
  ATTRIBUTE: 'erd:attribute',
  KEY_ATTRIBUTE: 'erd:key-attribute',
  MULTIVALUED_ATTRIBUTE: 'erd:multivalued-attribute',
  DERIVED_ATTRIBUTE: 'erd:derived-attribute',
  COMPOSITE_ATTRIBUTE: 'erd:composite-attribute',
} as const;

/**
 * Register all ERD types with the type registry
 */
export function registerERDTypes(registry: TypeRegistry): void {
  // Entity - Rectangle for entities
  registry.registerNodeType({
    type: ERDTypes.ENTITY,
    label: 'Entity',
    description: 'An entity in the database',
    category: 'erd',
    family: 'entity',
    tags: ['entity', 'table', 'strong-entity'],
    minPorts: 0,
    maxPorts: 20,
    defaultSize: {
      width: 140,
      height: 70,
    },
    defaultStyle: {
      shape: 'rectangle',
      fill: '#E3F2FD',
      stroke: '#1976D2',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Weak Entity - Double-bordered rectangle
  registry.registerNodeType({
    type: ERDTypes.WEAK_ENTITY,
    label: 'Weak Entity',
    description: 'An entity that depends on a strong entity',
    extends: ERDTypes.ENTITY,
    category: 'erd',
    family: 'entity',
    tags: ['entity', 'weak-entity', 'dependent'],
    defaultStyle: {
      strokeWidth: 4, // Double border effect
    },
  });

  // Relationship - Diamond for relationships
  registry.registerNodeType({
    type: ERDTypes.RELATIONSHIP,
    label: 'Relationship',
    description: 'A relationship between entities',
    category: 'erd',
    family: 'relationship',
    tags: ['relationship', 'association'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 120,
      height: 120,
    },
    defaultStyle: {
      shape: 'diamond',
      fill: '#FFF3E0',
      stroke: '#F57C00',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Weak Relationship - Double-bordered diamond (identifying relationship)
  registry.registerNodeType({
    type: ERDTypes.WEAK_RELATIONSHIP,
    label: 'Weak Relationship',
    description: 'An identifying relationship for weak entities',
    extends: ERDTypes.RELATIONSHIP,
    category: 'erd',
    family: 'relationship',
    tags: ['relationship', 'weak-relationship', 'identifying'],
    defaultStyle: {
      strokeWidth: 4, // Double border effect
    },
  });

  // Attribute - Ellipse/Oval for attributes
  registry.registerNodeType({
    type: ERDTypes.ATTRIBUTE,
    label: 'Attribute',
    description: 'An attribute of an entity',
    category: 'erd',
    family: 'attribute',
    tags: ['attribute', 'property', 'field'],
    minPorts: 0,
    maxPorts: 5,
    defaultSize: {
      width: 100,
      height: 50,
    },
    defaultStyle: {
      shape: 'ellipse',
      fill: '#F3E5F5',
      stroke: '#7B1FA2',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Key Attribute - Underlined ellipse for primary keys
  registry.registerNodeType({
    type: ERDTypes.KEY_ATTRIBUTE,
    label: 'Key Attribute',
    description: 'A primary key attribute',
    extends: ERDTypes.ATTRIBUTE,
    category: 'erd',
    family: 'attribute',
    tags: ['attribute', 'primary-key', 'key'],
    defaultStyle: {
      textDecoration: 'underline',
      fontWeight: 'bold',
    },
  });

  // Multivalued Attribute - Double-bordered ellipse
  registry.registerNodeType({
    type: ERDTypes.MULTIVALUED_ATTRIBUTE,
    label: 'Multivalued Attribute',
    description: 'An attribute that can have multiple values',
    extends: ERDTypes.ATTRIBUTE,
    category: 'erd',
    family: 'attribute',
    tags: ['attribute', 'multivalued', 'collection'],
    defaultStyle: {
      strokeWidth: 4, // Double border effect
    },
  });

  // Derived Attribute - Dashed ellipse
  registry.registerNodeType({
    type: ERDTypes.DERIVED_ATTRIBUTE,
    label: 'Derived Attribute',
    description: 'An attribute whose value is calculated/derived',
    extends: ERDTypes.ATTRIBUTE,
    category: 'erd',
    family: 'attribute',
    tags: ['attribute', 'derived', 'calculated'],
    defaultStyle: {
      strokeDasharray: '5,5',
    },
  });

  // Composite Attribute - Ellipse for composite attributes
  registry.registerNodeType({
    type: ERDTypes.COMPOSITE_ATTRIBUTE,
    label: 'Composite Attribute',
    description: 'An attribute composed of multiple sub-attributes',
    extends: ERDTypes.ATTRIBUTE,
    category: 'erd',
    family: 'attribute',
    tags: ['attribute', 'composite', 'complex'],
    maxPorts: 10, // Can have multiple child attributes
  });

  // ISA Relationship - Triangle for inheritance/specialization
  registry.registerNodeType({
    type: ERDTypes.ISA_RELATIONSHIP,
    label: 'ISA',
    description: 'An "is-a" relationship for inheritance/specialization',
    category: 'erd',
    family: 'inheritance',
    tags: ['inheritance', 'specialization', 'generalization', 'isa'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 80,
      height: 70,
    },
    defaultStyle: {
      shape: 'triangle',
      fill: '#E8F5E9',
      stroke: '#388E3C',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });
}
