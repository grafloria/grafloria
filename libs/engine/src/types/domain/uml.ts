// uml.ts - UML (Unified Modeling Language) type library

import type { TypeRegistry } from '../../validation/TypeRegistry';

/**
 * UML node type identifiers
 */
export const UMLTypes = {
  // Classifiers
  CLASS: 'uml:class',
  INTERFACE: 'uml:interface',
  ABSTRACT_CLASS: 'uml:abstract-class',
  ENUM: 'uml:enum',

  // Structural Elements
  PACKAGE: 'uml:package',
  COMPONENT: 'uml:component',
  NODE: 'uml:node',

  // Use Case Elements
  ACTOR: 'uml:actor',
  USE_CASE: 'uml:use-case',

  // State Machine Elements
  STATE: 'uml:state',
  INITIAL_STATE: 'uml:initial-state',
  FINAL_STATE: 'uml:final-state',

  // Annotations
  NOTE: 'uml:note',
} as const;

/**
 * Register all UML types with the type registry
 */
export function registerUMLTypes(registry: TypeRegistry): void {
  // Class - Rectangle for classes
  registry.registerNodeType({
    type: UMLTypes.CLASS,
    label: 'Class',
    description: 'A class in the object-oriented model',
    category: 'uml',
    family: 'classifier',
    tags: ['classifier', 'class', 'object-oriented'],
    minPorts: 0,
    maxPorts: 20,
    defaultSize: {
      width: 120,
      height: 80,
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

  // Interface - Rectangle with <<interface>> stereotype
  registry.registerNodeType({
    type: UMLTypes.INTERFACE,
    label: 'Interface',
    description: 'An interface defining a contract',
    extends: UMLTypes.CLASS,
    category: 'uml',
    family: 'classifier',
    tags: ['classifier', 'interface', 'contract'],
    defaultStyle: {
      fill: '#F3E5F5',
      stroke: '#7B1FA2',
    },
  });

  // Abstract Class - Rectangle with italic name
  registry.registerNodeType({
    type: UMLTypes.ABSTRACT_CLASS,
    label: 'Abstract Class',
    description: 'An abstract class that cannot be instantiated',
    extends: UMLTypes.CLASS,
    category: 'uml',
    family: 'classifier',
    tags: ['classifier', 'abstract', 'class'],
    defaultStyle: {
      fill: '#FFF3E0',
      stroke: '#F57C00',
      fontStyle: 'italic',
    },
  });

  // Enum - Rectangle with <<enumeration>> stereotype
  registry.registerNodeType({
    type: UMLTypes.ENUM,
    label: 'Enumeration',
    description: 'An enumeration type',
    extends: UMLTypes.CLASS,
    category: 'uml',
    family: 'classifier',
    tags: ['classifier', 'enum', 'enumeration'],
    defaultStyle: {
      fill: '#E8F5E9',
      stroke: '#388E3C',
    },
  });

  // Package - Tab-folder shape for packages
  registry.registerNodeType({
    type: UMLTypes.PACKAGE,
    label: 'Package',
    description: 'A package for organizing elements',
    category: 'uml',
    family: 'structural',
    tags: ['structural', 'package', 'namespace', 'container'],
    minPorts: 0,
    maxPorts: 30,
    defaultSize: {
      width: 180,
      height: 120,
    },
    defaultStyle: {
      shape: 'package',
      fill: '#FFF9C4',
      stroke: '#F57F17',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Component - Rectangle with component icon
  registry.registerNodeType({
    type: UMLTypes.COMPONENT,
    label: 'Component',
    description: 'A modular part of the system',
    category: 'uml',
    family: 'structural',
    tags: ['structural', 'component', 'module'],
    minPorts: 0,
    maxPorts: 20,
    defaultSize: {
      width: 140,
      height: 90,
    },
    defaultStyle: {
      shape: 'component',
      fill: '#E0F7FA',
      stroke: '#00838F',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Node - 3D cube for deployment nodes
  registry.registerNodeType({
    type: UMLTypes.NODE,
    label: 'Node',
    description: 'A physical or virtual deployment node',
    category: 'uml',
    family: 'deployment',
    tags: ['deployment', 'node', 'infrastructure'],
    minPorts: 0,
    maxPorts: 15,
    defaultSize: {
      width: 120,
      height: 100,
    },
    defaultStyle: {
      shape: 'cube',
      fill: '#FFEBEE',
      stroke: '#C62828',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Actor - Stick figure for actors
  registry.registerNodeType({
    type: UMLTypes.ACTOR,
    label: 'Actor',
    description: 'An external actor interacting with the system',
    category: 'uml',
    family: 'use-case',
    tags: ['use-case', 'actor', 'external', 'user'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 60,
      height: 80,
    },
    defaultStyle: {
      shape: 'actor',
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: false, // Actors typically maintain aspect ratio
      selectable: true,
    },
  });

  // Use Case - Ellipse for use cases
  registry.registerNodeType({
    type: UMLTypes.USE_CASE,
    label: 'Use Case',
    description: 'A use case representing system functionality',
    category: 'uml',
    family: 'use-case',
    tags: ['use-case', 'functionality', 'requirement'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 140,
      height: 70,
    },
    defaultStyle: {
      shape: 'ellipse',
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

  // State - Rounded rectangle for states
  registry.registerNodeType({
    type: UMLTypes.STATE,
    label: 'State',
    description: 'A state in a state machine',
    category: 'uml',
    family: 'state-machine',
    tags: ['state-machine', 'state', 'behavior'],
    minPorts: 0,
    maxPorts: 15,
    defaultSize: {
      width: 120,
      height: 60,
    },
    defaultStyle: {
      shape: 'rounded-rectangle',
      fill: '#FFF3E0',
      stroke: '#F57C00',
      strokeWidth: 2,
      borderRadius: 12,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Initial State - Small filled circle
  registry.registerNodeType({
    type: UMLTypes.INITIAL_STATE,
    label: 'Initial State',
    description: 'The initial state in a state machine',
    category: 'uml',
    family: 'state-machine',
    tags: ['state-machine', 'initial', 'start'],
    minPorts: 0,
    maxPorts: 5,
    defaultSize: {
      width: 20,
      height: 20,
    },
    defaultStyle: {
      shape: 'circle',
      fill: '#000000',
      stroke: '#000000',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: false,
      selectable: true,
    },
  });

  // Final State - Circle with bull's-eye (thick border)
  registry.registerNodeType({
    type: UMLTypes.FINAL_STATE,
    label: 'Final State',
    description: 'A final state in a state machine',
    category: 'uml',
    family: 'state-machine',
    tags: ['state-machine', 'final', 'end', 'terminal'],
    minPorts: 0,
    maxPorts: 5,
    defaultSize: {
      width: 20,
      height: 20,
    },
    defaultStyle: {
      shape: 'circle',
      fill: '#FFFFFF',
      stroke: '#000000',
      strokeWidth: 4, // Thick border for bull's-eye effect
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: false,
      selectable: true,
    },
  });

  // Note - Rectangle with folded corner
  registry.registerNodeType({
    type: UMLTypes.NOTE,
    label: 'Note',
    description: 'A note or comment',
    category: 'uml',
    family: 'annotation',
    tags: ['annotation', 'note', 'comment', 'documentation'],
    minPorts: 0,
    maxPorts: 5,
    defaultSize: {
      width: 100,
      height: 80,
    },
    defaultStyle: {
      shape: 'note',
      fill: '#FFFDE7',
      stroke: '#F57F17',
      strokeWidth: 1,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });
}
