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
import { DiagramEngine } from '@grafloria/engine';
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
    this.engine.getModel().clear();
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
    const nodes = Array.from(this.engine.getModel().getNodes().values());
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
    const model = engine.getModel();

    // CEO
    const ceo = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 180, height: 80 },
      data: {
        label: 'CEO',
        name: 'Sarah Johnson',
        role: 'Chief Executive Officer'
      }
    });

    // C-Level
    const cto = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 180, height: 80 },
      data: {
        label: 'CTO',
        name: 'Mike Chen',
        role: 'Chief Technology Officer'
      }
    });

    const cfo = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 180, height: 80 },
      data: {
        label: 'CFO',
        name: 'Emily Rodriguez',
        role: 'Chief Financial Officer'
      }
    });

    const cmo = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 180, height: 80 },
      data: {
        label: 'CMO',
        name: 'David Park',
        role: 'Chief Marketing Officer'
      }
    });

    // Engineering Team
    const engMgr = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 },
      data: { label: 'Engineering Manager', name: 'Alex Kim' }
    });

    const devLead = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 },
      data: { label: 'Dev Lead', name: 'Jordan Lee' }
    });

    const qaLead = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 },
      data: { label: 'QA Lead', name: 'Sam Taylor' }
    });

    // Finance Team
    const finController = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 },
      data: { label: 'Controller', name: 'Lisa Wang' }
    });

    // Marketing Team
    const mktMgr = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 },
      data: { label: 'Marketing Manager', name: 'Chris Brown' }
    });

    // Create hierarchy links
    model.addLink({ sourceNodeId: ceo.id, targetNodeId: cto.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: ceo.id, targetNodeId: cfo.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: ceo.id, targetNodeId: cmo.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: cto.id, targetNodeId: engMgr.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: engMgr.id, targetNodeId: devLead.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: engMgr.id, targetNodeId: qaLead.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: cfo.id, targetNodeId: finController.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: cmo.id, targetNodeId: mktMgr.id, sourcePortId: 'out', targetPortId: 'in' });
  }

  private createProcessFlow(engine: DiagramEngine): void {
    const model = engine.getModel();

    // Start
    const start = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Start', type: 'start' }
    });

    // Receive Order
    const receiveOrder = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 150, height: 70 },
      data: { label: 'Receive Order', type: 'process' }
    });

    // Check Inventory
    const checkInventory = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 },
      data: { label: 'Check Inventory', type: 'process' }
    });

    // Decision: In Stock?
    const inStockDecision = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 80 },
      data: { label: 'In Stock?', type: 'decision' }
    });

    // Process Payment
    const processPayment = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 150, height: 70 },
      data: { label: 'Process Payment', type: 'process' }
    });

    // Ship Order
    const shipOrder = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 150, height: 70 },
      data: { label: 'Ship Order', type: 'process' }
    });

    // Backorder
    const backorder = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 150, height: 70 },
      data: { label: 'Create Backorder', type: 'process' }
    });

    // Notify Customer
    const notifyCustomer = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 150, height: 70 },
      data: { label: 'Notify Customer', type: 'process' }
    });

    // End
    const end = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'End', type: 'end' }
    });

    // Create flow
    model.addLink({ sourceNodeId: start.id, targetNodeId: receiveOrder.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: receiveOrder.id, targetNodeId: checkInventory.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: checkInventory.id, targetNodeId: inStockDecision.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: inStockDecision.id, targetNodeId: processPayment.id, sourcePortId: 'out', targetPortId: 'in', data: { label: 'Yes' } });
    model.addLink({ sourceNodeId: inStockDecision.id, targetNodeId: backorder.id, sourcePortId: 'out', targetPortId: 'in', data: { label: 'No' } });
    model.addLink({ sourceNodeId: processPayment.id, targetNodeId: shipOrder.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: shipOrder.id, targetNodeId: notifyCustomer.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: backorder.id, targetNodeId: notifyCustomer.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: notifyCustomer.id, targetNodeId: end.id, sourcePortId: 'out', targetPortId: 'in' });
  }

  private createNetworkTopology(engine: DiagramEngine): void {
    const model = engine.getModel();

    // Core Network
    const router1 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 },
      data: { label: 'Core Router 1', type: 'router' }
    });

    const router2 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 },
      data: { label: 'Core Router 2', type: 'router' }
    });

    // Switches
    const switch1 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Switch A', type: 'switch' }
    });

    const switch2 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Switch B', type: 'switch' }
    });

    const switch3 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Switch C', type: 'switch' }
    });

    // Servers
    const webServer = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 130, height: 65 },
      data: { label: 'Web Server', type: 'server' }
    });

    const dbServer = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 130, height: 65 },
      data: { label: 'DB Server', type: 'server' }
    });

    const appServer = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 130, height: 65 },
      data: { label: 'App Server', type: 'server' }
    });

    const cacheServer = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 130, height: 65 },
      data: { label: 'Cache Server', type: 'server' }
    });

    // Firewall
    const firewall = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Firewall', type: 'firewall' }
    });

    // Create connections
    model.addLink({ sourceNodeId: router1.id, targetNodeId: router2.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: router1.id, targetNodeId: switch1.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: router2.id, targetNodeId: switch2.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: router2.id, targetNodeId: switch3.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: switch1.id, targetNodeId: webServer.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: switch1.id, targetNodeId: appServer.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: switch2.id, targetNodeId: dbServer.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: switch3.id, targetNodeId: cacheServer.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: firewall.id, targetNodeId: router1.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: webServer.id, targetNodeId: appServer.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: appServer.id, targetNodeId: dbServer.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: appServer.id, targetNodeId: cacheServer.id, sourcePortId: 'out', targetPortId: 'in' });
  }

  private createDecisionTree(engine: DiagramEngine): void {
    const model = engine.getModel();

    // Root
    const root = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 160, height: 70 },
      data: { label: 'Budget?', type: 'decision' }
    });

    // Level 1
    const budget1 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 60 },
      data: { label: '< $500', type: 'branch' }
    });

    const budget2 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 60 },
      data: { label: '$500-$1000', type: 'branch' }
    });

    const budget3 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 60 },
      data: { label: '> $1000', type: 'branch' }
    });

    // Level 2 - Use Case
    const casual1 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 130, height: 55 },
      data: { label: 'Casual Use', type: 'leaf' }
    });

    const gaming1 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 130, height: 55 },
      data: { label: 'Light Gaming', type: 'leaf' }
    });

    const gaming2 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 130, height: 55 },
      data: { label: 'Gaming', type: 'leaf' }
    });

    const professional = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 130, height: 55 },
      data: { label: 'Professional', type: 'leaf' }
    });

    const workstation = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 130, height: 55 },
      data: { label: 'Workstation', type: 'leaf' }
    });

    const enthusiast = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 130, height: 55 },
      data: { label: 'Enthusiast', type: 'leaf' }
    });

    // Create tree structure
    model.addLink({ sourceNodeId: root.id, targetNodeId: budget1.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: root.id, targetNodeId: budget2.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: root.id, targetNodeId: budget3.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: budget1.id, targetNodeId: casual1.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: budget1.id, targetNodeId: gaming1.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: budget2.id, targetNodeId: gaming2.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: budget2.id, targetNodeId: professional.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: budget3.id, targetNodeId: workstation.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: budget3.id, targetNodeId: enthusiast.id, sourcePortId: 'out', targetPortId: 'in' });
  }

  private createCircularDeps(engine: DiagramEngine): void {
    const model = engine.getModel();

    // Core module
    const core = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Core', type: 'module' }
    });

    // Modules
    const auth = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Auth', type: 'module' }
    });

    const api = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'API', type: 'module' }
    });

    const database = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Database', type: 'module' }
    });

    const cache = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Cache', type: 'module' }
    });

    const logger = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Logger', type: 'module' }
    });

    const config = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Config', type: 'module' }
    });

    // Create circular dependencies
    model.addLink({ sourceNodeId: core.id, targetNodeId: auth.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: core.id, targetNodeId: api.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: auth.id, targetNodeId: database.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: auth.id, targetNodeId: cache.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: api.id, targetNodeId: auth.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: api.id, targetNodeId: database.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: database.id, targetNodeId: logger.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: cache.id, targetNodeId: logger.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: logger.id, targetNodeId: config.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: config.id, targetNodeId: core.id, sourcePortId: 'out', targetPortId: 'in' });
  }

  private createSystemArchitecture(engine: DiagramEngine): void {
    const model = engine.getModel();

    // Frontend
    const webApp = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 },
      data: { label: 'Web App', type: 'frontend' }
    });

    const mobileApp = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 },
      data: { label: 'Mobile App', type: 'frontend' }
    });

    // API Gateway
    const apiGateway = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 150, height: 75 },
      data: { label: 'API Gateway', type: 'gateway' }
    });

    // Microservices
    const authService = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 },
      data: { label: 'Auth Service', type: 'service' }
    });

    const userService = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 },
      data: { label: 'User Service', type: 'service' }
    });

    const orderService = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 },
      data: { label: 'Order Service', type: 'service' }
    });

    const paymentService = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 },
      data: { label: 'Payment Service', type: 'service' }
    });

    // Databases
    const authDB = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Auth DB', type: 'database' }
    });

    const userDB = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'User DB', type: 'database' }
    });

    const orderDB = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 120, height: 60 },
      data: { label: 'Order DB', type: 'database' }
    });

    // Message Queue
    const messageQueue = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 140, height: 70 },
      data: { label: 'Message Queue', type: 'queue' }
    });

    // Create architecture
    model.addLink({ sourceNodeId: webApp.id, targetNodeId: apiGateway.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: mobileApp.id, targetNodeId: apiGateway.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: apiGateway.id, targetNodeId: authService.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: apiGateway.id, targetNodeId: userService.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: apiGateway.id, targetNodeId: orderService.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: apiGateway.id, targetNodeId: paymentService.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: authService.id, targetNodeId: authDB.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: userService.id, targetNodeId: userDB.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: orderService.id, targetNodeId: orderDB.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: orderService.id, targetNodeId: messageQueue.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: paymentService.id, targetNodeId: messageQueue.id, sourcePortId: 'out', targetPortId: 'in' });
  }

  private createPinnedLayout(engine: DiagramEngine): void {
    const model = engine.getModel();

    // Dashboard Header (Pinned to top)
    const header = model.addNode({
      position: { x: 400, y: 50 }, // Will be pinned here
      size: { width: 400, height: 80 },
      data: {
        label: 'Dashboard Header',
        subtitle: 'Pinned to position (400, 50)',
        type: 'header'
      }
    });

    // Navigation Menu (Fixed X position)
    const nav = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 160, height: 300 },
      data: {
        label: 'Navigation',
        subtitle: 'Fixed X = 50',
        type: 'sidebar'
      }
    });

    // Main Content Area (Boundary constrained)
    const mainContent = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 300, height: 200 },
      data: {
        label: 'Main Content',
        subtitle: 'Within boundary',
        type: 'content'
      }
    });

    // Analytics Widget 1
    const analytics1 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 200, height: 120 },
      data: { label: 'Analytics Widget', type: 'widget' }
    });

    // Analytics Widget 2
    const analytics2 = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 200, height: 120 },
      data: { label: 'Chart Widget', type: 'widget' }
    });

    // Stats Widget (Fixed Y position)
    const stats = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 180, height: 100 },
      data: {
        label: 'Stats Widget',
        subtitle: 'Fixed Y = 400',
        type: 'widget'
      }
    });

    // User Profile
    const userProfile = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 150, height: 80 },
      data: { label: 'User Profile', type: 'widget' }
    });

    // Notifications
    const notifications = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 150, height: 80 },
      data: { label: 'Notifications', type: 'widget' }
    });

    // Settings
    const settings = model.addNode({
      position: { x: 0, y: 0 },
      size: { width: 150, height: 80 },
      data: { label: 'Settings', type: 'widget' }
    });

    // Footer (Pinned to bottom)
    const footer = model.addNode({
      position: { x: 400, y: 650 }, // Will be pinned here
      size: { width: 400, height: 60 },
      data: {
        label: 'Footer',
        subtitle: 'Pinned to position (400, 650)',
        type: 'footer'
      }
    });

    // Create relationships
    model.addLink({ sourceNodeId: header.id, targetNodeId: nav.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: header.id, targetNodeId: mainContent.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: mainContent.id, targetNodeId: analytics1.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: mainContent.id, targetNodeId: analytics2.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: mainContent.id, targetNodeId: stats.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: nav.id, targetNodeId: userProfile.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: nav.id, targetNodeId: notifications.id, sourcePortId: 'out', targetPortId: 'in' });
    model.addLink({ sourceNodeId: nav.id, targetNodeId: settings.id, sourcePortId: 'out', targetPortId: 'in' });

    model.addLink({ sourceNodeId: mainContent.id, targetNodeId: footer.id, sourcePortId: 'out', targetPortId: 'in' });

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
