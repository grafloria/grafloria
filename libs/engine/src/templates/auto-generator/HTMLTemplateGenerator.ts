/**
 * HTMLTemplateGenerator - Generates HTML template configurations
 *
 * Creates appropriate HTML templates based on node type, category, and family.
 * Supports:
 * - Simple templates for basic nodes (rectangles, circles, diamonds)
 * - Complex templates for structured nodes (UML classes, ERD entities)
 * - Framework-agnostic LemonadeJS template syntax
 */

import type { HtmlConfig } from '../NodeTemplate';
import type { NodeTypeDefinition } from '../../validation/TypeRegistry';

export class HTMLTemplateGenerator {
  /**
   * Generate HTML configuration for a node type
   */
  generate(typeDefinition: NodeTypeDefinition): HtmlConfig {
    const { type, category, family, label } = typeDefinition;

    // Generate CSS class name
    const className = type.replace(':', '-');

    // Complex templates for specific categories
    if (category === 'uml' && family === 'classifier') {
      return this.generateUMLClassTemplate(className);
    }

    if (category === 'erd' && family === 'entity') {
      return this.generateERDEntityTemplate(className);
    }

    if (category === 'uml' && family === 'use-case') {
      return this.generateUseCaseTemplate(className);
    }

    // Simple template for most nodes
    return this.generateSimpleTemplate(className, label || 'Node');
  }

  /**
   * Generate simple template for standard nodes
   */
  private generateSimpleTemplate(className: string, defaultLabel: string): HtmlConfig {
    return {
      mode: 'template',
      template: `
        <div class="${className}-content">
          <div class="node-label">{{data.label || '${defaultLabel}'}}</div>
        </div>
      `.trim(),
      className: className,
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        textAlign: 'center',
        wordBreak: 'break-word',
      },
    };
  }

  /**
   * Generate template for UML class nodes
   */
  private generateUMLClassTemplate(className: string): HtmlConfig {
    return {
      mode: 'template',
      template: `
        <div class="uml-class-container">
          <div class="class-header">
            {{data.stereotype ? '&laquo;' + data.stereotype + '&raquo;' : ''}}
            <div class="class-name">{{data.name || 'Class'}}</div>
          </div>
          <div class="divider"></div>
          <div class="attributes-section">
            {{#if data.attributes}}
              {{#each data.attributes}}
                <div class="attribute">
                  <span class="visibility">{{this.visibility}}</span>
                  <span class="name">{{this.name}}</span>:
                  <span class="type">{{this.type}}</span>
                </div>
              {{/each}}
            {{else}}
              <div class="empty-section"></div>
            {{/if}}
          </div>
          <div class="divider"></div>
          <div class="methods-section">
            {{#if data.methods}}
              {{#each data.methods}}
                <div class="method">
                  <span class="visibility">{{this.visibility}}</span>
                  <span class="name">{{this.name}}</span>({{this.params}}):
                  <span class="return-type">{{this.returnType}}</span>
                </div>
              {{/each}}
            {{else}}
              <div class="empty-section"></div>
            {{/if}}
          </div>
        </div>
      `.trim(),
      className: className,
      style: {
        fontFamily: 'monospace',
        fontSize: '12px',
        padding: '0',
      },
    };
  }

  /**
   * Generate template for ERD entity nodes
   */
  private generateERDEntityTemplate(className: string): HtmlConfig {
    return {
      mode: 'template',
      template: `
        <div class="erd-entity-container">
          <div class="entity-header">
            {{data.name || 'Entity'}}
          </div>
          <div class="divider"></div>
          <div class="fields-section">
            {{#if data.fields}}
              {{#each data.fields}}
                <div class="field" data-field-id="{{this.name}}">
                  {{#if this.primaryKey}}<span class="pk-indicator">PK</span>{{/if}}
                  {{#if this.foreignKey}}<span class="fk-indicator">FK</span>{{/if}}
                  <span class="field-name {{#if this.primaryKey}}primary-key{{/if}}">
                    {{this.name}}
                  </span>:
                  <span class="field-type">{{this.type}}</span>
                  {{#if this.notNull}}<span class="constraint">NOT NULL</span>{{/if}}
                </div>
              {{/each}}
            {{else}}
              <div class="empty-section">No fields</div>
            {{/if}}
          </div>
        </div>
      `.trim(),
      className: className,
      style: {
        fontFamily: 'monospace',
        fontSize: '12px',
        padding: '0',
      },
    };
  }

  /**
   * Generate template for UML use case nodes
   */
  private generateUseCaseTemplate(className: string): HtmlConfig {
    return {
      mode: 'template',
      template: `
        <div class="${className}-content">
          <div class="use-case-name">{{data.name || 'Use Case'}}</div>
          {{#if data.description}}
            <div class="use-case-description">{{data.description}}</div>
          {{/if}}
        </div>
      `.trim(),
      className: className,
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        textAlign: 'center',
      },
    };
  }

  /**
   * Get default template for a specific category
   */
  getDefaultForCategory(category: string): HtmlConfig {
    switch (category) {
      case 'uml':
        return this.generateSimpleTemplate('uml-node', 'UML Element');
      case 'erd':
        return this.generateSimpleTemplate('erd-node', 'ERD Element');
      case 'bpmn':
        return this.generateSimpleTemplate('bpmn-node', 'BPMN Element');
      case 'flowchart':
        return this.generateSimpleTemplate('flowchart-node', 'Flowchart Element');
      default:
        return this.generateSimpleTemplate('node', 'Node');
    }
  }
}
