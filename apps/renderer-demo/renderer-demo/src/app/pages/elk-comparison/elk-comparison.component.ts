import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DiagramCanvasComponent } from '@grafloria/renderer-angular';
import {
  DiagramEngine,
  NodeModel,
  PortModel,
  LinkModel,
  InteractionMode,
  PortVisibilityStrategy,
} from '@grafloria/engine';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

@Component({
  standalone: true,
  imports: [CommonModule, DiagramCanvasComponent],
  selector: 'app-elk-comparison',
  templateUrl: './elk-comparison.component.html',
  styleUrl: './elk-comparison.component.css',
})
export class ElkComparisonComponent implements OnInit {
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1600, height: 1000 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  // Debounce timer for rerouting during drag to prevent visual lag
  private rerouteTimers = new Map<string, any>();
  private readonly REROUTE_DEBOUNCE_MS = 16; // ~60fps for smooth visual updates

  ngOnInit() {
    this.engine = new DiagramEngine({
      interaction: {
        mode: InteractionMode.SMART,
        portVisibility: PortVisibilityStrategy.ON_HOVER,
      },
    });

    const diagram = this.engine.createDiagram('ELK Comparison');

    // Subscribe to diagram events to reroute links when nodes move
    // The diagram emits 'node:moved' events when any node's position changes
    if (diagram) {
      diagram.on('node:moved', (data: { nodeId: string; position: { x: number; y: number } }) => {
        console.log('🔄 Node position changed:', data.nodeId, 'Scheduling reroute...');
        this.debouncedRerouteNodeLinks(data.nodeId);
      });
    }

    // Create nodes similar to React Flow ELK.js example
    // Layout: hierarchical from left to right

    // Root node
    const root = this.createNode('root', 'Root', { x: 100, y: 300 }, '#6366f1');

    // Level 1 nodes
    const node1 = this.createNode('node1', 'Node 1', { x: 350, y: 150 }, '#8b5cf6');
    const node2 = this.createNode('node2', 'Node 2', { x: 350, y: 300 }, '#8b5cf6');
    const node3 = this.createNode('node3', 'Node 3', { x: 350, y: 450 }, '#8b5cf6');

    // Level 2 nodes
    const node4 = this.createNode('node4', 'Node 4', { x: 600, y: 100 }, '#ec4899');
    const node5 = this.createNode('node5', 'Node 5', { x: 600, y: 200 }, '#ec4899');
    const node6 = this.createNode('node6', 'Node 6', { x: 600, y: 350 }, '#ec4899');
    const node7 = this.createNode('node7', 'Node 7', { x: 600, y: 500 }, '#ec4899');

    // Level 3 nodes
    const node8 = this.createNode('node8', 'Node 8', { x: 850, y: 150 }, '#10b981');
    const node9 = this.createNode('node9', 'Node 9', { x: 850, y: 300 }, '#10b981');
    const node10 = this.createNode('node10', 'Node 10', { x: 850, y: 450 }, '#10b981');

    // Add all nodes to diagram
    if (diagram) {
      diagram.addNode(root);
      diagram.addNode(node1);
      diagram.addNode(node2);
      diagram.addNode(node3);
      diagram.addNode(node4);
      diagram.addNode(node5);
      diagram.addNode(node6);
      diagram.addNode(node7);
      diagram.addNode(node8);
      diagram.addNode(node9);
      diagram.addNode(node10);

      // Create orthogonal links with obstacle avoidance
      // Root connections
      diagram.addLink(this.createLink(root, node1, 'link-root-1'));
      diagram.addLink(this.createLink(root, node2, 'link-root-2'));
      diagram.addLink(this.createLink(root, node3, 'link-root-3'));

      // Level 1 to Level 2 connections
      diagram.addLink(this.createLink(node1, node4, 'link-1-4'));
      diagram.addLink(this.createLink(node1, node5, 'link-1-5'));
      diagram.addLink(this.createLink(node2, node5, 'link-2-5'));
      diagram.addLink(this.createLink(node2, node6, 'link-2-6'));
      diagram.addLink(this.createLink(node3, node6, 'link-3-6'));
      diagram.addLink(this.createLink(node3, node7, 'link-3-7'));

      // Level 2 to Level 3 connections
      diagram.addLink(this.createLink(node4, node8, 'link-4-8'));
      diagram.addLink(this.createLink(node5, node8, 'link-5-8'));
      diagram.addLink(this.createLink(node5, node9, 'link-5-9'));
      diagram.addLink(this.createLink(node6, node9, 'link-6-9'));
      diagram.addLink(this.createLink(node6, node10, 'link-6-10'));
      diagram.addLink(this.createLink(node7, node10, 'link-7-10'));

      // Cross-level connections to test obstacle avoidance
      diagram.addLink(this.createLink(root, node6, 'link-root-6'));
      diagram.addLink(this.createLink(node1, node8, 'link-1-8'));

      console.log('🎨 ELK Comparison: Created', diagram.getNodes().length, 'nodes and', diagram.getLinks().length, 'links');

      // IMPORTANT: Route all links using ELK after they've been added
      this.routeAllLinks();
    }
  }

  /**
   * Debounced version of rerouteNodeLinks for smooth drag performance
   * Batches reroute requests to prevent excessive recalculations during rapid position changes
   */
  private debouncedRerouteNodeLinks(nodeId: string) {
    // Clear any existing timer for this node
    if (this.rerouteTimers.has(nodeId)) {
      clearTimeout(this.rerouteTimers.get(nodeId));
    }

    // Schedule a new reroute after debounce delay
    const timer = setTimeout(() => {
      this.rerouteNodeLinks(nodeId);
      this.rerouteTimers.delete(nodeId);
    }, this.REROUTE_DEBOUNCE_MS);

    this.rerouteTimers.set(nodeId, timer);
  }

  /**
   * Reroute all links connected to a specific node
   * Called when a node is moved/dragged (via debounced wrapper)
   */
  private rerouteNodeLinks(nodeId: string) {
    console.log(`⏰ rerouteNodeLinks CALLED for nodeId: ${nodeId}`);

    const diagram = this.engine.getDiagram();
    if (!diagram) {
      console.log(`❌ No diagram found`);
      return;
    }

    const node = diagram.getNode(nodeId);
    if (!node) {
      console.log(`❌ Node ${nodeId} not found`);
      return;
    }

    console.log(`✅ Found node: ${node.getMetadata('label')} (${nodeId})`);

    // Find all links connected to this node
    const links = diagram.getLinks().filter(link => {
      return link.sourceNodeId === nodeId || link.targetNodeId === nodeId;
    });

    if (links.length === 0) return;

    console.log(`🔄 Rerouting ${links.length} links for node ${nodeId}`);

    const nodes = diagram.getNodes();
    const routingEngine = this.engine.getRoutingEngine();

    // Reroute each connected link
    links.forEach(link => {
      try {
        // Find source and target nodes
        const sourceNode = nodes.find(n => n.id === link.sourceNodeId);
        const targetNode = nodes.find(n => n.id === link.targetNodeId);

        if (!sourceNode || !targetNode) return;

        // Get ports
        const sourcePort = sourceNode.getPort(link.sourcePortId);
        const targetPort = targetNode.getPort(link.targetPortId);

        if (!sourcePort || !targetPort) return;

        // Calculate fresh port positions
        const sourceBounds = sourceNode.getBoundingBox();
        const targetBounds = targetNode.getBoundingBox();
        const sourcePos = sourcePort.getAbsolutePosition(sourceBounds);
        const targetPos = targetPort.getAbsolutePosition(targetBounds);

        // Get port directions
        const sourceDirection = sourcePort.alignment?.side;
        const targetDirection = targetPort.alignment?.side;

        console.log(`🔗 Routing: ${sourceNode.getMetadata('label')} → ${targetNode.getMetadata('label')}`);

        // Get obstacles (all nodes except source and target)
        const obstacles = nodes
          .filter(n => n.id !== sourceNode.id && n.id !== targetNode.id)
          .map(node => {
            const worldPos = node.getWorldPosition();
            return {
              id: node.id,
              x: worldPos.x,
              y: worldPos.y,
              width: node.size.width,
              height: node.size.height,
            };
          });

        // Reroute the link
        const routedPath = routingEngine.route({
          start: sourcePos,
          end: targetPos,
          sourceDirection,
          targetDirection,
          obstacles,
          options: {
            algorithm: 'orthogonal',
            avoidObstacles: true,
            gridSize: 10,
          }
        });

        if (routedPath && routedPath.points.length > 0) {
          link.setPoints(routedPath.points);
          link.markDirty('node-moved');
        }
      } catch (error) {
        console.error(`❌ Error rerouting link ${link.id}:`, error);
      }
    });

    // Mark diagram dirty to trigger re-render
    diagram.markDirty('node-position-changed');
  }

  /**
   * Route all links using ELK.js
   */
  private async routeAllLinks() {
    const diagram = this.engine.getDiagram();
    if (!diagram) return;

    console.log('🔄 Starting ELK routing for all links...');

    const links = diagram.getLinks();
    const nodes = diagram.getNodes();
    const routingEngine = this.engine.getRoutingEngine();

    for (const link of links) {
      try {
        // Find nodes that own these ports
        const sourceNode = nodes.find(n => n.getPort(link.sourcePortId));
        const targetNode = nodes.find(n => n.getPort(link.targetPortId));

        if (!sourceNode || !targetNode) {
          console.warn('Cannot route link - missing nodes:', link.id);
          continue;
        }

        // Get source and target ports from nodes
        const sourcePort = sourceNode.getPort(link.sourcePortId);
        const targetPort = targetNode.getPort(link.targetPortId);

        if (!sourcePort || !targetPort) {
          console.warn('Cannot route link - missing ports:', link.id);
          continue;
        }

        // Calculate port positions
        const sourceBounds = sourceNode.getBoundingBox();
        const targetBounds = targetNode.getBoundingBox();
        const sourcePos = sourcePort.getAbsolutePosition(sourceBounds);
        const targetPos = targetPort.getAbsolutePosition(targetBounds);

        // Debug logging for Node 6
        if (sourceNode.id.includes('node6') || targetNode.id.includes('node6')) {
          console.log(`🔍 Node 6 Debug - Link ${link.id}:`);
          console.log(`  Source: ${sourceNode.id}`, sourceBounds, sourcePos);
          console.log(`  Target: ${targetNode.id}`, targetBounds, targetPos);
          console.log(`  Source port:`, sourcePort.id, sourcePort.alignment, sourcePort.position);
          console.log(`  Target port:`, targetPort.id, targetPort.alignment, targetPort.position);
        }

        // Get port directions
        const sourceDirection = sourcePort.alignment?.side;
        const targetDirection = targetPort.alignment?.side;

        // Get all obstacles
        const obstacles = nodes.map(node => {
          const worldPos = node.getWorldPosition();
          return {
            id: node.id,
            x: worldPos.x,
            y: worldPos.y,
            width: node.size.width,
            height: node.size.height,
          };
        });

        // Use route (synchronous) for orthogonal router
        const routedPath = routingEngine.route({
          start: sourcePos,
          end: targetPos,
          sourceDirection,
          targetDirection,
          obstacles,
          options: {
            algorithm: 'orthogonal',  // Use OrthogonalRouter with A* obstacle avoidance
            avoidObstacles: true,
            gridSize: 10,
          }
        });

        if (routedPath && routedPath.points.length > 0) {
          link.setPoints(routedPath.points);
        } else {
          console.warn(`⚠️ ELK routing returned no points for link ${link.id}`);
        }
      } catch (error) {
        console.error(`❌ Error routing link ${link.id}:`, error);
      }
    }

    // Force re-render - mark diagram and all links as dirty
    diagram.markDirty('elk-routing-complete');
    links.forEach(link => link.markDirty('elk-routing-complete'));
  }

  private createNode(
    id: string,
    label: string,
    position: { x: number; y: number },
    fillColor: string
  ): NodeModel {
    const node = new NodeModel({
      type: 'rect',
      position,
      size: { width: 120, height: 60 },
    });

    node.setMetadata('shape', {
      type: 'rect',
      fill: fillColor,
      stroke: fillColor.replace(/f1$|f6$|99$|81$/,  '00'), // Darker stroke
      strokeWidth: 2,
      cornerRadius: 4,
    });

    node.setMetadata('label', label);

    // Add ports
    const leftPort = new PortModel({
      id: `${id}-left`,
      type: 'input',
      side: 'left',
    });

    const rightPort = new PortModel({
      id: `${id}-right`,
      type: 'output',
      side: 'right',
    });

    node.addPort(leftPort);
    node.addPort(rightPort);

    return node;
  }

  private createLink(source: NodeModel, target: NodeModel, id: string): LinkModel {
    const sourcePort = source.getPorts().find(p => p.type === 'output');
    const targetPort = target.getPorts().find(p => p.type === 'input');

    if (!sourcePort || !targetPort) {
      throw new Error('Ports not found');
    }

    // Use orthogonal router for intelligent routing with obstacle avoidance
    // Note: ELK is designed for graph layout, not pure edge routing
    // Our OrthogonalRouter provides React Flow-style smoothstep routing with A* obstacle avoidance
    const link = new LinkModel(sourcePort.id, targetPort.id, 'orthogonal');
    link.setMetadata('routing', {
      algorithm: 'orthogonal',  // Use OrthogonalRouter (React Flow smoothstep equivalent)
    });
    link.setMetadata('style', {
      stroke: '#64748b',
      strokeWidth: 2,
    });
    link.setMetadata('markers', {
      end: {
        type: 'arrow',
        size: 8,
        color: '#64748b',
      },
    });

    return link;
  }
}
