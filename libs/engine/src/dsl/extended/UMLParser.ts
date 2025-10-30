/**
 * UML Parser - Parses UML Class Diagram syntax
 *
 * Supports Mermaid-compatible class diagram syntax:
 * - Class definitions with attributes and methods
 * - Visibility (public, private, protected)
 * - Relationships (inheritance, composition, aggregation, association)
 * - Abstract classes and interfaces
 */

export type Visibility = '+' | '-' | '#' | '~'; // public, private, protected, package

export interface UMLAttribute {
  visibility: Visibility;
  name: string;
  type: string;
  isStatic?: boolean;
  defaultValue?: string;
}

export interface UMLMethod {
  visibility: Visibility;
  name: string;
  parameters: UMLParameter[];
  returnType?: string;
  isStatic?: boolean;
  isAbstract?: boolean;
}

export interface UMLParameter {
  name: string;
  type: string;
}

export interface UMLClass {
  name: string;
  stereotype?: string; // <<interface>>, <<abstract>>, etc.
  attributes: UMLAttribute[];
  methods: UMLMethod[];
}

export type RelationshipType =
  | 'inheritance'      // <|--
  | 'composition'      // *--
  | 'aggregation'      // o--
  | 'association'      // --
  | 'dependency'       // ..>
  | 'realization';     // ..|>

export interface UMLRelationship {
  from: string;
  to: string;
  type: RelationshipType;
  label?: string;
  multiplicity?: {
    from?: string;
    to?: string;
  };
}

export interface UMLDiagram {
  classes: Map<string, UMLClass>;
  relationships: UMLRelationship[];
}

export class UMLParser {
  /**
   * Parse UML class diagram text
   *
   * Syntax:
   * classDiagram
   *   class Animal {
   *     <<abstract>>
   *     +String name
   *     +int age
   *     +makeSound() void
   *   }
   *   class Dog {
   *     +bark() void
   *   }
   *   Animal <|-- Dog
   */
  parse(text: string): UMLDiagram {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));

    // Skip 'classDiagram' declaration
    let startIndex = 0;
    if (lines[0]?.toLowerCase().includes('classdiagram')) {
      startIndex = 1;
    }

    const classes = new Map<string, UMLClass>();
    const relationships: UMLRelationship[] = [];

    let i = startIndex;
    while (i < lines.length) {
      const line = lines[i];

      // Class definition
      if (line.startsWith('class ')) {
        const className = line.match(/class\s+(\w+)/)?.[1];
        if (className && lines[i + 1]?.includes('{')) {
          i++; // Move to opening brace

          const classData = this.parseClass(className, lines, i);
          classes.set(className, classData.class);
          i = classData.endIndex;
          continue;
        }
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

    return { classes, relationships };
  }

  /**
   * Parse class definition
   */
  private parseClass(className: string, lines: string[], startIndex: number): {
    class: UMLClass;
    endIndex: number;
  } {
    const umlClass: UMLClass = {
      name: className,
      attributes: [],
      methods: [],
    };

    let i = startIndex + 1; // Skip opening brace

    while (i < lines.length && !lines[i].includes('}')) {
      const line = lines[i].trim();

      if (!line) {
        i++;
        continue;
      }

      // Stereotype
      if (line.startsWith('<<') && line.endsWith('>>')) {
        umlClass.stereotype = line.slice(2, -2);
        i++;
        continue;
      }

      // Attribute or method
      if (this.isMethod(line)) {
        const method = this.parseMethod(line);
        if (method) {
          umlClass.methods.push(method);
        }
      } else {
        const attribute = this.parseAttribute(line);
        if (attribute) {
          umlClass.attributes.push(attribute);
        }
      }

      i++;
    }

    return { class: umlClass, endIndex: i };
  }

  /**
   * Check if line is a method
   */
  private isMethod(line: string): boolean {
    return line.includes('(') && line.includes(')');
  }

  /**
   * Parse attribute
   * Format: +name: type = defaultValue
   */
  private parseAttribute(line: string): UMLAttribute | null {
    const match = line.match(/([+\-#~])\s*(\w+)\s*:\s*(\w+)(?:\s*=\s*(.+))?/);
    if (!match) return null;

    const [, visibility, name, type, defaultValue] = match;

    return {
      visibility: visibility as Visibility,
      name,
      type,
      defaultValue: defaultValue?.trim(),
      isStatic: line.includes('$'), // Static indicated by $
    };
  }

  /**
   * Parse method
   * Format: +methodName(param1: type1, param2: type2): returnType
   */
  private parseMethod(line: string): UMLMethod | null {
    const match = line.match(/([+\-#~])\s*(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?/);
    if (!match) return null;

    const [, visibility, name, paramsStr, returnType] = match;

    // Parse parameters
    const parameters: UMLParameter[] = [];
    if (paramsStr.trim()) {
      const paramParts = paramsStr.split(',');
      for (const part of paramParts) {
        const paramMatch = part.trim().match(/(\w+)\s*:\s*(\w+)/);
        if (paramMatch) {
          parameters.push({
            name: paramMatch[1],
            type: paramMatch[2],
          });
        }
      }
    }

    return {
      visibility: visibility as Visibility,
      name,
      parameters,
      returnType: returnType?.trim(),
      isStatic: line.includes('$'),
      isAbstract: line.includes('*'), // Abstract indicated by *
    };
  }

  /**
   * Check if line is a relationship
   */
  private isRelationshipLine(line: string): boolean {
    return /(<\|--|[*o]--|--[*o>]|\.\.>|\.\.\|>)/.test(line);
  }

  /**
   * Parse relationship
   */
  private parseRelationship(line: string): UMLRelationship | null {
    // Match: Class1 <|-- Class2 : label
    const match = line.match(/(\w+)\s+([<*o.\-|>]+)\s+(\w+)(?:\s*:\s*(.+))?/);
    if (!match) return null;

    const [, from, relSymbol, to, label] = match;

    const type = this.parseRelationshipType(relSymbol);

    return {
      from,
      to,
      type,
      label: label?.trim(),
    };
  }

  /**
   * Parse relationship type from symbol
   */
  private parseRelationshipType(symbol: string): RelationshipType {
    if (symbol.includes('<|--')) return 'inheritance';
    if (symbol.includes('*--')) return 'composition';
    if (symbol.includes('o--')) return 'aggregation';
    if (symbol.includes('..>')) return 'dependency';
    if (symbol.includes('..|>')) return 'realization';
    return 'association';
  }
}
