/**
 * Extended Types Round-Trip Tests
 *
 * Validates parse ↔ generate stability for ERD, BPMN, and UML diagrams.
 */

import { DSL } from './DSL';

interface TestCase {
  name: string;
  type: 'erd' | 'bpmn' | 'uml';
  input: string;
  expectedNodes: number;
  expectedLinks: number;
}

const testCases: TestCase[] = [
  // ERD Tests
  {
    name: 'Simple ERD with two entities',
    type: 'erd',
    input: `
erDiagram
  USER {
    int id PK
    string name
  }
  POST {
    int id PK
    int user_id FK
    string title
  }
  USER ||--o{ POST : creates
    `.trim(),
    expectedNodes: 2,
    expectedLinks: 1,
  },
  {
    name: 'ERD with multiple relationships',
    type: 'erd',
    input: `
erDiagram
  CUSTOMER {
    int id PK
    string name
    string email
  }
  ORDER {
    int id PK
    int customer_id FK
    date order_date
  }
  PRODUCT {
    int id PK
    string name
    decimal price
  }
  ORDER_ITEM {
    int id PK
    int order_id FK
    int product_id FK
    int quantity
  }
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--o{ ORDER_ITEM : contains
  PRODUCT ||--o{ ORDER_ITEM : "ordered in"
    `.trim(),
    expectedNodes: 4,
    expectedLinks: 3,
  },
  {
    name: 'ERD with various cardinalities',
    type: 'erd',
    input: `
erDiagram
  PERSON {
    int id PK
    string name
  }
  CAR {
    int id PK
    string model
  }
  PERSON ||--|| CAR : owns
    `.trim(),
    expectedNodes: 2,
    expectedLinks: 1,
  },

  // BPMN Tests
  {
    name: 'Simple BPMN linear flow',
    type: 'bpmn',
    input: `
flowchart TD
  Start([Start Event]) --> Process[Process Task]
  Process --> End([End Event])
    `.trim(),
    expectedNodes: 3,
    expectedLinks: 2,
  },
  {
    name: 'BPMN with decision gateway',
    type: 'bpmn',
    input: `
flowchart TD
  Start([Start]) --> Receive[Receive Order]
  Receive --> Check{Validate}
  Check -->|Valid| Process[Process]
  Check -->|Invalid| Reject([Reject])
  Process --> End([End])
    `.trim(),
    expectedNodes: 6,
    expectedLinks: 5,
  },
  {
    name: 'BPMN with multiple gateways',
    type: 'bpmn',
    input: `
flowchart TD
  Start([Start]) --> Task1[Task 1]
  Task1 --> Gateway1{Gateway 1}
  Gateway1 -->|A| Task2[Task 2]
  Gateway1 -->|B| Task3[Task 3]
  Task2 --> Gateway2{Gateway 2}
  Task3 --> Gateway2
  Gateway2 --> End([End])
    `.trim(),
    expectedNodes: 7,
    expectedLinks: 7,
  },

  // UML Tests
  {
    name: 'Simple UML with one class',
    type: 'uml',
    input: `
classDiagram
  class Person {
    + String name
    + int age
    + greet(): void
  }
    `.trim(),
    expectedNodes: 1,
    expectedLinks: 0,
  },
  {
    name: 'UML with inheritance',
    type: 'uml',
    input: `
classDiagram
  class Animal {
    <<abstract>>
    + String name
    + makeSound(): void
  }
  class Dog {
    + bark(): void
  }
  class Cat {
    + meow(): void
  }
  Animal <|-- Dog
  Animal <|-- Cat
    `.trim(),
    expectedNodes: 3,
    expectedLinks: 2,
  },
  {
    name: 'UML with multiple relationship types',
    type: 'uml',
    input: `
classDiagram
  class Engine {
    + start(): void
  }
  class Car {
    + drive(): void
  }
  class Driver {
    + String name
  }
  Car *-- Engine : contains
  Driver o-- Car : drives
    `.trim(),
    expectedNodes: 3,
    expectedLinks: 2,
  },
  {
    name: 'UML with complex class',
    type: 'uml',
    input: `
classDiagram
  class BankAccount {
    - String accountNumber
    - decimal balance
    + deposit(amount: decimal): void
    + withdraw(amount: decimal): boolean
    + getBalance(): decimal
  }
    `.trim(),
    expectedNodes: 1,
    expectedLinks: 0,
  },
];

/**
 * Run a single test case
 */
function runTest(testCase: TestCase): {
  passed: boolean;
  message: string;
  generatedText?: string;
} {
  const dsl = new DSL({ autoLayout: false });

  try {
    // Parse based on type
    let diagram1;
    switch (testCase.type) {
      case 'erd':
        diagram1 = dsl.parseERD(testCase.input);
        break;
      case 'bpmn':
        diagram1 = dsl.parseBPMN(testCase.input);
        break;
      case 'uml':
        diagram1 = dsl.parseUML(testCase.input);
        break;
    }

    const originalNodes = diagram1.getNodes().length;
    const originalLinks = diagram1.getLinks().length;

    // Check node count
    if (originalNodes !== testCase.expectedNodes) {
      return {
        passed: false,
        message: `Expected ${testCase.expectedNodes} nodes, got ${originalNodes}`,
      };
    }

    // Check link count
    if (originalLinks !== testCase.expectedLinks) {
      return {
        passed: false,
        message: `Expected ${testCase.expectedLinks} links, got ${originalLinks}`,
      };
    }

    // Generate based on type
    let generatedText;
    switch (testCase.type) {
      case 'erd':
        generatedText = dsl.generateERD(diagram1);
        break;
      case 'bpmn':
        generatedText = dsl.generateBPMN(diagram1);
        break;
      case 'uml':
        generatedText = dsl.generateUML(diagram1);
        break;
    }

    // Parse generated text
    let diagram2;
    switch (testCase.type) {
      case 'erd':
        diagram2 = dsl.parseERD(generatedText);
        break;
      case 'bpmn':
        diagram2 = dsl.parseBPMN(generatedText);
        break;
      case 'uml':
        diagram2 = dsl.parseUML(generatedText);
        break;
    }

    const regeneratedNodes = diagram2.getNodes().length;
    const regeneratedLinks = diagram2.getLinks().length;

    // Check round-trip success
    if (originalNodes !== regeneratedNodes || originalLinks !== regeneratedLinks) {
      return {
        passed: false,
        message: `Round-trip failed: ${originalNodes}→${regeneratedNodes} nodes, ${originalLinks}→${regeneratedLinks} links`,
        generatedText,
      };
    }

    return {
      passed: true,
      message: `✓ ${originalNodes} nodes, ${originalLinks} links preserved`,
      generatedText,
    };
  } catch (error) {
    return {
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Run all tests
 */
export function runAllExtendedTests(verbose: boolean = false): {
  passed: number;
  failed: number;
  total: number;
  byType: Record<string, { passed: number; failed: number }>;
} {
  console.log('\n' + '='.repeat(70));
  console.log('Extended Types Round-Trip Tests');
  console.log('='.repeat(70) + '\n');

  let passed = 0;
  let failed = 0;
  const byType: Record<string, { passed: number; failed: number }> = {
    erd: { passed: 0, failed: 0 },
    bpmn: { passed: 0, failed: 0 },
    uml: { passed: 0, failed: 0 },
  };

  // Group tests by type
  const erdTests = testCases.filter(t => t.type === 'erd');
  const bpmnTests = testCases.filter(t => t.type === 'bpmn');
  const umlTests = testCases.filter(t => t.type === 'uml');

  // Run ERD tests
  console.log('ERD Tests:');
  console.log('─'.repeat(70));
  for (const testCase of erdTests) {
    const result = runTest(testCase);
    if (result.passed) {
      passed++;
      byType['erd'].passed++;
      console.log(`  ✅ ${testCase.name}`);
      if (verbose) {
        console.log(`     ${result.message}`);
      }
    } else {
      failed++;
      byType['erd'].failed++;
      console.log(`  ❌ ${testCase.name}`);
      console.log(`     ${result.message}`);
      if (verbose && result.generatedText) {
        console.log('\n     Generated text:');
        console.log('     ' + result.generatedText.split('\n').join('\n     '));
      }
    }
  }
  console.log();

  // Run BPMN tests
  console.log('BPMN Tests:');
  console.log('─'.repeat(70));
  for (const testCase of bpmnTests) {
    const result = runTest(testCase);
    if (result.passed) {
      passed++;
      byType['bpmn'].passed++;
      console.log(`  ✅ ${testCase.name}`);
      if (verbose) {
        console.log(`     ${result.message}`);
      }
    } else {
      failed++;
      byType['bpmn'].failed++;
      console.log(`  ❌ ${testCase.name}`);
      console.log(`     ${result.message}`);
      if (verbose && result.generatedText) {
        console.log('\n     Generated text:');
        console.log('     ' + result.generatedText.split('\n').join('\n     '));
      }
    }
  }
  console.log();

  // Run UML tests
  console.log('UML Tests:');
  console.log('─'.repeat(70));
  for (const testCase of umlTests) {
    const result = runTest(testCase);
    if (result.passed) {
      passed++;
      byType['uml'].passed++;
      console.log(`  ✅ ${testCase.name}`);
      if (verbose) {
        console.log(`     ${result.message}`);
      }
    } else {
      failed++;
      byType['uml'].failed++;
      console.log(`  ❌ ${testCase.name}`);
      console.log(`     ${result.message}`);
      if (verbose && result.generatedText) {
        console.log('\n     Generated text:');
        console.log('     ' + result.generatedText.split('\n').join('\n     '));
      }
    }
  }
  console.log();

  console.log('='.repeat(70));
  console.log('Summary by Type:');
  console.log(`  ERD:  ${byType['erd'].passed}/${erdTests.length} passed`);
  console.log(`  BPMN: ${byType['bpmn'].passed}/${bpmnTests.length} passed`);
  console.log(`  UML:  ${byType['uml'].passed}/${umlTests.length} passed`);
  console.log('─'.repeat(70));
  console.log(`Total: ${passed}/${testCases.length} passed, ${failed} failed`);
  console.log('='.repeat(70) + '\n');

  return {
    passed,
    failed,
    total: testCases.length,
    byType,
  };
}

/**
 * Test specific extended type
 */
export function testExtendedType(type: 'erd' | 'bpmn' | 'uml', verbose: boolean = false) {
  const filtered = testCases.filter(t => t.type === type);

  console.log(`\n${type.toUpperCase()} Round-Trip Tests\n`);

  let passed = 0;
  let failed = 0;

  for (const testCase of filtered) {
    const result = runTest(testCase);

    if (result.passed) {
      passed++;
      console.log(`✅ ${testCase.name}`);
      if (verbose) {
        console.log(`   ${result.message}\n`);
      }
    } else {
      failed++;
      console.log(`❌ ${testCase.name}`);
      console.log(`   ${result.message}\n`);

      if (verbose && result.generatedText) {
        console.log('Generated:');
        console.log(result.generatedText);
        console.log();
      }
    }
  }

  console.log(`\nResults: ${passed}/${filtered.length} passed, ${failed} failed\n`);
}

/**
 * Test ERD field preservation
 */
export function testERDFieldPreservation() {
  console.log('\n' + '='.repeat(70));
  console.log('ERD Field Preservation Test');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false });

  const erdText = `
erDiagram
  USER {
    int id PK
    string username UNIQUE
    string email UNIQUE NOT NULL
    string password_hash NOT NULL
    timestamp created_at
  }
  `.trim();

  console.log('Step 1: Parse ERD with field constraints');
  const diagram = dsl.parseERD(erdText);
  const userNode = diagram.getNodes()[0];

  console.log(`✓ Parsed: ${userNode.data['name']}`);
  console.log(`  Fields: ${userNode.data['fields']?.length || 0}`);

  if (userNode.data['fields']) {
    console.log('\nField details:');
    for (const field of userNode.data['fields']) {
      const constraints = [];
      if (field.primaryKey) constraints.push('PK');
      if (field.foreignKey) constraints.push('FK');
      if (field.unique) constraints.push('UNIQUE');
      if (field.notNull) constraints.push('NOT NULL');

      console.log(`  ${field.name}: ${field.type} ${constraints.join(', ')}`);
    }
  }

  console.log('\nStep 2: Generate DSL');
  const generatedText = dsl.generateERD(diagram);
  console.log(generatedText);

  console.log('\nStep 3: Re-parse and verify');
  const diagram2 = dsl.parseERD(generatedText);
  const userNode2 = diagram2.getNodes()[0];

  const fieldsMatch = userNode.data['fields']?.length === userNode2.data['fields']?.length;
  console.log(`✓ Fields preserved: ${fieldsMatch ? '✅ YES' : '❌ NO'}`);
}

// Auto-run tests
const args = process.argv.slice(2);
const verbose = args.includes('--verbose') || args.includes('-v');
const type = args.find(arg => ['erd', 'bpmn', 'uml'].includes(arg));

if (type) {
  testExtendedType(type as 'erd' | 'bpmn' | 'uml', verbose);
} else {
  runAllExtendedTests(verbose);
  testERDFieldPreservation();
}
