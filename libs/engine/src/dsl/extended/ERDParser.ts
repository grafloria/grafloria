/**
 * ERD Parser - Parses Entity Relationship Diagram syntax
 *
 * Supports Mermaid-compatible ERD syntax:
 * - Entity definitions with fields
 * - Relationships with cardinality
 * - Field types and constraints
 * - Primary keys (PK) and Foreign keys (FK)
 */

import { Token, TokenType } from '../types/Token';

export interface ERDEntity {
  name: string;
  fields: ERDField[];
  alias?: string;
}

export interface ERDField {
  name: string;
  type: string;
  primaryKey?: boolean;
  foreignKey?: boolean;
  unique?: boolean;
  notNull?: boolean;
  comment?: string;
}

export interface ERDRelationship {
  from: string;
  to: string;
  cardinality: {
    from: 'zero-or-one' | 'exactly-one' | 'zero-or-many' | 'one-or-many';
    to: 'zero-or-one' | 'exactly-one' | 'zero-or-many' | 'one-or-many';
  };
  relationship: 'identifies' | 'references';
  label?: string;
}

export interface ERDDiagram {
  entities: Map<string, ERDEntity>;
  relationships: ERDRelationship[];
}

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
  parse(text: string): ERDDiagram {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));

    // Skip 'erDiagram' declaration
    let startIndex = 0;
    if (lines[0]?.toLowerCase().includes('erdiagram')) {
      startIndex = 1;
    }

    const entities = new Map<string, ERDEntity>();
    const relationships: ERDRelationship[] = [];

    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];

      // Entity definition
      if (line.includes('{')) {
        const entityName = line.split('{')[0].trim();
        const fields: ERDField[] = [];

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
  private parseField(line: string): ERDField | null {
    const parts = line.split(/\s+/);
    if (parts.length < 2) return null;

    const type = parts[0];
    const name = parts[1];

    const field: ERDField = { type, name };

    // Parse constraints
    for (let i = 2; i < parts.length; i++) {
      const part = parts[i].toUpperCase();

      if (part === 'PK') {
        field.primaryKey = true;
      } else if (part === 'FK') {
        field.foreignKey = true;
      } else if (part === 'UNIQUE') {
        field.unique = true;
      } else if (part === 'NOT' && parts[i + 1]?.toUpperCase() === 'NULL') {
        field.notNull = true;
        i++; // Skip 'NULL'
      } else if (part.startsWith('"') || part.startsWith("'")) {
        // Comment
        field.comment = part.replace(/["']/g, '');
      }
    }

    return field;
  }

  /**
   * Check if line is a relationship
   */
  private isRelationshipLine(line: string): boolean {
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
  private parseRelationship(line: string): ERDRelationship | null {
    // Match: ENTITY1 CARDINALITY ENTITY2 : label
    const match = line.match(/(\w+)\s+([\|o]\{?[\|o]?--[\|o]?\}?[\|o])\s+(\w+)(?:\s*:\s*(.+))?/);

    if (!match) return null;

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
  private parseCardinality(symbol: string): 'zero-or-one' | 'exactly-one' | 'zero-or-many' | 'one-or-many' {
    if (symbol.includes('||')) return 'exactly-one';
    if (symbol.includes('|o')) return 'zero-or-one';
    if (symbol.includes('}{')) return 'one-or-many';
    if (symbol.includes('}o')) return 'zero-or-many';

    return 'exactly-one'; // Default
  }
}
