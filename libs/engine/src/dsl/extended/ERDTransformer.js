/**
 * ERD Transformer - Converts ERD AST to DiagramModel
 *
 * Creates NodeModel instances for entities with field data,
 * and LinkModel instances for relationships.
 */
import { DiagramModel } from '../../models/DiagramModel';
import { NodeModel } from '../../models/NodeModel';
export class ERDTransformer {
    /**
     * Transform ERD diagram to DiagramModel
     */
    transform(erd, options = {}) {
        const { startPosition = { x: 100, y: 100 }, horizontalSpacing = 250, verticalSpacing = 200, entitiesPerRow = 3, } = options;
        const diagram = new DiagramModel('ERD Diagram');
        diagram.setMetadata('diagramType', 'erd');
        // Create entity nodes
        const entityNodes = new Map();
        let index = 0;
        for (const [name, entity] of erd.entities) {
            const row = Math.floor(index / entitiesPerRow);
            const col = index % entitiesPerRow;
            const x = startPosition.x + col * horizontalSpacing;
            const y = startPosition.y + row * verticalSpacing;
            const node = this.createEntityNode(entity, { x, y });
            diagram.addNode(node);
            entityNodes.set(name, node);
            index++;
        }
        // Create relationship links
        for (const relationship of erd.relationships) {
            const sourceNode = entityNodes.get(relationship.from);
            const targetNode = entityNodes.get(relationship.to);
            if (sourceNode && targetNode) {
                const link = diagram.createSmartLink(sourceNode, targetNode, 'smooth');
                if (link) {
                    // Store cardinality metadata
                    link.setMetadata('cardinality', relationship.cardinality);
                    // Set label — canonical write (metadata.label + legacy mirror)
                    if (relationship.label) {
                        link.setLabel(relationship.label);
                    }
                    // Store relationship type
                    link.setMetadata('erdRelationship', relationship.relationship);
                }
            }
        }
        return diagram;
    }
    /**
     * Create entity node
     */
    createEntityNode(entity, position) {
        const node = new NodeModel({
            id: entity.name,
            type: 'erd:entity',
            position,
            size: {
                width: 200,
                height: this.calculateEntityHeight(entity),
            },
        });
        // Set entity data
        node.data['name'] = entity.name;
        node.setLabel(entity.name); // canonical write: metadata.label + legacy mirror
        node.data['fields'] = entity.fields.map(field => ({
            name: field.name,
            type: field.type,
            primaryKey: field.primaryKey || false,
            foreignKey: field.foreignKey || false,
            unique: field.unique || false,
            notNull: field.notNull || false,
            comment: field.comment,
        }));
        // Store shape metadata for DSL generation
        node.setMetadata('dslShape', 'table');
        node.setMetadata('entityType', 'erd');
        // Set SVG renderer shape config for table rendering
        node.setMetadata('shape', {
            type: 'rect',
            cornerRadius: 0,
        });
        // Set default styles for ERD entity
        node.style.fill = '#f8f9fa';
        node.style.stroke = '#495057';
        node.style.strokeWidth = 2;
        node.style.color = '#212529';
        return node;
    }
    /**
     * Calculate entity height based on number of fields
     */
    calculateEntityHeight(entity) {
        const headerHeight = 40;
        const fieldHeight = 24;
        const padding = 20;
        const fieldsHeight = Math.max(entity.fields.length, 1) * fieldHeight;
        return headerHeight + fieldsHeight + padding;
    }
}
//# sourceMappingURL=ERDTransformer.js.map