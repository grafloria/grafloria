/**
 * Round-Trip Tests - Validates parse ↔ generate stability
 *
 * Tests that DSL text can be parsed, modified, and regenerated
 * while preserving diagram structure and semantics.
 */

import { DSL } from './DSL';

interface TestCase {
  name: string;
  input: string;
  expectedNodes: number;
  expectedLinks: number;
}

const testCases: TestCase[] = [
  {
    name: 'Simple linear flow',
    input: `
flowchart TD
  A[Start] --> B[Process]
  B --> C[End]
    `.trim(),
    expectedNodes: 3,
    expectedLinks: 2,
  },
  {
    name: 'Decision diamond',
    input: `
flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Process]
  B -->|No| D[End]
    `.trim(),
    expectedNodes: 4,
    expectedLinks: 3,
  },
  {
    name: 'Horizontal workflow',
    input: `
flowchart LR
  A[Input] --> B[Process]
  B --> C[Output]
    `.trim(),
    expectedNodes: 3,
    expectedLinks: 2,
  },
  {
    name: 'Multiple shapes',
    input: `
flowchart TD
  A[Rectangle] --> B(Rounded)
  B --> C{Diamond}
  C --> D((Circle))
    `.trim(),
    expectedNodes: 4,
    expectedLinks: 3,
  },
  {
    name: 'Cycle graph',
    input: `
flowchart TD
  A[Start] --> B[Process]
  B --> C{Check}
  C -->|Fail| A
  C -->|Pass| D[End]
    `.trim(),
    expectedNodes: 4,
    expectedLinks: 4,
  },
  {
    name: 'Complex workflow',
    input: `
flowchart TB
  A[Client] --> B{Auth}
  B -->|Valid| C[Load]
  B -->|Invalid| D[Error]
  C --> E{Data?}
  E -->|Yes| F[Process]
  E -->|No| G[Empty]
  F --> H[Response]
  G --> H
    `.trim(),
    expectedNodes: 8,
    expectedLinks: 8,
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
    // Test round-trip
    const result = dsl.testRoundTrip(testCase.input);

    // Check node count
    if (result.originalNodes !== testCase.expectedNodes) {
      return {
        passed: false,
        message: `Expected ${testCase.expectedNodes} nodes, got ${result.originalNodes}`,
      };
    }

    // Check link count
    if (result.originalLinks !== testCase.expectedLinks) {
      return {
        passed: false,
        message: `Expected ${testCase.expectedLinks} links, got ${result.originalLinks}`,
      };
    }

    // Check round-trip success
    if (!result.success) {
      return {
        passed: false,
        message: `Round-trip failed: ${result.originalNodes}→${result.regeneratedNodes} nodes, ${result.originalLinks}→${result.regeneratedLinks} links`,
        generatedText: result.generatedText,
      };
    }

    return {
      passed: true,
      message: `✓ ${result.originalNodes} nodes, ${result.originalLinks} links preserved`,
      generatedText: result.generatedText,
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
export function runAllTests(verbose: boolean = false): {
  passed: number;
  failed: number;
  total: number;
} {
  console.log('\n' + '='.repeat(70));
  console.log('DSL Round-Trip Tests');
  console.log('='.repeat(70) + '\n');

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = runTest(testCase);

    if (result.passed) {
      passed++;
      console.log(`✅ ${testCase.name}`);
      if (verbose) {
        console.log(`   ${result.message}`);
      }
    } else {
      failed++;
      console.log(`❌ ${testCase.name}`);
      console.log(`   ${result.message}`);

      if (verbose && result.generatedText) {
        console.log('\n   Generated text:');
        console.log('   ' + result.generatedText.split('\n').join('\n   '));
      }
    }

    if (verbose) {
      console.log();
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log(`Results: ${passed}/${testCases.length} passed, ${failed} failed`);
  console.log('='.repeat(70) + '\n');

  return {
    passed,
    failed,
    total: testCases.length,
  };
}

/**
 * Test specific scenario
 */
export function testScenario(name: string) {
  const testCase = testCases.find(t => t.name === name);

  if (!testCase) {
    console.log(`❌ Test case "${name}" not found`);
    return;
  }

  console.log(`\nTesting: ${testCase.name}\n`);
  console.log('Input:');
  console.log(testCase.input);
  console.log();

  const result = runTest(testCase);

  if (result.passed) {
    console.log(`✅ PASSED: ${result.message}\n`);
    console.log('Generated:');
    console.log(result.generatedText);
  } else {
    console.log(`❌ FAILED: ${result.message}\n`);
    if (result.generatedText) {
      console.log('Generated:');
      console.log(result.generatedText);
    }
  }
}

/**
 * Test parse → modify → generate workflow
 */
export function testModificationWorkflow() {
  console.log('\n' + '='.repeat(70));
  console.log('Modification Workflow Test');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false });

  const originalText = `
flowchart TD
  A[Start] --> B[Process]
  B --> C[End]
  `.trim();

  console.log('Step 1: Parse original');
  const diagram = dsl.parse(originalText);
  console.log(`✓ Parsed: ${diagram.getNodes().length} nodes, ${diagram.getLinks().length} links\n`);

  console.log('Step 2: Modify diagram (remove middle node)');
  const nodeB = diagram.getNode('B');
  if (nodeB) {
    // Get connections
    const connections = diagram.getNodeConnections(nodeB);
    console.log(`  Removing node B (has ${connections.all.length} connections)`);

    diagram.removeNode('B');
  }
  console.log(`✓ Modified: ${diagram.getNodes().length} nodes, ${diagram.getLinks().length} links\n`);

  console.log('Step 3: Generate new DSL');
  const newText = dsl.generatePretty(diagram);
  console.log('Generated:');
  console.log(newText);
  console.log();

  console.log('Step 4: Validate by re-parsing');
  const reparsed = dsl.parse(newText);
  console.log(`✓ Reparsed: ${reparsed.getNodes().length} nodes, ${reparsed.getLinks().length} links\n`);

  const success = reparsed.getNodes().length === diagram.getNodes().length;
  console.log(success ? '✅ Workflow test PASSED' : '❌ Workflow test FAILED');
}

// Run tests if this file is executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const scenario = args.find(arg => !arg.startsWith('-'));

  if (scenario) {
    testScenario(scenario);
  } else {
    runAllTests(verbose);
    testModificationWorkflow();
  }
}
