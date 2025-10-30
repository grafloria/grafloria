# DSL Engine API Reference

Complete API documentation for the DSL Engine - Diagram Text Language system.

## Table of Contents

- [Core DSL API](#core-dsl-api)
- [Extended Types](#extended-types)
  - [ERD (Entity Relationship Diagrams)](#erd-entity-relationship-diagrams)
  - [BPMN (Business Process Model)](#bpmn-business-process-model)
  - [UML (Class Diagrams)](#uml-class-diagrams)
- [Advanced Features](#advanced-features)
  - [Style Parser](#style-parser)
  - [Template Parser](#template-parser)
- [Performance APIs](#performance-apis)
  - [DSL Worker Pool](#dsl-worker-pool)
  - [Format Preserver](#format-preserver)
- [Data Models](#data-models)

---

## Core DSL API

### DSL Class

The main entry point for parsing and generating diagram text.

#### Constructor

```typescript
constructor(options?: DSLOptions)
```

**Parameters:**
- `options.debug` (boolean): Enable debug logging (default: false)
- `options.autoLayout` (boolean): Automatically apply layout after parsing (default: false)
- `options.transformOptions` (TransformOptions): Options for AST transformation

**Example:**
```typescript
import { DSL } from '@grafloria/engine/dsl';

const dsl = new DSL({
  debug: true,
  autoLayout: true
});
```

#### parse()

Parse DSL text into a DiagramModel.

```typescript
parse(text: string): DiagramModel
```

**Parameters:**
- `text` (string): DSL text in Mermaid-compatible syntax

**Returns:** `DiagramModel` - The parsed diagram model

**Throws:** `Error` if parsing fails

**Example:**
```typescript
const text = `
flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Success]
  B -->|No| D[Failure]
`;

const diagram = dsl.parse(text);
console.log(`Parsed ${diagram.getNodes().length} nodes`);
```

#### parseDetailed()

Parse DSL text with detailed metadata and layout suggestions.

```typescript
parseDetailed(text: string): ParseResult
```

**Parameters:**
- `text` (string): DSL text to parse

**Returns:** `ParseResult` object containing:
- `diagram` (DiagramModel): The parsed diagram
- `layoutSuggestion` (LayoutSuggestion): Recommended layout preset
- `stats` (ParseStats): Parse statistics (node count, link count, parse time)

**Example:**
```typescript
const result = dsl.parseDetailed(text);

console.log(`Nodes: ${result.stats.nodeCount}`);
console.log(`Links: ${result.stats.linkCount}`);
console.log(`Parse time: ${result.stats.parseTime}ms`);
console.log(`Suggested layout: ${result.layoutSuggestion.presetId}`);
console.log(`Confidence: ${result.layoutSuggestion.confidence}%`);
```

#### generate()

Generate DSL text from a DiagramModel.

```typescript
generate(diagram: DiagramModel): string
```

**Parameters:**
- `diagram` (DiagramModel): The diagram to convert to text

**Returns:** `string` - Generated DSL text

**Example:**
```typescript
const diagram = new DiagramModel('My Diagram');
// ... add nodes and links ...

const text = dsl.generate(diagram);
console.log(text);
```

---

## Extended Types

### ERD (Entity Relationship Diagrams)

Parse and generate Entity Relationship Diagrams.

#### Syntax

```
erDiagram
  ENTITY_NAME {
    type fieldName [PK] [FK] [UNIQUE] [NOT NULL]
  }

  ENTITY1 ||--o{ ENTITY2 : "relationship label"
```

**Cardinality Notation:**
- `||--||` : One to one
- `||--o{` : One to many
- `}o--o{` : Many to many
- `||--o|` : One to zero or one

#### parseERD()

```typescript
parseERD(text: string): DiagramModel
```

**Example:**
```typescript
const erdText = `
erDiagram
  Customer {
    int customerId PK
    string name NOT NULL
    string email UNIQUE
  }

  Order {
    int orderId PK
    int customerId FK
    date orderDate
    decimal total
  }

  Customer ||--o{ Order : "places"
`;

const diagram = dsl.parse(erdText);

// Access entity data
const customerNode = diagram.getNode('Customer');
console.log(customerNode.data['name']); // "Customer"
console.log(customerNode.data['fields']); // Array of field objects

// Each field has: { name, type, primaryKey, foreignKey, unique, notNull }
```

#### generateERD()

```typescript
generateERD(diagram: DiagramModel): string
```

**Example:**
```typescript
const erdText = dsl.generate(diagram);
// Produces valid erDiagram syntax
```

---

### BPMN (Business Process Model)

Parse and generate BPMN-style flowcharts with intelligent type inference.

#### Syntax

```
bpmn
  @pool PoolName
    @lane LaneName
      Node1[Task] --> Node2((Event))
      Node2 --> Node3{Gateway}
    @endlane
  @endpool
```

**Node Type Inference:**
- `( )` : Start/End events
- `(( ))` : Intermediate events
- `[ ]` : Tasks/Activities
- `{ }` : Gateways (XOR, AND, OR)
- `[( )]` : Manual tasks
- `[[]]` : Subprocesses

#### parseBPMN()

```typescript
parseBPMN(text: string): DiagramModel
```

**Example:**
```typescript
const bpmnText = `
bpmn
  @pool "Order Processing"
    @lane "Customer Service"
      Start(Order Received) --> Review[Review Order]
      Review --> Valid{Valid?}
      Valid -->|Yes| Process[Process Payment]
      Valid -->|No| Reject(Reject Order)
    @endlane
  @endpool
`;

const diagram = dsl.parse(bpmnText);

// Access BPMN metadata
const reviewNode = diagram.getNode('Review');
console.log(reviewNode.data['nodeType']); // "task"
console.log(reviewNode.data['pool']); // "Order Processing"
console.log(reviewNode.data['lane']); // "Customer Service"
```

---

### UML (Class Diagrams)

Parse and generate UML class diagrams with attributes and methods.

#### Syntax

```
classDiagram
  class ClassName {
    <<stereotype>>
    +publicAttribute: type
    -privateAttribute: type
    #protectedAttribute: type
    ~packageAttribute: type
    +method(param: type): returnType
    +abstractMethod()*
    +staticMethod()$
  }

  ClassA --|> ClassB : inheritance
  ClassC --* ClassD : composition
  ClassE --o ClassF : aggregation
  ClassG --> ClassH : association
```

**Visibility:**
- `+` : public
- `-` : private
- `#` : protected
- `~` : package

**Modifiers:**
- `*` : abstract
- `$` : static

#### parseUML()

```typescript
parseUML(text: string): DiagramModel
```

**Example:**
```typescript
const umlText = `
classDiagram
  class Animal {
    <<abstract>>
    +name: string
    +age: number
    +makeSound()*
    +move(): void
  }

  class Dog {
    +breed: string
    +makeSound(): void
    +fetch(item: string): void
  }

  Dog --|> Animal : inherits
`;

const diagram = dsl.parse(umlText);

// Access class data
const dogClass = diagram.getNode('Dog');
console.log(dogClass.data['stereotype']); // undefined (no stereotype)
console.log(dogClass.data['attributes']); // Array of attribute objects
console.log(dogClass.data['methods']); // Array of method objects

// Attribute: { visibility, name, type, isStatic, defaultValue }
// Method: { visibility, name, parameters, returnType, isAbstract, isStatic }
```

---

## Advanced Features

### Style Parser

Parse and apply CSS-like styling to diagrams.

#### Class: StyleParser

```typescript
class StyleParser
```

#### parseStyleDefinitions()

Parse `@style` blocks.

```typescript
parseStyleDefinitions(text: string): Map<string, Partial<NodeStyle>>
```

**Example:**
```typescript
import { StyleParser } from '@grafloria/engine/dsl/advanced';

const parser = new StyleParser();

const text = `
@style primary {
  fill: #3b82f6;
  stroke: #1e40af;
  strokeWidth: 2;
  borderRadius: 8;
}

@style success {
  fill: #10b981;
  stroke: #059669;
}
`;

const styles = parser.parseStyleDefinitions(text);
console.log(styles.get('primary'));
// { fill: '#3b82f6', stroke: '#1e40af', strokeWidth: 2, borderRadius: 8 }
```

#### parseInlineStyle()

Parse inline style syntax.

```typescript
parseInlineStyle(styleText: string): Partial<NodeStyle>
```

**Example:**
```typescript
const style = parser.parseInlineStyle('fill:#ff0000;stroke:#00ff00;strokeWidth:3');
console.log(style);
// { fill: '#ff0000', stroke: '#00ff00', strokeWidth: 3 }

// Also supports kebab-case
const style2 = parser.parseInlineStyle('stroke-width:2;border-radius:8;font-family:Arial');
console.log(style2);
// { strokeWidth: 2, borderRadius: 8, fontFamily: 'Arial' }
```

#### extractStyleClasses()

Extract style class names from node definition.

```typescript
extractStyleClasses(nodeDefinition: string): string[]
```

**Example:**
```typescript
const classes = parser.extractStyleClasses('A[Label]:::primary:::highlight');
console.log(classes); // ['primary', 'highlight']
```

#### extractInlineStyle()

Extract inline style from node definition.

```typescript
extractInlineStyle(nodeDefinition: string): Partial<NodeStyle> | null
```

**Example:**
```typescript
const style = parser.extractInlineStyle('A[Label]{fill:blue;stroke:red}');
console.log(style); // { fill: 'blue', stroke: 'red' }
```

#### mergeStyles()

Merge multiple style objects with proper precedence.

```typescript
mergeStyles(...styles: Array<Partial<NodeStyle>>): Partial<NodeStyle>
```

**Example:**
```typescript
const base = { fill: '#000', stroke: '#fff', strokeWidth: 1 };
const override = { fill: '#f00', strokeWidth: 2 };

const merged = parser.mergeStyles(base, override);
console.log(merged);
// { fill: '#f00', stroke: '#fff', strokeWidth: 2 }
```

#### Complete Style Example

```typescript
const text = `
@style primary {
  fill: #3b82f6;
  stroke: #1e40af;
  strokeWidth: 2;
}

flowchart TD
  A[Start]:::primary --> B[Process]{fill:#ff0000}
  B --> C[End]:::primary
`;

const diagram = dsl.parse(text);

// Node A: Uses 'primary' style class
// Node B: Uses inline style (overrides everything)
// Node C: Uses 'primary' style class
```

---

### Template Parser

Parse inline HTML template definitions.

#### Class: TemplateParser

```typescript
class TemplateParser
```

#### parseTemplateDefinitions()

Parse `@template` blocks.

```typescript
parseTemplateDefinitions(text: string): Map<string, TemplateDefinition>
```

**Example:**
```typescript
import { TemplateParser } from '@grafloria/engine/dsl/advanced';

const parser = new TemplateParser();

const text = `
@template myCard {
  <div class="card">
    <h3>{{data.title}}</h3>
    <p>{{data.description}}</p>
    <span class="badge">{{data.status}}</span>
  </div>
}

@template simpleBox {
  <div class="box">{{data.label}}</div>
}
`;

const templates = parser.parseTemplateDefinitions(text);
console.log(templates.size); // 2

const cardTemplate = templates.get('myCard');
console.log(cardTemplate.name); // "myCard"
console.log(cardTemplate.html); // "<div class=\"card\">..."
console.log(cardTemplate.bindings); // ['data.title', 'data.description', 'data.status']
```

#### extractTemplateBindings()

Extract data binding expressions from template HTML.

```typescript
extractTemplateBindings(html: string): string[]
```

**Example:**
```typescript
const html = '<div>{{data.name}} - {{data.value}}</div>';
const bindings = parser.extractTemplateBindings(html);
console.log(bindings); // ['data.name', 'data.value']
```

#### validateTemplate()

Validate template HTML structure and security.

```typescript
validateTemplate(template: TemplateDefinition): string[]
```

**Returns:** Array of error messages (empty if valid)

**Example:**
```typescript
const validTemplate = {
  name: 'valid',
  html: '<div>{{data.value}}</div>',
  bindings: ['data.value']
};

const invalidTemplate = {
  name: 'invalid',
  html: '<div><script>alert("xss")</script></div>',
  bindings: []
};

const validErrors = parser.validateTemplate(validTemplate);
console.log(validErrors); // []

const invalidErrors = parser.validateTemplate(invalidTemplate);
console.log(invalidErrors); // ['Template contains script tag']
```

#### Complete Template Example

```typescript
const text = `
@template taskCard {
  <div class="task-card">
    <div class="task-header">{{data.name}}</div>
    <div class="task-body">
      <p>Assigned to: {{data.assignee}}</p>
      <p>Due: {{data.dueDate}}</p>
    </div>
    <div class="task-footer">
      <span class="status {{data.statusClass}}">{{data.status}}</span>
    </div>
  </div>
}

flowchart TD
  A[Task 1]@taskCard
`;

const diagram = dsl.parse(text);

// Node A will use the 'taskCard' template
// Template bindings will be resolved from node.data
```

---

## Performance APIs

### DSL Worker Pool

Async DSL parsing using Web Workers to prevent UI blocking.

#### Class: DSLWorkerPool

```typescript
class DSLWorkerPool
```

#### Constructor

```typescript
constructor(workerScriptUrl?: string)
```

**Parameters:**
- `workerScriptUrl` (string, optional): Custom worker script URL

#### initialize()

Initialize the worker pool.

```typescript
async initialize(): Promise<void>
```

**Example:**
```typescript
import { DSLWorkerPool } from '@grafloria/engine/dsl/workers';

const pool = new DSLWorkerPool();
await pool.initialize();
```

#### isSupported()

Check if Web Workers are supported.

```typescript
static isSupported(): boolean
```

**Example:**
```typescript
if (DSLWorkerPool.isSupported()) {
  console.log('Web Workers are available');
}
```

#### parse()

Parse DSL text using a worker (async, non-blocking).

```typescript
async parse(
  text: string,
  options?: DSLWorkerOptions
): Promise<{ diagram: DiagramModel; formatInfo?: FormatInfo }>
```

**Parameters:**
- `text` (string): DSL text to parse
- `options.useWorker` (boolean): Enable worker parsing (default: true)
- `options.timeout` (number): Timeout in ms (default: 10000)
- `options.reportProgress` (boolean): Log progress updates (default: true)
- `options.fallbackToMainThread` (boolean): Fallback if worker fails (default: true)

**Example:**
```typescript
const pool = new DSLWorkerPool();

// Parse in background worker
const result = await pool.parse(largeText, {
  timeout: 30000,
  reportProgress: true
});

console.log(`Parsed ${result.diagram.getNodes().length} nodes`);
if (result.formatInfo) {
  console.log(`Preserved ${result.formatInfo.comments.length} comments`);
}
```

#### generate()

Generate DSL text using a worker (async, non-blocking).

```typescript
async generate(
  diagram: SerializedDiagram,
  options?: DSLWorkerOptions
): Promise<string>
```

**Example:**
```typescript
import { serializeDiagram } from '@grafloria/engine/dsl/workers';

const serialized = serializeDiagram(diagram);
const text = await pool.generate(serialized);
```

#### cancelRequest()

Cancel a specific request.

```typescript
cancelRequest(requestId: string): void
```

#### cancelAll()

Cancel all active requests.

```typescript
cancelAll(): void
```

#### terminate()

Terminate worker and clean up.

```typescript
terminate(): void
```

**Example:**
```typescript
// Clean up when done
pool.terminate();
```

#### getStats()

Get pool statistics.

```typescript
getStats(): { workerActive: boolean; activeRequests: number }
```

---

### Format Preserver

Preserve comments, whitespace, and formatting across parse/generate cycles.

#### Class: FormatPreserver

```typescript
class FormatPreserver
```

#### extractFormatInfo()

Extract formatting information from DSL text.

```typescript
extractFormatInfo(text: string): FormatInfo
```

**Returns:** `FormatInfo` object containing:
- `originalText` (string): Original text for reference
- `comments` (CommentInfo[]): Extracted comments
- `whitespace` (WhitespaceInfo): Whitespace patterns
- `indentStyle` ('spaces' | 'tabs'): Detected indent style
- `indentSize` (number): Indent size (2 or 4 spaces)
- `lineEnding` ('\n' | '\r\n'): Line ending style

**Example:**
```typescript
import { FormatPreserver } from '@grafloria/engine/dsl/format';

const preserver = new FormatPreserver();

const text = `
// Main flowchart
flowchart TD
  // Start node
  A[Start] --> B[Process]
  B --> C[End] // End node
`;

const formatInfo = preserver.extractFormatInfo(text);

console.log(`Found ${formatInfo.comments.length} comments`);
console.log(`Indent style: ${formatInfo.indentStyle}`);
console.log(`Indent size: ${formatInfo.indentSize}`);
console.log(`Line ending: ${formatInfo.lineEnding === '\n' ? 'LF' : 'CRLF'}`);

// Comments array: [
//   { text: "Main flowchart", line: 1, type: "line" },
//   { text: "Start node", line: 3, type: "line", nodeId: "A" },
//   { text: "End node", line: 5, type: "line", nodeId: "C" }
// ]
```

#### applyFormatInfo()

Apply formatting information to generated text.

```typescript
applyFormatInfo(text: string, formatInfo: FormatInfo): string
```

**Example:**
```typescript
// Round-trip with format preservation
const originalText = `
// My diagram
flowchart TD
    A[Start] --> B[End]
`;

// 1. Extract format
const formatInfo = preserver.extractFormatInfo(originalText);

// 2. Strip comments and whitespace
const cleanText = preserver.stripComments(originalText);

// 3. Parse and modify
const diagram = dsl.parse(cleanText);
// ... make changes ...

// 4. Generate new text
const generated = dsl.generate(diagram);

// 5. Apply original formatting
const formatted = preserver.applyFormatInfo(generated, formatInfo);

// formatted text will have:
// - Original comments restored
// - Same indentation (4 spaces)
// - Same line endings
// - Same whitespace patterns
```

#### stripComments()

Remove comments from text.

```typescript
stripComments(text: string): string
```

#### detectIndentStyle()

Detect indentation style (spaces vs tabs).

```typescript
detectIndentStyle(text: string): 'spaces' | 'tabs'
```

#### detectIndentSize()

Detect indent size for space-based indentation.

```typescript
detectIndentSize(text: string): number
```

#### detectLineEnding()

Detect line ending style.

```typescript
detectLineEnding(text: string): '\n' | '\r\n'
```

---

## Data Models

### DiagramModel

Represents a complete diagram with nodes and links.

#### Constructor

```typescript
constructor(name: string)
```

#### Methods

```typescript
// Node management
addNode(node: NodeModel): void
removeNode(nodeId: string): void
getNode(nodeId: string): NodeModel | undefined
getNodes(): NodeModel[]

// Link management
addLink(link: LinkModel): void
removeLink(linkId: string): void
getLink(linkId: string): LinkModel | undefined
getLinks(): LinkModel[]

// Metadata
setMetadata(key: string, value: any): void
getMetadata(key: string): any
getAllMetadata(): Map<string, any>
```

---

### NodeModel

Represents a diagram node.

#### Constructor

```typescript
constructor(options: {
  id: string;
  type: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
})
```

#### Properties

```typescript
id: string                          // Unique identifier
type: string                        // Node type (e.g., 'flowchart:rect')
position: { x: number; y: number } // Position in canvas
size: { width: number; height: number } // Node dimensions
data: Record<string, any>          // Custom data (use bracket notation)
style: Record<string, any>         // Visual styling
```

#### Methods

```typescript
setPosition(x: number, y: number): void
setSize(width: number, height: number): void
setMetadata(key: string, value: any): void
getMetadata(key: string): any
getAllMetadata(): Map<string, any>
```

#### Example

```typescript
const node = new NodeModel({
  id: 'A',
  type: 'flowchart:rect',
  position: { x: 100, y: 100 },
  size: { width: 120, height: 60 }
});

// Use bracket notation for data access
node.data['label'] = 'My Node';
node.data['description'] = 'This is a node';

// Set style
node.style['fill'] = '#3b82f6';
node.style['stroke'] = '#1e40af';
node.style['strokeWidth'] = 2;
```

---

### LinkModel

Represents a connection between nodes.

#### Constructor

```typescript
constructor(options: {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePortId: string;
  targetPortId: string;
})
```

#### Properties

```typescript
id: string                   // Unique identifier
sourceNodeId: string        // Source node ID
targetNodeId: string        // Target node ID
sourcePortId: string        // Source port ID
targetPortId: string        // Target port ID
pathType: string           // Path rendering type ('bezier', 'straight', 'orthogonal')
data: Record<string, any>  // Custom data (use bracket notation)
```

#### Methods

```typescript
setPath(pathType: string): void
setMetadata(key: string, value: any): void
getMetadata(key: string): any
getAllMetadata(): Map<string, any>
```

#### Example

```typescript
const link = new LinkModel({
  id: 'link1',
  sourceNodeId: 'A',
  targetNodeId: 'B',
  sourcePortId: 'out',
  targetPortId: 'in'
});

// Use bracket notation for data access
link.data['label'] = 'connects to';
link.data['edgeType'] = 'arrow';

link.setPath('bezier');
```

---

## Type Definitions

### NodeStyle

```typescript
interface NodeStyle {
  fill?: string;              // Background color
  stroke?: string;            // Border color
  strokeWidth?: number;       // Border width
  borderRadius?: number;      // Corner radius
  fontFamily?: string;        // Font family
  fontSize?: number;          // Font size
  fontWeight?: string;        // Font weight
  color?: string;            // Text color
  padding?: number;          // Inner padding
  opacity?: number;          // Transparency (0-1)
  // ... and more CSS-like properties
}
```

### LayoutSuggestion

```typescript
interface LayoutSuggestion {
  presetId: string;          // Suggested layout preset ID
  confidence: number;        // Confidence score (0-100)
  reasoning: string;         // Explanation for suggestion
}
```

### ParseStats

```typescript
interface ParseStats {
  nodeCount: number;         // Number of nodes parsed
  linkCount: number;         // Number of links parsed
  parseTime: number;         // Parse duration in milliseconds
}
```

### CommentInfo

```typescript
interface CommentInfo {
  text: string;              // Comment text
  line: number;              // Line number
  type: 'line' | 'block';   // Comment type
  nodeId?: string;          // Associated node (if applicable)
}
```

---

## Error Handling

All parsing methods can throw errors. Always wrap in try-catch:

```typescript
try {
  const diagram = dsl.parse(text);
  console.log('Parse successful');
} catch (error) {
  if (error instanceof Error) {
    console.error('Parse error:', error.message);

    // Some errors include line/column info
    if ('line' in error) {
      console.error(`At line ${error.line}, column ${error.column}`);
    }
  }
}
```

Worker-based parsing returns errors via Promise rejection:

```typescript
const pool = new DSLWorkerPool();

try {
  const result = await pool.parse(text);
  console.log('Async parse successful');
} catch (error) {
  console.error('Worker parse error:', error.message);
}
```

---

## Best Practices

### 1. Use bracket notation for node/link data

```typescript
// ✅ Correct (required for TypeScript strict mode)
node.data['label'] = 'My Label';
link.data['edgeType'] = 'arrow';

// ❌ Incorrect (causes TS4111 error)
node.data.label = 'My Label';
link.data.edgeType = 'arrow';
```

### 2. Leverage worker pool for large diagrams

```typescript
// For diagrams with >100 nodes, use workers
const pool = new DSLWorkerPool();
const result = await pool.parse(largeText);

// Don't forget to clean up
pool.terminate();
```

### 3. Preserve format when round-tripping

```typescript
const preserver = new FormatPreserver();

// Extract format before parsing
const formatInfo = preserver.extractFormatInfo(originalText);
const cleanText = preserver.stripComments(originalText);

// Parse, modify, generate
const diagram = dsl.parse(cleanText);
// ... modifications ...
const generated = dsl.generate(diagram);

// Apply original format
const final = preserver.applyFormatInfo(generated, formatInfo);
```

### 4. Use style cascading properly

```typescript
// Define base styles
@style base { fill: #000; stroke: #fff; strokeWidth: 1; }
@style highlight { fill: #ff0; }

// Cascade: base < class < inline
flowchart TD
  A[Node]:::base:::highlight{strokeWidth:3}

// Result: fill=#ff0 (from highlight), stroke=#fff (from base), strokeWidth=3 (inline)
```

### 5. Validate templates before use

```typescript
const parser = new TemplateParser();
const templates = parser.parseTemplateDefinitions(text);

for (const [name, template] of templates) {
  const errors = parser.validateTemplate(template);
  if (errors.length > 0) {
    console.error(`Template '${name}' has errors:`, errors);
  }
}
```

---

## Version History

- **v1.0.0** - Initial release with all 6 phases complete
  - Phase 1: Template Auto-Generator (80 templates)
  - Phase 2: Bidirectional Sync
  - Phase 3: Extended Types (ERD, BPMN, UML)
  - Phase 4: Advanced Features (Styles, Templates)
  - Phase 5: Performance (Workers, Format Preservation)
  - Phase 6: Documentation

---

## See Also

- [User Guide](USER-GUIDE.md) - Step-by-step tutorials
- [Examples](EXAMPLES.md) - Code examples and use cases
- [Architecture](ARCHITECTURE.md) - System design and internals
- [Demo Page](../demo-page.html) - Interactive demos
