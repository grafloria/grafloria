import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DSL, BidirectionalSync } from '@grafloria/engine';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-dsl-bidirectional-demo',
  templateUrl: './dsl-bidirectional-demo.component.html',
  styleUrl: './dsl-bidirectional-demo.component.css',
})
export class DslBidirectionalDemoComponent implements OnInit, OnDestroy {
  dsl!: DSL;
  sync!: BidirectionalSync;

  dslText = `flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Success]
  B -->|No| D[Failure]
  C --> E[End]
  D --> E`;

  generatedText = '';
  syncStatus = '';
  syncDirection: 'text-to-diagram' | 'diagram-to-text' | '' = '';

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
    this.dsl = new DSL({
      debug: true,
      autoLayout: true
    });

    this.sync = new BidirectionalSync(this.dsl, {
      debounceTime: 300,
      autoLayout: true
    });

    // Listen for sync events
    this.sync.on('sync', (event: any) => {
      this.syncDirection = event.direction;
      this.syncStatus = `Synced: ${event.direction}`;

      if (event.direction === 'text-to-diagram') {
        // Update generated text
        this.generatedText = this.dsl.generate(event.diagram);
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
      this.sync.removeAllListeners();
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
}
