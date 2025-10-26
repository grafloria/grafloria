/**
 * TemplateLoader - Utility for loading/exporting templates
 *
 * Handles:
 * - JSON string parsing
 * - Object validation
 * - Array loading
 * - Export to JSON
 */

import { NodeTemplate } from './NodeTemplate';

export class TemplateLoader {
  /**
   * Load template from JSON string
   * @throws Error if JSON is invalid or template is invalid
   */
  static fromJSON(json: string): NodeTemplate {
    try {
      const template = JSON.parse(json);
      this.validateTemplate(template);
      return template as NodeTemplate;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse template JSON: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Load template from object
   * @throws Error if template is invalid
   */
  static fromObject(obj: any): NodeTemplate {
    this.validateTemplate(obj);
    return obj as NodeTemplate;
  }

  /**
   * Load multiple templates from JSON array
   * @throws Error if JSON is invalid or not an array
   */
  static fromJSONArray(json: string): NodeTemplate[] {
    try {
      const data = JSON.parse(json);

      if (!Array.isArray(data)) {
        throw new Error('Expected array of templates');
      }

      return data.map(item => this.fromObject(item));
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse templates JSON: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Export template to JSON string
   * @param template Template to export
   * @param pretty Pretty print with indentation (default: true)
   * @returns JSON string
   */
  static toJSON(template: NodeTemplate, pretty: boolean = true): string {
    return pretty
      ? JSON.stringify(template, null, 2)
      : JSON.stringify(template);
  }

  /**
   * Export multiple templates to JSON array
   * @param templates Templates to export
   * @param pretty Pretty print with indentation (default: true)
   * @returns JSON string
   */
  static toJSONArray(templates: NodeTemplate[], pretty: boolean = true): string {
    return pretty
      ? JSON.stringify(templates, null, 2)
      : JSON.stringify(templates);
  }

  /**
   * Validate template structure
   * @throws Error if template is invalid
   */
  private static validateTemplate(template: any): void {
    if (!template) {
      throw new Error('Template is null or undefined');
    }

    if (!template.id) {
      throw new Error('Template must have an id');
    }

    if (!template.version) {
      throw new Error('Template must have a version');
    }

    if (!template.meta) {
      throw new Error('Template must have meta information');
    }

    if (!template.structure) {
      throw new Error('Template must have a structure definition');
    }

    // Validate meta fields
    if (!template.meta.name) {
      throw new Error('Template meta must have a name');
    }

    if (!template.meta.category) {
      throw new Error('Template meta must have a category');
    }

    // Validate structure
    if (!template.structure.type) {
      throw new Error('Template structure must have a type');
    }
  }
}
