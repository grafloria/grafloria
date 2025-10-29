# DSL Engine Documentation

Welcome to the DSL Engine documentation! This comprehensive guide will help you understand and use the Diagram Text Language system.

## Quick Navigation

### 🚀 [Getting Started](index.html)
Modern landing page with feature overview, quick start guide, and interactive demos.

### 📖 [User Guide](USER-GUIDE.md)
Step-by-step tutorials for all diagram types:
- Basic Flowcharts
- Entity Relationship Diagrams (ERD)
- Business Process Models (BPMN)
- UML Class Diagrams
- Styling and Templates
- Advanced Features

### 🔧 [API Reference](API-REFERENCE.md)
Complete API documentation:
- Core DSL API
- Extended Type APIs (ERD, BPMN, UML)
- Style Parser API
- Template Parser API
- Worker Pool APIs
- Format Preserver API

### 💡 [Examples](EXAMPLES.md)
Real-world code examples:
- Software Development (Git workflows, CI/CD)
- Database Design (E-commerce, Social Media)
- Business Processes (Order fulfillment, Support tickets)
- System Architecture (Microservices, Cloud)
- Project Management
- Data Flows (ETL, Real-time analytics)

### 🏗️ [Architecture](ARCHITECTURE.md)
System design and internals:
- Architecture Overview
- Core Components
- Data Flow
- Phase Implementation Details
- Design Patterns
- Performance Optimizations

## Documentation Structure

```
docs/
├── index.html           # Landing page with feature showcase
├── README.md            # This file
├── USER-GUIDE.md        # Tutorial-style guide
├── API-REFERENCE.md     # Complete API documentation
├── EXAMPLES.md          # Code examples
└── ARCHITECTURE.md      # System design
```

## Interactive Demos

All phases include working demos:

- **[Phase 2: Bidirectional Sync](../demo-page.html)** - Live text ↔ diagram synchronization
- **Phase 3: Extended Types** - Run `npm run demo:extended` for ERD, BPMN, UML
- **Phase 4: Styles & Templates** - Run `npm run demo:styles`
- **Phase 5: Performance** - Run `npm run demo:performance`

## Quick Start

```typescript
import { DSL } from '@grafloria/engine/dsl';

// Create DSL instance
const dsl = new DSL({ autoLayout: true });

// Parse text into diagram
const text = `
flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Success]
  B -->|No| D[Failure]
`;

const diagram = dsl.parse(text);
console.log(`Created diagram with ${diagram.getNodes().length} nodes`);

// Generate text from diagram
const generated = dsl.generate(diagram);
console.log(generated);
```

## Features

### ✅ Phase 1: Template Auto-Generator
- 80 auto-generated node templates from TypeRegistry
- LemonadeJS-based template system
- Dynamic node rendering

### ✅ Phase 2: Bidirectional Sync
- Real-time text ↔ diagram synchronization
- 300ms debouncing for smooth UX
- Auto-layout detection
- Layout suggestions

### ✅ Phase 3: Extended Types
- **ERD**: Entity Relationship Diagrams with table-like rendering
- **BPMN**: Business Process Models with pools, lanes, and intelligent type inference
- **UML**: Class Diagrams with attributes, methods, and relationships

### ✅ Phase 4: Advanced Features
- **CSS-like Styling**: `@style` definitions with cascading
- **Inline Styles**: Direct node styling `{fill:#color}`
- **HTML Templates**: `@template` blocks with data bindings
- **Security**: Template validation and XSS prevention

### ✅ Phase 5: Performance
- **Web Workers**: Async parsing without blocking UI
- **Format Preservation**: Maintain comments, whitespace, indentation
- **Progress Reporting**: Track long-running operations
- **Cancellation Support**: Cancel operations mid-flight

### ✅ Phase 6: Documentation
- Comprehensive user guide
- Complete API reference
- Real-world examples
- Architecture documentation
- Modern landing page

## Version

**Current Version**: 1.0.0 (All Phases Complete)

## Support

- 📁 Source code: `/libs/engine/src/dsl/`
- 🧪 Demo files: `*-demo.ts`, `demo-page.html`
- 🧪 Test files: `*-test.ts`, `*-roundtrip-test.ts`

## Related Documentation

- [Grafloria Engine Documentation](../../README.md)
- [Layout System](../../layout/README.md)
- [Model System](../../models/README.md)
- [Template System](../../templates/README.md)

---

**Built with TypeScript, LemonadeJS, and Web Workers**

Part of the Grafloria Platform
