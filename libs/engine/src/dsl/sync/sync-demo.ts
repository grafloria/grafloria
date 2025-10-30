/**
 * Bidirectional Sync Demo - Real-time text ↔ visual editing
 *
 * Demonstrates the integrated sync system with:
 * - 300ms debounced updates
 * - Auto-layout application
 * - Status tracking
 * - Performance metrics
 */

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { IntegratedSyncManager } from './IntegratedSyncManager';

/**
 * Demo 1: Basic bidirectional sync
 */
export async function demoBasicSync() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 1: Basic Bidirectional Sync');
  console.log('='.repeat(70) + '\n');

  const syncManager = new IntegratedSyncManager({
    debug: true,
    autoLayoutOnTextChange: false,
  });

  const initialText = `
flowchart TD
  A[Start] --> B[Process]
  B --> C[End]
  `.trim();

  // Initialize
  const diagram = new DiagramModel('Sync Demo');
  syncManager.initialize(diagram, initialText);

  console.log('📝 Initial text:');
  console.log(syncManager.getText());
  console.log();

  // Subscribe to changes
  syncManager.onTextChange((text) => {
    console.log('📝 Text updated:');
    console.log(text);
    console.log();
  });

  syncManager.onStatusChange((status) => {
    console.log(`📊 Status: ${syncManager.getFormattedStatus()}`);
  });

  // Simulate text edit
  console.log('✏️  Simulating text edit (adding new node)...\n');
  await wait(500);

  const newText = `
flowchart TD
  A[Start] --> B[Process]
  B --> C[End]
  C --> D[Review]
  `.trim();

  syncManager.onTextEdit(newText);

  // Wait for debounce + sync
  await wait(500);

  console.log(`\n📊 Final state:`);
  console.log(`   Nodes: ${syncManager.getDiagram()?.getNodes().length}`);
  console.log(`   Links: ${syncManager.getDiagram()?.getLinks().length}`);

  syncManager.dispose();
}

/**
 * Demo 2: Visual editing with auto text sync
 */
export async function demoVisualEditing() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 2: Visual Editing → Text Sync');
  console.log('='.repeat(70) + '\n');

  const syncManager = new IntegratedSyncManager({
    debug: false,
    autoLayoutOnTextChange: false,
  });

  const diagram = new DiagramModel('Visual Demo');
  syncManager.initialize(diagram, 'flowchart TD\n  A[Start] --> B[End]');

  console.log('📝 Initial text:');
  console.log(syncManager.getText());
  console.log();

  // Subscribe to text changes
  syncManager.onTextChange((text) => {
    console.log('📝 Text auto-updated:');
    console.log(text);
    console.log();
  });

  // Simulate visual edits
  console.log('🎨 Adding node visually...\n');
  syncManager.onVisualEdit();

  const newNode = new NodeModel({
    id: 'C',
    type: 'flowchart:process',
    position: { x: 300, y: 200 },
  });
  newNode.data['label'] = 'Process';

  const diag = syncManager.getDiagram();
  if (diag) {
    diag.addNode(newNode);

    const nodeB = diag.getNode('B');
    if (nodeB) {
      diag.connectNodes(nodeB, newNode);
    }
  }

  // Wait for debounce + sync
  await wait(500);

  console.log('✅ Visual → Text sync complete');

  syncManager.dispose();
}

/**
 * Demo 3: Auto-layout application
 */
export async function demoAutoLayout() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 3: Auto-Layout Application');
  console.log('='.repeat(70) + '\n');

  const syncManager = new IntegratedSyncManager({
    debug: false,
    autoLayoutOnTextChange: true, // Enable auto-layout
  });

  const text = `
flowchart LR
  A[Start] --> B[Process]
  B --> C{Decision}
  C -->|Yes| D[End]
  C -->|No| A
  `.trim();

  const diagram = new DiagramModel('Layout Demo');
  syncManager.initialize(diagram, text);

  console.log('📝 Input text:');
  console.log(text);
  console.log();

  console.log('🔍 Detecting optimal layout...');
  const suggestion = syncManager.suggestLayout();

  if (suggestion) {
    console.log(`   Suggested: ${suggestion.presetId}`);
    console.log(`   Confidence: ${suggestion.confidence.toFixed(2)}`);
    console.log(`   Reasoning: ${suggestion.reasoning}`);
    console.log();
  }

  console.log('⚙️  Applying layout...\n');
  await syncManager.applyLayout();

  await wait(100);

  console.log('✅ Layout applied');
  console.log(`   Node positions updated`);

  syncManager.dispose();
}

/**
 * Demo 4: Rapid editing with debounce
 */
export async function demoRapidEditing() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 4: Rapid Editing with Debounce');
  console.log('='.repeat(70) + '\n');

  const syncManager = new IntegratedSyncManager({
    syncOptions: { debounceMs: 300 },
    debug: false,
  });

  const diagram = new DiagramModel('Rapid Demo');
  syncManager.initialize(diagram, 'flowchart TD\n  A[Start]');

  let syncCount = 0;
  syncManager.onTextChange(() => {
    syncCount++;
    console.log(`  → Sync #${syncCount} triggered`);
  });

  console.log('⚡ Simulating rapid typing (5 edits in 1 second)...\n');

  // Rapid edits
  syncManager.onTextEdit('flowchart TD\n  A[Start] --> B');
  await wait(50);

  syncManager.onTextEdit('flowchart TD\n  A[Start] --> B[Proc');
  await wait(50);

  syncManager.onTextEdit('flowchart TD\n  A[Start] --> B[Process');
  await wait(50);

  syncManager.onTextEdit('flowchart TD\n  A[Start] --> B[Process]');
  await wait(50);

  syncManager.onTextEdit('flowchart TD\n  A[Start] --> B[Process]\n  B --> C');

  // Wait for final debounce
  await wait(500);

  console.log(`\n✅ Only ${syncCount} sync(s) performed (debouncing prevented ${5 - syncCount} unnecessary syncs)`);

  syncManager.dispose();
}

/**
 * Demo 5: Performance metrics
 */
export async function demoPerformanceMetrics() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 5: Performance Metrics');
  console.log('='.repeat(70) + '\n');

  const syncManager = new IntegratedSyncManager({
    debug: false,
    autoLayoutOnTextChange: false,
  });

  const diagram = new DiagramModel('Metrics Demo');
  syncManager.initialize(diagram, 'flowchart TD\n  A[Start]');

  console.log('📊 Performing multiple sync operations...\n');

  // Text → Visual syncs
  for (let i = 0; i < 3; i++) {
    syncManager.onTextEdit(`flowchart TD\n  A[Start] --> B${i}[Node ${i}]`);
    await wait(400);
  }

  // Visual → Text syncs
  const diag = syncManager.getDiagram();
  if (diag) {
    for (let i = 0; i < 2; i++) {
      syncManager.onVisualEdit();
      const node = new NodeModel({
        id: `V${i}`,
        type: 'flowchart:process',
        position: { x: 100 * i, y: 100 },
      });
      node.data['label'] = `Visual ${i}`;
      diag.addNode(node);
      await wait(400);
    }
  }

  console.log('📊 Metrics Summary:');
  console.log(syncManager.getMetricsSummary());

  syncManager.dispose();
}

/**
 * Demo 6: Status tracking
 */
export async function demoStatusTracking() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 6: Status Tracking');
  console.log('='.repeat(70) + '\n');

  const syncManager = new IntegratedSyncManager({
    debug: false,
  });

  const diagram = new DiagramModel('Status Demo');
  syncManager.initialize(diagram, 'flowchart TD\n  A[Start]');

  console.log('📡 Monitoring sync status...\n');

  syncManager.onStatusChange((status) => {
    console.log(`   ${syncManager.getFormattedStatus()}`);
  });

  console.log('Performing edits:\n');

  syncManager.onTextEdit('flowchart TD\n  A[Start] --> B[Process]');
  await wait(500);

  syncManager.onTextEdit('flowchart TD\n  A[Start] --> B[Process]\n  B --> C[End]');
  await wait(500);

  console.log('\n✅ Status tracking complete');

  syncManager.dispose();
}

/**
 * Helper: Wait for milliseconds
 */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run all demos
 */
export async function runAllSyncDemos() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(18) + 'DSL Bidirectional Sync Demos' + ' '.repeat(22) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  try {
    await demoBasicSync();
    await demoVisualEditing();
    await demoAutoLayout();
    await demoRapidEditing();
    await demoPerformanceMetrics();
    await demoStatusTracking();

    console.log('\n' + '='.repeat(70));
    console.log('✅ All sync demos completed successfully!');
    console.log('='.repeat(70) + '\n');
  } catch (error) {
    console.error('\n❌ Demo error:', error);
  }
}

// Run demos if this file is executed directly
if (require.main === module) {
  runAllSyncDemos();
}
