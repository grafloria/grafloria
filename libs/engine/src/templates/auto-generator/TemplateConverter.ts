/**
 * TemplateConverter - Main orchestrator for auto-generating NodeTemplates
 *
 * Converts TypeRegistry entries to NodeTemplate definitions by coordinating:
 * - ShapeMapper: Shape string → ShapeConfig
 * - PortConfigGenerator: Port configuration
 * - HTMLTemplateGenerator: HTML template
 * - ValidationSchemaGenerator: JSON Schema
 *
 * Usage:
 *   const converter = new TemplateConverter();
 *   const templates = converter.convertAll(typeRegistry);
 *   await converter.generateFiles(templates, outputDir);
 */

import type { NodeTemplate } from '../NodeTemplate';
import type { NodeTypeDefinition } from '../../validation/TypeRegistry';
import { ShapeMapper } from './ShapeMapper';
import { PortConfigGenerator } from './PortConfigGenerator';
import { HTMLTemplateGenerator } from './HTMLTemplateGenerator';
import { ValidationSchemaGenerator } from './ValidationSchemaGenerator';
import * as fs from 'fs/promises';
import * as path from 'path';

export class TemplateConverter {
  private shapeMapper: ShapeMapper;
  private portGenerator: PortConfigGenerator;
  private htmlGenerator: HTMLTemplateGenerator;
  private schemaGenerator: ValidationSchemaGenerator;

  constructor() {
    this.shapeMapper = new ShapeMapper();
    this.portGenerator = new PortConfigGenerator();
    this.htmlGenerator = new HTMLTemplateGenerator();
    this.schemaGenerator = new ValidationSchemaGenerator();
  }

  /**
   * Convert a single TypeRegistry entry to a NodeTemplate
   */
  convert(entry: NodeTypeDefinition): NodeTemplate {
    // Generate template ID (replace ':' with '-')
    const templateId = entry.type.replace(':', '-');

    // Map shape configuration
    const shapeConfig = this.shapeMapper.map(entry.defaultStyle || {});

    // Generate port configuration
    const portsConfig = this.portGenerator.generate(entry);

    // Generate HTML template
    const htmlConfig = this.htmlGenerator.generate(entry);

    // Generate validation schema
    const dataSchema = this.schemaGenerator.generate(entry);

    // Map category
    const category = this.mapCategory(entry.category || 'common');

    // Build default data
    const defaultData: Record<string, any> = {
      label: entry.label || entry.type,
      ...(entry.defaultData || {}),
    };

    // Build NodeTemplate
    const template: NodeTemplate = {
      id: templateId,
      version: '1.0.0',
      meta: {
        name: entry.label || entry.type,
        description: entry.description,
        category,
        tags: this.buildTags(entry),
        author: 'Auto-Generated',
      },
      structure: {
        type: entry.type,
        size: {
          ...(entry.defaultSize || { width: 120, height: 80 }),
          ...this.getSizeConstraints(entry.category || 'common'),
        },
        shape: {
          ...shapeConfig,
          fill: entry.defaultStyle?.fill || '#FFFFFF',
          stroke: entry.defaultStyle?.stroke || '#000000',
          strokeWidth: entry.defaultStyle?.strokeWidth || 2,
          opacity: 1,
        },
        html: htmlConfig,
        ports: portsConfig,
        behavior: {
          draggable: entry.defaultBehavior?.draggable !== false,
          selectable: entry.defaultBehavior?.selectable !== false,
          connectable: entry.defaultBehavior?.connectable !== false,
          resizable: entry.defaultBehavior?.resizable || false,
          deletable: entry.defaultBehavior?.deletable !== false,
        },
      },
      defaultData,
      dataSchema,
    };

    return template;
  }

  /**
   * Convert all entries from a TypeRegistry
   */
  convertAll(typeDefinitions: NodeTypeDefinition[]): NodeTemplate[] {
    return typeDefinitions.map(entry => this.convert(entry));
  }

  /**
   * Generate template files on disk
   */
  async generateFiles(
    templates: NodeTemplate[],
    outputDir: string
  ): Promise<void> {
    // Group by category
    const grouped = this.groupByCategory(templates);

    // Generate file for each template
    for (const [category, categoryTemplates] of Object.entries(grouped)) {
      const categoryDir = path.join(outputDir, category);
      await fs.mkdir(categoryDir, { recursive: true });

      for (const template of categoryTemplates) {
        const filename = `${template.id}.template.ts`;
        const filepath = path.join(categoryDir, filename);
        const content = this.generateTemplateFile(template);
        await fs.writeFile(filepath, content, 'utf-8');
      }
    }

    // Generate index files
    await this.generateIndexFiles(outputDir, grouped);
  }

  /**
   * Map TypeRegistry category to NodeTemplate category
   */
  private mapCategory(typeCategory: string): string {
    const mapping: Record<string, string> = {
      'bpmn': 'workflow',
      'flowchart': 'workflow',
      'uml': 'diagram',
      'erd': 'diagram',
    };
    return mapping[typeCategory] || 'common';
  }

  /**
   * Get size constraints based on category
   */
  private getSizeConstraints(category: string) {
    const constraints: Record<string, any> = {
      'bpmn': { minWidth: 80, maxWidth: 300, minHeight: 60, maxHeight: 200 },
      'flowchart': { minWidth: 80, maxWidth: 250, minHeight: 50, maxHeight: 150 },
      'uml': { minWidth: 120, maxWidth: 400, minHeight: 80, maxHeight: 600 },
      'erd': { minWidth: 140, maxWidth: 350, minHeight: 70, maxHeight: 500 },
    };
    return constraints[category] || { minWidth: 80, maxWidth: 300, minHeight: 60, maxHeight: 200 };
  }

  /**
   * Build tags array from entry
   */
  private buildTags(entry: NodeTypeDefinition): string[] {
    const tags: string[] = [];

    if (entry.tags) {
      tags.push(...entry.tags);
    }

    if (entry.category) {
      tags.push(entry.category);
    }

    if (entry.family) {
      tags.push(entry.family);
    }

    // Remove duplicates
    return Array.from(new Set(tags));
  }

  /**
   * Group templates by category
   */
  private groupByCategory(templates: NodeTemplate[]): Record<string, NodeTemplate[]> {
    return templates.reduce((acc, template) => {
      // Extract category from type (e.g., 'bpmn:task' → 'bpmn')
      const category = template.structure.type.split(':')[0];
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(template);
      return acc;
    }, {} as Record<string, NodeTemplate[]>);
  }

  /**
   * Generate TypeScript file content for a template
   */
  private generateTemplateFile(template: NodeTemplate): string {
    // Convert template to formatted JSON string
    const templateJson = JSON.stringify(template, null, 2);

    // Generate camelCase variable name
    const varName = this.toCamelCase(template.id) + 'Template';

    return `/**
 * Auto-generated NodeTemplate for ${template.id}
 * Generated from TypeRegistry entry: ${template.structure.type}
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 *
 * To regenerate:
 *   npm run generate:templates
 */

import type { NodeTemplate } from '../../NodeTemplate';

export const ${varName}: NodeTemplate = ${templateJson};
`;
  }

  /**
   * Generate index files for each category
   */
  private async generateIndexFiles(
    outputDir: string,
    grouped: Record<string, NodeTemplate[]>
  ): Promise<void> {
    // Generate category index files
    for (const [category, templates] of Object.entries(grouped)) {
      const imports = templates
        .map(t => {
          const varName = this.toCamelCase(t.id) + 'Template';
          return `export { ${varName} } from './${t.id}.template';`;
        })
        .join('\n');

      const categoryIndexPath = path.join(outputDir, category, 'index.ts');
      await fs.writeFile(categoryIndexPath, imports + '\n', 'utf-8');
    }

    // Generate main index file
    const categoryExports = Object.keys(grouped)
      .map(category => `export * from './${category}';`)
      .join('\n');

    const mainIndexPath = path.join(outputDir, 'index.ts');
    const mainIndexContent = `/**
 * Auto-generated NodeTemplate exports
 *
 * DO NOT EDIT MANUALLY - Regenerate using TemplateConverter
 */

${categoryExports}
`;
    await fs.writeFile(mainIndexPath, mainIndexContent, 'utf-8');
  }

  /**
   * Convert kebab-case to camelCase
   */
  private toCamelCase(str: string): string {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  }

  /**
   * Get statistics about converted templates
   */
  getStatistics(templates: NodeTemplate[]): {
    total: number;
    byCategory: Record<string, number>;
    byFamily: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};
    const byFamily: Record<string, number> = {};

    templates.forEach(template => {
      const category = template.structure.type.split(':')[0];
      byCategory[category] = (byCategory[category] || 0) + 1;

      const family = template.meta.tags?.find(tag =>
        ['activity', 'gateway', 'event', 'entity', 'classifier'].includes(tag)
      );
      if (family) {
        byFamily[family] = (byFamily[family] || 0) + 1;
      }
    });

    return {
      total: templates.length,
      byCategory,
      byFamily,
    };
  }
}
