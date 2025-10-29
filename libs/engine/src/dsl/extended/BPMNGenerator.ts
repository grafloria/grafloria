/**
 * BPMN Generator - Generates BPMN flowchart DSL
 *
 * Converts DiagramModel with BPMN nodes into flowchart syntax.
 */

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';

export interface BPMNGeneratorOptions {
  /**
   * Include comments
   */
  includeComments?: boolean;

  /**
   * Direction (TD, LR, etc.)
   */
  direction?: 'TD' | 'TB' | 'LR' | 'RL';
}

export class BPMNGenerator {
  /**
   * Generate BPMN flowchart DSL
   */
  generate(diagram: DiagramModel, options: BPMNGeneratorOptions = {}): string {
    const {
      includeComments = true,
      direction = 'TD',
    } = options;

    const lines: string[] = [];

    // Header
    if (includeComments) {
      lines.push('%% BPMN Business Process Diagram');
      lines.push('%%');
    }

    lines.push(`flowchart ${direction}`);
    lines.push('');

    // Generate nodes
    const nodes = diagram.getNodes().filter(n => n.type.startsWith('bpmn:'));

    for (const node of nodes) {
      const nodeLine = this.generateNode(node);
      lines.push('  ' + nodeLine);
    }

    lines.push('');

    // Generate flows
    const links = diagram.getLinks();
    for (const link of links) {
      const flowLine = this.generateFlow(link, diagram);
      if (flowLine) {
        lines.push('  ' + flowLine);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate node definition
   */
  private generateNode(node: NodeModel): string {
    const id = this.sanitizeId(node.id);
    const label = node.data['label'] || node.id;
    const brackets = this.getNodeBrackets(node.type);

    return `${id}${brackets.open}${label}${brackets.close}`;
  }

  /**
   * Get brackets for BPMN node type
   */
  private getNodeBrackets(type: string): { open: string; close: string } {
    if (type.includes('event')) {
      return { open: '([', close: '])' }; // Stadium for events
    }
    if (type.includes('gateway')) {
      return { open: '{', close: '}' }; // Diamond for gateways
    }
    // Tasks use rectangles
    return { open: '[', close: ']' };
  }

  /**
   * Generate flow
   */
  private generateFlow(link: any, diagram: DiagramModel): string | null {
    const sourceNode = diagram.getNode(link.sourceNodeId || '');
    const targetNode = diagram.getNode(link.targetNodeId || '');

    if (!sourceNode || !targetNode) return null;

    const sourceId = this.sanitizeId(sourceNode.id);
    const targetId = this.sanitizeId(targetNode.id);

    let flow = `${sourceId} --> `;

    // Add condition label if present
    const label = link.data['label'];
    if (label) {
      flow += `|${label}| `;
    }

    flow += targetId;

    return flow;
  }

  /**
   * Sanitize ID for DSL
   */
  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }
}
