/**
 * BPMN Parser - Parses Business Process Model and Notation syntax
 *
 * Supports extended BPMN flowchart syntax:
 * - Tasks (task, user task, service task, etc.)
 * - Events (start, end, intermediate)
 * - Gateways (exclusive, parallel, inclusive)
 * - Sequence flows with conditions
 * - Pools and lanes (subgraphs)
 */

export type BPMNNodeType =
  | 'task'
  | 'user-task'
  | 'service-task'
  | 'manual-task'
  | 'script-task'
  | 'business-rule-task'
  | 'start-event'
  | 'end-event'
  | 'intermediate-event'
  | 'message-event'
  | 'timer-event'
  | 'error-event'
  | 'exclusive-gateway'
  | 'parallel-gateway'
  | 'inclusive-gateway';

export interface BPMNNode {
  id: string;
  type: BPMNNodeType;
  label: string;
  shape?: string;
}

export interface BPMNFlow {
  from: string;
  to: string;
  label?: string;
  condition?: string;
}

export interface BPMNPool {
  id: string;
  label: string;
  lanes: BPMNLane[];
}

export interface BPMNLane {
  id: string;
  label: string;
  nodes: string[];
}

export interface BPMNDiagram {
  nodes: Map<string, BPMNNode>;
  flows: BPMNFlow[];
  pools: BPMNPool[];
}

export class BPMNParser {
  /**
   * Parse BPMN flowchart text
   *
   * Extended flowchart syntax with BPMN notation:
   * flowchart TD
   *   Start([Start Event])
   *   Task1[User Task]
   *   Gateway{Exclusive Gateway}
   *   End([End Event])
   *
   *   Start --> Task1
   *   Task1 --> Gateway
   *   Gateway -->|Approved| End
   */
  parse(text: string): BPMNDiagram {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));

    // Skip 'flowchart' declaration
    let startIndex = 0;
    if (lines[0]?.toLowerCase().includes('flowchart')) {
      startIndex = 1;
    }

    const nodes = new Map<string, BPMNNode>();
    const flows: BPMNFlow[] = [];
    const pools: BPMNPool[] = [];

    let i = startIndex;
    let currentPool: BPMNPool | null = null;
    let currentLane: BPMNLane | null = null;

    while (i < lines.length) {
      const line = lines[i];

      // Pool (subgraph)
      if (line.toLowerCase().startsWith('subgraph')) {
        const match = line.match(/subgraph\s+(\w+)\[(.+)\]/i);
        if (match) {
          currentPool = {
            id: match[1],
            label: match[2],
            lanes: [],
          };
          pools.push(currentPool);
        }
        i++;
        continue;
      }

      // End pool/lane
      if (line.toLowerCase() === 'end') {
        currentPool = null;
        currentLane = null;
        i++;
        continue;
      }

      // Node definition
      if (this.isNodeDefinition(line)) {
        const node = this.parseNode(line);
        if (node) {
          nodes.set(node.id, node);

          // Add to current lane if in pool
          if (currentLane && currentLane !== null) {
            (currentLane as BPMNLane).nodes.push(node.id);
          }
        }
      }

      // Flow definition
      if (this.isFlowDefinition(line)) {
        const flow = this.parseFlow(line);
        if (flow) {
          flows.push(flow);
        }
      }

      i++;
    }

    return { nodes, flows, pools };
  }

  /**
   * Check if line is a node definition
   */
  private isNodeDefinition(line: string): boolean {
    return /^\s*\w+[\[\(\{]/.test(line) && !line.includes('-->') && !line.includes('---');
  }

  /**
   * Check if line is a flow definition
   */
  private isFlowDefinition(line: string): boolean {
    return line.includes('-->') || line.includes('---');
  }

  /**
   * Parse node definition
   */
  private parseNode(line: string): BPMNNode | null {
    // Extract ID and label
    const match = line.match(/(\w+)([\[\(\{<].+[\]\)\}>])/);
    if (!match) return null;

    const id = match[1];
    const shapeAndLabel = match[2];

    // Determine type from shape and label
    const shape = this.extractShape(shapeAndLabel);
    const label = this.extractLabel(shapeAndLabel);
    const type = this.inferNodeType(shape, label);

    return { id, type, label, shape };
  }

  /**
   * Extract shape from brackets
   */
  private extractShape(text: string): string {
    if (text.startsWith('([') && text.endsWith('])')) return 'stadium';
    if (text.startsWith('((') && text.endsWith('))')) return 'circle';
    if (text.startsWith('{') && text.endsWith('}')) return 'diamond';
    if (text.startsWith('[') && text.endsWith(']')) return 'rectangle';
    if (text.startsWith('(') && text.endsWith(')')) return 'rounded';
    return 'rectangle';
  }

  /**
   * Extract label from brackets
   */
  private extractLabel(text: string): string {
    return text
      .replace(/^[\[\(\{<]+/, '')
      .replace(/[\]\)\}>]+$/, '')
      .trim();
  }

  /**
   * Infer BPMN node type
   */
  private inferNodeType(shape: string, label: string): BPMNNodeType {
    const lowerLabel = label.toLowerCase();

    // Events
    if (shape === 'circle' || shape === 'stadium') {
      if (lowerLabel.includes('start')) return 'start-event';
      if (lowerLabel.includes('end')) return 'end-event';
      if (lowerLabel.includes('message')) return 'message-event';
      if (lowerLabel.includes('timer')) return 'timer-event';
      if (lowerLabel.includes('error')) return 'error-event';
      return 'intermediate-event';
    }

    // Gateways
    if (shape === 'diamond') {
      if (lowerLabel.includes('parallel')) return 'parallel-gateway';
      if (lowerLabel.includes('inclusive')) return 'inclusive-gateway';
      return 'exclusive-gateway';
    }

    // Tasks
    if (lowerLabel.includes('user')) return 'user-task';
    if (lowerLabel.includes('service')) return 'service-task';
    if (lowerLabel.includes('manual')) return 'manual-task';
    if (lowerLabel.includes('script')) return 'script-task';
    if (lowerLabel.includes('business rule')) return 'business-rule-task';

    return 'task';
  }

  /**
   * Parse flow definition
   */
  private parseFlow(line: string): BPMNFlow | null {
    // Match: ID1 -->|label| ID2
    const match = line.match(/(\w+)\s+--+>(?:\|([^|]+)\|)?\s+(\w+)/);
    if (!match) return null;

    const [, from, label, to] = match;

    return {
      from,
      to,
      label: label?.trim(),
    };
  }
}
