import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DSL, BidirectionalSync, DiagramEngine, DiagramModel, LayoutService } from '@grafloria/engine';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

@Component({
    imports: [CommonModule, FormsModule, DiagramCanvasComponent],
    selector: 'app-dsl-bidirectional-demo',
    templateUrl: './dsl-bidirectional-demo.component.html',
    styleUrl: './dsl-bidirectional-demo.component.css'
})
export class DslBidirectionalDemoComponent implements OnInit, OnDestroy {
  constructor(private cdr: ChangeDetectorRef) {}
  dsl!: DSL;
  sync!: BidirectionalSync;
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1200, height: 800 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;
  diagramReady = false; // Flag to control when canvas should render

  dslText = `flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Success]
  B -->|No| D[Failure]
  C --> E[End]
  D --> E`;

  generatedText = '';
  syncStatus = '';
  syncDirection: 'text-to-diagram' | 'diagram-to-text' | 'text-to-visual' | 'visual-to-text' | 'none' | '' = '';

  // Panel visibility controls
  showExamples = true;
  showEditor = true;
  showDiagram = true;
  showGenerated = true;

  examples = [
    {
      name: 'Simple Flowchart',
      description: 'Basic flowchart with decision logic',
      dsl: `flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Success]
  B -->|No| D[Failure]
  C --> E[End]
  D --> E`
    },
    {
      name: 'ERD - E-Commerce',
      description: 'Database schema for online store',
      dsl: `erDiagram
  Customer {
    int customerId PK
    string name NOT NULL
    string email UNIQUE
    date createdAt
  }

  Order {
    int orderId PK
    int customerId FK
    date orderDate
    decimal total
  }

  Product {
    int productId PK
    string name NOT NULL
    decimal price
    int stock
  }

  OrderItem {
    int orderItemId PK
    int orderId FK
    int productId FK
    int quantity
    decimal price
  }

  Customer ||--o{ Order : "places"
  Order ||--|{ OrderItem : "contains"
  Product ||--o{ OrderItem : "ordered in"`
    },
    {
      name: 'BPMN - Order Processing',
      description: 'Business process with pools and lanes',
      dsl: `bpmn
  @pool "Order Fulfillment"
    @lane "Customer Service"
      Start(Order Received) --> Review[Review Order]
      Review --> Valid{Valid?}
    @endlane

    @lane "Warehouse"
      Valid -->|Yes| Pick[Pick Items]
      Pick --> Pack[Pack Order]
    @endlane

    @lane "Shipping"
      Pack --> Ship[Ship Order]
      Ship --> Complete((Delivered))
    @endlane
  @endpool`
    },
    {
      name: 'UML - Class Hierarchy',
      description: 'Object-oriented class structure',
      dsl: `classDiagram
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

  class Cat {
    +lives: number
    +makeSound(): void
    +purr(): void
  }

  Animal --|> Dog : inherits
  Animal --|> Cat : inherits`
    },
    {
      name: 'Styled Workflow',
      description: 'Flowchart with custom styling',
      dsl: `@style primary {
  fill: #3b82f6;
  stroke: #1e40af;
  color: white;
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
  Start[User Login]:::primary
  Start --> Input[Enter Credentials]:::primary
  Input --> Validate{Valid?}
  Validate -->|Yes| Success[Dashboard]:::success
  Validate -->|No| Error[Show Error]:::error
  Error --> Input`
    },
    {
      name: 'Git Workflow',
      description: 'Development branching strategy',
      dsl: `flowchart LR
  Main[main branch] --> Dev[develop branch]
  Dev --> F1[feature/login]
  Dev --> F2[feature/api]
  F1 --> PR1[Pull Request]
  F2 --> PR2[Pull Request]
  PR1 --> Review1{Code Review}
  PR2 --> Review2{Code Review}
  Review1 -->|Approved| Merge1[Merge to develop]
  Review2 -->|Approved| Merge2[Merge to develop]
  Merge1 --> Dev
  Merge2 --> Dev
  Dev --> Release[Release branch]
  Release --> Main`
    },
    {
      name: 'API Flow',
      description: 'API request processing',
      dsl: `flowchart TD
  Client[Client] --> Gateway[API Gateway]
  Gateway --> Auth{Authenticated?}
  Auth -->|No| Unauth[401 Unauthorized]
  Auth -->|Yes| Valid{Valid Request?}
  Valid -->|No| BadReq[400 Bad Request]
  Valid -->|Yes| Cache{In Cache?}
  Cache -->|Yes| Return1[Return Cached]
  Cache -->|No| DB[(Database)]
  DB --> Process[Process Data]
  Process --> Store[Update Cache]
  Store --> Return2[200 OK]
  Return1 --> Client
  Return2 --> Client
  Unauth --> Client
  BadReq --> Client`
    }
  ];

  ngOnInit() {
    // Create diagram engine for rendering
    this.engine = new DiagramEngine();

    // CRITICAL: Initialize LayoutService on engine (required for engine.applyLayout())
    const layoutService = new LayoutService();
    this.engine.setLayoutService(layoutService);

    this.dsl = new DSL({
      debug: true,
      autoLayout: true  // Enable auto-layout to detect optimal layout
    });

    this.sync = new BidirectionalSync({
      debounceMs: 300,
      autoLayout: true,  // Enable auto-layout to apply layout during parse
      debug: true
    });

    // Initialize with empty diagram and initial text
    const emptyDiagram = new DiagramModel('DSL Demo');
    this.sync.initialize(emptyDiagram, this.dslText);

    // Listen for sync events
    this.sync.onSync(async (direction, success) => {
      this.syncDirection = direction;
      this.syncStatus = `Synced: ${direction}`;

      if (direction === 'text-to-visual' && success) {
        // Update generated text and render diagram
        const diagram = this.sync.getDiagram();
        if (diagram) {
          this.generatedText = this.dsl.generate(diagram);

          // Debug: Log diagram stats
          const suggestedLayout = diagram.getMetadata('suggestedLayout');
          const layoutReasoning = diagram.getMetadata('layoutReasoning');
          const layoutConfidence = diagram.getMetadata('layoutConfidence');

          console.log('[DSL Debug] Diagram loaded:', {
            nodes: diagram.getNodes().length,
            links: diagram.getLinks().length,
            suggestedLayout,
            layoutReasoning,
            layoutConfidence
          });

          // Log diagram stats for debugging
          const direction = diagram.getMetadata('direction') || 'TB';
          console.log('[DSL] Diagram parsed:', {
            nodes: diagram.getNodes().length,
            links: diagram.getLinks().length,
            direction,
            suggestedLayout
          });

          // Step 1: TEMPORARILY hide canvas to force re-initialization
          this.diagramReady = false;

          // Step 2: Set diagram to engine
          this.engine.setDiagram(diagram);

          // Step 3: Enable live rerouting BEFORE applying layout
          this.engine.enableLiveRerouting();

          // Step 4: Apply layout
          try {
            const layoutResult = await this.engine.applyLayout({
              adapter: 'dagre',
              options: {
                rankdir: direction,
                nodesep: 80,
                ranksep: 100,
                ranker: 'network-simplex'
              },
              animate: false
            });

            console.log('[DSL] Layout applied with direction:', direction);

            // Step 4.5: CRITICAL - Optimize port assignments using layout-aware algorithm
            // This ensures connections use optimal port sides based on hierarchical layout
            const nodeRanks = layoutResult.metadata?.nodeRanks;
            if (nodeRanks) {
              const layoutManager = diagram.getLayoutManager();
              layoutManager.optimizeConnections({
                direction: direction as 'TB' | 'LR' | 'RL' | 'BT',
                ranks: nodeRanks
              });
              console.log('[DSL] Port assignments optimized using layout-aware algorithm');
            } else {
              // Fallback: optimize without ranks (geometric only)
              const layoutManager = diagram.getLayoutManager();
              layoutManager.optimizeConnections();
              console.log('[DSL] Port assignments optimized using geometric algorithm (no ranks available)');
            }
          } catch (error: any) {
            console.error('[DSL] Layout error:', error);
          }

          // Step 5: Show canvas AFTER layout completes (next tick)
          // This mimics toggling the panel off/on
          setTimeout(() => {
            this.diagramReady = true;
            this.cdr.detectChanges();
          }, 0);
        }
      }

      setTimeout(() => {
        this.syncStatus = '';
        this.syncDirection = '';
      }, 2000);
    });

    // Initial parse
    this.onTextChange();
  }

  ngOnDestroy() {
    // Clean up sync listeners
    if (this.sync) {
      this.sync.dispose();
    }
  }

  onTextChange() {
    try {
      this.sync.onTextChange(this.dslText);
    } catch (error: any) {
      console.error('Parse error:', error);
      this.syncStatus = `Error: ${error.message}`;
    }
  }

  loadExample(example: any) {
    this.dslText = example.dsl;
    this.onTextChange();
  }

  formatText() {
    try {
      const diagram = this.dsl.parse(this.dslText);
      this.dslText = this.dsl.generate(diagram);
      this.onTextChange();
    } catch (error: any) {
      console.error('Format error:', error);
    }
  }

  clearText() {
    this.dslText = '';
    this.generatedText = '';
    this.syncStatus = '';
  }

  copyToClipboard() {
    navigator.clipboard.writeText(this.dslText).then(() => {
      this.syncStatus = 'Copied to clipboard!';
      setTimeout(() => {
        this.syncStatus = '';
      }, 2000);
    });
  }

  toggleExamples() {
    this.showExamples = !this.showExamples;
  }

  toggleEditor() {
    this.showEditor = !this.showEditor;
  }

  toggleDiagram() {
    this.showDiagram = !this.showDiagram;
  }

  toggleGenerated() {
    this.showGenerated = !this.showGenerated;
  }
}
