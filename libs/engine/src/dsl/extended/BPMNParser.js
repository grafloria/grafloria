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
    parse(text) {
        var _a;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
        // Skip 'flowchart' declaration
        let startIndex = 0;
        if ((_a = lines[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('flowchart')) {
            startIndex = 1;
        }
        const nodes = new Map();
        const flows = [];
        const pools = [];
        let i = startIndex;
        let currentPool = null;
        let currentLane = null;
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
                        currentLane.nodes.push(node.id);
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
    isNodeDefinition(line) {
        return /^\s*\w+[\[\(\{]/.test(line) && !line.includes('-->') && !line.includes('---');
    }
    /**
     * Check if line is a flow definition
     */
    isFlowDefinition(line) {
        return line.includes('-->') || line.includes('---');
    }
    /**
     * Parse node definition
     */
    parseNode(line) {
        // Extract ID and label
        const match = line.match(/(\w+)([\[\(\{<].+[\]\)\}>])/);
        if (!match)
            return null;
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
    extractShape(text) {
        if (text.startsWith('([') && text.endsWith('])'))
            return 'stadium';
        if (text.startsWith('((') && text.endsWith('))'))
            return 'circle';
        if (text.startsWith('{') && text.endsWith('}'))
            return 'diamond';
        if (text.startsWith('[') && text.endsWith(']'))
            return 'rectangle';
        if (text.startsWith('(') && text.endsWith(')'))
            return 'rounded';
        return 'rectangle';
    }
    /**
     * Extract label from brackets
     */
    extractLabel(text) {
        return text
            .replace(/^[\[\(\{<]+/, '')
            .replace(/[\]\)\}>]+$/, '')
            .trim();
    }
    /**
     * Infer BPMN node type
     */
    inferNodeType(shape, label) {
        const lowerLabel = label.toLowerCase();
        // Events
        if (shape === 'circle' || shape === 'stadium') {
            if (lowerLabel.includes('start'))
                return 'start-event';
            if (lowerLabel.includes('end'))
                return 'end-event';
            if (lowerLabel.includes('message'))
                return 'message-event';
            if (lowerLabel.includes('timer'))
                return 'timer-event';
            if (lowerLabel.includes('error'))
                return 'error-event';
            return 'intermediate-event';
        }
        // Gateways
        if (shape === 'diamond') {
            if (lowerLabel.includes('parallel'))
                return 'parallel-gateway';
            if (lowerLabel.includes('inclusive'))
                return 'inclusive-gateway';
            return 'exclusive-gateway';
        }
        // Tasks
        if (lowerLabel.includes('user'))
            return 'user-task';
        if (lowerLabel.includes('service'))
            return 'service-task';
        if (lowerLabel.includes('manual'))
            return 'manual-task';
        if (lowerLabel.includes('script'))
            return 'script-task';
        if (lowerLabel.includes('business rule'))
            return 'business-rule-task';
        return 'task';
    }
    /**
     * Parse flow definition
     */
    parseFlow(line) {
        // Match: ID1 -->|label| ID2
        const match = line.match(/(\w+)\s+--+>(?:\|([^|]+)\|)?\s+(\w+)/);
        if (!match)
            return null;
        const [, from, label, to] = match;
        return {
            from,
            to,
            label: label === null || label === void 0 ? void 0 : label.trim(),
        };
    }
}
//# sourceMappingURL=BPMNParser.js.map