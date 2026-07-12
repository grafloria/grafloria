import { Injectable } from '@angular/core';
import type { VNode } from '@grafloria/renderer';

/**
 * VNodeRendererService
 * Converts framework-agnostic VNode trees to actual DOM/SVG elements
 */
@Injectable({
  providedIn: 'root',
})
export class VNodeRendererService {
  private readonly SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

  /**
   * Render a VNode to a DOM element
   */
  renderVNode(vnode: VNode): Element {
    // Create element based on type
    const element = this.createElement(vnode.type);

    // Apply properties
    this.applyProps(element, vnode.props);

    // Render children
    if (vnode.children && vnode.children.length > 0) {
      for (const child of vnode.children) {
        const childElement = this.renderVNode(child);
        element.appendChild(childElement);
      }
    }

    return element;
  }

  /**
   * Update an existing element with new VNode properties
   */
  updateVNode(element: Element, oldVNode: VNode, newVNode: VNode): void {
    // Get old and new props
    const oldProps = oldVNode.props || {};
    const newProps = newVNode.props || {};

    // Remove old props that don't exist in new props
    for (const key in oldProps) {
      if (!(key in newProps)) {
        this.removeProp(element, key);
      }
    }

    // Add/update new props
    for (const key in newProps) {
      if (oldProps[key] !== newProps[key]) {
        this.setProp(element, key, newProps[key]);
      }
    }

    // TODO: Handle children updates (for now, full re-render is used)
  }

  /**
   * Render VNode tree into a container
   */
  render(vnode: VNode, container: HTMLElement): void {
    // Clear container
    container.innerHTML = '';

    // Render root element
    const element = this.renderVNode(vnode);

    // Append to container
    container.appendChild(element);
  }

  /**
   * Create an element based on type
   */
  private createElement(type: string): Element {
    return document.createElementNS(this.SVG_NAMESPACE, type);
  }

  /**
   * Apply properties to an element
   */
  private applyProps(element: Element, props: Record<string, any>): void {
    for (const key in props) {
      this.setProp(element, key, props[key]);
    }
  }

  /**
   * Set a single property on an element
   */
  private setProp(element: Element, key: string, value: any): void {
    // CRITICAL: Skip undefined and null values to prevent overriding CSS
    // Setting stroke-width="undefined" as a string would override CSS animations
    if (value === undefined || value === null) {
      return;
    }

    if (key === 'textContent') {
      element.textContent = value;
      return;
    }

    if (key === 'className') {
      element.setAttribute('class', value);
      return;
    }

    // Special SVG attributes that preserve their casing. camelToKebab would
    // corrupt these genuinely-camelCase SVG attribute names (e.g. gradientUnits
    // → gradient-units), so they're set verbatim. The paint-server defs
    // (gradients/patterns/drop-shadow filters) rely on this list.
    const svgSpecialAttrs = [
      'viewBox',
      'preserveAspectRatio',
      'gradientUnits',
      'gradientTransform',
      'spreadMethod',
      'patternUnits',
      'patternContentUnits',
      'patternTransform',
      'stdDeviation',
    ];
    if (svgSpecialAttrs.includes(key)) {
      element.setAttribute(key, String(value));
      return;
    }

    // Convert camelCase to kebab-case for SVG attributes
    const attrName = this.camelToKebab(key);

    // Set attribute
    element.setAttribute(attrName, String(value));
  }

  /**
   * Remove a property from an element
   */
  private removeProp(element: Element, key: string): void {
    if (key === 'textContent') {
      element.textContent = '';
      return;
    }

    if (key === 'className') {
      element.removeAttribute('class');
      return;
    }

    // Convert camelCase to kebab-case
    const attrName = this.camelToKebab(key);

    // Remove attribute
    element.removeAttribute(attrName);
  }

  /**
   * Convert camelCase to kebab-case
   */
  private camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }
}
