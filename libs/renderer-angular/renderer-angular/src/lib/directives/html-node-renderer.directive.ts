import { Directive, Input, ViewContainerRef, OnInit, OnChanges, SimpleChanges, EnvironmentInjector, createComponent, ComponentRef } from '@angular/core';
import { ComponentRendererService } from '../services/component-renderer.service';

/**
 * Directive to dynamically render HTML node components
 * React Flow pattern: declarative rendering with dynamic component loading
 */
@Directive({
  selector: '[htmlNodeRenderer]',
  standalone: true
})
export class HtmlNodeRendererDirective implements OnInit, OnChanges {
  @Input() htmlNodeRenderer: any; // The node to render
  @Input() nodeType!: string;
  @Input() engine: any; // DiagramEngine instance

  private componentRef?: ComponentRef<any>;
  private templateElement?: HTMLElement;

  constructor(
    private viewContainerRef: ViewContainerRef,
    private componentRenderer: ComponentRendererService,
    private environmentInjector: EnvironmentInjector
  ) {}

  ngOnInit() {
    this.renderComponent();
  }

  ngOnChanges(changes: SimpleChanges) {
    // PERFORMANCE FIX: Only re-render if node ID or type actually changed
    // Don't recreate component if it's the same node (same reference or same ID)
    if (changes['htmlNodeRenderer']) {
      const prev = changes['htmlNodeRenderer'].previousValue;
      const curr = changes['htmlNodeRenderer'].currentValue;

      // Skip if it's the same node reference or same node ID
      if (prev && curr && prev.id === curr.id && !changes['nodeType']) {
        return; // Same node, no need to recreate component
      }
    }

    if (changes['htmlNodeRenderer'] || changes['nodeType']) {
      this.renderComponent();
    }
  }

  private renderComponent() {
    // Clear existing component
    this.viewContainerRef.clear();
    if (this.componentRef) {
      this.componentRef.destroy();
    }

    // Clear any template HTML
    if (this.templateElement && this.templateElement.parentNode) {
      this.templateElement.parentNode.removeChild(this.templateElement);
      this.templateElement = undefined;
    }

    const node = this.htmlNodeRenderer;
    if (!node || !this.nodeType) {
      return;
    }

    // Check if node has HTML template data
    const htmlConfig = node.data?._html || node.metadata?.get?.('_html');

    // If template mode, render as HTML template
    if (htmlConfig && htmlConfig.mode === 'template' && htmlConfig.template) {
      this.renderTemplate(node, htmlConfig);
      return;
    }

    // Otherwise, use component mode
    // Get component class from registry
    const componentClass = this.componentRenderer.getRegisteredComponent(this.nodeType);
    if (!componentClass) {
      console.warn(`No component registered for type "${this.nodeType}"`);
      return;
    }

    // Create component instance
    this.componentRef = createComponent(componentClass, {
      environmentInjector: this.environmentInjector,
    });

    // Set node input
    if ('node' in this.componentRef.instance) {
      this.componentRef.instance.node = node;
    }

    // Set engine input (for port visibility and other engine-dependent features)
    if ('engine' in this.componentRef.instance) {
      this.componentRef.instance.engine = this.engine;
    }

    // Append to view
    this.viewContainerRef.insert(this.componentRef.hostView);
  }

  private renderTemplate(node: any, htmlConfig: any) {
    // Enhanced template rendering with :loop support
    let html = htmlConfig.template;

    // Get data source - NodeModel has node.data, GroupModel has metadata.data
    const dataSource = node.data || node.getMetadata?.('data') || {};

    // Handle :loop attribute for array iteration (LemonadeJS-style)
    // Example: <div :loop="${this.data.items}">{{self.name}}</div>
    html = this.renderLoops(html, dataSource);

    // Replace {{data.key}} with dataSource[key]
    html = html.replace(/\{\{data\.(\w+)\}\}/g, (match: string, key: string) => {
      return dataSource[key] ?? '';
    });

    // Handle conditional blocks {{#data.key}}...{{/data.key}}
    html = html.replace(/\{\{#data\.(\w+)\}\}(.*?)\{\{\/data\.\1\}\}/gs, (match: string, key: string, content: string) => {
      return dataSource[key] ? content : '';
    });

    // Handle inverted conditional blocks {{^data.key}}...{{/data.key}}
    html = html.replace(/\{\{\^data\.(\w+)\}\}(.*?)\{\{\/data\.\1\}\}/gs, (match: string, key: string, content: string) => {
      return !dataSource[key] ? content : '';
    });

    // Create a div element to hold the template
    const container = document.createElement('div');
    container.innerHTML = html;

    // Apply className if specified
    if (htmlConfig.className) {
      container.classList.add(htmlConfig.className);
    }

    // Apply inline styles if specified
    if (htmlConfig.style) {
      Object.assign(container.style, htmlConfig.style);
    }

    // Insert into the DOM using ViewContainerRef
    // We need to insert the container as a root view
    const hostElement = this.viewContainerRef.element.nativeElement;

    // Insert after the anchor element (comment node)
    if (hostElement.parentNode) {
      hostElement.parentNode.insertBefore(container, hostElement.nextSibling);
      this.templateElement = container;
    }
  }

  /**
   * Render :loop attributes for array iteration (LemonadeJS-style)
   * Supports patterns like: <div :loop="${this.data.items}">{{self.name}}</div>
   */
  private renderLoops(html: string, dataSource: any): string {
    // Match elements with :loop attribute
    // Pattern: <tagName :loop="${this.data.arrayName}">...content...</tagName>
    const loopRegex = /<(\w+)([^>]*?):loop="\$\{this\.data\.(\w+)\}"([^>]*?)>(.*?)<\/\1>/gs;

    return html.replace(loopRegex, (match, tagName, attrsBefore, arrayName, attrsAfter, content) => {
      // Get the array data
      const arrayData = dataSource[arrayName];

      // If not an array or empty, return empty string
      if (!Array.isArray(arrayData) || arrayData.length === 0) {
        return '';
      }

      // Generate repeated HTML for each item
      const repeatedHtml = arrayData.map((item, index) => {
        // Replace {{self.property}} with item data
        let itemHtml = content.replace(/\{\{self\.(\w+)\}\}/g, (_m: string, prop: string) => {
          return item[prop] ?? '';
        });

        // Handle conditional blocks for item properties {{#self.prop}}...{{/self.prop}}
        itemHtml = itemHtml.replace(/\{\{#self\.(\w+)\}\}(.*?)\{\{\/self\.\1\}\}/gs, (_m: string, prop: string, conditionalContent: string) => {
          return item[prop] ? conditionalContent : '';
        });

        // Handle inverted conditional blocks {{^self.prop}}...{{/self.prop}}
        itemHtml = itemHtml.replace(/\{\{\^self\.(\w+)\}\}(.*?)\{\{\/self\.\1\}\}/gs, (_m: string, prop: string, conditionalContent: string) => {
          return !item[prop] ? conditionalContent : '';
        });

        // Reconstruct the element without :loop attribute
        return `<${tagName}${attrsBefore}${attrsAfter} data-loop-index="${index}">${itemHtml}</${tagName}>`;
      }).join('');

      return repeatedHtml;
    });
  }

  ngOnDestroy() {
    if (this.componentRef) {
      this.componentRef.destroy();
    }
    // Clean up template element
    if (this.templateElement && this.templateElement.parentNode) {
      this.templateElement.parentNode.removeChild(this.templateElement);
    }
  }
}
