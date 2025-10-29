/**
 * TemplateParser - Parse inline HTML templates for custom node rendering
 *
 * Supports inline template definitions:
 * @template myNode {
 *   <div class="custom-node">
 *     {{data.label}}
 *   </div>
 * }
 *
 * Phase 4: Advanced Features
 */

export interface TemplateDefinition {
  name: string;
  html: string;
  bindings?: string[]; // Data bindings found in template
}

export class TemplateParser {
  /**
   * Parse @template definitions from DSL text
   * @example
   * @template customNode {
   *   <div class="my-node">
   *     <h3>{{data.title}}</h3>
   *     <p>{{data.description}}</p>
   *   </div>
   * }
   */
  parseTemplateDefinitions(text: string): Map<string, TemplateDefinition> {
    const templates = new Map<string, TemplateDefinition>();

    // Match @template blocks with proper nesting support
    const templateRegex = /@template\s+(\w+)\s*\{([\s\S]*?)\n\}/gm;

    let match;
    while ((match = templateRegex.exec(text)) !== null) {
      const name = match[1];
      const html = match[2].trim();
      const bindings = this.extractBindings(html);

      templates.set(name, {
        name,
        html,
        bindings,
      });
    }

    return templates;
  }

  /**
   * Extract data bindings from template HTML
   * Finds {{data.something}} patterns
   */
  private extractBindings(html: string): string[] {
    const bindingRegex = /\{\{([^}]+)\}\}/g;
    const bindings = new Set<string>();

    let match;
    while ((match = bindingRegex.exec(html)) !== null) {
      const binding = match[1].trim();
      bindings.add(binding);
    }

    return Array.from(bindings);
  }

  /**
   * Validate template HTML (basic checks)
   * Returns array of validation errors, empty if valid
   */
  validateTemplate(template: TemplateDefinition): string[] {
    const errors: string[] = [];

    // Check for balanced HTML tags
    const openTags = template.html.match(/<(\w+)[^>]*>/g) || [];
    const closeTags = template.html.match(/<\/(\w+)>/g) || [];

    if (openTags.length !== closeTags.length) {
      errors.push(`Template "${template.name}" has unbalanced HTML tags`);
    }

    // Check for empty template
    if (!template.html.trim()) {
      errors.push(`Template "${template.name}" is empty`);
    }

    // Check for script tags (security)
    if (template.html.includes('<script')) {
      errors.push(`Template "${template.name}" contains <script> tags which are not allowed`);
    }

    return errors;
  }

  /**
   * Convert template to LemonadeJS-compatible format
   * Handles basic conversions for compatibility
   */
  convertToLemonadeFormat(html: string): string {
    // LemonadeJS uses {{}} for expressions, which matches our syntax
    // Basic conversions:

    let converted = html;

    // Convert if/else blocks (if we support them in future)
    // {{#if condition}} => @if(condition)
    converted = converted.replace(/\{\{#if\s+([^}]+)\}\}/g, '@if($1)');
    converted = converted.replace(/\{\{\/if\}\}/g, '@endif');

    // Convert loops (if we support them in future)
    // {{#each items}} => @for(item in items)
    converted = converted.replace(/\{\{#each\s+([^}]+)\}\}/g, '@for(item in $1)');
    converted = converted.replace(/\{\{\/each\}\}/g, '@endfor');

    return converted;
  }

  /**
   * Extract referenced data fields from template
   * Returns list of data properties accessed (e.g., ['title', 'description'])
   */
  extractDataFields(template: TemplateDefinition): string[] {
    const fields = new Set<string>();

    for (const binding of template.bindings || []) {
      // Extract field name from data.fieldName
      if (binding.startsWith('data.')) {
        const field = binding.substring(5).split('.')[0]; // Handle nested: data.user.name => user
        fields.add(field);
      }
    }

    return Array.from(fields);
  }

  /**
   * Generate default data schema from template
   * Returns JSON Schema-like object
   */
  generateDataSchema(template: TemplateDefinition): Record<string, any> {
    const fields = this.extractDataFields(template);
    const schema: Record<string, any> = {
      type: 'object',
      properties: {},
    };

    for (const field of fields) {
      schema.properties[field] = {
        type: 'string', // Default to string, could be inferred better
        description: `Value for ${field}`,
      };
    }

    return schema;
  }

  /**
   * Parse template metadata from comments
   * @example
   * @template myNode {
   *   <!-- @meta category: custom -->
   *   <!-- @meta description: My custom node -->
   *   <div>...</div>
   * }
   */
  parseTemplateMeta(html: string): Record<string, string> {
    const meta: Record<string, string> = {};
    const metaRegex = /<!--\s*@meta\s+(\w+):\s*([^-]+)-->/g;

    let match;
    while ((match = metaRegex.exec(html)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim();
      meta[key] = value;
    }

    return meta;
  }

  /**
   * Strip template metadata comments from HTML
   */
  stripTemplateMeta(html: string): string {
    return html.replace(/<!--\s*@meta[^-]*-->/g, '').trim();
  }

  /**
   * Check if template uses custom data format (not just data.field)
   * For advanced templates that might use computed values, etc.
   */
  isAdvancedTemplate(template: TemplateDefinition): boolean {
    for (const binding of template.bindings || []) {
      // Check for expressions beyond simple data access
      if (binding.includes('(') || binding.includes('+') || binding.includes('-')) {
        return true;
      }
      // Check for conditional/ternary expressions
      if (binding.includes('?') || binding.includes(':')) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generate a safe template ID from template name
   * Ensures valid ID format for use in systems
   */
  generateTemplateId(name: string, prefix: string = 'inline'): string {
    return `${prefix}:${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  }

  /**
   * Minify template HTML (remove unnecessary whitespace)
   * Useful for reducing template size
   */
  minifyTemplate(html: string): string {
    return html
      .replace(/\s+/g, ' ') // Multiple spaces to single
      .replace(/>\s+</g, '><') // Remove space between tags
      .replace(/\s+>/g, '>') // Remove space before closing >
      .replace(/<\s+/g, '<') // Remove space after opening <
      .trim();
  }

  /**
   * Prettify template HTML for display
   */
  prettifyTemplate(html: string): string {
    let indentLevel = 0;
    const indent = '  ';
    let pretty = '';
    let inTag = false;

    for (let i = 0; i < html.length; i++) {
      const char = html[i];
      const nextChar = html[i + 1];

      if (char === '<') {
        if (nextChar === '/') {
          indentLevel--;
          pretty += '\n' + indent.repeat(indentLevel);
        } else if (!inTag) {
          pretty += '\n' + indent.repeat(indentLevel);
        }
        inTag = true;
      }

      pretty += char;

      if (char === '>') {
        inTag = false;
        if (html[i - 1] !== '/' && nextChar !== '<') {
          indentLevel++;
        }
      }
    }

    return pretty.trim();
  }
}
