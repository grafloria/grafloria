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

  // Activity Diagram Elements (Phase 3)
  ACTIVITY: 'uml:activity',
  DECISION: 'uml:decision',
  MERGE: 'uml:merge',
  FORK: 'uml:fork',
  JOIN: 'uml:join',
  INITIAL_NODE: 'uml:initial-node',
  FINAL_NODE: 'uml:final-node',
  ACTIVITY_PARTITION: 'uml:activity-partition',

  // Sequence Diagram Elements (Phase 3)
  LIFELINE: 'uml:lifeline',
  ACTIVATION: 'uml:activation',

  // Object-Oriented Elements (Phase 3)
  OBJECT: 'uml:object',
  DATATYPE: 'uml:datatype',
  PRIMITIVE_TYPE: 'uml:primitive-type',
  SIGNAL: 'uml:signal',

  // Composite Structure Elements (Phase 3)
  PORT: 'uml:port',
  PART: 'uml:part',
  COLLABORATION: 'uml:collaboration',
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

  // === Phase 3: Activity Diagram Elements ===

  // Activity - Rounded rectangle for activities
  registry.registerNodeType({
    type: UMLTypes.ACTIVITY,
    label: 'Activity',
    description: 'An activity in an activity diagram',
    category: 'uml',
    family: 'activity',
    tags: ['activity', 'action', 'behavior'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 120,
      height: 60,
    },
    defaultStyle: {
      shape: 'rounded-rectangle',
      fill: '#E3F2FD',
      stroke: '#1976D2',
      strokeWidth: 2,
      borderRadius: 20,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Decision - Diamond for decision nodes
  registry.registerNodeType({
    type: UMLTypes.DECISION,
    label: 'Decision',
    description: 'A decision/branch node in an activity diagram',
    category: 'uml',
    family: 'activity',
    tags: ['activity', 'decision', 'branch', 'conditional'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 50,
      height: 50,
    },
    defaultStyle: {
      shape: 'diamond',
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

  // Merge - Diamond for merge nodes
  registry.registerNodeType({
    type: UMLTypes.MERGE,
    label: 'Merge',
    description: 'A merge node in an activity diagram',
    extends: UMLTypes.DECISION,
    category: 'uml',
    family: 'activity',
    tags: ['activity', 'merge', 'join-flow'],
    defaultStyle: {
      fill: '#E8F5E9',
      stroke: '#388E3C',
    },
  });

  // Fork - Thick horizontal bar for fork/split nodes
  registry.registerNodeType({
    type: UMLTypes.FORK,
    label: 'Fork',
    description: 'A fork/split node for parallel flows',
    category: 'uml',
    family: 'activity',
    tags: ['activity', 'fork', 'split', 'parallel', 'concurrency'],
    minPorts: 0,
    maxPorts: 15,
    defaultSize: {
      width: 100,
      height: 10,
    },
    defaultStyle: {
      shape: 'rectangle',
      fill: '#000000',
      stroke: '#000000',
      strokeWidth: 1,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // Join - Thick horizontal bar for join/synchronization nodes
  registry.registerNodeType({
    type: UMLTypes.JOIN,
    label: 'Join',
    description: 'A join/synchronization node for parallel flows',
    extends: UMLTypes.FORK,
    category: 'uml',
    family: 'activity',
    tags: ['activity', 'join', 'sync', 'parallel', 'concurrency'],
  });

  // Initial Node - Filled circle for activity start
  registry.registerNodeType({
    type: UMLTypes.INITIAL_NODE,
    label: 'Initial Node',
    description: 'The starting point of an activity',
    category: 'uml',
    family: 'activity',
    tags: ['activity', 'initial', 'start'],
    minPorts: 0,
    maxPorts: 3,
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

  // Final Node - Bull's-eye circle for activity end
  registry.registerNodeType({
    type: UMLTypes.FINAL_NODE,
    label: 'Final Node',
    description: 'The ending point of an activity',
    category: 'uml',
    family: 'activity',
    tags: ['activity', 'final', 'end', 'terminal'],
    minPorts: 0,
    maxPorts: 3,
    defaultSize: {
      width: 24,
      height: 24,
    },
    defaultStyle: {
      shape: 'circle',
      fill: '#000000',
      stroke: '#000000',
      strokeWidth: 4,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: false,
      selectable: true,
    },
  });

  // Activity Partition - Swimlane for organizing activities
  registry.registerNodeType({
    type: UMLTypes.ACTIVITY_PARTITION,
    label: 'Activity Partition',
    description: 'A swimlane for organizing activities by responsibility',
    category: 'uml',
    family: 'activity',
    tags: ['activity', 'partition', 'swimlane', 'responsibility', 'container'],
    minPorts: 0,
    maxPorts: 0,
    defaultSize: {
      width: 200,
      height: 400,
    },
    defaultStyle: {
      shape: 'rectangle',
      fill: 'transparent',
      stroke: '#9E9E9E',
      strokeWidth: 2,
      strokeDasharray: '5,5',
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });

  // === Phase 3: Sequence Diagram Elements ===

  // Lifeline - Rectangle with dashed line for sequence diagrams
  registry.registerNodeType({
    type: UMLTypes.LIFELINE,
    label: 'Lifeline',
    description: 'A lifeline representing an object in a sequence diagram',
    category: 'uml',
    family: 'interaction',
    tags: ['sequence', 'interaction', 'lifeline', 'participant'],
    minPorts: 0,
    maxPorts: 20,
    defaultSize: {
      width: 100,
      height: 60,
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

  // Activation - Thin vertical rectangle for activation boxes
  registry.registerNodeType({
    type: UMLTypes.ACTIVATION,
    label: 'Activation',
    description: 'An activation box showing when an object is active',
    category: 'uml',
    family: 'interaction',
    tags: ['sequence', 'interaction', 'activation', 'execution'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 15,
      height: 80,
    },
    defaultStyle: {
      shape: 'rectangle',
      fill: '#FFFFFF',
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

  // === Phase 3: Object-Oriented Elements ===

  // Object - Underlined rectangle for object instances
  registry.registerNodeType({
    type: UMLTypes.OBJECT,
    label: 'Object',
    description: 'An instance of a class',
    extends: UMLTypes.CLASS,
    category: 'uml',
    family: 'classifier',
    tags: ['classifier', 'object', 'instance'],
    defaultStyle: {
      fill: '#F3E5F5',
      stroke: '#7B1FA2',
      textDecoration: 'underline',
    },
  });

  // Data Type - Rectangle for data types
  registry.registerNodeType({
    type: UMLTypes.DATATYPE,
    label: 'DataType',
    description: 'A data type defining a value',
    extends: UMLTypes.CLASS,
    category: 'uml',
    family: 'classifier',
    tags: ['classifier', 'datatype', 'value'],
    defaultStyle: {
      fill: '#E0F2F1',
      stroke: '#00695C',
    },
  });

  // Primitive Type - Rectangle for primitive types
  registry.registerNodeType({
    type: UMLTypes.PRIMITIVE_TYPE,
    label: 'PrimitiveType',
    description: 'A primitive type (int, string, bool, etc.)',
    extends: UMLTypes.DATATYPE,
    category: 'uml',
    family: 'classifier',
    tags: ['classifier', 'primitive', 'basic-type'],
    defaultStyle: {
      fill: '#E8EAF6',
      stroke: '#3F51B5',
    },
  });

  // Signal - Rectangle for signals
  registry.registerNodeType({
    type: UMLTypes.SIGNAL,
    label: 'Signal',
    description: 'A signal for asynchronous communication',
    category: 'uml',
    family: 'behavioral',
    tags: ['behavioral', 'signal', 'async', 'communication'],
    minPorts: 0,
    maxPorts: 10,
    defaultSize: {
      width: 100,
      height: 60,
    },
    defaultStyle: {
      shape: 'trapezoid',
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

  // === Phase 3: Composite Structure Elements ===

  // Port - Small square for ports on components
  registry.registerNodeType({
    type: UMLTypes.PORT,
    label: 'Port',
    description: 'A port on a component or class',
    category: 'uml',
    family: 'composite',
    tags: ['composite', 'port', 'interface-point'],
    minPorts: 0,
    maxPorts: 5,
    defaultSize: {
      width: 20,
      height: 20,
    },
    defaultStyle: {
      shape: 'rectangle',
      fill: '#FFFFFF',
      stroke: '#00838F',
      strokeWidth: 2,
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: false,
      selectable: true,
    },
  });

  // Part - Rectangle for parts in composite structures
  registry.registerNodeType({
    type: UMLTypes.PART,
    label: 'Part',
    description: 'A part in a composite structure',
    extends: UMLTypes.CLASS,
    category: 'uml',
    family: 'composite',
    tags: ['composite', 'part', 'component-part'],
    defaultSize: {
      width: 100,
      height: 60,
    },
    defaultStyle: {
      fill: '#E1F5FE',
      stroke: '#0277BD',
    },
  });

  // Collaboration - Dashed ellipse for collaborations
  registry.registerNodeType({
    type: UMLTypes.COLLABORATION,
    label: 'Collaboration',
    description: 'A collaboration between multiple elements',
    category: 'uml',
    family: 'composite',
    tags: ['composite', 'collaboration', 'interaction'],
    minPorts: 0,
    maxPorts: 15,
    defaultSize: {
      width: 140,
      height: 70,
    },
    defaultStyle: {
      shape: 'ellipse',
      fill: '#F3E5F5',
      stroke: '#7B1FA2',
      strokeWidth: 2,
      strokeDasharray: '5,5',
    },
    defaultBehavior: {
      draggable: true,
      deletable: true,
      resizable: true,
      selectable: true,
    },
  });
}
