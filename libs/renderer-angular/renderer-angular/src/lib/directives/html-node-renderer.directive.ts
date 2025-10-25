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

    const node = this.htmlNodeRenderer;
    if (!node || !this.nodeType) {
      return;
    }

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

  ngOnDestroy() {
    if (this.componentRef) {
      this.componentRef.destroy();
    }
  }
}
