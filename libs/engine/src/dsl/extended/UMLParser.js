/**
 * UML Parser - Parses UML Class Diagram syntax
 *
 * Supports Mermaid-compatible class diagram syntax:
 * - Class definitions with attributes and methods
 * - Visibility (public, private, protected)
 * - Relationships (inheritance, composition, aggregation, association)
 * - Abstract classes and interfaces
 */
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
    parse(text) {
        var _a, _b, _c;
        const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
        // Skip 'classDiagram' declaration
        let startIndex = 0;
        if ((_a = lines[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('classdiagram')) {
            startIndex = 1;
        }
        const classes = new Map();
        const relationships = [];
        let i = startIndex;
        while (i < lines.length) {
            const line = lines[i];
            // Class definition
            if (line.startsWith('class ')) {
                const className = (_b = line.match(/class\s+(\w+)/)) === null || _b === void 0 ? void 0 : _b[1];
                if (className && ((_c = lines[i + 1]) === null || _c === void 0 ? void 0 : _c.includes('{'))) {
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
    parseClass(className, lines, startIndex) {
        const umlClass = {
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
            }
            else {
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
    isMethod(line) {
        return line.includes('(') && line.includes(')');
    }
    /**
     * Parse attribute
     * Format: +name: type = defaultValue
     */
    parseAttribute(line) {
        const match = line.match(/([+\-#~])\s*(\w+)\s*:\s*(\w+)(?:\s*=\s*(.+))?/);
        if (!match)
            return null;
        const [, visibility, name, type, defaultValue] = match;
        return {
            visibility: visibility,
            name,
            type,
            defaultValue: defaultValue === null || defaultValue === void 0 ? void 0 : defaultValue.trim(),
            isStatic: line.includes('$'), // Static indicated by $
        };
    }
    /**
     * Parse method
     * Format: +methodName(param1: type1, param2: type2): returnType
     */
    parseMethod(line) {
        const match = line.match(/([+\-#~])\s*(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\w+))?/);
        if (!match)
            return null;
        const [, visibility, name, paramsStr, returnType] = match;
        // Parse parameters
        const parameters = [];
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
            visibility: visibility,
            name,
            parameters,
            returnType: returnType === null || returnType === void 0 ? void 0 : returnType.trim(),
            isStatic: line.includes('$'),
            isAbstract: line.includes('*'), // Abstract indicated by *
        };
    }
    /**
     * Check if line is a relationship
     */
    isRelationshipLine(line) {
        return /(<\|--|[*o]--|--[*o>]|\.\.>|\.\.\|>)/.test(line);
    }
    /**
     * Parse relationship
     */
    parseRelationship(line) {
        // Match: Class1 <|-- Class2 : label
        const match = line.match(/(\w+)\s+([<*o.\-|>]+)\s+(\w+)(?:\s*:\s*(.+))?/);
        if (!match)
            return null;
        const [, from, relSymbol, to, label] = match;
        const type = this.parseRelationshipType(relSymbol);
        return {
            from,
            to,
            type,
            label: label === null || label === void 0 ? void 0 : label.trim(),
        };
    }
    /**
     * Parse relationship type from symbol
     */
    parseRelationshipType(symbol) {
        if (symbol.includes('<|--'))
            return 'inheritance';
        if (symbol.includes('*--'))
            return 'composition';
        if (symbol.includes('o--'))
            return 'aggregation';
        if (symbol.includes('..>'))
            return 'dependency';
        if (symbol.includes('..|>'))
            return 'realization';
        return 'association';
    }
}
//# sourceMappingURL=UMLParser.js.map