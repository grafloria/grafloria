/**
 * StyleParser - Parse CSS-like styling syntax for nodes and diagrams
 *
 * Supports two syntax styles:
 * 1. Inline styles: A[Label]{fill:blue;stroke:red;strokeWidth:2}
 * 2. Style classes: A[Label]:::myStyle with @style myStyle { fill: blue; stroke: red; }
 *
 * Phase 4: Advanced Features
 */

import { NodeStyle } from '../../types';

export interface StyleDefinition {
  name: string;
  properties: Partial<NodeStyle>;
}

export interface ParsedInlineStyle {
  properties: Partial<NodeStyle>;
}

export class StyleParser {
  /**
   * Parse @style definitions from DSL text
   * @example
   * @style primary {
   *   fill: #3b82f6;
   *   stroke: #1e40af;
   *   strokeWidth: 2;
   *   borderRadius: 8;
   * }
   */
  parseStyleDefinitions(text: string): Map<string, Partial<NodeStyle>> {
    const styles = new Map<string, Partial<NodeStyle>>();
    const styleRegex = /@style\s+(\w+)\s*\{([^}]+)\}/g;

    let match;
    while ((match = styleRegex.exec(text)) !== null) {
      const name = match[1];
      const propertiesText = match[2];
      const properties = this.parseStyleProperties(propertiesText);
      styles.set(name, properties);
    }

    return styles;
  }

  /**
   * Parse inline style properties from string
   * @example {fill:blue;stroke:red;strokeWidth:2}
   */
  parseInlineStyle(styleText: string): Partial<NodeStyle> {
    // Remove braces if present
    const cleaned = styleText.replace(/^{|}$/g, '').trim();
    return this.parseStyleProperties(cleaned);
  }

  /**
   * Parse CSS-like style properties
   * Supports both camelCase and kebab-case properties
   */
  private parseStyleProperties(text: string): Partial<NodeStyle> {
    const properties: Partial<NodeStyle> = {};

    // Split by semicolon, handling nested values
    const declarations = text.split(';').map(d => d.trim()).filter(d => d);

    for (const declaration of declarations) {
      const colonIndex = declaration.indexOf(':');
      if (colonIndex === -1) continue;

      const property = declaration.substring(0, colonIndex).trim();
      const value = declaration.substring(colonIndex + 1).trim();

      // Convert kebab-case to camelCase
      const camelProperty = this.toCamelCase(property);

      // Parse value based on property type
      const parsedValue = this.parseStyleValue(camelProperty, value);
      if (parsedValue !== undefined) {
        (properties as any)[camelProperty] = parsedValue;
      }
    }

    return properties;
  }

  /**
   * Convert kebab-case to camelCase
   */
  private toCamelCase(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Parse style value based on property name
   */
  private parseStyleValue(property: string, value: string): any {
    // Boolean properties
    if (property === 'shadow' || property === 'animatedBorder') {
      return value.toLowerCase() === 'true' || value === '1';
    }

    // Number properties
    if (
      property === 'strokeWidth' ||
      property === 'opacity' ||
      property === 'borderRadius' ||
      property === 'fontSize' ||
      property === 'padding' ||
      property === 'zIndex' ||
      property === 'borderAnimationSpeed'
    ) {
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num;
    }

    // Array properties
    if (property === 'borderAnimationColors') {
      // Parse array: [red, blue, green] or red,blue,green
      const cleaned = value.replace(/[\[\]]/g, '').trim();
      return cleaned.split(',').map(c => c.trim());
    }

    // String properties
    return value;
  }

  /**
   * Extract style class names from node definition
   * @example A[Label]:::primary:::highlight
   * Returns: ['primary', 'highlight']
   */
  extractStyleClasses(nodeDefinition: string): string[] {
    const classRegex = /:::(\w+)/g;
    const classes: string[] = [];

    let match;
    while ((match = classRegex.exec(nodeDefinition)) !== null) {
      classes.push(match[1]);
    }

    return classes;
  }

  /**
   * Extract inline style from node definition
   * @example A[Label]{fill:blue;stroke:red}
   * Returns: {fill: 'blue', stroke: 'red'}
   */
  extractInlineStyle(nodeDefinition: string): Partial<NodeStyle> | null {
    const styleRegex = /\{([^}]+)\}$/;
    const match = nodeDefinition.match(styleRegex);

    if (!match) {
      return null;
    }

    return this.parseInlineStyle(match[1]);
  }

  /**
   * Merge multiple style objects
   * Later styles override earlier ones
   */
  mergeStyles(...styles: Array<Partial<NodeStyle> | null | undefined>): Partial<NodeStyle> {
    const merged: Partial<NodeStyle> = {};

    for (const style of styles) {
      if (style) {
        Object.assign(merged, style);
      }
    }

    return merged;
  }

  /**
   * Apply diagram-level styles
   * @style diagram { ... }
   */
  parseDiagramStyles(text: string): Partial<NodeStyle> | null {
    const diagramStyleRegex = /@style\s+diagram\s*\{([^}]+)\}/;
    const match = text.match(diagramStyleRegex);

    if (!match) {
      return null;
    }

    return this.parseStyleProperties(match[1]);
  }

  /**
   * Strip style syntax from node definition for clean parsing
   * @example A[Label]:::primary{fill:blue} => A[Label]
   */
  stripStyleSyntax(nodeDefinition: string): string {
    return nodeDefinition
      .replace(/:::\w+/g, '') // Remove style classes
      .replace(/\{[^}]+\}$/, ''); // Remove inline styles
  }
}
