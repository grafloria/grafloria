/**
 * ERD Generator - Generates Entity Relationship Diagram DSL
 *
 * Converts DiagramModel with ERD nodes into Mermaid-compatible ERD syntax.
 */
export class ERDGenerator {
    /**
     * Generate ERD DSL from diagram
     */
    generate(diagram, options = {}) {
        const { includeComments = true, indent = '  ', } = options;
        const lines = [];
        // Header
        if (includeComments) {
            lines.push('%% Entity Relationship Diagram');
            lines.push('%%');
        }
        lines.push('erDiagram');
        lines.push('');
        // Generate entities
        const nodes = diagram.getNodes().filter(n => n.type.startsWith('erd:'));
        for (const node of nodes) {
            const entityLines = this.generateEntity(node, indent);
            lines.push(...entityLines);
            lines.push('');
        }
        // Generate relationships
        const links = diagram.getLinks();
        for (const link of links) {
            const relLine = this.generateRelationship(link, diagram);
            if (relLine) {
                lines.push(indent + relLine);
            }
        }
        return lines.join('\n');
    }
    /**
     * Generate entity definition
     */
    generateEntity(node, indent) {
        const lines = [];
        const name = node.data['name'] || node.getLabel() || node.id;
        lines.push(indent + name + ' {');
        // Generate fields
        const fields = node.data['fields'] || [];
        for (const field of fields) {
            const fieldLine = this.generateField(field, indent + indent);
            lines.push(fieldLine);
        }
        lines.push(indent + '}');
        return lines;
    }
    /**
     * Generate field definition
     */
    generateField(field, indent) {
        let line = indent;
        // Type and name
        line += `${field.type || 'string'} ${field.name}`;
        // Constraints
        if (field.primaryKey) {
            line += ' PK';
        }
        if (field.foreignKey) {
            line += ' FK';
        }
        if (field.unique) {
            line += ' UNIQUE';
        }
        if (field.notNull) {
            line += ' NOT NULL';
        }
        // Comment
        if (field.comment) {
            line += ` "${field.comment}"`;
        }
        return line;
    }
    /**
     * Generate relationship
     */
    generateRelationship(link, diagram) {
        const sourceNode = diagram.getNode(link.sourceNodeId || '');
        const targetNode = diagram.getNode(link.targetNodeId || '');
        if (!sourceNode || !targetNode)
            return null;
        const sourceName = sourceNode.data['name'] || sourceNode.getLabel() || sourceNode.id;
        const targetName = targetNode.data['name'] || targetNode.getLabel() || targetNode.id;
        // Determine cardinality from link metadata
        const cardinality = link.getMetadata('cardinality') || {
            from: 'exactly-one',
            to: 'zero-or-many',
        };
        const fromSymbol = this.getCardinalitySymbol(cardinality.from);
        const toSymbol = this.getCardinalitySymbol(cardinality.to);
        let line = `${sourceName} ${fromSymbol}--${toSymbol} ${targetName}`;
        // Add label if present
        const label = link.getLabel(); // canonical read
        if (label) {
            line += ` : ${label}`;
        }
        return line;
    }
    /**
     * Get cardinality symbol
     */
    getCardinalitySymbol(cardinality) {
        switch (cardinality) {
            case 'exactly-one':
                return '||';
            case 'zero-or-one':
                return '|o';
            case 'one-or-many':
                return '}{';
            case 'zero-or-many':
                return '}o';
            default:
                return '||';
        }
    }
}
//# sourceMappingURL=ERDGenerator.js.map