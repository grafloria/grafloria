/**
 * Extended Types Demo - ERD, BPMN, UML
 *
 * Demonstrates parsing and generating extended diagram types:
 * - ERD (Entity Relationship Diagrams) with table-like entities
 * - BPMN (Business Process Model) with proper notation
 * - UML (Class Diagrams) with classes and relationships
 */

import { DSL } from './DSL';
import { DiagramModel } from '../models/DiagramModel';

/**
 * Demo 1: ERD with table-like entities
 */
export function demoERD() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 1: ERD (Entity Relationship Diagram)');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false, debug: false });

  const erdText = `
erDiagram
  CUSTOMER {
    int id PK
    string name
    string email
    string phone
  }
  ORDER {
    int id PK
    int customer_id FK
    date order_date
    decimal total_amount
  }
  ORDER_ITEM {
    int id PK
    int order_id FK
    int product_id FK
    int quantity
    decimal price
  }
  PRODUCT {
    int id PK
    string name
    string description
    decimal price
    int stock_quantity
  }

  CUSTOMER ||--o{ ORDER : places
  ORDER ||--o{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : "ordered in"
  `.trim();

  console.log('📝 ERD DSL Input:');
  console.log(erdText);
  console.log();

  // Parse ERD
  console.log('⚙️  Parsing ERD...');
  const diagram = dsl.parseERD(erdText);
  console.log(`✅ Created diagram with ${diagram.getNodes().length} entities, ${diagram.getLinks().length} relationships`);
  console.log();

  // Show entity details
  console.log('📊 Entity Details (Table-like structure):');
  for (const node of diagram.getNodes()) {
    console.log(`\n   ${node.data['name']} (${node.id})`);
    console.log('   ' + '─'.repeat(40));
    if (node.data['fields'] && Array.isArray(node.data['fields'])) {
      for (const field of node.data['fields']) {
        const indicators = [];
        if (field.primaryKey) indicators.push('PK');
        if (field.foreignKey) indicators.push('FK');
        const indicator = indicators.length > 0 ? `[${indicators.join(',')}]` : '';
        console.log(`   ${field.name}: ${field.type} ${indicator}`);
      }
    }
  }
  console.log();

  // Generate back to text
  console.log('⚙️  Generating ERD DSL from diagram...');
  const generatedText = dsl.generateERD(diagram);
  console.log('📝 Generated ERD DSL:');
  console.log(generatedText);
  console.log();

  // Round-trip test
  console.log('🔄 Round-trip test...');
  const diagram2 = dsl.parseERD(generatedText);
  const success = diagram.getNodes().length === diagram2.getNodes().length &&
                  diagram.getLinks().length === diagram2.getLinks().length;
  console.log(`${success ? '✅ PASSED' : '❌ FAILED'}: ${diagram2.getNodes().length} entities, ${diagram2.getLinks().length} relationships`);
}

/**
 * Demo 2: BPMN with proper notation
 */
export function demoBPMN() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 2: BPMN (Business Process Model)');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false, debug: false });

  const bpmnText = `
flowchart TD
  Start([Start Event]) --> ReceiveOrder[Receive Order]
  ReceiveOrder --> ValidateOrder{Validate Order}
  ValidateOrder -->|Valid| ProcessPayment[Process Payment]
  ValidateOrder -->|Invalid| Reject([Reject Order])
  ProcessPayment --> PaymentOk{Payment OK?}
  PaymentOk -->|Yes| FulfillOrder[Fulfill Order]
  PaymentOk -->|No| PaymentFailed([Payment Failed])
  FulfillOrder --> ShipOrder[Ship Order]
  ShipOrder --> NotifyCustomer[Notify Customer]
  NotifyCustomer --> End([End Event])
  `.trim();

  console.log('📝 BPMN DSL Input:');
  console.log(bpmnText);
  console.log();

  // Parse BPMN
  console.log('⚙️  Parsing BPMN...');
  const diagram = dsl.parseBPMN(bpmnText);
  console.log(`✅ Created diagram with ${diagram.getNodes().length} nodes, ${diagram.getLinks().length} flows`);
  console.log();

  // Show node types
  console.log('📊 BPMN Elements:');
  const events = diagram.getNodes().filter(n => n.type.includes('event'));
  const tasks = diagram.getNodes().filter(n => n.type.includes('task') || n.type.includes('process'));
  const gateways = diagram.getNodes().filter(n => n.type.includes('gateway') || n.type.includes('decision'));

  console.log(`   Events: ${events.length}`);
  for (const node of events) {
    console.log(`     - ${node.data['label']} (${node.type})`);
  }

  console.log(`   Tasks: ${tasks.length}`);
  for (const node of tasks) {
    console.log(`     - ${node.data['label']} (${node.type})`);
  }

  console.log(`   Gateways: ${gateways.length}`);
  for (const node of gateways) {
    console.log(`     - ${node.data['label']} (${node.type})`);
  }
  console.log();

  // Generate back to text
  console.log('⚙️  Generating BPMN DSL from diagram...');
  const generatedText = dsl.generateBPMN(diagram);
  console.log('📝 Generated BPMN DSL:');
  console.log(generatedText);
  console.log();

  // Round-trip test
  console.log('🔄 Round-trip test...');
  const diagram2 = dsl.parseBPMN(generatedText);
  const success = diagram.getNodes().length === diagram2.getNodes().length &&
                  diagram.getLinks().length === diagram2.getLinks().length;
  console.log(`${success ? '✅ PASSED' : '❌ FAILED'}: ${diagram2.getNodes().length} nodes, ${diagram2.getLinks().length} flows`);
}

/**
 * Demo 3: UML Class Diagram
 */
export function demoUML() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 3: UML Class Diagram');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false, debug: false });

  const umlText = `
classDiagram
  class Animal {
    <<abstract>>
    + String name
    + int age
    + makeSound(): void
    + move(): void
  }

  class Dog {
    + String breed
    + bark(): void
    + wagTail(): void
  }

  class Cat {
    + boolean indoor
    + meow(): void
    + purr(): void
  }

  class Owner {
    + String name
    + String address
    + adoptPet(pet: Animal): void
  }

  Animal <|-- Dog
  Animal <|-- Cat
  Owner o-- Animal : owns
  `.trim();

  console.log('📝 UML DSL Input:');
  console.log(umlText);
  console.log();

  // Parse UML
  console.log('⚙️  Parsing UML...');
  const diagram = dsl.parseUML(umlText);
  console.log(`✅ Created diagram with ${diagram.getNodes().length} classes, ${diagram.getLinks().length} relationships`);
  console.log();

  // Show class details
  console.log('📊 Class Details:');
  for (const node of diagram.getNodes()) {
    console.log(`\n   ${node.data['name']}`);
    if (node.data['stereotype']) {
      console.log(`   <<${node.data['stereotype']}>>`);
    }
    console.log('   ' + '─'.repeat(40));

    if (node.data['attributes'] && Array.isArray(node.data['attributes'])) {
      console.log('   Attributes:');
      for (const attr of node.data['attributes']) {
        console.log(`     ${attr.visibility} ${attr.name}: ${attr.type}`);
      }
    }

    if (node.data['methods'] && Array.isArray(node.data['methods'])) {
      console.log('   Methods:');
      for (const method of node.data['methods']) {
        const params = method.parameters.map((p: any) => `${p.name}: ${p.type}`).join(', ');
        const returnType = method.returnType ? `: ${method.returnType}` : '';
        console.log(`     ${method.visibility} ${method.name}(${params})${returnType}`);
      }
    }
  }
  console.log();

  // Show relationships
  console.log('📊 Relationships:');
  for (const link of diagram.getLinks()) {
    const relType = link.getMetadata('umlRelationship') || 'association';
    const sourceNode = link.sourceNodeId ? diagram.getNode(link.sourceNodeId) : null;
    const targetNode = link.targetNodeId ? diagram.getNode(link.targetNodeId) : null;
    if (sourceNode && targetNode) {
      console.log(`   ${sourceNode.data['name']} --[${relType}]--> ${targetNode.data['name']}`);
    }
  }
  console.log();

  // Generate back to text
  console.log('⚙️  Generating UML DSL from diagram...');
  const generatedText = dsl.generateUML(diagram);
  console.log('📝 Generated UML DSL:');
  console.log(generatedText);
  console.log();

  // Round-trip test
  console.log('🔄 Round-trip test...');
  const diagram2 = dsl.parseUML(generatedText);
  const success = diagram.getNodes().length === diagram2.getNodes().length &&
                  diagram.getLinks().length === diagram2.getLinks().length;
  console.log(`${success ? '✅ PASSED' : '❌ FAILED'}: ${diagram2.getNodes().length} classes, ${diagram2.getLinks().length} relationships`);
}

/**
 * Demo 4: ERD with complex relationships
 */
export function demoERDComplex() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 4: ERD with Complex Cardinality');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false });

  const erdText = `
erDiagram
  USER {
    int id PK
    string username UNIQUE
    string email UNIQUE
    string password_hash
  }

  PROJECT {
    int id PK
    string name
    string description
    date created_at
  }

  TASK {
    int id PK
    int project_id FK
    int assigned_to FK
    string title
    string status
    date due_date
  }

  COMMENT {
    int id PK
    int task_id FK
    int user_id FK
    string content
    timestamp created_at
  }

  USER ||--o{ PROJECT : creates
  USER ||--o{ TASK : "assigned to"
  PROJECT ||--o{ TASK : contains
  TASK ||--o{ COMMENT : has
  USER ||--o{ COMMENT : writes
  `.trim();

  console.log('📝 Complex ERD Input:');
  console.log(erdText);
  console.log();

  const diagram = dsl.parseERD(erdText);
  console.log(`✅ Parsed: ${diagram.getNodes().length} entities, ${diagram.getLinks().length} relationships`);
  console.log();

  // Analyze relationships
  console.log('📊 Relationship Analysis:');
  for (const link of diagram.getLinks()) {
    const sourceNode = link.sourceNodeId ? diagram.getNode(link.sourceNodeId) : null;
    const targetNode = link.targetNodeId ? diagram.getNode(link.targetNodeId) : null;
    if (sourceNode && targetNode) {
      const label = link.data['label'] || 'related to';
      console.log(`   ${sourceNode.data['name']} --> ${targetNode.data['name']} (${label})`);
    }
  }
}

/**
 * Demo 5: Comparison of all three types
 */
export function demoComparison() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 5: Extended Types Comparison');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false });

  // Simple examples
  const erdText = `
erDiagram
  AUTHOR {
    int id PK
    string name
  }
  BOOK {
    int id PK
    int author_id FK
    string title
  }
  AUTHOR ||--o{ BOOK : writes
  `.trim();

  const bpmnText = `
flowchart TD
  Start([Start]) --> Process[Process]
  Process --> End([End])
  `.trim();

  const umlText = `
classDiagram
  class Person {
    + String name
    + greet(): void
  }
  `.trim();

  console.log('Parsing three diagram types with similar complexity...\n');

  const erdDiagram = dsl.parseERD(erdText);
  console.log(`ERD:  ${erdDiagram.getNodes().length} entities, ${erdDiagram.getLinks().length} relationships`);

  const bpmnDiagram = dsl.parseBPMN(bpmnText);
  console.log(`BPMN: ${bpmnDiagram.getNodes().length} nodes, ${bpmnDiagram.getLinks().length} flows`);

  const umlDiagram = dsl.parseUML(umlText);
  console.log(`UML:  ${umlDiagram.getNodes().length} classes, ${umlDiagram.getLinks().length} relationships`);

  console.log('\n✅ All three extended types working correctly');
}

/**
 * Run all extended type demos
 */
export function runAllExtendedDemos() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'Extended Types Demos' + ' '.repeat(29) + '║');
  console.log('║' + ' '.repeat(21) + 'ERD, BPMN, UML' + ' '.repeat(33) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  try {
    demoERD();
    demoBPMN();
    demoUML();
    demoERDComplex();
    demoComparison();

    console.log('\n' + '='.repeat(70));
    console.log('✅ All extended type demos completed successfully!');
    console.log('='.repeat(70) + '\n');
  } catch (error) {
    console.error('\n❌ Demo error:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// Auto-run demos
runAllExtendedDemos();
