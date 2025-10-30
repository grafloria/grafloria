# DSL Engine Examples

A curated collection of practical examples for common use cases. Copy and adapt these examples for your own projects.

## Table of Contents

- [Software Development](#software-development)
- [Database Design](#database-design)
- [Business Processes](#business-processes)
- [System Architecture](#system-architecture)
- [Project Management](#project-management)
- [Education](#education)
- [Data Flows](#data-flows)

---

## Software Development

### Git Workflow

A typical Git branching strategy:

```
flowchart TD
  Main[main branch] --> Develop[develop branch]
  Develop --> Feature1[feature/login]
  Develop --> Feature2[feature/dashboard]
  Feature1 --> PR1[Pull Request]
  Feature2 --> PR2[Pull Request]
  PR1 --> Review1{Code Review}
  PR2 --> Review2{Code Review}
  Review1 -->|Approved| Merge1[Merge to develop]
  Review1 -->|Changes Requested| Feature1
  Review2 -->|Approved| Merge2[Merge to develop]
  Review2 -->|Changes Requested| Feature2
  Merge1 --> Develop
  Merge2 --> Develop
  Develop --> Release[Release branch]
  Release --> Main
```

### CI/CD Pipeline

Continuous Integration and Deployment:

```
@style build {
  fill: #3b82f6;
  stroke: #1e40af;
  color: white;
  strokeWidth: 2;
}

@style test {
  fill: #8b5cf6;
  stroke: #6d28d9;
  color: white;
  strokeWidth: 2;
}

@style deploy {
  fill: #10b981;
  stroke: #059669;
  color: white;
  strokeWidth: 2;
}

@style fail {
  fill: #ef4444;
  stroke: #dc2626;
  color: white;
  strokeWidth: 2;
}

flowchart LR
  Commit(Developer Commits Code):::build
  Commit --> Checkout[Checkout Code]:::build
  Checkout --> Install[Install Dependencies]:::build
  Install --> Build[Build Project]:::build
  Build --> BuildCheck{Build Success?}
  BuildCheck -->|Yes| UnitTest[Run Unit Tests]:::test
  BuildCheck -->|No| BuildFail((Build Failed)):::fail
  UnitTest --> TestCheck{Tests Pass?}
  TestCheck -->|Yes| Integration[Integration Tests]:::test
  TestCheck -->|No| TestFail((Tests Failed)):::fail
  Integration --> IntCheck{Tests Pass?}
  IntCheck -->|Yes| DeployStaging[Deploy to Staging]:::deploy
  IntCheck -->|No| IntFail((Integration Failed)):::fail
  DeployStaging --> SmokeTest[Smoke Tests]:::test
  SmokeTest --> SmokeCheck{Tests Pass?}
  SmokeCheck -->|Yes| DeployProd[Deploy to Production]:::deploy
  SmokeCheck -->|No| RollBack[Rollback]:::fail
  DeployProd --> Success((Deployment Complete)):::deploy
```

### API Request Flow

How an API request is processed:

```
flowchart TD
  Client[Client Application] --> LB[Load Balancer]
  LB --> API1[API Server 1]
  LB --> API2[API Server 2]
  API1 --> Auth{Authenticated?}
  API2 --> Auth
  Auth -->|No| Unauthorized[401 Unauthorized]
  Auth -->|Yes| Validate{Valid Request?}
  Validate -->|No| BadRequest[400 Bad Request]
  Validate -->|Yes| RateLimit{Rate Limit OK?}
  RateLimit -->|No| TooMany[429 Too Many Requests]
  RateLimit -->|Yes| Cache{In Cache?}
  Cache -->|Yes| CacheHit[Return Cached Data]
  Cache -->|No| Database[(Database)]
  Database --> Process[Process Data]
  Process --> Store[Update Cache]
  Store --> Success[200 OK with Data]
  CacheHit --> Client
  Success --> Client
  Unauthorized --> Client
  BadRequest --> Client
  TooMany --> Client
```

### Authentication System

User authentication flow with JWT:

```
flowchart TD
  User[User] --> LoginPage[Login Page]
  LoginPage --> SubmitCreds[Submit Credentials]
  SubmitCreds --> Backend[Backend Server]
  Backend --> ValidateUser{Valid User?}
  ValidateUser -->|No| LoginError[Show Error]
  LoginError --> LoginPage
  ValidateUser -->|Yes| Check2FA{2FA Enabled?}
  Check2FA -->|No| GenerateJWT[Generate JWT Token]
  Check2FA -->|Yes| Send2FA[Send 2FA Code]
  Send2FA --> User
  User --> Enter2FA[Enter 2FA Code]
  Enter2FA --> Verify2FA{Code Valid?}
  Verify2FA -->|No| LoginError
  Verify2FA -->|Yes| GenerateJWT
  GenerateJWT --> StoreRefresh[Store Refresh Token]
  StoreRefresh --> SendTokens[Send Access + Refresh Tokens]
  SendTokens --> User
  User --> AccessApp[Access Application]
```

---

## Database Design

### E-Commerce Database

Complete database schema for an online store:

```
erDiagram
  User {
    int userId PK
    string email UNIQUE NOT NULL
    string passwordHash NOT NULL
    string firstName NOT NULL
    string lastName NOT NULL
    string phone
    date createdAt NOT NULL
    date lastLogin
    boolean isActive NOT NULL
  }

  Address {
    int addressId PK
    int userId FK
    string type NOT NULL
    string street1 NOT NULL
    string street2
    string city NOT NULL
    string state NOT NULL
    string zipCode NOT NULL
    string country NOT NULL
    boolean isDefault NOT NULL
  }

  Product {
    int productId PK
    int categoryId FK
    string sku UNIQUE NOT NULL
    string name NOT NULL
    string description
    decimal price NOT NULL
    decimal compareAtPrice
    int stockQuantity NOT NULL
    string imageUrl
    boolean isActive NOT NULL
    date createdAt NOT NULL
  }

  Category {
    int categoryId PK
    int parentCategoryId FK
    string name NOT NULL
    string slug UNIQUE NOT NULL
    string description
    int sortOrder NOT NULL
  }

  Cart {
    int cartId PK
    int userId FK
    date createdAt NOT NULL
    date updatedAt NOT NULL
  }

  CartItem {
    int cartItemId PK
    int cartId FK
    int productId FK
    int quantity NOT NULL
    decimal priceAtAdd NOT NULL
  }

  Order {
    int orderId PK
    int userId FK
    int shippingAddressId FK
    int billingAddressId FK
    string orderNumber UNIQUE NOT NULL
    string status NOT NULL
    decimal subtotal NOT NULL
    decimal tax NOT NULL
    decimal shipping NOT NULL
    decimal total NOT NULL
    date orderDate NOT NULL
    date shippedDate
    date deliveredDate
  }

  OrderItem {
    int orderItemId PK
    int orderId FK
    int productId FK
    string productName NOT NULL
    int quantity NOT NULL
    decimal price NOT NULL
    decimal total NOT NULL
  }

  Payment {
    int paymentId PK
    int orderId FK
    string paymentMethod NOT NULL
    string transactionId UNIQUE NOT NULL
    decimal amount NOT NULL
    string status NOT NULL
    date paidAt
  }

  Review {
    int reviewId PK
    int productId FK
    int userId FK
    int rating NOT NULL
    string title
    string comment
    date createdAt NOT NULL
    boolean isVerifiedPurchase NOT NULL
  }

  User ||--o{ Address : "has"
  User ||--o{ Cart : "has"
  User ||--o{ Order : "places"
  User ||--o{ Review : "writes"

  Category ||--o{ Category : "contains"
  Category ||--o{ Product : "contains"

  Cart ||--|{ CartItem : "contains"
  Product ||--o{ CartItem : "in"

  Order ||--|{ OrderItem : "contains"
  Product ||--o{ OrderItem : "ordered"
  Order ||--o| Payment : "paid by"

  Address ||--o{ Order : "ships to"
  Address ||--o{ Order : "bills to"

  Product ||--o{ Review : "reviewed in"
```

### Social Media Database

Schema for a social network:

```
erDiagram
  User {
    int userId PK
    string username UNIQUE NOT NULL
    string email UNIQUE NOT NULL
    string passwordHash NOT NULL
    string displayName NOT NULL
    string bio
    string avatarUrl
    date birthDate
    date joinedAt NOT NULL
    boolean isVerified NOT NULL
  }

  Post {
    int postId PK
    int userId FK
    string content NOT NULL
    string mediaUrl
    int likesCount NOT NULL
    int commentsCount NOT NULL
    int sharesCount NOT NULL
    date createdAt NOT NULL
    date updatedAt
    boolean isPublic NOT NULL
  }

  Comment {
    int commentId PK
    int postId FK
    int userId FK
    int parentCommentId FK
    string content NOT NULL
    int likesCount NOT NULL
    date createdAt NOT NULL
  }

  Like {
    int likeId PK
    int userId FK
    int postId FK
    date createdAt NOT NULL
  }

  Follow {
    int followId PK
    int followerId FK
    int followingId FK
    date createdAt NOT NULL
  }

  Message {
    int messageId PK
    int senderId FK
    int receiverId FK
    string content NOT NULL
    boolean isRead NOT NULL
    date sentAt NOT NULL
    date readAt
  }

  User ||--o{ Post : "creates"
  User ||--o{ Comment : "writes"
  User ||--o{ Like : "gives"
  User ||--o{ Follow : "follower"
  User ||--o{ Follow : "following"
  User ||--o{ Message : "sends"
  User ||--o{ Message : "receives"

  Post ||--o{ Comment : "has"
  Post ||--o{ Like : "receives"

  Comment ||--o{ Comment : "replies to"
```

---

## Business Processes

### Order Fulfillment

End-to-end order processing:

```
bpmn
  @pool "E-Commerce Order Fulfillment"
    @lane "Customer"
      Start(Customer Places Order)
      CustomerPay[Submit Payment]
      ReceiveShip((Receive Shipment))
    @endlane

    @lane "Payment Gateway"
      ProcessPay[Process Payment]
      PayCheck{Payment Approved?}
      PaySuccess[Payment Confirmed]
      PayFail[Payment Declined]
    @endlane

    @lane "Inventory"
      CheckStock{Items Available?}
      ReserveItems[Reserve Inventory]
      UpdateStock[Update Stock Levels]
      Backorder[Create Backorder]
    @endlane

    @lane "Warehouse"
      PickItems[Pick Items]
      QualityCheck[Quality Inspection]
      PackItems[Pack Order]
      QualityPass{Pass Inspection?}
    @endlane

    @lane "Shipping"
      GenLabel[Generate Label]
      HandCarrier[Hand to Carrier]
      TrackShip[Track Shipment]
      Delivered((Order Delivered))
    @endlane
  @endpool

  Start --> CustomerPay
  CustomerPay --> ProcessPay
  ProcessPay --> PayCheck
  PayCheck -->|Approved| PaySuccess
  PayCheck -->|Declined| PayFail
  PayFail --> Start
  PaySuccess --> CheckStock
  CheckStock -->|Yes| ReserveItems
  CheckStock -->|No| Backorder
  ReserveItems --> PickItems
  PickItems --> QualityCheck
  QualityCheck --> QualityPass
  QualityPass -->|Pass| PackItems
  QualityPass -->|Fail| PickItems
  PackItems --> UpdateStock
  UpdateStock --> GenLabel
  GenLabel --> HandCarrier
  HandCarrier --> TrackShip
  TrackShip --> ReceiveShip
  ReceiveShip --> Delivered
```

### Customer Support Ticket

Support ticket lifecycle:

```
bpmn
  @pool "Customer Support System"
    @lane "Customer"
      Submit(Submit Ticket)
      Response((Receive Response))
      Resolve((Issue Resolved))
    @endlane

    @lane "Triage"
      Receive[Receive Ticket]
      Classify{Classify Issue}
      AssignPriority[Assign Priority]
    @endlane

    @lane "Level 1 Support"
      Review[Review Ticket]
      CanResolve{Can Resolve?}
      ResolveL1[Resolve Issue]
      SendResponse[Send Response]
    @endlane

    @lane "Level 2 Support"
      Escalate[Escalated Ticket]
      Investigate[Deep Investigation]
      ResolveL2[Resolve Complex Issue]
    @endlane

    @lane "Engineering"
      BugTicket[Create Bug Ticket]
      FixBug[Fix Bug]
      Deploy[Deploy Fix]
    @endlane
  @endpool

  Submit --> Receive
  Receive --> Classify
  Classify -->|Simple| AssignPriority
  Classify -->|Complex| Escalate
  AssignPriority --> Review
  Review --> CanResolve
  CanResolve -->|Yes| ResolveL1
  CanResolve -->|No| Escalate
  ResolveL1 --> SendResponse
  SendResponse --> Response
  Response --> Resolve
  Escalate --> Investigate
  Investigate --> CanResolve
  CanResolve -->|Needs Dev| BugTicket
  BugTicket --> FixBug
  FixBug --> Deploy
  Deploy --> ResolveL2
  ResolveL2 --> SendResponse
```

### Employee Onboarding

New employee onboarding process:

```
bpmn
  @pool "Employee Onboarding"
    @lane "HR"
      Start(New Hire Accepted Offer)
      CreateProfile[Create Employee Profile]
      SendWelcome[Send Welcome Email]
      Schedule[Schedule Orientation]
      Benefits[Process Benefits Enrollment]
    @endlane

    @lane "IT"
      CreateAccounts[Create User Accounts]
      SetupEquipment[Prepare Equipment]
      SetupWorkspace[Setup Workspace]
      InstallSoftware[Install Required Software]
    @endlane

    @lane "Facilities"
      AssignDesk[Assign Desk]
      IssueBadge[Issue Access Badge]
      ProvideKeys[Provide Keys]
    @endlane

    @lane "Manager"
      PrepareWelcome[Prepare Welcome Kit]
      Orientation[Conduct Orientation]
      IntroTeam[Introduce to Team]
      AssignMentor[Assign Mentor]
      SetGoals[Set 30-60-90 Day Goals]
    @endlane

    @lane "New Employee"
      FirstDay((First Day))
      Complete((Onboarding Complete))
    @endlane
  @endpool

  Start --> CreateProfile
  CreateProfile --> SendWelcome
  SendWelcome --> CreateAccounts
  CreateAccounts --> SetupEquipment
  SetupEquipment --> Schedule
  Schedule --> AssignDesk
  AssignDesk --> IssueBadge
  IssueBadge --> PrepareWelcome
  PrepareWelcome --> FirstDay
  FirstDay --> Orientation
  Orientation --> InstallSoftware
  InstallSoftware --> SetupWorkspace
  SetupWorkspace --> IntroTeam
  IntroTeam --> Benefits
  Benefits --> AssignMentor
  AssignMentor --> SetGoals
  SetGoals --> Complete
```

---

## System Architecture

### Microservices Architecture

Modern microservices system:

```
flowchart TB
  Users[Users/Clients] --> Gateway[API Gateway]
  Gateway --> Auth[Auth Service]
  Gateway --> User[User Service]
  Gateway --> Product[Product Service]
  Gateway --> Order[Order Service]
  Gateway --> Payment[Payment Service]

  Auth --> AuthDB[(Auth DB)]
  User --> UserDB[(User DB)]
  Product --> ProductDB[(Product DB)]
  Order --> OrderDB[(Order DB)]
  Payment --> PaymentDB[(Payment DB)]

  Auth -.-> MessageBus[Message Bus / Event Stream]
  User -.-> MessageBus
  Product -.-> MessageBus
  Order -.-> MessageBus
  Payment -.-> MessageBus

  MessageBus -.-> Email[Email Service]
  MessageBus -.-> Notification[Notification Service]
  MessageBus -.-> Analytics[Analytics Service]

  Email --> EmailQueue[(Email Queue)]
  Notification --> NotifQueue[(Notification Queue)]
  Analytics --> DataWarehouse[(Data Warehouse)]

  Gateway --> Cache[(Redis Cache)]
  Product --> Search[Search Service]
  Search --> Elastic[(Elasticsearch)]
```

### Three-Tier Architecture

Classic web application architecture:

```
flowchart TD
  subgraph Presentation[Presentation Tier]
    Web[Web Browser]
    Mobile[Mobile App]
    Desktop[Desktop App]
  end

  subgraph Application[Application Tier]
    LB[Load Balancer]
    WebServer1[Web Server 1]
    WebServer2[Web Server 2]
    AppServer1[App Server 1]
    AppServer2[App Server 2]
  end

  subgraph Data[Data Tier]
    Primary[(Primary Database)]
    Replica1[(Replica 1)]
    Replica2[(Replica 2)]
    Cache[(Cache Server)]
    FileStore[(File Storage)]
  end

  Web --> LB
  Mobile --> LB
  Desktop --> LB

  LB --> WebServer1
  LB --> WebServer2

  WebServer1 --> AppServer1
  WebServer1 --> AppServer2
  WebServer2 --> AppServer1
  WebServer2 --> AppServer2

  AppServer1 --> Cache
  AppServer2 --> Cache

  AppServer1 --> Primary
  AppServer2 --> Primary
  Primary --> Replica1
  Primary --> Replica2

  AppServer1 --> FileStore
  AppServer2 --> FileStore
```

### Cloud Infrastructure

AWS-based cloud architecture:

```
flowchart TB
  Users[Users] --> Route53[Route 53 DNS]
  Route53 --> CloudFront[CloudFront CDN]
  CloudFront --> ALB[Application Load Balancer]

  subgraph VPC[VPC]
    subgraph Public[Public Subnet]
      ALB --> NAT[NAT Gateway]
    end

    subgraph Private[Private Subnet]
      ALB --> EC2_1[EC2 Instance 1]
      ALB --> EC2_2[EC2 Instance 2]
      EC2_1 --> RDS_Primary[(RDS Primary)]
      EC2_2 --> RDS_Primary
      RDS_Primary --> RDS_Replica[(RDS Replica)]
      EC2_1 --> ElastiCache[(ElastiCache)]
      EC2_2 --> ElastiCache
    end
  end

  EC2_1 --> S3[(S3 Bucket)]
  EC2_2 --> S3
  EC2_1 --> SQS[SQS Queue]
  EC2_2 --> SQS
  SQS --> Lambda[Lambda Functions]
  Lambda --> SNS[SNS Notifications]

  CloudWatch[CloudWatch Logs & Metrics] -.-> EC2_1
  CloudWatch -.-> EC2_2
  CloudWatch -.-> RDS_Primary
  CloudWatch -.-> Lambda
```

---

## Project Management

### Agile Sprint Workflow

Typical 2-week sprint:

```
flowchart TD
  Start(Sprint Start) --> Planning[Sprint Planning]
  Planning --> Refine[Backlog Refinement]
  Refine --> Select[Select Stories]
  Select --> Estimate[Estimate Effort]
  Estimate --> Commit[Team Commits]

  Commit --> Day1[Day 1: Sprint Kickoff]
  Day1 --> Daily[Daily Standups]
  Daily --> Work[Development Work]
  Work --> Daily

  Daily --> Review{Mid-Sprint Review?}
  Review -->|Yes| Adjust[Adjust if Needed]
  Review -->|No| Continue[Continue Work]
  Adjust --> Daily
  Continue --> Daily

  Daily --> LastDay{Last Day?}
  LastDay -->|No| Daily
  LastDay -->|Yes| Demo[Sprint Demo]

  Demo --> Retro[Retrospective]
  Retro --> Celebrate[Celebrate Wins]
  Celebrate --> NextSprint(Next Sprint)
```

### Software Release Process

From development to production:

```
flowchart LR
  Dev[Development] --> CodeReview[Code Review]
  CodeReview --> DevTest{Tests Pass?}
  DevTest -->|No| Dev
  DevTest -->|Yes| MergeDev[Merge to Develop]

  MergeDev --> AutoTest[Automated Tests]
  AutoTest --> TestCheck{All Pass?}
  TestCheck -->|No| Fix[Fix Issues]
  Fix --> Dev
  TestCheck -->|Yes| QA[QA Environment]

  QA --> ManualTest[Manual Testing]
  ManualTest --> QAApprove{QA Approved?}
  QAApprove -->|No| Bug[Log Bugs]
  Bug --> Dev
  QAApprove -->|Yes| Staging[Staging Environment]

  Staging --> UAT[User Acceptance Testing]
  UAT --> UATApprove{UAT Approved?}
  UATApprove -->|No| Feedback[Gather Feedback]
  Feedback --> Dev
  UATApprove -->|Yes| ReleaseNotes[Prepare Release Notes]

  ReleaseNotes --> Schedule[Schedule Deployment]
  Schedule --> Backup[Backup Production]
  Backup --> Deploy[Deploy to Production]
  Deploy --> Smoke[Smoke Tests]
  Smoke --> SmokePass{Tests Pass?}
  SmokePass -->|No| Rollback[Rollback]
  SmokePass -->|Yes| Monitor[Monitor Metrics]
  Monitor --> Success((Release Complete))
```

---

## Education

### Learning Path

Software development learning roadmap:

```
flowchart TD
  Start[Start Learning] --> Basics[Programming Basics]
  Basics --> HTML[HTML & CSS]
  HTML --> JS[JavaScript Fundamentals]
  JS --> JSAdv{Advanced JS?}

  JSAdv -->|Yes| React[React.js]
  JSAdv -->|No| Backend[Backend Path]

  React --> State[State Management]
  State --> Next[Next.js / Frameworks]
  Next --> FrontendProj[Frontend Projects]

  Backend --> ChooseLang{Choose Language}
  ChooseLang -->|Node.js| Node[Node.js & Express]
  ChooseLang -->|Python| Python[Python & Django]
  ChooseLang -->|Java| Java[Java & Spring]

  Node --> Database[Databases]
  Python --> Database
  Java --> Database

  Database --> SQL[(SQL Databases)]
  Database --> NoSQL[(NoSQL Databases)]

  SQL --> API[REST APIs]
  NoSQL --> API

  API --> Auth[Authentication]
  Auth --> Deploy[Deployment]
  Deploy --> BackendProj[Backend Projects]

  FrontendProj --> Fullstack[Full-Stack Projects]
  BackendProj --> Fullstack

  Fullstack --> Advanced{Advanced Topics?}
  Advanced -->|Yes| DevOps[DevOps & CI/CD]
  Advanced -->|Yes| Cloud[Cloud Platforms]
  Advanced -->|Yes| Architecture[System Design]

  DevOps --> Professional[Professional Developer]
  Cloud --> Professional
  Architecture --> Professional
```

### Course Structure

Online course organization:

```
flowchart TD
  Course[Course: Web Development] --> Module1[Module 1: Foundations]
  Course --> Module2[Module 2: Frontend]
  Course --> Module3[Module 3: Backend]
  Course --> Module4[Module 4: Database]
  Course --> Module5[Module 5: Deployment]

  Module1 --> Lesson1_1[Lesson 1.1: HTML Basics]
  Module1 --> Lesson1_2[Lesson 1.2: CSS Fundamentals]
  Module1 --> Lesson1_3[Lesson 1.3: JavaScript Intro]
  Lesson1_1 --> Quiz1_1{Quiz 1.1}
  Lesson1_2 --> Quiz1_2{Quiz 1.2}
  Lesson1_3 --> Quiz1_3{Quiz 1.3}
  Quiz1_1 --> Project1[Project 1: Landing Page]
  Quiz1_2 --> Project1
  Quiz1_3 --> Project1

  Module2 --> Lesson2_1[Lesson 2.1: React Basics]
  Module2 --> Lesson2_2[Lesson 2.2: Components]
  Module2 --> Lesson2_3[Lesson 2.3: State Management]
  Lesson2_1 --> Quiz2_1{Quiz 2.1}
  Lesson2_2 --> Quiz2_2{Quiz 2.2}
  Lesson2_3 --> Quiz2_3{Quiz 2.3}
  Quiz2_1 --> Project2[Project 2: Todo App]
  Quiz2_2 --> Project2
  Quiz2_3 --> Project2

  Project1 --> Certificate{Pass Module 1?}
  Project2 --> Certificate
  Certificate -->|Yes| Final[Final Project]
  Certificate -->|No| Review[Review Material]
  Review --> Module1
  Final --> Complete((Course Complete))
```

---

## Data Flows

### ETL Pipeline

Extract, Transform, Load data pipeline:

```
flowchart LR
  subgraph Sources[Data Sources]
    API1[External API 1]
    API2[External API 2]
    DB1[(Legacy Database)]
    Files[File Uploads]
  end

  subgraph Extract[Extract Layer]
    Connector1[API Connector]
    Connector2[DB Connector]
    Connector3[File Parser]
  end

  subgraph Transform[Transform Layer]
    Validate[Data Validation]
    Clean[Data Cleaning]
    Normalize[Normalization]
    Enrich[Data Enrichment]
    Aggregate[Aggregation]
  end

  subgraph Load[Load Layer]
    Staging[(Staging DB)]
    Warehouse[(Data Warehouse)]
    Cache[(Redis Cache)]
  end

  subgraph Consume[Consumption Layer]
    BI[BI Tools]
    Analytics[Analytics Platform]
    Reports[Report Generator]
    ML[ML Models]
  end

  API1 --> Connector1
  API2 --> Connector1
  DB1 --> Connector2
  Files --> Connector3

  Connector1 --> Validate
  Connector2 --> Validate
  Connector3 --> Validate

  Validate --> Clean
  Clean --> Normalize
  Normalize --> Enrich
  Enrich --> Aggregate

  Aggregate --> Staging
  Staging --> Warehouse
  Warehouse --> Cache

  Warehouse --> BI
  Warehouse --> Analytics
  Warehouse --> Reports
  Warehouse --> ML
```

### Real-Time Analytics

Streaming data architecture:

```
flowchart TB
  subgraph Sources[Event Sources]
    Web[Web Apps]
    Mobile[Mobile Apps]
    IoT[IoT Devices]
    Logs[System Logs]
  end

  subgraph Ingestion[Ingestion Layer]
    Kafka[Kafka Cluster]
    Topics[Topic Partitions]
  end

  subgraph Processing[Stream Processing]
    Spark[Spark Streaming]
    Flink[Apache Flink]
    Storm[Storm Topology]
  end

  subgraph Storage[Storage Layer]
    HotDB[(Hot Storage - Redis)]
    WarmDB[(Warm Storage - Cassandra)]
    ColdDB[(Cold Storage - S3)]
  end

  subgraph Analytics[Analytics Layer]
    RealTime[Real-Time Dashboard]
    Alerts[Alert System]
    ML[ML Predictions]
    Historical[Historical Analysis]
  end

  Web --> Kafka
  Mobile --> Kafka
  IoT --> Kafka
  Logs --> Kafka

  Kafka --> Topics
  Topics --> Spark
  Topics --> Flink
  Topics --> Storm

  Spark --> HotDB
  Flink --> HotDB
  Storm --> HotDB

  Spark --> WarmDB
  Flink --> WarmDB

  Spark --> ColdDB

  HotDB --> RealTime
  HotDB --> Alerts
  WarmDB --> ML
  ColdDB --> Historical
```

---

## Advanced Styling Examples

### Corporate Theme

Professional business diagram:

```
@style corporate {
  fill: #1e3a8a;
  stroke: #1e40af;
  color: #ffffff;
  strokeWidth: 2;
  borderRadius: 4;
  fontFamily: Arial;
  fontSize: 14;
  fontWeight: bold;
}

@style accent {
  fill: #0891b2;
  stroke: #0e7490;
  color: #ffffff;
  strokeWidth: 2;
  borderRadius: 4;
}

@style success {
  fill: #059669;
  stroke: #047857;
  color: #ffffff;
  strokeWidth: 2;
  borderRadius: 20;
}

flowchart TD
  Start[Project Initiation]:::corporate
  Start --> Planning[Project Planning]:::corporate
  Planning --> Execute[Execution Phase]:::accent
  Execute --> Monitor[Monitoring & Control]:::accent
  Monitor --> Check{On Track?}:::accent
  Check -->|Yes| Continue[Continue Execution]:::success
  Check -->|No| Adjust[Adjust Plan]:::corporate
  Adjust --> Execute
  Continue --> Closure[Project Closure]:::success
```

### Dark Mode Theme

Modern dark theme:

```
@style darkPrimary {
  fill: #1f2937;
  stroke: #4b5563;
  color: #f3f4f6;
  strokeWidth: 2;
  borderRadius: 8;
}

@style darkAccent {
  fill: #7c3aed;
  stroke: #6d28d9;
  color: #ffffff;
  strokeWidth: 2;
  borderRadius: 8;
}

@style darkSuccess {
  fill: #10b981;
  stroke: #059669;
  color: #ffffff;
  strokeWidth: 2;
  borderRadius: 8;
}

flowchart LR
  Input[User Input]:::darkAccent
  Input --> Process[Process Data]:::darkPrimary
  Process --> Validate{Valid?}:::darkPrimary
  Validate -->|Yes| Success[Complete]:::darkSuccess
  Validate -->|No| Error[Show Error]:::darkPrimary
  Error --> Input
```

---

## See Also

- [User Guide](USER-GUIDE.md) - Learn the basics
- [API Reference](API-REFERENCE.md) - Detailed API docs
- [Architecture](ARCHITECTURE.md) - System internals
- [Interactive Demos](../demo-page.html) - Try it live

---

**Need more examples?** Check the demo files:
- `extended-types-demo.ts` - ERD, BPMN, UML examples
- `phase4-demo.ts` - Styling and template examples
- `phase5-demo.ts` - Performance and format preservation
- `bidirectional-demo.ts` - Live sync examples
