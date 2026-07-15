/**
 * UML Generator - Generates UML Class Diagram DSL
 *
 * Converts DiagramModel with UML nodes into Mermaid class diagram syntax.
 */

import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
import { LinkModel } from '../../models/LinkModel';

export interface UMLGeneratorOptions {
  /**
   * Include comments
   */
  includeComments?: boolean;

  /**
   * Indent size
   */
  indent?: string;
}

export class UMLGenerator {
  /**
   * Generate UML class diagram DSL
   */
  generate(diagram: DiagramModel, options: UMLGeneratorOptions = {}): string {
    const {
      includeComments = true,
      indent = '  ',
    } = options;

    const lines: string[] = [];

    // Header
    if (includeComments) {
      lines.push('%% UML Class Diagram');
      lines.push('%%');
    }

    lines.push('classDiagram');
    lines.push('');

    // Generate classes
    const nodes = diagram.getNodes().filter(n => n.type.startsWith('uml:'));

    for (const node of nodes) {
      const classLines = this.generateClass(node, indent);
      lines.push(...classLines);
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
   * Generate class definition
   */
  private generateClass(node: NodeModel, indent: string): string[] {
    const lines: string[] = [];

    const className = node.data['name'] || node.getLabel() || node.id;
    lines.push(indent + `class ${className} {`);

    // Stereotype
    const stereotype = node.data['stereotype'];
    if (stereotype) {
      lines.push(indent + indent + `<<${stereotype}>>`);
    }

    // Attributes
    const attributes = node.data['attributes'] || [];
    for (const attr of attributes) {
      const attrLine = this.generateAttribute(attr, indent + indent);
      lines.push(attrLine);
    }

    // Methods
    const methods = node.data['methods'] || [];
    for (const method of methods) {
      const methodLine = this.generateMethod(method, indent + indent);
      lines.push(methodLine);
    }

    lines.push(indent + '}');

    return lines;
  }

  /**
   * Generate attribute
   */
  private generateAttribute(attr: any, indent: string): string {
    let line = indent;

    // Visibility
    line += attr.visibility || '+';
    line += ' ';

    // Static
    if (attr.isStatic) {
      line += '$ ';
    }

    // Name and type
    line += `${attr.name}: ${attr.type}`;

    // Default value
    if (attr.defaultValue) {
      line += ` = ${attr.defaultValue}`;
    }

    return line;
  }

  /**
   * Generate method
   */
  private generateMethod(method: any, indent: string): string {
    let line = indent;

    // Visibility
    line += method.visibility || '+';
    line += ' ';

    // Static or abstract
    if (method.isStatic) {
      line += '$ ';
    }
    if (method.isAbstract) {
      line += '* ';
    }

    // Method name
    line += method.name;

    // Parameters
    line += '(';
    const params = method.parameters || [];
    line += params.map((p: any) => `${p.name}: ${p.type}`).join(', ');
    line += ')';

    // Return type
    if (method.returnType) {
      line += `: ${method.returnType}`;
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

    const sourceName = sourceNode.data['name'] || sourceNode.getLabel() || sourceNode.id;
    const targetName = targetNode.data['name'] || targetNode.getLabel() || targetNode.id;

    // Get relationship type from metadata
    const relType = link.getMetadata('umlRelationship') || 'association';
    const symbol = this.getRelationshipSymbol(relType);

    let line = `${sourceName} ${symbol} ${targetName}`;

    // Add label if present
    const label = link.getLabel(); // canonical read
    if (label) {
      line += ` : ${label}`;
    }

    return line;
  }

  /**
   * Get relationship symbol
   */
  private getRelationshipSymbol(type: string): string {
    switch (type) {
      case 'inheritance':
        return '<|--';
      case 'composition':
        return '*--';
      case 'aggregation':
        return 'o--';
      case 'dependency':
        return '..>';
      case 'realization':
        return '..|>';
      default:
        return '--';
    }
  }
}
