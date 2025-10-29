# DSL Engine User Guide

Welcome to the DSL Engine user guide! This guide will walk you through everything you need to know to create beautiful diagrams using our text-based language.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Basic Flowcharts](#basic-flowcharts)
3. [Entity Relationship Diagrams](#entity-relationship-diagrams)
4. [Business Process Models (BPMN)](#business-process-models-bpmn)
5. [UML Class Diagrams](#uml-class-diagrams)
6. [Styling Your Diagrams](#styling-your-diagrams)
7. [Custom Templates](#custom-templates)
8. [Advanced Features](#advanced-features)
9. [Performance Tips](#performance-tips)
10. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Installation

```typescript
import { DSL } from '@grafloria/engine/dsl';

// Create a DSL instance
const dsl = new DSL({
  debug: false,      // Enable debug logging
  autoLayout: true   // Automatically position nodes
});
```

### Your First Diagram

Let's create a simple flowchart:

```typescript
const text = `
flowchart TD
  A[Start] --> B[Process]
  B --> C[End]
`;

const diagram = dsl.parse(text);
console.log(`Created diagram with ${diagram.getNodes().length} nodes`);
```

That's it! You've just created your first diagram.

---

## Basic Flowcharts

### Node Shapes

Different node shapes convey different meanings:

```
flowchart TD
  A[Rectangle - Process]
  B(Rounded - Start/End)
  C([Stadium - Action])
  D[[Subroutine]]
  E[(Database)]
  F((Circle))
  G>Flag]
  H{Diamond - Decision}
  I{{Hexagon}}
  J[/Parallelogram/]
  K[\Trapezoid\]
```

### Direction

Control the flow direction:

```
flowchart TD   -- Top to Down (vertical)
flowchart LR   -- Left to Right (horizontal)
flowchart RL   -- Right to Left
flowchart BT   -- Bottom to Top
```

**Example:**

```
flowchart LR
  A[User] --> B[Frontend]
  B --> C[API]
  C --> D[Database]
```

### Connections

Different arrow styles:

```
flowchart TD
  A --> B          -- Solid arrow
  A -.-> C         -- Dotted arrow
  A ==> D          -- Thick arrow
  A --- E          -- No arrow (line only)
  A -.- F          -- Dotted line
  A === G          -- Thick line
```

### Labels on Links

Add text to your connections:

```
flowchart TD
  A[Login] -->|Success| B[Dashboard]
  A -->|Failure| C[Error Page]
  B --> D[Logout]
```

### Example: User Login Flow

```
flowchart TD
  Start(User visits site) --> Login[Login Page]
  Login --> Auth{Valid credentials?}
  Auth -->|Yes| Success[Load Dashboard]
  Auth -->|No| Error[Show Error Message]
  Error --> Login
  Success --> Dashboard[User Dashboard]
  Dashboard --> Logout[Logout]
  Logout --> End(Session ended)
```

**Tips:**
- Use descriptive IDs (A, B, C) or names (Login, Auth, Success)
- Keep labels concise
- Use decisions (diamond shapes) for branching logic

---

## Entity Relationship Diagrams

ERD diagrams show database structures and relationships.

### Basic Syntax

```
erDiagram
  EntityName {
    type fieldName [constraints]
  }
```

### Field Types

Common database types:

```
erDiagram
  User {
    int userId
    string username
    string email
    date createdAt
    boolean isActive
    decimal balance
  }
```

### Constraints

Add constraints to fields:

```
erDiagram
  Customer {
    int customerId PK           -- Primary Key
    string name NOT NULL        -- Required field
    string email UNIQUE         -- Must be unique
    int accountId FK            -- Foreign Key
  }
```

Available constraints:
- `PK` - Primary Key
- `FK` - Foreign Key
- `UNIQUE` - Unique constraint
- `NOT NULL` - Required field

### Relationships

Define how entities relate to each other:

```
erDiagram
  Customer ||--o{ Order : "places"
  Order ||--|{ OrderItem : "contains"
  Product ||--o{ OrderItem : "ordered in"
```

**Cardinality notation:**

| Notation | Meaning |
|----------|---------|
| `\|\|--\|\|` | One to one |
| `\|\|--o{` | One to many |
| `}o--o{` | Many to many |
| `\|\|--o\|` | One to zero or one |
| `}o--\|\|` | Many to one |

### Complete Example: E-Commerce Database

```
erDiagram
  Customer {
    int customerId PK
    string firstName NOT NULL
    string lastName NOT NULL
    string email UNIQUE NOT NULL
    string phone
    date registeredAt
  }

  Address {
    int addressId PK
    int customerId FK
    string street NOT NULL
    string city NOT NULL
    string state
    string zipCode
    string country NOT NULL
  }

  Order {
    int orderId PK
    int customerId FK
    int shippingAddressId FK
    date orderDate NOT NULL
    decimal total NOT NULL
    string status NOT NULL
  }

  OrderItem {
    int orderItemId PK
    int orderId FK
    int productId FK
    int quantity NOT NULL
    decimal price NOT NULL
  }

  Product {
    int productId PK
    string name NOT NULL
    string description
    decimal price NOT NULL
    int stockQuantity
    string category
  }

  Customer ||--o{ Address : "has"
  Customer ||--o{ Order : "places"
  Order ||--|{ OrderItem : "contains"
  Product ||--o{ OrderItem : "ordered in"
  Address ||--o{ Order : "ships to"
```

**Tips:**
- Start with core entities (Customer, Product, Order)
- Add relationships after defining all entities
- Use meaningful field names
- Always define primary keys
- The system automatically renders entities as tables

---

## Business Process Models (BPMN)

BPMN diagrams show business workflows and processes.

### Basic Syntax

```
bpmn
  Node1[Task] --> Node2((Event))
  Node2 --> Node3{Gateway}
```

### Node Types

The system intelligently infers BPMN node types from shapes:

```
bpmn
  Start(Start Event)           -- Circle: Events
  Task[Process Order]          -- Rectangle: Tasks
  Gateway{Valid?}              -- Diamond: Gateways
  SubProcess[[Handle Payment]] -- Double brackets: Subprocess
  EndEvent((Order Complete))   -- Double circle: End Event
  ManualTask[(Manual Review)]  -- Rectangle with parentheses: Manual task
```

### Pools and Lanes

Organize processes by roles or departments:

```
bpmn
  @pool "Order Processing"
    @lane "Customer Service"
      ReceiveOrder(Order Received) --> ReviewOrder[Review Order]
    @endlane

    @lane "Warehouse"
      ReviewOrder --> PickItems[Pick Items]
      PickItems --> PackOrder[Pack Order]
    @endlane

    @lane "Shipping"
      PackOrder --> ShipOrder[Ship Order]
      ShipOrder --> Complete((Order Shipped))
    @endlane
  @endpool
```

### Gateways

Different gateway types for process flow:

```
bpmn
  Start(Begin) --> Gateway{XOR Gateway}
  Gateway -->|Option A| TaskA[Task A]
  Gateway -->|Option B| TaskB[Task B]
  TaskA --> Merge{Join}
  TaskB --> Merge
  Merge --> End((Complete))
```

### Complete Example: Order Fulfillment

```
bpmn
  @pool "E-Commerce Order Fulfillment"
    @lane "Customer"
      Start(Place Order) --> PaymentSubmit[Submit Payment]
      Notify((Receive Notification))
    @endlane

    @lane "Payment System"
      PaymentSubmit --> ProcessPayment[Process Payment]
      ProcessPayment --> PaymentCheck{Payment Valid?}
      PaymentCheck -->|Yes| PaymentSuccess[Payment Confirmed]
      PaymentCheck -->|No| PaymentFailed((Payment Failed))
    @endlane

    @lane "Warehouse"
      PaymentSuccess --> CheckStock{Items in Stock?}
      CheckStock -->|Yes| PickItems[Pick Items from Shelf]
      CheckStock -->|No| Backorder[Create Backorder]
      PickItems --> QualityCheck[Quality Check]
      QualityCheck --> PackItems[Pack Items]
    @endlane

    @lane "Shipping"
      PackItems --> GenerateLabel[Generate Shipping Label]
      GenerateLabel --> HandToCarrier[Hand to Carrier]
      HandToCarrier --> ShipOrder[Ship Order]
      ShipOrder --> Notify
    @endlane
  @endpool
```

**Tips:**
- Use pools for different organizations
- Use lanes for roles within an organization
- Start with events (circles)
- End with events (double circles)
- Use gateways for decisions

---

## UML Class Diagrams

UML diagrams show object-oriented class structures.

### Basic Syntax

```
classDiagram
  class ClassName {
    +attribute: type
    +method(): returnType
  }
```

### Visibility

Control attribute and method visibility:

```
classDiagram
  class Example {
    +publicAttribute: string      -- Public (+)
    -privateAttribute: number     -- Private (-)
    #protectedAttribute: boolean  -- Protected (#)
    ~packageAttribute: date       -- Package (~)
  }
```

### Methods

Define class methods:

```
classDiagram
  class Calculator {
    +add(a: number, b: number): number
    +subtract(a: number, b: number): number
    +multiply(a: number, b: number): number
    +divide(a: number, b: number): number
  }
```

### Method Modifiers

```
classDiagram
  class Shape {
    <<abstract>>
    +area()*                    -- Abstract method (*)
    +perimeter()*
    +getColor()$: string       -- Static method ($)
  }
```

### Relationships

Define class relationships:

```
classDiagram
  ClassA --|> ClassB : inheritance
  ClassC --* ClassD : composition
  ClassE --o ClassF : aggregation
  ClassG --> ClassH : association
  ClassI ..> ClassJ : dependency
  ClassK ..|> ClassL : realization
```

**Relationship types:**

| Notation | Type | Meaning |
|----------|------|---------|
| `--\|>` | Inheritance | "is a" relationship |
| `--*` | Composition | Strong ownership |
| `--o` | Aggregation | Weak ownership |
| `-->` | Association | General relationship |
| `..>` | Dependency | Uses temporarily |
| `..\|>` | Realization | Implements interface |

### Complete Example: Animal Hierarchy

```
classDiagram
  class Animal {
    <<abstract>>
    +name: string
    +age: number
    +constructor(name: string, age: number)
    +makeSound()*
    +move(): void
    +sleep(): void
    +toString()$: string
  }

  class Mammal {
    <<abstract>>
    +furColor: string
    +feedYoung(): void
    +makeSound()*
  }

  class Bird {
    <<abstract>>
    +wingspan: number
    +fly(): void
    +makeSound()*
  }

  class Dog {
    +breed: string
    +isGoodBoy: boolean
    +constructor(name: string, age: number, breed: string)
    +makeSound(): void
    +fetch(item: string): void
    +wagTail(): void
  }

  class Cat {
    +livesRemaining: number
    +constructor(name: string, age: number)
    +makeSound(): void
    +scratch(target: string): void
    +purr(): void
  }

  class Eagle {
    +eyesightRange: number
    +constructor(name: string, age: number)
    +makeSound(): void
    +hunt(prey: Animal): boolean
  }

  class Penguin {
    +canFly: boolean
    +constructor(name: string, age: number)
    +makeSound(): void
    +swim(): void
    +slide(): void
  }

  class Owner {
    +name: string
    +pets: Animal[]
    +adoptPet(pet: Animal): void
    +feedPets(): void
  }

  Animal --|> Mammal : inherits
  Animal --|> Bird : inherits
  Mammal --|> Dog : inherits
  Mammal --|> Cat : inherits
  Bird --|> Eagle : inherits
  Bird --|> Penguin : inherits
  Owner --o Animal : owns
```

**Tips:**
- Use stereotypes (<<abstract>>, <<interface>>) to add context
- Mark abstract methods with `*`
- Mark static methods with `$`
- Start with base classes/interfaces
- Add concrete implementations
- Show relationships last

---

## Styling Your Diagrams

Make your diagrams visually appealing with CSS-like styles.

### Style Classes

Define reusable style classes:

```
@style primary {
  fill: #3b82f6;
  stroke: #1e40af;
  strokeWidth: 2;
  borderRadius: 8;
}

@style success {
  fill: #10b981;
  stroke: #059669;
  color: white;
}

@style error {
  fill: #ef4444;
  stroke: #dc2626;
  color: white;
}

flowchart TD
  A[Start]:::primary --> B{Check Status}
  B -->|OK| C[Success]:::success
  B -->|Error| D[Failure]:::error
```

### Inline Styles

Apply styles directly to nodes:

```
flowchart TD
  A[Custom Node]{fill:#ff0000;stroke:#990000;strokeWidth:3}
  B[Another Node]{fill:#00ff00;borderRadius:20}
  A --> B
```

### Style Cascading

Styles cascade with precedence: diagram defaults < style classes < inline styles

```
@style base {
  fill: #000000;
  stroke: #ffffff;
  strokeWidth: 1;
}

@style highlight {
  fill: #ffff00;
}

flowchart TD
  A[Node with base]:::base
  B[Node with highlight]:::highlight
  C[Node with both]:::base:::highlight
  D[Custom override]:::base{fill:#ff0000}
```

Results:
- **A**: Black fill, white stroke, width 1 (base)
- **B**: Yellow fill, default stroke (highlight)
- **C**: Yellow fill, white stroke, width 1 (highlight overrides base fill)
- **D**: Red fill, white stroke, width 1 (inline overrides all)

### Available Style Properties

```
@style example {
  // Colors
  fill: #3b82f6;              // Background color
  stroke: #1e40af;            // Border color
  color: #ffffff;             // Text color

  // Sizing
  strokeWidth: 2;             // Border width
  borderRadius: 8;            // Corner radius
  padding: 10;                // Inner padding

  // Typography
  fontFamily: Arial;
  fontSize: 14;
  fontWeight: bold;

  // Effects
  opacity: 0.9;               // Transparency (0-1)
}
```

### Complete Styled Example

```
@style header {
  fill: #1e293b;
  color: #ffffff;
  fontSize: 18;
  fontWeight: bold;
  borderRadius: 8;
}

@style process {
  fill: #3b82f6;
  stroke: #1e40af;
  color: #ffffff;
  strokeWidth: 2;
  borderRadius: 4;
}

@style decision {
  fill: #f59e0b;
  stroke: #d97706;
  color: #ffffff;
  strokeWidth: 2;
}

@style success {
  fill: #10b981;
  stroke: #059669;
  color: #ffffff;
  strokeWidth: 2;
  borderRadius: 20;
}

@style error {
  fill: #ef4444;
  stroke: #dc2626;
  color: #ffffff;
  strokeWidth: 2;
  borderRadius: 20;
}

flowchart TD
  Start[User Registration]:::header
  Start --> Input[Fill Form]:::process
  Input --> Validate{Valid Data?}:::decision
  Validate -->|Yes| Create[Create Account]:::process
  Validate -->|No| Error[Show Errors]:::error
  Error --> Input
  Create --> Email[Send Confirmation]:::process
  Email --> Success[Registration Complete]:::success
```

**Tips:**
- Define a consistent color palette with style classes
- Use meaningful class names (primary, success, error, warning)
- Reserve inline styles for one-off customizations
- Test color contrast for readability

---

## Custom Templates

Create custom HTML templates for rich node rendering.

### Basic Template

```
@template myCard {
  <div class="card">
    <h3>{{data.title}}</h3>
    <p>{{data.description}}</p>
  </div>
}

flowchart TD
  A[Task 1]@myCard
```

### Template Bindings

Access node data using `{{data.property}}`:

```
@template taskCard {
  <div class="task-card">
    <div class="task-header">{{data.name}}</div>
    <div class="task-body">
      <p><strong>Assignee:</strong> {{data.assignee}}</p>
      <p><strong>Due:</strong> {{data.dueDate}}</p>
      <p><strong>Priority:</strong> {{data.priority}}</p>
    </div>
    <div class="task-footer">
      <span class="status-badge {{data.statusClass}}">
        {{data.status}}
      </span>
    </div>
  </div>
}

flowchart TD
  Task1[Sprint Planning]@taskCard
  Task2[Development]@taskCard
  Task3[Code Review]@taskCard
```

### Conditional Rendering

Use LemonadeJS-style conditionals:

```
@template userCard {
  <div class="user-card">
    <h3>{{data.name}}</h3>
    {{#if data.isAdmin}}
      <span class="badge admin">Admin</span>
    {{/if}}
    {{#if data.isPremium}}
      <span class="badge premium">Premium</span>
    {{/if}}
    <p>Email: {{data.email}}</p>
  </div>
}
```

### Iterating Over Lists

Loop through arrays:

```
@template entityTable {
  <div class="entity-container">
    <div class="entity-header">{{data.name}}</div>
    <div class="divider"></div>
    <div class="fields-section">
      {{#each data.fields}}
        <div class="field">
          {{#if this.primaryKey}}
            <span class="pk-indicator">PK</span>
          {{/if}}
          <span class="field-name">{{this.name}}</span>:
          <span class="field-type">{{this.type}}</span>
        </div>
      {{/each}}
    </div>
  </div>
}
```

### Complete Template Example

```
@template projectCard {
  <div class="project-card">
    <div class="project-header" style="background-color: {{data.color}}">
      <h2>{{data.name}}</h2>
      <span class="project-id">{{data.id}}</span>
    </div>

    <div class="project-body">
      <div class="info-row">
        <span class="label">Owner:</span>
        <span class="value">{{data.owner}}</span>
      </div>

      <div class="info-row">
        <span class="label">Status:</span>
        <span class="value status-{{data.status}}">{{data.status}}</span>
      </div>

      <div class="info-row">
        <span class="label">Budget:</span>
        <span class="value">{{data.budget}}</span>
      </div>

      <div class="info-row">
        <span class="label">Deadline:</span>
        <span class="value">{{data.deadline}}</span>
      </div>

      {{#if data.team}}
        <div class="team-section">
          <span class="label">Team:</span>
          <div class="team-members">
            {{#each data.team}}
              <span class="team-member">{{this.name}}</span>
            {{/each}}
          </div>
        </div>
      {{/if}}

      {{#if data.milestones}}
        <div class="milestones-section">
          <span class="label">Milestones:</span>
          <ul class="milestones-list">
            {{#each data.milestones}}
              <li class="milestone {{#if this.completed}}completed{{/if}}">
                {{this.title}} - {{this.date}}
              </li>
            {{/each}}
          </ul>
        </div>
      {{/if}}
    </div>

    <div class="project-footer">
      <div class="progress-bar">
        <div class="progress-fill" style="width: {{data.progress}}%"></div>
      </div>
      <span class="progress-text">{{data.progress}}% Complete</span>
    </div>
  </div>
}

flowchart LR
  Project1[Website Redesign]@projectCard
  Project2[Mobile App]@projectCard
  Project3[API Integration]@projectCard
  Project1 --> Project2
  Project2 --> Project3
```

**Tips:**
- Keep templates focused and reusable
- Use semantic HTML structure
- Validate templates (no script tags for security)
- Test with sample data before using

---

## Advanced Features

### Bidirectional Sync

The DSL engine supports real-time synchronization between text and visual editors.

```typescript
import { BidirectionalSync } from '@grafloria/engine/dsl/sync';

const sync = new BidirectionalSync(dsl, {
  debounceTime: 300,  // Wait 300ms after last edit
  autoLayout: true     // Auto-arrange on sync
});

// When text changes
sync.onTextChange(newText);

// When diagram changes
sync.onDiagramChange(diagram);

// Listen for updates
sync.on('sync', ({ text, diagram, direction }) => {
  console.log(`Synced ${direction}: text ↔ diagram`);
});
```

### Format Preservation

Maintain comments and formatting across parse/generate cycles:

```typescript
import { FormatPreserver } from '@grafloria/engine/dsl/format';

const preserver = new FormatPreserver();

const originalText = `
// This is my diagram
flowchart TD
    // Start of process
    A[Start] --> B[Process]
    B --> C[End] // End of process
`;

// Extract format info
const formatInfo = preserver.extractFormatInfo(originalText);

// Parse and modify
const cleanText = preserver.stripComments(originalText);
const diagram = dsl.parse(cleanText);

// ... make changes to diagram ...

// Generate with preserved format
const generated = dsl.generate(diagram);
const formatted = preserver.applyFormatInfo(generated, formatInfo);

// formatted text will have original comments and indentation
```

### Web Workers for Large Diagrams

Use Web Workers for non-blocking parsing:

```typescript
import { DSLWorkerPool } from '@grafloria/engine/dsl/workers';

const pool = new DSLWorkerPool();
await pool.initialize();

// Parse in background (non-blocking)
const result = await pool.parse(largeText, {
  timeout: 30000,
  reportProgress: true,
  fallbackToMainThread: true
});

console.log(`Parsed ${result.diagram.getNodes().length} nodes`);

// Clean up when done
pool.terminate();
```

### Auto-Layout Detection

The system automatically suggests the best layout:

```typescript
const result = dsl.parseDetailed(text);

console.log(`Suggested layout: ${result.layoutSuggestion.presetId}`);
console.log(`Confidence: ${result.layoutSuggestion.confidence}%`);
console.log(`Reasoning: ${result.layoutSuggestion.reasoning}`);

// Apply suggested layout
applyLayout(result.diagram, result.layoutSuggestion.presetId);
```

---

## Performance Tips

### 1. Use Workers for Large Diagrams

For diagrams with >100 nodes, use the worker pool:

```typescript
const pool = new DSLWorkerPool();
const result = await pool.parse(largeText);
```

### 2. Debounce Text Changes

When building live editors, debounce input:

```typescript
let debounceTimer;
const DEBOUNCE_TIME = 300; // ms

function onTextChange(newText) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const diagram = dsl.parse(newText);
    updateView(diagram);
  }, DEBOUNCE_TIME);
}
```

### 3. Cache Parse Results

Cache diagrams that don't change often:

```typescript
const cache = new Map();

function parseWithCache(text) {
  const hash = hashString(text);
  if (cache.has(hash)) {
    return cache.get(hash);
  }
  const diagram = dsl.parse(text);
  cache.set(hash, diagram);
  return diagram;
}
```

### 4. Lazy Load Extended Types

Only load parsers you need:

```typescript
// Instead of loading all parsers
import { DSL } from '@grafloria/engine/dsl';

// Load specific parsers
import { ERDParser } from '@grafloria/engine/dsl/extended/ERDParser';
```

### 5. Profile Your Code

Use the built-in stats:

```typescript
const result = dsl.parseDetailed(text);
console.log(`Parse time: ${result.stats.parseTime}ms`);

if (result.stats.parseTime > 1000) {
  console.warn('Slow parse detected, consider using workers');
}
```

---

## Troubleshooting

### Parse Errors

**Problem:** "Unexpected token at line X"

**Solution:** Check syntax. Common issues:
- Missing closing brackets: `[Label` instead of `[Label]`
- Invalid arrow syntax: `->` instead of `-->`
- Unclosed strings in labels

**Example:**
```
// ❌ Wrong
A[Missing bracket --> B

// ✅ Correct
A[Closed bracket] --> B
```

### Style Not Applying

**Problem:** Style class not working

**Solution:** Check:
1. Style is defined before use
2. Class name matches exactly (case-sensitive)
3. Using `:::` syntax for classes

**Example:**
```
// ❌ Wrong
flowchart TD
  A[Node]:::primary    // Style not defined yet

@style primary { fill: #000; }

// ✅ Correct
@style primary { fill: #000; }

flowchart TD
  A[Node]:::primary
```

### Template Not Rendering

**Problem:** Template not applied to node

**Solution:** Check:
1. Template is defined before use
2. Using `@templateName` syntax
3. Node data has required fields

**Example:**
```
// ❌ Wrong
flowchart TD
  A[Node]@myCard       // Template not defined

// ✅ Correct
@template myCard {
  <div>{{data.label}}</div>
}

flowchart TD
  A[Node]@myCard
```

### TypeScript Errors

**Problem:** "Property 'X' comes from an index signature..."

**Solution:** Use bracket notation for node/link data:

```typescript
// ❌ Wrong
node.data.label = 'My Label';

// ✅ Correct
node.data['label'] = 'My Label';
```

### Worker Timeout

**Problem:** "Layout computation timed out"

**Solution:** Increase timeout or simplify diagram:

```typescript
const result = await pool.parse(text, {
  timeout: 60000  // Increase to 60 seconds
});
```

### Format Not Preserved

**Problem:** Comments lost after round-trip

**Solution:** Use FormatPreserver explicitly:

```typescript
const formatInfo = preserver.extractFormatInfo(originalText);
const cleanText = preserver.stripComments(originalText);
// ... parse, modify, generate ...
const formatted = preserver.applyFormatInfo(generated, formatInfo);
```

---

## Next Steps

Congratulations! You now know how to use the DSL Engine. Here are some next steps:

1. **Explore Examples** - Check out [EXAMPLES.md](EXAMPLES.md) for more code samples
2. **API Reference** - Dive deeper with [API-REFERENCE.md](API-REFERENCE.md)
3. **Architecture** - Learn how it works in [ARCHITECTURE.md](ARCHITECTURE.md)
4. **Interactive Demos** - Try the [live demos](../demo-page.html)
5. **Contribute** - Found a bug or have a feature idea? Open an issue!

---

## Quick Reference

### Flowchart Syntax
```
flowchart TD
  A[Rectangle] --> B(Rounded)
  B --> C{Diamond}
  C -->|Label| D[(Database)]
```

### ERD Syntax
```
erDiagram
  Entity {
    type field PK FK
  }
  Entity1 ||--o{ Entity2 : "relation"
```

### BPMN Syntax
```
bpmn
  Start(Event) --> Task[Action]
  Task --> End((Complete))
```

### UML Syntax
```
classDiagram
  class Name {
    +attribute: type
    +method(): type
  }
  ClassA --|> ClassB
```

### Style Syntax
```
@style name {
  fill: #color;
  stroke: #color;
  strokeWidth: 2;
}
Node[Label]:::styleName
Node[Label]{fill:#color}
```

### Template Syntax
```
@template name {
  <div>{{data.property}}</div>
}
Node[Label]@templateName
```

---

Happy diagramming! 🎨
