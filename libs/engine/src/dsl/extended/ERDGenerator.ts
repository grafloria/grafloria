/**
 * ERD Generator - Generates Entity Relationship Diagram DSL
 *
 * Converts DiagramModel with ERD nodes into Mermaid-compatible ERD syntax.
 */

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { LinkModel } from '../../models/LinkModel';

export interface ERDGeneratorOptions {
  /**
   * Include comments
   */
  includeComments?: boolean;

  /**
   * Indent size
   */
  indent?: string;
}

export class ERDGenerator {
  /**
   * Generate ERD DSL from diagram
   */
  generate(diagram: DiagramModel, options: ERDGeneratorOptions = {}): string {
    const {
      includeComments = true,
      indent = '  ',
    } = options;

    const lines: string[] = [];

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
  private generateEntity(node: NodeModel, indent: string): string[] {
    const lines: string[] = [];

    const name = node.data.name || node.data.label || node.id;
    lines.push(indent + name + ' {');

    // Generate fields
    const fields = node.data.fields || [];
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
  private generateField(field: any, indent: string): string {
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
  private generateRelationship(link: LinkModel, diagram: DiagramModel): string | null {
    const sourceNode = diagram.getNode(link.sourceNodeId || '');
    const targetNode = diagram.getNode(link.targetNodeId || '');

    if (!sourceNode || !targetNode) return null;

    const sourceName = sourceNode.data.name || sourceNode.data.label || sourceNode.id;
    const targetName = targetNode.data.name || targetNode.data.label || targetNode.id;

    // Determine cardinality from link metadata
    const cardinality = link.getMetadata('cardinality') || {
      from: 'exactly-one',
      to: 'zero-or-many',
    };

    const fromSymbol = this.getCardinalitySymbol(cardinality.from);
    const toSymbol = this.getCardinalitySymbol(cardinality.to);

    let line = `${sourceName} ${fromSymbol}--${toSymbol} ${targetName}`;

    // Add label if present
    const label = link.data.label;
    if (label) {
      line += ` : ${label}`;
    }

    return line;
  }

  /**
   * Get cardinality symbol
   */
  private getCardinalitySymbol(cardinality: string): string {
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
