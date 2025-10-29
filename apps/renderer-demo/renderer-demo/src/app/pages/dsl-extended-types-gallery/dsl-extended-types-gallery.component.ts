import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DSL, DiagramEngine } from '@grafloria/engine';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

interface DiagramExample {
  name: string;
  type: 'ERD' | 'BPMN' | 'UML';
  description: string;
  useCase: string;
  dsl: string;
  complexity: 'Simple' | 'Medium' | 'Complex';
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, DiagramCanvasComponent],
  selector: 'app-dsl-extended-types-gallery',
  templateUrl: './dsl-extended-types-gallery.component.html',
  styleUrl: './dsl-extended-types-gallery.component.css',
})
export class DslExtendedTypesGalleryComponent implements OnInit {
  dsl!: DSL;
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1200, height: 800 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  activeTab: 'ERD' | 'BPMN' | 'UML' = 'ERD';
  selectedExample: DiagramExample | null = null;
  currentDSL = '';
  parseResult: any = null;
  parseError: string | null = null;

  erdExamples: DiagramExample[] = [
    {
      name: 'Blog Platform',
      type: 'ERD',
      description: 'Simple blog with users, posts, and comments',
      useCase: 'Content Management System',
      complexity: 'Simple',
      dsl: `erDiagram
  User {
    int userId PK
    string username UNIQUE NOT NULL
    string email UNIQUE NOT NULL
    date joinedAt
  }

  Post {
    int postId PK
    int authorId FK
    string title NOT NULL
    string content
    date publishedAt
  }

  Comment {
    int commentId PK
    int postId FK
    int userId FK
    string content NOT NULL
    date createdAt
  }

  User ||--o{ Post : "writes"
  User ||--o{ Comment : "writes"
  Post ||--o{ Comment : "has"`
    },
    {
      name: 'E-Learning Platform',
      type: 'ERD',
      description: 'Online courses with enrollments and progress tracking',
      useCase: 'Education Technology',
      complexity: 'Medium',
      dsl: `erDiagram
  Student {
    int studentId PK
    string name NOT NULL
    string email UNIQUE
    date enrolledDate
  }

  Instructor {
    int instructorId PK
    string name NOT NULL
    string bio
    string expertise
  }

  Course {
    int courseId PK
    int instructorId FK
    string title NOT NULL
    string description
    decimal price
    int duration
  }

  Lesson {
    int lessonId PK
    int courseId FK
    string title NOT NULL
    string content
    int orderIndex
  }

  Enrollment {
    int enrollmentId PK
    int studentId FK
    int courseId FK
    date enrolledAt
    int progress
    string status
  }

  Quiz {
    int quizId PK
    int lessonId FK
    string title
    int passingScore
  }

  Student ||--o{ Enrollment : "enrolls in"
  Course ||--o{ Enrollment : "has"
  Instructor ||--o{ Course : "teaches"
  Course ||--|{ Lesson : "contains"
  Lesson ||--o| Quiz : "has"`
    },
    {
      name: 'Healthcare Management',
      type: 'ERD',
      description: 'Hospital system with patients, doctors, appointments',
      useCase: 'Healthcare IT',
      complexity: 'Complex',
      dsl: `erDiagram
  Patient {
    int patientId PK
    string firstName NOT NULL
    string lastName NOT NULL
    date dateOfBirth
    string bloodType
    string allergies
    string insuranceNumber
  }

  Doctor {
    int doctorId PK
    string firstName NOT NULL
    string lastName NOT NULL
    string specialization
    string licenseNumber UNIQUE
    int yearsExperience
  }

  Appointment {
    int appointmentId PK
    int patientId FK
    int doctorId FK
    date appointmentDate
    string timeSlot
    string status
    string reason
  }

  MedicalRecord {
    int recordId PK
    int patientId FK
    int doctorId FK
    date visitDate
    string diagnosis
    string treatment
    string notes
  }

  Prescription {
    int prescriptionId PK
    int recordId FK
    string medication
    string dosage
    int duration
    string instructions
  }

  Department {
    int departmentId PK
    string name NOT NULL
    string location
    string phone
  }

  Patient ||--o{ Appointment : "has"
  Doctor ||--o{ Appointment : "schedules"
  Patient ||--o{ MedicalRecord : "has"
  Doctor ||--o{ MedicalRecord : "creates"
  MedicalRecord ||--o{ Prescription : "includes"
  Doctor }o--|| Department : "works in"`
    }
  ];

  bpmnExamples: DiagramExample[] = [
    {
      name: 'Customer Onboarding',
      type: 'BPMN',
      description: 'New customer registration and verification process',
      useCase: 'Customer Relationship Management',
      complexity: 'Simple',
      dsl: `bpmn
  @pool "Customer Onboarding"
    @lane "Customer"
      Start(Register) --> Submit[Submit Information]
      ReceiveEmail((Email Received))
    @endlane

    @lane "System"
      Submit --> Validate{Valid Data?}
      Validate -->|Yes| CreateAccount[Create Account]
      Validate -->|No| Error[Send Error]
      Error --> Submit
      CreateAccount --> SendEmail[Send Verification Email]
    @endlane

    @lane "Verification"
      SendEmail --> ReceiveEmail
      ReceiveEmail --> Complete((Account Active))
    @endlane
  @endpool`
    },
    {
      name: 'Loan Approval Process',
      type: 'BPMN',
      description: 'Bank loan application with credit checks and approval',
      useCase: 'Financial Services',
      complexity: 'Medium',
      dsl: `bpmn
  @pool "Loan Approval System"
    @lane "Applicant"
      Start(Apply for Loan) --> SubmitDocs[Submit Documents]
      Notification((Decision Notification))
    @endlane

    @lane "Loan Officer"
      SubmitDocs --> Review[Review Application]
      Review --> CheckCredit[Check Credit Score]
      CheckCredit --> CreditOK{Credit Score OK?}
      CreditOK -->|No| Reject[Reject Application]
      CreditOK -->|Yes| VerifyIncome[Verify Income]
    @endlane

    @lane "Manager"
      VerifyIncome --> IncomeOK{Income Sufficient?}
      IncomeOK -->|No| Reject
      IncomeOK -->|Yes| ApprovalDecision{Approve?}
      ApprovalDecision -->|Yes| Approve[Approve Loan]
      ApprovalDecision -->|No| Reject
    @endlane

    @lane "Disbursement"
      Approve --> Disburse[Disburse Funds]
      Disburse --> Notification
      Reject --> Notification
    @endlane
  @endpool`
    },
    {
      name: 'Software Release Pipeline',
      type: 'BPMN',
      description: 'Complete CI/CD pipeline with testing and deployment',
      useCase: 'DevOps Automation',
      complexity: 'Complex',
      dsl: `bpmn
  @pool "Software Release Pipeline"
    @lane "Developer"
      Start(Code Commit) --> Push[Push to Repository]
      Notification((Release Notification))
    @endlane

    @lane "CI System"
      Push --> Checkout[Checkout Code]
      Checkout --> Build[Build Application]
      Build --> BuildOK{Build Success?}
      BuildOK -->|No| BuildFail((Build Failed))
      BuildOK -->|Yes| UnitTests[Run Unit Tests]
    @endlane

    @lane "QA Automation"
      UnitTests --> TestsOK{Tests Pass?}
      TestsOK -->|No| TestFail((Tests Failed))
      TestsOK -->|Yes| Integration[Integration Tests]
      Integration --> IntOK{Tests Pass?}
      IntOK -->|No| TestFail
      IntOK -->|Yes| Security[Security Scan]
    @endlane

    @lane "Staging"
      Security --> SecOK{No Vulnerabilities?}
      SecOK -->|No| SecurityFail((Security Issues))
      SecOK -->|Yes| DeployStaging[Deploy to Staging]
      DeployStaging --> SmokeTests[Smoke Tests]
      SmokeTests --> SmokeOK{Tests Pass?}
      SmokeOK -->|No| Rollback[Rollback]
      SmokeOK -->|Yes| Approval{Approved?}
    @endlane

    @lane "Production"
      Approval -->|Yes| DeployProd[Deploy to Production]
      Approval -->|No| Hold((On Hold))
      DeployProd --> Monitor[Monitor Metrics]
      Monitor --> Notification
    @endlane
  @endpool`
    }
  ];

  umlExamples: DiagramExample[] = [
    {
      name: 'E-Commerce Shop',
      type: 'UML',
      description: 'Shopping cart and product catalog system',
      useCase: 'Online Retail',
      complexity: 'Simple',
      dsl: `classDiagram
  class Product {
    +id: string
    +name: string
    +price: number
    +stock: number
    +getPrice(): number
    +updateStock(quantity: number): void
  }

  class CartItem {
    +product: Product
    +quantity: number
    +getSubtotal(): number
  }

  class ShoppingCart {
    -items: CartItem[]
    +addItem(product: Product, quantity: number): void
    +removeItem(productId: string): void
    +getTotal(): number
    +checkout(): Order
  }

  class Order {
    +id: string
    +items: CartItem[]
    +total: number
    +status: string
    +process(): void
    +cancel(): void
  }

  ShoppingCart --* CartItem : contains
  CartItem --> Product : references
  ShoppingCart --> Order : creates`
    },
    {
      name: 'Payment Gateway',
      type: 'UML',
      description: 'Payment processing with multiple providers',
      useCase: 'Financial Technology',
      complexity: 'Medium',
      dsl: `classDiagram
  class PaymentGateway {
    <<interface>>
    +processPayment(amount: number, card: Card): PaymentResult*
    +refund(transactionId: string): RefundResult*
    +validateCard(card: Card): boolean*
  }

  class StripeGateway {
    -apiKey: string
    +processPayment(amount: number, card: Card): PaymentResult
    +refund(transactionId: string): RefundResult
    +validateCard(card: Card): boolean
  }

  class PayPalGateway {
    -clientId: string
    -clientSecret: string
    +processPayment(amount: number, card: Card): PaymentResult
    +refund(transactionId: string): RefundResult
    +validateCard(card: Card): boolean
  }

  class Card {
    -number: string
    -cvv: string
    -expiryDate: string
    +isValid(): boolean
    +getType(): string
  }

  class PaymentResult {
    +success: boolean
    +transactionId: string
    +message: string
    +timestamp: Date
  }

  class Transaction {
    +id: string
    +amount: number
    +status: string
    +gateway: string
    +record(): void
  }

  PaymentGateway <|.. StripeGateway : implements
  PaymentGateway <|.. PayPalGateway : implements
  PaymentGateway ..> Card : uses
  PaymentGateway ..> PaymentResult : returns
  Transaction --> PaymentResult : records`
    },
    {
      name: 'Authentication System',
      type: 'UML',
      description: 'Complete auth system with multiple strategies',
      useCase: 'Security Infrastructure',
      complexity: 'Complex',
      dsl: `classDiagram
  class AuthenticationService {
    -strategies: AuthStrategy[]
    -tokenService: TokenService
    +authenticate(credentials: Credentials): AuthResult
    +register(user: UserRegistration): User
    +logout(token: string): void
    +refreshToken(token: string): string
  }

  class AuthStrategy {
    <<interface>>
    +authenticate(credentials: Credentials): User*
    +validate(token: string): boolean*
  }

  class JWTStrategy {
    -secret: string
    -algorithm: string
    +authenticate(credentials: Credentials): User
    +validate(token: string): boolean
    -generateToken(user: User): string
  }

  class OAuth2Strategy {
    -clientId: string
    -clientSecret: string
    -provider: string
    +authenticate(credentials: Credentials): User
    +validate(token: string): boolean
    -exchangeCode(code: string): Token
  }

  class LDAPStrategy {
    -serverUrl: string
    -baseDN: string
    +authenticate(credentials: Credentials): User
    +validate(token: string): boolean
  }

  class User {
    +id: string
    +username: string
    +email: string
    -passwordHash: string
    +roles: Role[]
    +permissions: Permission[]
    +hasPermission(permission: string): boolean
  }

  class Role {
    +id: string
    +name: string
    +permissions: Permission[]
  }

  class Permission {
    +id: string
    +name: string
    +resource: string
    +action: string
  }

  class TokenService {
    +generate(user: User): string
    +verify(token: string): boolean
    +decode(token: string): TokenPayload
    +refresh(token: string): string
  }

  class Session {
    +id: string
    +userId: string
    +token: string
    +expiresAt: Date
    +isActive(): boolean
  }

  AuthenticationService --> AuthStrategy : uses
  AuthStrategy <|.. JWTStrategy : implements
  AuthStrategy <|.. OAuth2Strategy : implements
  AuthStrategy <|.. LDAPStrategy : implements
  AuthenticationService --> TokenService : uses
  AuthenticationService --> User : manages
  User --o Role : has
  Role --o Permission : contains
  TokenService --> Session : creates`
    }
  ];

  ngOnInit() {
    this.engine = new DiagramEngine();

    this.dsl = new DSL({
      debug: true,
      autoLayout: true
    });

    // Load first example
    this.loadExample(this.erdExamples[0]);
  }

  get currentExamples(): DiagramExample[] {
    switch (this.activeTab) {
      case 'ERD':
        return this.erdExamples;
      case 'BPMN':
        return this.bpmnExamples;
      case 'UML':
        return this.umlExamples;
    }
  }

  switchTab(tab: 'ERD' | 'BPMN' | 'UML') {
    this.activeTab = tab;
    this.loadExample(this.currentExamples[0]);
  }

  loadExample(example: DiagramExample) {
    this.selectedExample = example;
    this.currentDSL = example.dsl;
    this.parseDiagram();
  }

  parseDiagram() {
    try {
      const result = this.dsl.parseDetailed(this.currentDSL);
      this.parseResult = result;
      this.parseError = null;

      // Set diagram to engine for visual rendering
      if (result.diagram) {
        this.engine.setDiagram(result.diagram);
      }
    } catch (error: any) {
      this.parseError = error.message;
      this.parseResult = null;
    }
  }

  getComplexityClass(complexity: string): string {
    return `complexity-${complexity.toLowerCase()}`;
  }

  getTypeIcon(type: string): string {
    const icons: any = {
      'ERD': '🗄️',
      'BPMN': '⚙️',
      'UML': '🏗️'
    };
    return icons[type] || '📊';
  }

  copyToClipboard() {
    navigator.clipboard.writeText(this.currentDSL);
  }
}
