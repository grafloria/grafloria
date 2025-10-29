/**
 * Bidirectional Sync Demo - Demonstrates DSL parse and generate
 *
 * Shows how the DSL can be used for bidirectional text ↔ visual editing:
 * 1. Parse text to create diagram
 * 2. Modify diagram visually
 * 3. Generate updated text
 * 4. Round-trip validation
 */

import { DSL } from './DSL';
import { DiagramModel } from '../models/DiagramModel';
import { NodeModel } from '../models/NodeModel';

/**
 * Example 1: Basic round-trip
 */
export function demoBasicRoundTrip() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 1: Basic Round-Trip (Parse → Generate)');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false, debug: false });

  const originalText = `
flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Process]
  B -->|No| D[End]
  C --> D
  `.trim();

  console.log('📝 Original DSL:');
  console.log(originalText);
  console.log();

  // Parse to diagram
  console.log('⚙️  Parsing to DiagramModel...');
  const diagram = dsl.parse(originalText);
  console.log(`✅ Created diagram with ${diagram.getNodes().length} nodes, ${diagram.getLinks().length} links`);
  console.log();

  // Generate back to text
  console.log('⚙️  Generating DSL from DiagramModel...');
  const generatedText = dsl.generatePretty(diagram);
  console.log('📝 Generated DSL:');
  console.log(generatedText);
  console.log();

  // Test round-trip
  const roundTrip = dsl.testRoundTrip(originalText);
  console.log(`🔄 Round-trip test: ${roundTrip.success ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`   Original: ${roundTrip.originalNodes} nodes, ${roundTrip.originalLinks} links`);
  console.log(`   Regenerated: ${roundTrip.regeneratedNodes} nodes, ${roundTrip.regeneratedLinks} links`);
}

/**
 * Example 2: Visual editing → text sync
 */
export function demoVisualEditing() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 2: Visual Editing → Text Sync');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false });

  const originalText = `
flowchart LR
  A[Login] --> B[Dashboard]
  B --> C[Profile]
  `.trim();

  console.log('📝 Original DSL:');
  console.log(originalText);
  console.log();

  // Parse to diagram
  const diagram = dsl.parse(originalText);
  console.log(`✅ Parsed: ${diagram.getNodes().length} nodes`);
  console.log();

  // Simulate visual editing: Add new node and link
  console.log('🎨 Simulating visual edits:');
  console.log('   - Adding new node "Settings"');
  console.log('   - Connecting Dashboard → Settings');
  console.log();

  const settingsNode = new NodeModel({
    id: 'D',
    type: 'flowchart:process',
    position: { x: 550, y: 100 },
  });
  settingsNode.data.label = 'Settings';
  diagram.addNode(settingsNode);

  const dashboardNode = diagram.getNode('B');
  if (dashboardNode) {
    diagram.connectNodes(dashboardNode, settingsNode);
  }

  // Generate updated text
  console.log('⚙️  Generating updated DSL...');
  const updatedText = dsl.generatePretty(diagram);
  console.log('📝 Updated DSL (reflects visual changes):');
  console.log(updatedText);
  console.log();

  console.log(`✅ Text now reflects visual changes: ${diagram.getNodes().length} nodes, ${diagram.getLinks().length} links`);
}

/**
 * Example 3: Text editing → visual sync
 */
export function demoTextEditing() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 3: Text Editing → Visual Sync');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false });

  const originalText = `
flowchart TD
  A[Start] --> B[Process]
  `;

  console.log('📝 Original DSL:');
  console.log(originalText.trim());
  console.log();

  // Parse initial diagram
  let diagram = dsl.parse(originalText);
  console.log(`✅ Initial diagram: ${diagram.getNodes().length} nodes`);
  console.log();

  // User edits text
  const editedText = `
flowchart TD
  A[Start] --> B[Process]
  B --> C{Decision}
  C -->|Yes| D[End]
  C -->|No| A
  `;

  console.log('✏️  User edited text:');
  console.log(editedText.trim());
  console.log();

  // Re-parse to update diagram
  console.log('⚙️  Re-parsing to update visual diagram...');
  diagram = dsl.parse(editedText);
  console.log(`✅ Updated diagram: ${diagram.getNodes().length} nodes, ${diagram.getLinks().length} links`);
  console.log();

  // List nodes to show structure
  console.log('📊 Diagram structure:');
  for (const node of diagram.getNodes()) {
    console.log(`   - ${node.id}: ${node.data.label}`);
  }
}

/**
 * Example 4: Formatting and style preservation
 */
export function demoFormatting() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 4: Formatting and Style Preservation');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false });

  const messyText = `
flowchart   TD
A[Start]-->B{Decision}
B-->|Yes|C[Process]
    B   -->|No|   D[End]
C-->D

style A fill:#e1f5ff
style B fill:#fff4e1
  `;

  console.log('📝 Messy input DSL:');
  console.log(messyText);
  console.log();

  // Parse and regenerate with formatting
  const diagram = dsl.parse(messyText);
  const formattedText = dsl.generatePretty(diagram, true);

  console.log('✨ Formatted DSL (with proper spacing and sections):');
  console.log(formattedText);
  console.log();

  console.log('✅ Formatting applied with style preservation');
}

/**
 * Example 5: Multiple round-trips
 */
export function demoMultipleRoundTrips() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 5: Multiple Round-Trips (Stability Test)');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false });

  let text = `
flowchart LR
  A[Start] --> B[Middle]
  B --> C[End]
  `.trim();

  console.log('📝 Original text:');
  console.log(text);
  console.log();

  const iterations = 3;
  console.log(`🔄 Performing ${iterations} round-trips...\n`);

  for (let i = 1; i <= iterations; i++) {
    const diagram = dsl.parse(text);
    text = dsl.generate(diagram);

    console.log(`   Round ${i}: ${diagram.getNodes().length} nodes, ${diagram.getLinks().length} links`);
  }

  console.log();
  console.log('📝 Final text after ' + iterations + ' round-trips:');
  console.log(text);
  console.log();

  // Validate final structure
  const finalDiagram = dsl.parse(text);
  console.log(`✅ Structure stable: ${finalDiagram.getNodes().length} nodes, ${finalDiagram.getLinks().length} links`);
}

/**
 * Example 6: Real-time sync simulation (300ms debounce)
 */
export function demoRealTimeSync() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 6: Real-Time Sync Simulation');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ autoLayout: false });

  console.log('📝 Simulating real-time bidirectional editing...');
  console.log('   (In a real app, this would use 300ms debounce)\n');

  // Initial state
  let text = `
flowchart TD
  A[Task 1] --> B[Task 2]
  `.trim();

  let diagram = dsl.parse(text);
  console.log(`⚡ Initial state: ${diagram.getNodes().length} nodes`);
  console.log();

  // Simulate text edit
  console.log('✏️  [Text Editor] User types: "B --> C[Task 3]"');
  text += '\n  B --> C[Task 3]';
  diagram = dsl.parse(text);
  console.log(`   → Visual updated: ${diagram.getNodes().length} nodes\n`);

  // Simulate visual edit
  console.log('🎨 [Visual Editor] User drags new node "Task 4"');
  const newNode = new NodeModel({
    id: 'D',
    type: 'flowchart:process',
    position: { x: 300, y: 400 },
  });
  newNode.data.label = 'Task 4';
  diagram.addNode(newNode);

  const nodeC = diagram.getNode('C');
  if (nodeC) {
    diagram.connectNodes(nodeC, newNode);
  }

  text = dsl.generate(diagram);
  console.log('   → Text updated:');
  console.log(text);
  console.log();

  console.log('✅ Bidirectional sync maintained');
}

/**
 * Run all demos
 */
export function runAllDemos() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'DSL Bidirectional Sync Demos' + ' '.repeat(25) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  try {
    demoBasicRoundTrip();
    demoVisualEditing();
    demoTextEditing();
    demoFormatting();
    demoMultipleRoundTrips();
    demoRealTimeSync();

    console.log('\n' + '='.repeat(70));
    console.log('✅ All demos completed successfully!');
    console.log('='.repeat(70) + '\n');
  } catch (error) {
    console.error('\n❌ Demo error:', error);
  }
}

// Run demos if this file is executed directly
if (require.main === module) {
  runAllDemos();
}
