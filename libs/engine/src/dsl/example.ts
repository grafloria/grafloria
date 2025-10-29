/**
 * DSL Example - Demonstrates basic usage
 *
 * This file shows how to use the DSL to parse Mermaid-compatible
 * diagram syntax and generate DiagramModel instances.
 */

import { DSL } from './DSL';

/**
 * Example 1: Simple flowchart
 */
export function exampleSimpleFlowchart() {
  const dsl = new DSL({ autoLayout: true, debug: true });

  const text = `
flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Process]
  B -->|No| D[End]
  C --> D
  `;

  const result = dsl.parseDetailed(text);

  console.log('\n=== Simple Flowchart ===');
  console.log(`Nodes: ${result.stats.nodeCount}`);
  console.log(`Links: ${result.stats.linkCount}`);
  console.log(`Parse time: ${result.stats.parseTime.toFixed(2)}ms`);
  console.log(`Layout suggestion: ${result.layoutSuggestion?.presetId}`);
  console.log(`Reasoning: ${result.layoutSuggestion?.reasoning}`);

  return result.diagram;
}

/**
 * Example 2: Horizontal workflow
 */
export function exampleHorizontalWorkflow() {
  const dsl = new DSL({ autoLayout: true });

  const text = `
flowchart LR
  Start([Start]) --> Input[Get Input]
  Input --> Validate{Valid?}
  Validate -->|Yes| Process[Process Data]
  Validate -->|No| Error[Show Error]
  Process --> Output[Display Result]
  Error --> Input
  Output --> End([End])
  `;

  const result = dsl.parseDetailed(text);

  console.log('\n=== Horizontal Workflow ===');
  console.log(`Nodes: ${result.stats.nodeCount}`);
  console.log(`Links: ${result.stats.linkCount}`);
  console.log(`Layout suggestion: ${result.layoutSuggestion?.presetId}`);

  return result.diagram;
}

/**
 * Example 3: Complex flowchart with styles
 */
export function exampleStyledFlowchart() {
  const dsl = new DSL({ autoLayout: true });

  const text = `
flowchart TB
  A[Client Request] --> B{Auth Check}
  B -->|Valid| C[Load Data]
  B -->|Invalid| D[Return 401]
  C --> E{Has Data?}
  E -->|Yes| F[Transform]
  E -->|No| G[Return 404]
  F --> H[Send Response]

  style A fill:#e1f5ff
  style B fill:#fff4e1
  style F fill:#e8f5e9
  `;

  const result = dsl.parseDetailed(text);

  console.log('\n=== Styled Flowchart ===');
  console.log(`Nodes: ${result.stats.nodeCount}`);
  console.log(`Links: ${result.stats.linkCount}`);
  console.log(`Layout: ${result.layoutSuggestion?.presetId}`);

  return result.diagram;
}

/**
 * Example 4: Validation
 */
export function exampleValidation() {
  const dsl = new DSL();

  const validText = `
flowchart LR
  A --> B
  B --> C
  `;

  const invalidText = `
flowchart LR
  A -->
  B --> C
  `;

  console.log('\n=== Validation ===');

  const validResult = dsl.validate(validText);
  console.log(`Valid syntax: ${validResult.valid}`);

  const invalidResult = dsl.validate(invalidText);
  console.log(`Invalid syntax: ${invalidResult.valid}`);
  if (!invalidResult.valid) {
    console.log(`Errors: ${invalidResult.errors.join(', ')}`);
  }
}

/**
 * Run all examples
 */
export function runAllExamples() {
  console.log('🚀 DSL Examples\n');
  console.log('=' .repeat(50));

  try {
    exampleSimpleFlowchart();
    exampleHorizontalWorkflow();
    exampleStyledFlowchart();
    exampleValidation();

    console.log('\n' + '='.repeat(50));
    console.log('✅ All examples completed successfully!');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples();
}
