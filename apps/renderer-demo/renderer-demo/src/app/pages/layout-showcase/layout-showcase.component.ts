/**
 * Layout Showcase Component
 *
 * Demonstrates layout adapters with real business use cases:
 * - Organizational Chart (Dagre TB)
 * - Process Flow (Dagre LR)
 * - Network Topology (ELK Force)
 * - Decision Tree (ELK MrTree)
 * - Circular Dependencies (ELK Radial)
 * - System Architecture (ELK Layered)
 */

import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DiagramEngine, NodeModel } from '@grafloria/engine';
import { LayoutService } from '@grafloria/engine';

interface BusinessScenario {
  id: string;
  name: string;
  description: string;
  icon: string;
  adapter: 'dagre' | 'elk';
  defaultOptions: any;
  createDiagram: (engine: DiagramEngine) => void;
}

@Component({
  selector: 'app-layout-showcase',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './layout-showcase.component.html',
  styleUrls: ['./layout-showcase.component.css']
})
export class LayoutShowcaseComponent implements OnInit, OnDestroy {
  engine!: DiagramEngine;
  layoutService!: LayoutService;

  selectedScenario: BusinessScenario | null = null;
  isAnimating = false;
  executionTime = 0;
  errorMessage: string | null = null;

  // Layout options for current scenario
  currentOptions: any = {};

  scenarios: BusinessScenario[] = [
    {
      id: 'org-chart',
      name: 'Organizational Chart',
      description: 'Company hierarchy with departments and reporting structure',
      icon: '🏢',
      adapter: 'dagre',
      defaultOptions: {
        rankdir: 'TB',
        nodesep: 80,
        ranksep: 100,
        ranker: 'network-simplex'
      },
      createDiagram: this.createOrgChart.bind(this)
    },
    {
      id: 'process-flow',
      name: 'Process Flow',
      description: 'Business process with sequential steps and decision points',
      icon: '⚙️',
      adapter: 'dagre',
      defaultOptions: {
        rankdir: 'LR',
        nodesep: 60,
        ranksep: 120,
        ranker: 'network-simplex'
      },
      createDiagram: this.createProcessFlow.bind(this)
    },
    {
      id: 'network-topology',
      name: 'Network Topology',
      description: 'IT infrastructure with servers, routers, and connections',
      icon: '🌐',
      adapter: 'elk',
      defaultOptions: {
        algorithm: 'force',
        'elk.force.repulsion': 150,
        'elk.force.iterations': 300
      },
      createDiagram: this.createNetworkTopology.bind(this)
    },
    {
      id: 'decision-tree',
      name: 'Decision Tree',
      description: 'Product recommendation engine decision tree',
      icon: '🌳',
      adapter: 'elk',
      defaultOptions: {
        algorithm: 'mrtree',
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': 60
      },
      createDiagram: this.createDecisionTree.bind(this)
    },
    {
      id: 'circular-deps',
      name: 'Circular Dependencies',
      description: 'Module dependencies with circular references',
      icon: '🔄',
      adapter: 'elk',
      defaultOptions: {
        algorithm: 'radial',
        'elk.radial.radius': 200,
        'elk.radial.compaction': true
      },
      createDiagram: this.createCircularDeps.bind(this)
    },
    {
      id: 'system-architecture',
      name: 'System Architecture',
      description: 'Microservices architecture with API gateway',
      icon: '🏗️',
      adapter: 'elk',
      defaultOptions: {
        algorithm: 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': 100,
        'elk.layered.spacing.nodeNodeBetweenLayers': 120,
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX'
      },
      createDiagram: this.createSystemArchitecture.bind(this)
    },
    {
      id: 'pinned-layout',
      name: 'Interactive Layout (Pinned Nodes)',
      description: 'Dashboard with pinned header and constrained components',
      icon: '📌',
      adapter: 'dagre',
      defaultOptions: {
        rankdir: 'TB',
        nodesep: 70,
        ranksep: 90,
        constraints: {
          constraints: [],
          conflictResolution: 'priority'
        }
      },
      createDiagram: this.createPinnedLayout.bind(this)
    }
  ];

  ngOnInit(): void {
    this.engine = new DiagramEngine();
    this.layoutService = new LayoutService();
    this.engine.setLayoutService(this.layoutService);

    // Load first scenario by default
    this.loadScenario(this.scenarios[0]);
  }

  ngOnDestroy(): void {
    this.engine?.dispose();
  }

  loadScenario(scenario: BusinessScenario): void {
    this.selectedScenario = scenario;
    this.currentOptions = { ...scenario.defaultOptions };

    // Clear and recreate diagram
    const model = this.engine.getDiagram();
    if (model) {
      model.clear();
    }
    scenario.createDiagram(this.engine);

    // Apply layout
    this.applyLayout();
  }

  async applyLayout(): Promise<void> {
    if (!this.selectedScenario) return;

    this.isAnimating = true;
    this.errorMessage = null;
    const startTime = performance.now();

    try {
      const result = await this.engine.applyLayout({
        adapter: this.selectedScenario.adapter,
        options: this.currentOptions,
        animate: true,
        animationDuration: 500
      });

      this.executionTime = result.metadata?.executionTime || 0;
    } catch (error: any) {
      console.error('Layout error:', error);
      this.errorMessage = error?.message || 'Failed to apply layout. Please check your options and try again.';
    } finally {
      this.isAnimating = false;
    }
  }

  randomizePositions(): void {
    const model = this.engine.getDiagram();
    if (!model) return;

    const nodes = Array.from(model.getNodes().values());
    nodes.forEach(node => {
      node.setPosition(
        Math.random() * 1000,
        Math.random() * 600
      );
    });
  }

  // ========================================================================
  // Business Scenario Creators
  // ========================================================================

  private createOrgChart(engine: DiagramEngine): void {
    const model = engine.getDiagram();
    if (!model) return;

    // CEO
    const ceo = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 180, height: 80 }
    });
    ceo.setData('label', 'CEO');
    ceo.setData('name', 'Sarah Johnson');
    ceo.setData('role', 'Chief Executive Officer');
    model.addNode(ceo);

    // C-Level
    const cto = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 180, height: 80 }
    });
    cto.setData('label', 'CTO');
    cto.setData('name', 'Mike Chen');
    cto.setData('role', 'Chief Technology Officer');
    model.addNode(cto);

    const cfo = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 180, height: 80 }
    });
    cfo.setData('label', 'CFO');
    cfo.setData('name', 'Emily Rodriguez');
    cfo.setData('role', 'Chief Financial Officer');
    model.addNode(cfo);

    const cmo = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 180, height: 80 }
    });
    cmo.setData('label', 'CMO');
    cmo.setData('name', 'David Park');
    cmo.setData('role', 'Chief Marketing Officer');
    model.addNode(cmo);

    // Engineering Team
    const engMgr = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 }
    });
    engMgr.setData('label', 'Engineering Manager');
    engMgr.setData('name', 'Alex Kim');
    model.addNode(engMgr);

    const devLead = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 }
    });
    devLead.setData('label', 'Dev Lead');
    devLead.setData('name', 'Jordan Lee');
    model.addNode(devLead);

    const qaLead = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 }
    });
    qaLead.setData('label', 'QA Lead');
    qaLead.setData('name', 'Sam Taylor');
    model.addNode(qaLead);

    // Finance Team
    const finController = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 }
    });
    finController.setData('label', 'Controller');
    finController.setData('name', 'Lisa Wang');
    model.addNode(finController);

    // Marketing Team
    const mktMgr = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 }
    });
    mktMgr.setData('label', 'Marketing Manager');
    mktMgr.setData('name', 'Chris Brown');
    model.addNode(mktMgr);

    // Create hierarchy links
    model.connectNodes(ceo, cto);
    model.connectNodes(ceo, cfo);
    model.connectNodes(ceo, cmo);

    model.connectNodes(cto, engMgr);
    model.connectNodes(engMgr, devLead);
    model.connectNodes(engMgr, qaLead);

    model.connectNodes(cfo, finController);
    model.connectNodes(cmo, mktMgr);
  }

  private createProcessFlow(engine: DiagramEngine): void {
    const model = engine.getDiagram();
    if (!model) return;

    // Start
    const start = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    start.setData('label', 'Start');
    start.setData('type', 'start');
    model.addNode(start);

    // Receive Order
    const receiveOrder = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 150, height: 70 }
    });
    receiveOrder.setData('label', 'Receive Order');
    receiveOrder.setData('type', 'process');
    model.addNode(receiveOrder);

    // Check Inventory
    const checkInventory = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 }
    });
    checkInventory.setData('label', 'Check Inventory');
    checkInventory.setData('type', 'process');
    model.addNode(checkInventory);

    // Decision: In Stock?
    const inStockDecision = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 80 }
    });
    inStockDecision.setData('label', 'In Stock?');
    inStockDecision.setData('type', 'decision');
    model.addNode(inStockDecision);

    // Process Payment
    const processPayment = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 150, height: 70 }
    });
    processPayment.setData('label', 'Process Payment');
    processPayment.setData('type', 'process');
    model.addNode(processPayment);

    // Ship Order
    const shipOrder = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 150, height: 70 }
    });
    shipOrder.setData('label', 'Ship Order');
    shipOrder.setData('type', 'process');
    model.addNode(shipOrder);

    // Backorder
    const backorder = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 150, height: 70 }
    });
    backorder.setData('label', 'Create Backorder');
    backorder.setData('type', 'process');
    model.addNode(backorder);

    // Notify Customer
    const notifyCustomer = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 150, height: 70 }
    });
    notifyCustomer.setData('label', 'Notify Customer');
    notifyCustomer.setData('type', 'process');
    model.addNode(notifyCustomer);

    // End
    const end = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    end.setData('label', 'End');
    end.setData('type', 'end');
    model.addNode(end);

    // Create flow
    model.connectNodes(start, receiveOrder);
    model.connectNodes(receiveOrder, checkInventory);
    model.connectNodes(checkInventory, inStockDecision);
    model.connectNodes(inStockDecision, processPayment);
    model.connectNodes(inStockDecision, backorder);
    model.connectNodes(processPayment, shipOrder);
    model.connectNodes(shipOrder, notifyCustomer);
    model.connectNodes(backorder, notifyCustomer);
    model.connectNodes(notifyCustomer, end);
  }

  private createNetworkTopology(engine: DiagramEngine): void {
    const model = engine.getDiagram();
    if (!model) return;

    // Core Network
    const router1 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 }
    });
    router1.setData('label', 'Core Router 1');
    router1.setData('type', 'router');
    model.addNode(router1);

    const router2 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 }
    });
    router2.setData('label', 'Core Router 2');
    router2.setData('type', 'router');
    model.addNode(router2);

    // Switches
    const switch1 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    switch1.setData('label', 'Switch A');
    switch1.setData('type', 'switch');
    model.addNode(switch1);

    const switch2 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    switch2.setData('label', 'Switch B');
    switch2.setData('type', 'switch');
    model.addNode(switch2);

    const switch3 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    switch3.setData('label', 'Switch C');
    switch3.setData('type', 'switch');
    model.addNode(switch3);

    // Servers
    const webServer = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 130, height: 65 }
    });
    webServer.setData('label', 'Web Server');
    webServer.setData('type', 'server');
    model.addNode(webServer);

    const dbServer = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 130, height: 65 }
    });
    dbServer.setData('label', 'DB Server');
    dbServer.setData('type', 'server');
    model.addNode(dbServer);

    const appServer = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 130, height: 65 }
    });
    appServer.setData('label', 'App Server');
    appServer.setData('type', 'server');
    model.addNode(appServer);

    const cacheServer = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 130, height: 65 }
    });
    cacheServer.setData('label', 'Cache Server');
    cacheServer.setData('type', 'server');
    model.addNode(cacheServer);

    // Firewall
    const firewall = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    firewall.setData('label', 'Firewall');
    firewall.setData('type', 'firewall');
    model.addNode(firewall);

    // Create connections
    model.connectNodes(router1, router2);
    model.connectNodes(router1, switch1);
    model.connectNodes(router2, switch2);
    model.connectNodes(router2, switch3);

    model.connectNodes(switch1, webServer);
    model.connectNodes(switch1, appServer);
    model.connectNodes(switch2, dbServer);
    model.connectNodes(switch3, cacheServer);

    model.connectNodes(firewall, router1);
    model.connectNodes(webServer, appServer);
    model.connectNodes(appServer, dbServer);
    model.connectNodes(appServer, cacheServer);
  }

  private createDecisionTree(engine: DiagramEngine): void {
    const model = engine.getDiagram();
    if (!model) return;

    // Root
    const root = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 }
    });
    root.setData('label', 'Budget?');
    root.setData('type', 'decision');
    model.addNode(root);

    // Level 1
    const budget1 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 60 }
    });
    budget1.setData('label', '< $500');
    budget1.setData('type', 'branch');
    model.addNode(budget1);

    const budget2 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 60 }
    });
    budget2.setData('label', '$500-$1000');
    budget2.setData('type', 'branch');
    model.addNode(budget2);

    const budget3 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 60 }
    });
    budget3.setData('label', '> $1000');
    budget3.setData('type', 'branch');
    model.addNode(budget3);

    // Level 2 - Use Case
    const casual1 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 130, height: 55 }
    });
    casual1.setData('label', 'Casual Use');
    casual1.setData('type', 'leaf');
    model.addNode(casual1);

    const gaming1 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 130, height: 55 }
    });
    gaming1.setData('label', 'Light Gaming');
    gaming1.setData('type', 'leaf');
    model.addNode(gaming1);

    const gaming2 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 130, height: 55 }
    });
    gaming2.setData('label', 'Gaming');
    gaming2.setData('type', 'leaf');
    model.addNode(gaming2);

    const professional = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 130, height: 55 }
    });
    professional.setData('label', 'Professional');
    professional.setData('type', 'leaf');
    model.addNode(professional);

    const workstation = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 130, height: 55 }
    });
    workstation.setData('label', 'Workstation');
    workstation.setData('type', 'leaf');
    model.addNode(workstation);

    const enthusiast = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 130, height: 55 }
    });
    enthusiast.setData('label', 'Enthusiast');
    enthusiast.setData('type', 'leaf');
    model.addNode(enthusiast);

    // Create tree structure
    model.connectNodes(root, budget1);
    model.connectNodes(root, budget2);
    model.connectNodes(root, budget3);

    model.connectNodes(budget1, casual1);
    model.connectNodes(budget1, gaming1);

    model.connectNodes(budget2, gaming2);
    model.connectNodes(budget2, professional);

    model.connectNodes(budget3, workstation);
    model.connectNodes(budget3, enthusiast);
  }

  private createCircularDeps(engine: DiagramEngine): void {
    const model = engine.getDiagram();
    if (!model) return;

    // Core module
    const core = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    core.setData('label', 'Core');
    core.setData('type', 'module');
    model.addNode(core);

    // Modules
    const auth = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    auth.setData('label', 'Auth');
    auth.setData('type', 'module');
    model.addNode(auth);

    const api = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    api.setData('label', 'API');
    api.setData('type', 'module');
    model.addNode(api);

    const database = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    database.setData('label', 'Database');
    database.setData('type', 'module');
    model.addNode(database);

    const cache = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    cache.setData('label', 'Cache');
    cache.setData('type', 'module');
    model.addNode(cache);

    const logger = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    logger.setData('label', 'Logger');
    logger.setData('type', 'module');
    model.addNode(logger);

    const config = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    config.setData('label', 'Config');
    config.setData('type', 'module');
    model.addNode(config);

    // Create circular dependencies
    model.connectNodes(core, auth);
    model.connectNodes(core, api);
    model.connectNodes(auth, database);
    model.connectNodes(auth, cache);
    model.connectNodes(api, auth);
    model.connectNodes(api, database);
    model.connectNodes(database, logger);
    model.connectNodes(cache, logger);
    model.connectNodes(logger, config);
    model.connectNodes(config, core);
  }

  private createSystemArchitecture(engine: DiagramEngine): void {
    const model = engine.getDiagram();
    if (!model) return;

    // Frontend
    const webApp = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 }
    });
    webApp.setData('label', 'Web App');
    webApp.setData('type', 'frontend');
    model.addNode(webApp);

    const mobileApp = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 }
    });
    mobileApp.setData('label', 'Mobile App');
    mobileApp.setData('type', 'frontend');
    model.addNode(mobileApp);

    // API Gateway
    const apiGateway = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 150, height: 75 }
    });
    apiGateway.setData('label', 'API Gateway');
    apiGateway.setData('type', 'gateway');
    model.addNode(apiGateway);

    // Microservices
    const authService = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 }
    });
    authService.setData('label', 'Auth Service');
    authService.setData('type', 'service');
    model.addNode(authService);

    const userService = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 }
    });
    userService.setData('label', 'User Service');
    userService.setData('type', 'service');
    model.addNode(userService);

    const orderService = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 }
    });
    orderService.setData('label', 'Order Service');
    orderService.setData('type', 'service');
    model.addNode(orderService);

    const paymentService = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 }
    });
    paymentService.setData('label', 'Payment Service');
    paymentService.setData('type', 'service');
    model.addNode(paymentService);

    // Databases
    const authDB = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    authDB.setData('label', 'Auth DB');
    authDB.setData('type', 'database');
    model.addNode(authDB);

    const userDB = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    userDB.setData('label', 'User DB');
    userDB.setData('type', 'database');
    model.addNode(userDB);

    const orderDB = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 }
    });
    orderDB.setData('label', 'Order DB');
    orderDB.setData('type', 'database');
    model.addNode(orderDB);

    // Message Queue
    const messageQueue = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 }
    });
    messageQueue.setData('label', 'Message Queue');
    messageQueue.setData('type', 'queue');
    model.addNode(messageQueue);

    // Create architecture
    model.connectNodes(webApp, apiGateway);
    model.connectNodes(mobileApp, apiGateway);

    model.connectNodes(apiGateway, authService);
    model.connectNodes(apiGateway, userService);
    model.connectNodes(apiGateway, orderService);
    model.connectNodes(apiGateway, paymentService);

    model.connectNodes(authService, authDB);
    model.connectNodes(userService, userDB);
    model.connectNodes(orderService, orderDB);

    model.connectNodes(orderService, messageQueue);
    model.connectNodes(paymentService, messageQueue);
  }

  private createPinnedLayout(engine: DiagramEngine): void {
    const model = engine.getDiagram();
    if (!model) return;

    // Dashboard Header (Pinned to top)
    const header = new NodeModel({
      type: 'default',
      position: { x: 400, y: 50 }, // Will be pinned here
      size: { width: 400, height: 80 }
    });
    header.setData('label', 'Dashboard Header');
    header.setData('subtitle', 'Pinned to position (400, 50)');
    header.setData('type', 'header');
    model.addNode(header);

    // Navigation Menu (Fixed X position)
    const nav = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 160, height: 300 }
    });
    nav.setData('label', 'Navigation');
    nav.setData('subtitle', 'Fixed X = 50');
    nav.setData('type', 'sidebar');
    model.addNode(nav);

    // Main Content Area (Boundary constrained)
    const mainContent = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 300, height: 200 }
    });
    mainContent.setData('label', 'Main Content');
    mainContent.setData('subtitle', 'Within boundary');
    mainContent.setData('type', 'content');
    model.addNode(mainContent);

    // Analytics Widget 1
    const analytics1 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 200, height: 120 }
    });
    analytics1.setData('label', 'Analytics Widget');
    analytics1.setData('type', 'widget');
    model.addNode(analytics1);

    // Analytics Widget 2
    const analytics2 = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 200, height: 120 }
    });
    analytics2.setData('label', 'Chart Widget');
    analytics2.setData('type', 'widget');
    model.addNode(analytics2);

    // Stats Widget (Fixed Y position)
    const stats = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 180, height: 100 }
    });
    stats.setData('label', 'Stats Widget');
    stats.setData('subtitle', 'Fixed Y = 400');
    stats.setData('type', 'widget');
    model.addNode(stats);

    // User Profile
    const userProfile = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 150, height: 80 }
    });
    userProfile.setData('label', 'User Profile');
    userProfile.setData('type', 'widget');
    model.addNode(userProfile);

    // Notifications
    const notifications = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 150, height: 80 }
    });
    notifications.setData('label', 'Notifications');
    notifications.setData('type', 'widget');
    model.addNode(notifications);

    // Settings
    const settings = new NodeModel({
      type: 'default',
      position: { x: 0, y: 0 },
      size: { width: 150, height: 80 }
    });
    settings.setData('label', 'Settings');
    settings.setData('type', 'widget');
    model.addNode(settings);

    // Footer (Pinned to bottom)
    const footer = new NodeModel({
      type: 'default',
      position: { x: 400, y: 650 }, // Will be pinned here
      size: { width: 400, height: 60 }
    });
    footer.setData('label', 'Footer');
    footer.setData('subtitle', 'Pinned to position (400, 650)');
    footer.setData('type', 'footer');
    model.addNode(footer);

    // Create relationships
    model.connectNodes(header, nav);
    model.connectNodes(header, mainContent);

    model.connectNodes(mainContent, analytics1);
    model.connectNodes(mainContent, analytics2);
    model.connectNodes(mainContent, stats);

    model.connectNodes(nav, userProfile);
    model.connectNodes(nav, notifications);
    model.connectNodes(nav, settings);

    model.connectNodes(mainContent, footer);

    // Set up constraints for this scenario
    // These will be applied when the layout is run
    this.currentOptions.constraints = {
      constraints: [
        // Pin header to top
        {
          nodeId: header.id,
          type: 'pin',
          position: { x: 400, y: 50 },
          priority: 10
        },
        // Pin footer to bottom
        {
          nodeId: footer.id,
          type: 'pin',
          position: { x: 400, y: 650 },
          priority: 10
        },
        // Fix navigation to left side
        {
          nodeId: nav.id,
          type: 'fix-x',
          value: 50,
          priority: 5
        },
        // Fix stats widget Y position
        {
          nodeId: stats.id,
          type: 'fix-y',
          value: 400,
          priority: 3
        },
        // Constrain main content to central area
        {
          nodeId: mainContent.id,
          type: 'boundary',
          boundary: { minX: 250, maxX: 750, minY: 150, maxY: 500 },
          priority: 2
        }
      ],
      conflictResolution: 'priority'
    };
  }
}
