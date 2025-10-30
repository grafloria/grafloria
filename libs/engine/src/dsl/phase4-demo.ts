/**
 * Phase 4 Demo: Advanced Features - Inline Templates and Styles
 *
 * Demonstrates:
 * - @style definitions (CSS-like styling)
 * - Inline styles {property:value}
 * - Style classes :::className
 * - @template definitions (custom HTML templates)
 * - Style cascading and precedence
 */

import { DSL } from './DSL';

/**
 * Demo 1: Style Classes with @style definitions
 */
export function demoStyleClasses() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 1: Style Classes with @style definitions');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ debug: false });

  const dslText = `
@style primary {
  fill: #3b82f6;
  stroke: #1e40af;
  strokeWidth: 2;
  borderRadius: 8;
}

@style success {
  fill: #10b981;
  stroke: #059669;
  strokeWidth: 2;
  borderRadius: 8;
}

@style warning {
  fill: #f59e0b;
  stroke: #d97706;
  strokeWidth: 2;
}

@style danger {
  fill: #ef4444;
  stroke: #dc2626;
  strokeWidth: 3;
  shadow: true;
}

flowchart TD
  A[Start]:::primary --> B{Decision}:::warning
  B -->|Yes| C[Success]:::success
  B -->|No| D[Error]:::danger
  C --> E[End]:::primary
  D --> E
  `.trim();

  console.log('📝 DSL with Style Classes:');
  console.log(dslText);
  console.log();

  const diagram = dsl.parse(dslText);

  console.log(`✅ Parsed diagram: ${diagram.getNodes().length} nodes`);
  console.log();

  console.log('🎨 Node Styles Applied:');
  for (const node of diagram.getNodes()) {
    const style = node.style;
    console.log(`   ${node.id} (${node.data['label']}):`);
    console.log(`      fill: ${style.fill || 'default'}`);
    console.log(`      stroke: ${style.stroke || 'default'}`);
    console.log(`      strokeWidth: ${style.strokeWidth || 'default'}`);
    console.log(`      borderRadius: ${style.borderRadius || 'default'}`);
    console.log(`      shadow: ${style.shadow || false}`);
  }
}

/**
 * Demo 2: Inline Styles
 */
export function demoInlineStyles() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 2: Inline Styles');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ debug: false });

  const dslText = `
flowchart LR
  A[Node A]{fill:#ff6b6b;stroke:#c92a2a;strokeWidth:3}
  B[Node B]{fill:#4ecdc4;stroke:#1098ad;borderRadius:12}
  C[Node C]{fill:#ffe66d;stroke:#f9ca24;opacity:0.8}
  D[Node D]{fill:#a8e6cf;stroke:#56ab91;shadow:true}

  A --> B --> C --> D
  `.trim();

  console.log('📝 DSL with Inline Styles:');
  console.log(dslText);
  console.log();

  const diagram = dsl.parse(dslText);

  console.log(`✅ Parsed diagram: ${diagram.getNodes().length} nodes`);
  console.log();

  console.log('🎨 Inline Styles Applied:');
  for (const node of diagram.getNodes()) {
    const style = node.style;
    console.log(`   ${node.id}:`);
    if (style.fill) console.log(`      fill: ${style.fill}`);
    if (style.stroke) console.log(`      stroke: ${style.stroke}`);
    if (style.strokeWidth) console.log(`      strokeWidth: ${style.strokeWidth}`);
    if (style.borderRadius) console.log(`      borderRadius: ${style.borderRadius}`);
    if (style.opacity) console.log(`      opacity: ${style.opacity}`);
    if (style.shadow) console.log(`      shadow: ${style.shadow}`);
  }
}

/**
 * Demo 3: Style Cascading (Class + Inline)
 */
export function demoStyleCascading() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 3: Style Cascading (Class + Inline)');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ debug: false });

  const dslText = `
@style base {
  fill: #f1f5f9;
  stroke: #64748b;
  strokeWidth: 1;
  borderRadius: 4;
}

@style highlight {
  stroke: #8b5cf6;
  strokeWidth: 3;
  shadow: true;
}

flowchart TD
  A[Normal]:::base
  B[Highlighted]:::base:::highlight
  C[Custom]:::base{fill:#fbbf24;borderRadius:16}

  A --> B --> C
  `.trim();

  console.log('📝 DSL with Style Cascading:');
  console.log(dslText);
  console.log();

  console.log('Style Precedence: base class < highlight class < inline styles\n');

  const diagram = dsl.parse(dslText);

  console.log(`✅ Parsed diagram: ${diagram.getNodes().length} nodes`);
  console.log();

  console.log('🎨 Cascaded Styles:');
  for (const node of diagram.getNodes()) {
    const style = node.style;
    console.log(`   ${node.id} (${node.data['label']}):`);
    console.log(`      fill: ${style.fill}`);
    console.log(`      stroke: ${style.stroke}`);
    console.log(`      strokeWidth: ${style.strokeWidth}`);
    console.log(`      borderRadius: ${style.borderRadius}`);
    console.log(`      shadow: ${style.shadow || false}`);
  }
}

/**
 * Demo 4: Inline HTML Templates
 */
export function demoInlineTemplates() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 4: Inline HTML Templates');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ debug: false });

  const dslText = `
@template customCard {
  <div class="custom-card">
    <div class="card-header">
      <h3>{{data.title}}</h3>
    </div>
    <div class="card-body">
      <p>{{data.description}}</p>
    </div>
    <div class="card-footer">
      <span class="badge">{{data.status}}</span>
    </div>
  </div>
}

@template statusBadge {
  <div class="status-badge" style="background: {{data.color}}">
    <span class="icon">{{data.icon}}</span>
    <span class="text">{{data.label}}</span>
  </div>
}

flowchart TD
  A[Start] --> B[Process]
  `.trim();

  console.log('📝 DSL with Template Definitions:');
  console.log(dslText);
  console.log();

  const diagram = dsl.parse(dslText);

  const templates = diagram.getMetadata('templateDefinitions');
  if (templates) {
    console.log(`✅ Found ${Object.keys(templates).length} template definitions`);
    console.log();

    console.log('📋 Template Details:');
    for (const [name, template] of Object.entries(templates as Record<string, any>)) {
      console.log(`\n   Template: ${name}`);
      console.log(`   Bindings: ${template.bindings.join(', ')}`);
      console.log(`   HTML Preview:`);
      const lines = template.html.split('\n');
      lines.forEach((line: string) => console.log(`      ${line}`));
    }
  }
}

/**
 * Demo 5: Diagram-Level Default Styles
 */
export function demoDiagramStyles() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 5: Diagram-Level Default Styles');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ debug: false });

  const dslText = `
@style diagram {
  fill: #e0f2fe;
  stroke: #0284c7;
  strokeWidth: 2;
  borderRadius: 6;
  fontSize: 14;
  fontFamily: Arial;
}

flowchart TD
  A[Node A] --> B[Node B]
  B --> C[Node C]
  C --> D[Node D]{fill:#fef3c7}
  `.trim();

  console.log('📝 DSL with Diagram-Level Styles:');
  console.log(dslText);
  console.log();

  const diagram = dsl.parse(dslText);

  const defaultStyle = diagram.getMetadata('defaultNodeStyle');
  if (defaultStyle) {
    console.log('🎨 Diagram Default Style:');
    console.log(`   fill: ${defaultStyle.fill}`);
    console.log(`   stroke: ${defaultStyle.stroke}`);
    console.log(`   strokeWidth: ${defaultStyle.strokeWidth}`);
    console.log(`   borderRadius: ${defaultStyle.borderRadius}`);
    console.log(`   fontSize: ${defaultStyle.fontSize}`);
    console.log(`   fontFamily: ${defaultStyle.fontFamily}`);
    console.log();
  }

  console.log('📊 Nodes with Applied Styles:');
  for (const node of diagram.getNodes()) {
    const style = node.style;
    console.log(`   ${node.id}: fill=${style.fill}, stroke=${style.stroke}`);
  }
}

/**
 * Demo 6: Combined Styles and Templates
 */
export function demoCombinedFeatures() {
  console.log('\n' + '='.repeat(70));
  console.log('DEMO 6: Combined Styles and Templates');
  console.log('='.repeat(70) + '\n');

  const dsl = new DSL({ debug: false });

  const dslText = `
@style primary {
  fill: #dbeafe;
  stroke: #3b82f6;
  strokeWidth: 2;
  borderRadius: 8;
}

@style accent {
  fill: #fef3c7;
  stroke: #f59e0b;
  strokeWidth: 2;
  borderRadius: 8;
}

@template infoBox {
  <div class="info-box">
    <strong>{{data.title}}</strong>
    <p>{{data.details}}</p>
  </div>
}

flowchart TD
  A[Start]:::primary --> B[Process]:::primary
  B --> C[Check]:::accent
  C --> D[End]:::primary
  `.trim();

  console.log('📝 DSL with Combined Features:');
  console.log(dslText);
  console.log();

  const diagram = dsl.parse(dslText);

  console.log(`✅ Parsed: ${diagram.getNodes().length} nodes`);
  console.log();

  const styles = diagram.getMetadata('styleDefinitions');
  const templates = diagram.getMetadata('templateDefinitions');

  console.log(`📊 Features Summary:`);
  console.log(`   Style Classes: ${styles ? Object.keys(styles).length : 0}`);
  console.log(`   Templates: ${templates ? Object.keys(templates).length : 0}`);
  console.log(`   Styled Nodes: ${diagram.getNodes().filter(n => Object.keys(n.style).length > 0).length}`);
}

/**
 * Run all Phase 4 demos
 */
export function runAllPhase4Demos() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(12) + 'Phase 4: Advanced Features Demos' + ' '.repeat(23) + '║');
  console.log('║' + ' '.repeat(18) + 'Inline Templates & Styles' + ' '.repeat(24) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  try {
    demoStyleClasses();
    demoInlineStyles();
    demoStyleCascading();
    demoInlineTemplates();
    demoDiagramStyles();
    demoCombinedFeatures();

    console.log('\n' + '='.repeat(70));
    console.log('✅ All Phase 4 demos completed successfully!');
    console.log('='.repeat(70) + '\n');
  } catch (error) {
    console.error('\n❌ Demo error:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// Auto-run demos
runAllPhase4Demos();
