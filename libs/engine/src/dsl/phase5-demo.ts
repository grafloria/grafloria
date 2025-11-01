/**
 * Phase 5 Demo: Performance - Web Workers and Format Preservation
 *
 * Demonstrates:
 * - Async DSL parsing with Web Workers
 * - Format preservation (comments, whitespace, indentation)
 * - Performance improvements
 * - Fallback to main thread when workers unavailable
 */

import { DSL } from './DSL';
import { FormatPreserver } from './format/FormatPreserver';
import { DSLWorkerPool } from './workers/DSLWorkerPool';

/**
 * Demo 1: Format Preservation - Comments
 */
export function demoCommentPreservation() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 1: Format Preservation - Comments');
  console.log('='.repeat(70) + '\n');

  const preserv = new FormatPreserver();

  const dslText = `
// Application Flow Diagram
// Version: 1.0

flowchart TD
  // Entry point
  A[Start] --> B{Check Auth}

  // Authentication branch
  B -->|Yes| C[Dashboard]  // Authenticated users
  B -->|No| D[Login Page]  // Guest users

  /* Main features */
  C --> E[Features]
  D --> B

  // Exit point
  E --> F[End]
  `.trim();

  console.log('📝 DSL with Comments:');
  console.log(dslText);
  console.log();

  const formatInfo = preserv.extractFormatInfo(dslText);

  console.log(`✅ Extracted Format Info:`);
  console.log(`   Comments: ${formatInfo.comments.length}`);
  console.log();

  console.log('📋 Comment Details:');
  for (const comment of formatInfo.comments) {
    console.log(`   Line ${comment.line} (${comment.type}): ${comment.text}`);
    if (comment.nodeId) {
      console.log(`      Associated with node: ${comment.nodeId}`);
    }
  }
  console.log();

  // Strip comments for parsing
  const stripped = preserv.stripComments(dslText);
  console.log('🔧 Stripped Text (for parsing):');
  console.log(stripped);
  console.log();

  // Restore comments
  const restored = preserv.restoreComments(stripped, formatInfo.comments);
  console.log('♻️  Restored Text:');
  console.log(restored);
}

/**
 * Demo 2: Format Preservation - Whitespace and Indentation
 */
export function demoWhitespacePreservation() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 2: Format Preservation - Whitespace and Indentation');
  console.log('='.repeat(70) + '\n');

  const preserver = new FormatPreserver();

  const dslText = `
@style primary {
  fill: #3b82f6;
  stroke: #1e40af;
}


flowchart TD
  A[Node A] --> B[Node B]
  B  -->  C[Node C]
  C->D[Node D]
  `.trim();

  console.log('📝 DSL with Various Whitespace:');
  console.log(dslText);
  console.log();

  const formatInfo = preserver.extractFormatInfo(dslText);

  console.log('✅ Detected Format:');
  console.log(`   Indent Style: ${formatInfo.indentStyle}`);
  console.log(`   Indent Size: ${formatInfo.indentSize}`);
  console.log(`   Line Ending: ${formatInfo.lineEnding === '\n' ? 'LF' : 'CRLF'}`);
  console.log(`   Section Spacing: ${formatInfo.whitespace.sectionSpacing} blank lines`);
  console.log(`   Arrow Spacing: ${formatInfo.whitespace.arrowSpacing}`);
  console.log(`   Colon Spacing: ${formatInfo.whitespace.colonSpacing}`);
  console.log();

  // Apply whitespace normalization
  const normalized = preserver.normalize(dslText);
  console.log('🔧 Normalized Text:');
  console.log(normalized);
}

/**
 * Demo 3: Round-trip Format Preservation
 */
export function demoRoundTripPreservation() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 3: Round-trip Format Preservation');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ debug: false });
  const preserver = new FormatPreserver();

  const originalText = `
// My Flowchart
@style primary {
  fill: #3b82f6;
  stroke: #1e40af;
}

flowchart TD
  // Start node
  A[Start]:::primary --> B[Process]

  B --> C[End]  // Final node
  `.trim();

  console.log('📝 Original Text:');
  console.log(originalText);
  console.log();

  // Extract format
  const formatInfo = preserver.extractFormatInfo(originalText);

  // Parse (with comments stripped)
  const stripped = preserver.stripComments(originalText);
  const diagram = dsl.parse(stripped);

  console.log(`✅ Parsed: ${diagram.getNodes().length} nodes`);
  console.log();

  // Generate
  const generated = dsl.generate(diagram);

  console.log('📤 Generated Text (without format):');
  console.log(generated);
  console.log();

  // Apply format
  const formatted = preserver.applyFormatInfo(generated, formatInfo);

  console.log('✨ Formatted Text (with preserved format):');
  console.log(formatted);
  console.log();

  // Compare
  const stats = preserver.getFormatStats(formatInfo);
  console.log('📊 Format Stats:');
  console.log(`   Comments Preserved: ${stats.commentCount}`);
  console.log(`   Indent: ${stats.indentSize} ${stats.indentStyle}`);
  console.log(`   Line Ending: ${stats.lineEnding}`);
  console.log(`   Custom Whitespace: ${stats.hasCustomWhitespace}`);
}

/**
 * Demo 4: Web Worker Parsing (with fallback)
 */
export async function demoWorkerParsing() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 4: Web Worker Parsing');
  console.log('='.repeat(70) + '\n');

  const workerPool = new DSLWorkerPool();

  const dslText = `
flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Success]
  B -->|No| D[Failure]
  C --> E[End]
  D --> E
  `.trim();

  console.log('📝 DSL Text to Parse:');
  console.log(dslText);
  console.log();

  // Check worker support
  if (DSLWorkerPool.isSupported()) {
    console.log('✅ Web Workers supported');
    console.log('⚙️  Parsing in worker...');

    try {
      const startTime = performance.now();
      const { diagram, formatInfo } = await workerPool.parse(dslText, {
        useWorker: true,
        fallbackToMainThread: true,
      });
      const endTime = performance.now();

      console.log(`✅ Parsed in ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`   Nodes: ${diagram.getNodes().length}`);
      console.log(`   Links: ${diagram.getLinks().length}`);

      if (formatInfo) {
        console.log(`   Comments: ${formatInfo.comments.length}`);
      }
    } catch (error) {
      console.error(`❌ Worker parsing failed: ${error instanceof Error ? error.message : String(error)}`);
      console.log('⚠️  Falling back to main thread...');
    } finally {
      workerPool.terminate();
    }
  } else {
    console.log('⚠️  Web Workers not supported, using main thread');

    const dsl = new DSL({ debug: false });
    const startTime = performance.now();
    const diagram = dsl.parse(dslText);
    const endTime = performance.now();

    console.log(`✅ Parsed in ${(endTime - startTime).toFixed(2)}ms`);
    console.log(`   Nodes: ${diagram.getNodes().length}`);
    console.log(`   Links: ${diagram.getLinks().length}`);
  }
}

/**
 * Demo 5: Performance Comparison
 */
export function demoPerformanceComparison() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 5: Performance Comparison');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ debug: false });

  // Small diagram
  const smallDSL = `
flowchart TD
  A --> B --> C --> D
  `.trim();

  // Medium diagram
  const mediumDSL = `
flowchart TD
  ${Array.from({ length: 20 }, (_, i) => {
    const id = String.fromCharCode(65 + i);
    const next = String.fromCharCode(65 + i + 1);
    return `${id}[Node ${id}] --> ${next}[Node ${next}]`;
  }).join('\n  ')}
  `.trim();

  // Large diagram
  const largeDSL = `
flowchart TD
  ${Array.from({ length: 100 }, (_, i) => {
    const id = `N${i}`;
    const next = `N${i + 1}`;
    return `${id}[Node ${i}] --> ${next}[Node ${i + 1}]`;
  }).join('\n  ')}
  `.trim();

  console.log('Running performance benchmarks...\n');

  // Small
  let start = performance.now();
  const smallDiagram = dsl.parse(smallDSL);
  let duration = performance.now() - start;
  console.log(`Small (${smallDiagram.getNodes().length} nodes): ${duration.toFixed(2)}ms`);

  // Medium
  start = performance.now();
  const mediumDiagram = dsl.parse(mediumDSL);
  duration = performance.now() - start;
  console.log(`Medium (${mediumDiagram.getNodes().length} nodes): ${duration.toFixed(2)}ms`);

  // Large
  start = performance.now();
  const largeDiagram = dsl.parse(largeDSL);
  duration = performance.now() - start;
  console.log(`Large (${largeDiagram.getNodes().length} nodes): ${duration.toFixed(2)}ms`);
  console.log();

  console.log('💡 Tip: Large diagrams (>50 nodes) benefit most from worker-based parsing');
}

/**
 * Demo 6: Format Preservation with Extended Types
 */
export function demoExtendedTypesFormat() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 6: Format Preservation with Extended Types');
  console.log('='.repeat(70) + '\n');

  const preserver = new FormatPreserver();

  const erdText = `
// Database Schema
// E-commerce System

erDiagram
  // Core entities
  CUSTOMER {
    int id PK
    string name
    string email
  }

  ORDER {
    int id PK
    int customer_id FK  // Reference to CUSTOMER
    date order_date
  }

  CUSTOMER ||--o{ ORDER : places
  `.trim();

  console.log('📝 ERD with Comments:');
  console.log(erdText);
  console.log();

  const formatInfo = preserver.extractFormatInfo(erdText);

  console.log('✅ Format Info:');
  console.log(`   Comments: ${formatInfo.comments.length}`);
  console.log(`   Indent: ${formatInfo.indentSize} ${formatInfo.indentStyle}`);
  console.log();

  console.log('📋 Comments:');
  for (const comment of formatInfo.comments) {
    console.log(`   ${comment.text}`);
  }
}

/**
 * Run all Phase 5 demos
 */
export async function runAllPhase5Demos() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + 'Phase 5: Performance Demos' + ' '.repeat(26) + '║');
  console.log('║' + ' '.repeat(13) + 'Web Workers & Format Preservation' + ' '.repeat(20) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  try {
    demoCommentPreservation();
    demoWhitespacePreservation();
    demoRoundTripPreservation();
    await demoWorkerParsing();
    demoPerformanceComparison();
    demoExtendedTypesFormat();

    console.log('\n' + '='.repeat(70));
    console.log('✅ All Phase 5 demos completed successfully!');
    console.log('='.repeat(70) + '\n');
  } catch (error) {
    console.error('\n❌ Demo error:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// Auto-run demos
runAllPhase5Demos();
