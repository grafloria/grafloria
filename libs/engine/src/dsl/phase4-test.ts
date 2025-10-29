/**
 * Phase 4 Tests: Inline Templates and Styles
 *
 * Validates:
 * - Style parsing and application
 * - Template parsing and storage
 * - Style cascading and precedence
 * - Edge cases and error handling
 */

import { StyleParser, TemplateParser } from './advanced';
import { DSL } from './DSL';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
}

/**
 * Test style class parsing
 */
export function testStyleClassParsing(): TestResult {
  const parser = new StyleParser();

  const text = `
@style primary {
  fill: #3b82f6;
  stroke: #1e40af;
  strokeWidth: 2;
  borderRadius: 8;
}

@style secondary {
  fill: #6b7280;
  stroke: #374151;
}
  `;

  const styles = parser.parseStyleDefinitions(text);

  if (styles.size !== 2) {
    return {
      name: 'Style Class Parsing',
      passed: false,
      message: `Expected 2 style definitions, got ${styles.size}`,
    };
  }

  const primary = styles.get('primary');
  if (!primary || primary.fill !== '#3b82f6' || primary.strokeWidth !== 2) {
    return {
      name: 'Style Class Parsing',
      passed: false,
      message: 'Primary style not parsed correctly',
    };
  }

  return {
    name: 'Style Class Parsing',
    passed: true,
    message: 'Parsed 2 style definitions correctly',
  };
}

/**
 * Test inline style parsing
 */
export function testInlineStyleParsing(): TestResult {
  const parser = new StyleParser();

  const style = parser.parseInlineStyle('fill:#ff0000;stroke:#00ff00;strokeWidth:3');

  if (style.fill !== '#ff0000' || style.stroke !== '#00ff00' || style.strokeWidth !== 3) {
    return {
      name: 'Inline Style Parsing',
      passed: false,
      message: 'Inline styles not parsed correctly',
    };
  }

  return {
    name: 'Inline Style Parsing',
    passed: true,
    message: 'Inline styles parsed correctly',
  };
}

/**
 * Test style class extraction from node definition
 */
export function testStyleClassExtraction(): TestResult {
  const parser = new StyleParser();

  const classes = parser.extractStyleClasses('A[Label]:::primary:::highlight');

  if (classes.length !== 2 || !classes.includes('primary') || !classes.includes('highlight')) {
    return {
      name: 'Style Class Extraction',
      passed: false,
      message: `Expected ['primary', 'highlight'], got [${classes.join(', ')}]`,
    };
  }

  return {
    name: 'Style Class Extraction',
    passed: true,
    message: 'Extracted 2 style classes correctly',
  };
}

/**
 * Test inline style extraction from node definition
 */
export function testInlineStyleExtraction(): TestResult {
  const parser = new StyleParser();

  const style = parser.extractInlineStyle('A[Label]{fill:blue;stroke:red}');

  if (!style || style.fill !== 'blue' || style.stroke !== 'red') {
    return {
      name: 'Inline Style Extraction',
      passed: false,
      message: 'Inline styles not extracted correctly',
    };
  }

  return {
    name: 'Inline Style Extraction',
    passed: true,
    message: 'Extracted inline styles correctly',
  };
}

/**
 * Test style merging
 */
export function testStyleMerging(): TestResult {
  const parser = new StyleParser();

  const base = { fill: '#000', stroke: '#fff', strokeWidth: 1 };
  const override = { fill: '#f00', strokeWidth: 2 };

  const merged = parser.mergeStyles(base, override);

  if (merged.fill !== '#f00' || merged.stroke !== '#fff' || merged.strokeWidth !== 2) {
    return {
      name: 'Style Merging',
      passed: false,
      message: 'Styles not merged correctly',
    };
  }

  return {
    name: 'Style Merging',
    passed: true,
    message: 'Merged styles correctly with proper precedence',
  };
}

/**
 * Test template parsing
 */
export function testTemplateParsing(): TestResult {
  const parser = new TemplateParser();

  const text = `
@template myCard {
  <div class="card">
    <h3>{{data.title}}</h3>
    <p>{{data.description}}</p>
  </div>
}
  `;

  const templates = parser.parseTemplateDefinitions(text);

  if (templates.size !== 1) {
    return {
      name: 'Template Parsing',
      passed: false,
      message: `Expected 1 template, got ${templates.size}`,
    };
  }

  const template = templates.get('myCard');
  if (!template) {
    return {
      name: 'Template Parsing',
      passed: false,
      message: 'Template "myCard" not found',
    };
  }

  if (!template.html.includes('<div class="card">')) {
    return {
      name: 'Template Parsing',
      passed: false,
      message: 'Template HTML not parsed correctly',
    };
  }

  if (!template.bindings || template.bindings.length !== 2) {
    return {
      name: 'Template Parsing',
      passed: false,
      message: 'Template bindings not extracted correctly',
    };
  }

  return {
    name: 'Template Parsing',
    passed: true,
    message: 'Parsed template with 2 bindings correctly',
  };
}

/**
 * Test template validation
 */
export function testTemplateValidation(): TestResult {
  const parser = new TemplateParser();

  const validTemplate = {
    name: 'valid',
    html: '<div>{{data.value}}</div>',
    bindings: ['data.value'],
  };

  const invalidTemplate = {
    name: 'invalid',
    html: '<div><script>alert("xss")</script></div>',
    bindings: [],
  };

  const validErrors = parser.validateTemplate(validTemplate);
  const invalidErrors = parser.validateTemplate(invalidTemplate);

  if (validErrors.length > 0) {
    return {
      name: 'Template Validation',
      passed: false,
      message: 'Valid template incorrectly flagged as invalid',
    };
  }

  if (invalidErrors.length === 0) {
    return {
      name: 'Template Validation',
      passed: false,
      message: 'Invalid template (with script tag) not caught',
    };
  }

  return {
    name: 'Template Validation',
    passed: true,
    message: 'Template validation working correctly',
  };
}

/**
 * Test DSL integration with styles
 */
export function testDSLStyleIntegration(): TestResult {
  const dsl = new DSL({ debug: false });

  const text = `
@style primary {
  fill: #3b82f6;
  stroke: #1e40af;
  strokeWidth: 2;
}

flowchart TD
  A[Node A]:::primary --> B[Node B]
  `;

  try {
    const diagram = dsl.parse(text);

    if (diagram.getNodes().length !== 2) {
      return {
        name: 'DSL Style Integration',
        passed: false,
        message: `Expected 2 nodes, got ${diagram.getNodes().length}`,
      };
    }

    const nodeA = diagram.getNode('A');
    if (!nodeA) {
      return {
        name: 'DSL Style Integration',
        passed: false,
        message: 'Node A not found',
      };
    }

    if (nodeA.style.fill !== '#3b82f6' || nodeA.style.strokeWidth !== 2) {
      return {
        name: 'DSL Style Integration',
        passed: false,
        message: 'Style not applied to Node A',
      };
    }

    return {
      name: 'DSL Style Integration',
      passed: true,
      message: 'Styles applied correctly via DSL',
    };
  } catch (error) {
    return {
      name: 'DSL Style Integration',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Test DSL integration with inline styles
 */
export function testDSLInlineStyleIntegration(): TestResult {
  const dsl = new DSL({ debug: false });

  const text = `
flowchart TD
  A[Node A]{fill:#ff0000;strokeWidth:3} --> B[Node B]
  `;

  try {
    const diagram = dsl.parse(text);

    const nodeA = diagram.getNode('A');
    if (!nodeA) {
      return {
        name: 'DSL Inline Style Integration',
        passed: false,
        message: 'Node A not found',
      };
    }

    if (nodeA.style.fill !== '#ff0000' || nodeA.style.strokeWidth !== 3) {
      return {
        name: 'DSL Inline Style Integration',
        passed: false,
        message: 'Inline style not applied to Node A',
      };
    }

    return {
      name: 'DSL Inline Style Integration',
      passed: true,
      message: 'Inline styles applied correctly via DSL',
    };
  } catch (error) {
    return {
      name: 'DSL Inline Style Integration',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Test style cascading (class + inline)
 */
export function testStyleCascading(): TestResult {
  const dsl = new DSL({ debug: false });

  const text = `
@style base {
  fill: #000;
  stroke: #fff;
  strokeWidth: 1;
}

flowchart TD
  A[Node A]:::base{fill:#ff0000}
  `;

  try {
    const diagram = dsl.parse(text);

    const nodeA = diagram.getNode('A');
    if (!nodeA) {
      return {
        name: 'Style Cascading',
        passed: false,
        message: 'Node A not found',
      };
    }

    // Inline fill should override class fill
    if (nodeA.style.fill !== '#ff0000') {
      return {
        name: 'Style Cascading',
        passed: false,
        message: `Expected fill #ff0000, got ${nodeA.style.fill}`,
      };
    }

    // Class stroke should still apply
    if (nodeA.style.stroke !== '#fff' || nodeA.style.strokeWidth !== 1) {
      return {
        name: 'Style Cascading',
        passed: false,
        message: 'Class styles not applied correctly',
      };
    }

    return {
      name: 'Style Cascading',
      passed: true,
      message: 'Style cascading working correctly (inline overrides class)',
    };
  } catch (error) {
    return {
      name: 'Style Cascading',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Test kebab-case to camelCase conversion
 */
export function testKebabCaseConversion(): TestResult {
  const parser = new StyleParser();

  const style = parser.parseInlineStyle('stroke-width:2;border-radius:8;font-family:Arial');

  if (style.strokeWidth !== 2 || style.borderRadius !== 8 || style.fontFamily !== 'Arial') {
    return {
      name: 'Kebab-case Conversion',
      passed: false,
      message: 'Kebab-case properties not converted correctly',
    };
  }

  return {
    name: 'Kebab-case Conversion',
    passed: true,
    message: 'Kebab-case properties converted to camelCase correctly',
  };
}

/**
 * Run all Phase 4 tests
 */
export function runAllPhase4Tests(): {
  passed: number;
  failed: number;
  total: number;
  results: TestResult[];
} {
  console.log('\n' + '='.repeat(70));
  console.log('Phase 4 Tests: Inline Templates and Styles');
  console.log('='.repeat(70) + '\n');

  const tests = [
    testStyleClassParsing,
    testInlineStyleParsing,
    testStyleClassExtraction,
    testInlineStyleExtraction,
    testStyleMerging,
    testTemplateParsing,
    testTemplateValidation,
    testDSLStyleIntegration,
    testDSLInlineStyleIntegration,
    testStyleCascading,
    testKebabCaseConversion,
  ];

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = test();
    results.push(result);

    if (result.passed) {
      passed++;
      console.log(`✅ ${result.name}`);
      console.log(`   ${result.message}`);
    } else {
      failed++;
      console.log(`❌ ${result.name}`);
      console.log(`   ${result.message}`);
    }
    console.log();
  }

  console.log('='.repeat(70));
  console.log(`Results: ${passed}/${tests.length} passed, ${failed} failed`);
  console.log('='.repeat(70) + '\n');

  return {
    passed,
    failed,
    total: tests.length,
    results,
  };
}

// Auto-run tests
runAllPhase4Tests();
