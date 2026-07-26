/**
 * ERD Parser - Parses Entity Relationship Diagram syntax
 *
 * Supports Mermaid-compatible ERD syntax:
 * - Entity definitions with fields
 * - Relationships with cardinality
 * - Field types and constraints
 * - Primary keys (PK) and Foreign keys (FK)
 */
export class ERDParser {
    /**
     * Parse ERD text
     *
     * Syntax:
     * erDiagram
     *   CUSTOMER {
     *     int id PK
     *     string name
     *     string email
     *   }
     *   ORDER {
     *     int id PK
     *     int customer_id FK
     *     date order_date
     *   }
     *   CUSTOMER ||--o{ ORDER : places
     */
    parse(text) {
        var _a;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
        // Skip 'erDiagram' declaration
        let startIndex = 0;
        if ((_a = lines[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('erdiagram')) {
            startIndex = 1;
        }
        const entities = new Map();
        const relationships = [];
        let i = startIndex;
        while (i < lines.length) {
            const line = lines[i];
            // Entity definition
            if (line.includes('{')) {
                const entityName = line.split('{')[0].trim();
                const fields = [];
                i++;
                while (i < lines.length && !lines[i].includes('}')) {
                    const fieldLine = lines[i].trim();
                    if (fieldLine) {
                        const field = this.parseField(fieldLine);
                        if (field) {
                            fields.push(field);
                        }
                    }
                    i++;
                }
                entities.set(entityName, { name: entityName, fields });
                i++; // Skip closing brace
                continue;
            }
            // Relationship
            if (this.isRelationshipLine(line)) {
                const rel = this.parseRelationship(line);
                if (rel) {
                    relationships.push(rel);
                }
            }
            i++;
        }
        return { entities, relationships };
    }
    /**
     * Parse field definition
     * Format: type name [PK] [FK] [NOT NULL] [UNIQUE] "comment"
     */
    parseField(line) {
        var _a;
        const parts = line.split(/\s+/);
        if (parts.length < 2)
            return null;
        const type = parts[0];
        const name = parts[1];
        const field = { type, name };
        // Parse constraints
        for (let i = 2; i < parts.length; i++) {
            const part = parts[i].toUpperCase();
            if (part === 'PK') {
                field.primaryKey = true;
            }
            else if (part === 'FK') {
                field.foreignKey = true;
            }
            else if (part === 'UNIQUE') {
                field.unique = true;
            }
            else if (part === 'NOT' && ((_a = parts[i + 1]) === null || _a === void 0 ? void 0 : _a.toUpperCase()) === 'NULL') {
                field.notNull = true;
                i++; // Skip 'NULL'
            }
            else if (part.startsWith('"') || part.startsWith("'")) {
                // Comment
                field.comment = part.replace(/["']/g, '');
            }
        }
        return field;
    }
    /**
     * Check if line is a relationship
     */
    isRelationshipLine(line) {
        return /\|[o|]\-\-[o|]\{|\}\|/.test(line);
    }
    /**
     * Parse relationship line
     * Format: ENTITY1 ||--o{ ENTITY2 : label
     *
     * Cardinality symbols:
     * ||  exactly one
     * |o  zero or one
     * }{  one or many
     * }o  zero or many
     */
    parseRelationship(line) {
        // Match: ENTITY1 CARDINALITY ENTITY2 : label
        const match = line.match(/(\w+)\s+([\|o]\{?[\|o]?--[\|o]?\}?[\|o])\s+(\w+)(?:\s*:\s*(.+))?/);
        if (!match)
            return null;
        const [, from, cardinalityStr, to, label] = match;
        // Parse cardinality
        const fromCard = this.parseCardinality(cardinalityStr.split('--')[0]);
        const toCard = this.parseCardinality(cardinalityStr.split('--')[1]);
        return {
            from,
            to,
            cardinality: {
                from: fromCard,
                to: toCard,
            },
            relationship: 'references',
            label,
        };
    }
    /**
     * Parse cardinality symbol
     */
    parseCardinality(symbol) {
        if (symbol.includes('||'))
            return 'exactly-one';
        if (symbol.includes('|o'))
            return 'zero-or-one';
        if (symbol.includes('}{'))
            return 'one-or-many';
        if (symbol.includes('}o'))
            return 'zero-or-many';
        return 'exactly-one'; // Default
    }
}
//# sourceMappingURL=ERDParser.js.map