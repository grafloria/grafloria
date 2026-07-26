/**
 * BPMN Generator - Generates BPMN flowchart DSL
 *
 * Converts DiagramModel with BPMN nodes into flowchart syntax.
 */
export class BPMNGenerator {
    /**
     * Generate BPMN flowchart DSL
     */
    generate(diagram, options = {}) {
        const { includeComments = true, direction = 'TD', } = options;
        const lines = [];
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
    generateNode(node) {
        var _a;
        const id = this.sanitizeId(node.id);
        const label = (_a = node.getLabel()) !== null && _a !== void 0 ? _a : node.id; // canonical read
        const brackets = this.getNodeBrackets(node.type);
        return `${id}${brackets.open}${label}${brackets.close}`;
    }
    /**
     * Get brackets for BPMN node type
     */
    getNodeBrackets(type) {
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
    generateFlow(link, diagram) {
        const sourceNode = diagram.getNode(link.sourceNodeId || '');
        const targetNode = diagram.getNode(link.targetNodeId || '');
        if (!sourceNode || !targetNode)
            return null;
        const sourceId = this.sanitizeId(sourceNode.id);
        const targetId = this.sanitizeId(targetNode.id);
        let flow = `${sourceId} --> `;
        // Add condition label if present
        const label = link.getLabel(); // canonical read
        if (label) {
            flow += `|${label}| `;
        }
        flow += targetId;
        return flow;
    }
    /**
     * Sanitize ID for DSL
     */
    sanitizeId(id) {
        return id.replace(/[^a-zA-Z0-9_]/g, '_');
    }
}
//# sourceMappingURL=BPMNGenerator.js.map