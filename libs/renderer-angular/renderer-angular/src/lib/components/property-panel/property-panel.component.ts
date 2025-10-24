import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  TemplateRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PropertyPanelService, type PropertyDiagramNode } from '../../services/property-panel.service';
import { PropertyEditorComponent } from './property-editor.component';
import type { PropertySchema, PropertyDefinition } from '@grafloria/renderer';

/**
 * Property panel change event (UI-level event).
 */
export interface PropertyPanelChangeEvent {
  nodes: PropertyDiagramNode[];
  property: string;
  value: any;
}

/**
 * Validation error event.
 */
export interface ValidationErrorEvent {
  property: string;
  errors: string[];
}

/**
 * Save event.
 */
export interface SaveEvent {
  nodes: PropertyDiagramNode[];
  changes: Record<string, any>;
}

/**
 * Property panel component for editing diagram node properties.
 * Displays editable properties based on PropertySchema.
 *
 * Features:
 * - Schema-driven dynamic rendering
 * - Multi-node editing with mixed value detection
 * - Validation with inline error display
 * - Conditional property visibility
 * - Collapsible property groups
 * - Immediate and deferred update modes
 * - Responsive design
 * - WCAG 2.1 Level AA accessible
 *
 * @example
 * ```html
 * <diagram-property-panel
 *   [selectedNodes]="selectedNodes"
 *   [updateMode]="'immediate'"
 *   [showHeader]="true"
 *   (propertyChanged)="onPropertyChange($event)">
 * </diagram-property-panel>
 * ```
 */
@Component({
  selector: 'diagram-property-panel',
  standalone: true,
  imports: [CommonModule, PropertyEditorComponent],
  templateUrl: './property-panel.component.html',
  styleUrls: ['./property-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PropertyPanelComponent implements OnInit, OnDestroy {
  /**
   * Selected node(s) to edit.
   * Can be single node or array for multi-node editing.
   */
  @Input()
  set selectedNodes(nodes: PropertyDiagramNode | PropertyDiagramNode[] | null) {
    this._selectedNodes = nodes ? (Array.isArray(nodes) ? nodes : [nodes]) : [];
    this.loadSchema();
  }
  get selectedNodes(): PropertyDiagramNode[] {
    return this._selectedNodes;
  }
  private _selectedNodes: PropertyDiagramNode[] = [];

  /**
   * Update mode: 'immediate' or 'deferred'.
   * - immediate: Changes applied on every keystroke
   * - deferred: Changes applied only when Save button clicked
   */
  @Input() updateMode: 'immediate' | 'deferred' = 'immediate';

  /**
   * Show header section with node info.
   */
  @Input() showHeader = true;

  /**
   * Show actions menu (delete, duplicate, etc.).
   */
  @Input() showActions = false;

  /**
   * Enable collapsible groups.
   */
  @Input() collapsibleGroups = true;

  /**
   * Custom header template.
   */
  @Input() headerTemplate?: TemplateRef<any>;

  /**
   * Custom empty state template.
   */
  @Input() emptyStateTemplate?: TemplateRef<any>;

  /**
   * Custom group header template.
   */
  @Input() groupHeaderTemplate?: TemplateRef<any>;

  /**
   * Emitted when property value changes.
   */
  @Output() propertyChanged = new EventEmitter<PropertyPanelChangeEvent>();

  /**
   * Emitted when validation error occurs.
   */
  @Output() validationError = new EventEmitter<ValidationErrorEvent>();

  /**
   * Emitted when Save button clicked (deferred mode).
   */
  @Output() save = new EventEmitter<SaveEvent>();

  /**
   * Emitted when Cancel button clicked (deferred mode).
   */
  @Output() cancel = new EventEmitter<void>();

  // Internal state
  schema: PropertySchema | null = null;
  propertyGroups: Map<string, PropertyDefinition[]> = new Map();
  expandedGroups = new Set<string>();
  propertyValues = new Map<string, any>();
  propertyErrors = new Map<string, string[]>();
  isDirty = false;

  constructor(
    private propertyPanelService: PropertyPanelService,
    private changeDetectorRef: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Load saved expand/collapse state from localStorage
    this.loadExpandedGroupsState();
  }

  ngOnDestroy(): void {
    // Save expand/collapse state
    this.saveExpandedGroupsState();
  }

  /**
   * Load property schema for selected node(s).
   */
  private loadSchema(): void {
    if (this._selectedNodes.length === 0) {
      this.schema = null;
      this.propertyGroups.clear();
      this.changeDetectorRef.markForCheck();
      return;
    }

    // For multi-node, use schema of first node
    const nodeType = this._selectedNodes[0].type;

    // Check if all nodes have same type
    const allSameType = this._selectedNodes.every(n => n.type === nodeType);

    if (!allSameType) {
      console.warn('Selected nodes have different types. Showing properties for first node only.');
    }

    this.schema = this.propertyPanelService.getSchema(nodeType);

    if (!this.schema) {
      console.error(`No schema registered for node type: ${nodeType}`);
      return;
    }

    // Organize into groups
    this.propertyGroups = this.propertyPanelService.getPropertyGroups(this.schema);

    // Load initial values
    this.loadPropertyValues();

    // Expand all groups by default (first time only)
    if (this.expandedGroups.size === 0) {
      for (const groupName of this.propertyGroups.keys()) {
        this.expandedGroups.add(groupName);
      }
    }

    this.changeDetectorRef.markForCheck();
  }

  /**
   * Load property values from selected node(s).
   */
  private loadPropertyValues(): void {
    if (!this.schema || this._selectedNodes.length === 0) {
      return;
    }

    for (const property of this.schema.properties) {
      if (this._selectedNodes.length === 1) {
        // Single node: direct value
        const value = this.propertyPanelService.getPropertyValue(
          this._selectedNodes[0],
          property.key
        );
        this.propertyValues.set(property.key, value);
      } else {
        // Multi-node: check if values are same
        const values = this._selectedNodes.map(node =>
          this.propertyPanelService.getPropertyValue(node, property.key)
        );

        const allSame = values.every(v => JSON.stringify(v) === JSON.stringify(values[0]));

        if (allSame) {
          this.propertyValues.set(property.key, values[0]);
        } else {
          // Mixed values
          this.propertyValues.set(property.key, undefined);
        }
      }
    }

    this.isDirty = false;
  }

  /**
   * Handle property value change.
   */
  onPropertyChange(property: PropertyDefinition, newValue: any): void {
    // Validate
    const validation = this.propertyPanelService.validateProperty(newValue, property);

    if (!validation.valid) {
      this.propertyErrors.set(property.key, validation.errors.map(e => e.message));
      this.validationError.emit({
        property: property.key,
        errors: validation.errors.map(e => e.message)
      });
      this.changeDetectorRef.markForCheck();
      return;
    }

    // Clear errors
    this.propertyErrors.delete(property.key);

    // Update local state
    this.propertyValues.set(property.key, newValue);
    this.isDirty = true;

    // Immediate mode: update service
    if (this.updateMode === 'immediate') {
      this.applyPropertyChange(property.key, newValue);
    }

    this.changeDetectorRef.markForCheck();
  }

  /**
   * Apply property change to node(s).
   */
  private applyPropertyChange(propertyKey: string, newValue: any): void {
    if (this._selectedNodes.length === 1) {
      // Single node
      try {
        this.propertyPanelService.setPropertyValue(
          this._selectedNodes[0],
          propertyKey,
          newValue
        );

        this.propertyChanged.emit({
          nodes: this._selectedNodes,
          property: propertyKey,
          value: newValue
        });
      } catch (error) {
        console.error('Failed to set property:', error);
      }
    } else {
      // Multi-node
      try {
        this.propertyPanelService.setPropertyValues(
          this._selectedNodes,
          propertyKey,
          newValue
        );

        this.propertyChanged.emit({
          nodes: this._selectedNodes,
          property: propertyKey,
          value: newValue
        });
      } catch (error) {
        console.error('Failed to set property on multiple nodes:', error);
      }
    }
  }

  /**
   * Check if property should be visible.
   */
  isPropertyVisible(property: PropertyDefinition): boolean {
    if (!property.condition || this._selectedNodes.length === 0) {
      return true;
    }

    // For multi-node, show if ANY node satisfies condition
    return this._selectedNodes.some(node =>
      this.propertyPanelService.isPropertyVisible(node, property)
    );
  }

  /**
   * Check if property has mixed values (multi-node editing).
   */
  hasMixedValues(property: PropertyDefinition): boolean {
    if (this._selectedNodes.length <= 1) {
      return false;
    }

    const value = this.propertyValues.get(property.key);
    return value === undefined;
  }

  /**
   * Get property value or placeholder.
   */
  getPropertyValue(property: PropertyDefinition): any {
    const value = this.propertyValues.get(property.key);

    if (value === undefined && this.hasMixedValues(property)) {
      return '(multiple values)';
    }

    return value !== undefined ? value : property.defaultValue;
  }

  /**
   * Get validation errors for property.
   */
  getPropertyErrors(property: PropertyDefinition): string[] {
    return this.propertyErrors.get(property.key) || [];
  }

  /**
   * Toggle group expand/collapse.
   */
  toggleGroup(groupName: string): void {
    if (this.expandedGroups.has(groupName)) {
      this.expandedGroups.delete(groupName);
    } else {
      this.expandedGroups.add(groupName);
    }

    this.changeDetectorRef.markForCheck();
  }

  /**
   * Check if group is expanded.
   */
  isGroupExpanded(groupName: string): boolean {
    return this.expandedGroups.has(groupName);
  }

  /**
   * Save changes (deferred mode).
   */
  onSave(): void {
    if (!this.isDirty) {
      return;
    }

    // Apply all changes
    for (const property of this.schema?.properties || []) {
      const newValue = this.propertyValues.get(property.key);

      if (newValue !== undefined) {
        this.applyPropertyChange(property.key, newValue);
      }
    }

    this.isDirty = false;
    this.save.emit({
      nodes: this._selectedNodes,
      changes: Object.fromEntries(this.propertyValues)
    });

    this.changeDetectorRef.markForCheck();
  }

  /**
   * Cancel changes (deferred mode).
   */
  onCancel(): void {
    if (!this.isDirty) {
      return;
    }

    // Reload original values
    this.loadPropertyValues();
    this.cancel.emit();

    this.changeDetectorRef.markForCheck();
  }

  /**
   * Load expand/collapse state from localStorage.
   */
  private loadExpandedGroupsState(): void {
    try {
      const saved = localStorage.getItem('diagram.propertyPanel.expandedGroups');
      if (saved) {
        this.expandedGroups = new Set(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load expanded groups state:', error);
    }
  }

  /**
   * Save expand/collapse state to localStorage.
   */
  private saveExpandedGroupsState(): void {
    try {
      localStorage.setItem(
        'diagram.propertyPanel.expandedGroups',
        JSON.stringify(Array.from(this.expandedGroups))
      );
    } catch (error) {
      console.error('Failed to save expanded groups state:', error);
    }
  }

  /**
   * Track by function for property groups (performance optimization).
   */
  trackByGroupName(index: number, entry: { key: string; value: PropertyDefinition[] }): string {
    return entry.key;
  }

  /**
   * Track by function for properties (performance optimization).
   */
  trackByPropertyKey(index: number, property: PropertyDefinition): string {
    return property.key;
  }
}
