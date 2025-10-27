import { Component, OnInit, OnDestroy, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { TemplateEditorService } from './services/template-editor.service';
import { TemplateLibraryService } from './services/template-library.service';
import { UndoRedoService } from './services/undo-redo.service';
import { PerformanceMonitorService } from './services/performance-monitor.service';
import { MonacoEditorComponent } from './components/monaco-editor/monaco-editor.component';
import { PreviewPanelComponent } from './components/preview-panel/preview-panel.component';
import { TemplateSidebarComponent } from './components/template-library/template-sidebar.component';
import { PerformancePanelComponent } from './components/performance-panel/performance-panel.component';
import { DocumentationSidebarComponent } from './components/documentation-sidebar/documentation-sidebar.component';
import { SnippetPanelComponent } from './components/snippet-panel/snippet-panel.component';
// NEW IMPORTS - Foundation & Core Features
import { ButtonComponent } from './shared/components/button/button.component';
import { DataTestingPanelComponent } from './components/data-testing-panel/data-testing-panel.component';
import { EventMonitorPanelComponent } from './components/event-monitor-panel/event-monitor-panel.component';
import { PortConfigPanelComponent } from './components/port-config-panel/port-config-panel.component';
import { NodeLayerEditorComponent } from './components/node-layer-editor/node-layer-editor.component';
import { ChildNodeWizardComponent, type ChildNodeConfig } from './components/child-node-wizard/child-node-wizard.component';
import { KeyboardShortcutsService } from './services/keyboard-shortcuts.service';
import type { PortsConfig } from './components/port-config-panel/port-config-panel.component';
// PHASE 9 IMPORTS - Template Gallery
import { TemplateGalleryComponent } from './components/template-gallery/template-gallery.component';
import { TemplatePreviewModalComponent } from './components/template-preview-modal/template-preview-modal.component';
import { TemplateMetadata, TemplateActionEvent } from './models/template-metadata.model';
import { TemplateGalleryService } from './services/template-gallery.service';

/**
 * Template Builder Component
 *
 * Main orchestrator for the template builder page.
 * Provides a comprehensive environment for creating and editing node templates.
 *
 * Layout:
 * ┌──────────────────────────────────────────────────────┐
 * │  Header (toolbar with actions)                       │
 * ├─────────────┬────────────────────┬───────────────────┤
 * │             │                    │                   │
 * │  Library    │   JSON Editor      │   Live Preview    │
 * │  Sidebar    │                    │                   │
 * │  (200px)    │   (flex-1)         │   (flex-1)        │
 * │             │                    │                   │
 * └─────────────┴────────────────────┴───────────────────┘
 * │  Performance Metrics (Bottom Panel - collapsible)    │
 * └──────────────────────────────────────────────────────┘
 *
 * Responsibilities:
 * - Coordinate between all sub-components
 * - Handle keyboard shortcuts
 * - Manage layout state
 * - Integrate all services
 *
 * ~250 lines
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MonacoEditorComponent,
    PreviewPanelComponent,
    TemplateSidebarComponent,
    PerformancePanelComponent,
    DocumentationSidebarComponent,
    SnippetPanelComponent,
    // NEW COMPONENTS
    ButtonComponent,
    DataTestingPanelComponent,
    EventMonitorPanelComponent,
    PortConfigPanelComponent,
    NodeLayerEditorComponent,
    ChildNodeWizardComponent,
    // PHASE 9 COMPONENTS
    TemplateGalleryComponent,
    TemplatePreviewModalComponent
  ],
  selector: 'app-template-builder',
  templateUrl: './template-builder.component.html',
  styleUrl: './template-builder.component.css'
})
export class TemplateBuilderComponent implements OnInit, OnDestroy {

  private destroy$ = new Subject<void>();

  // Services
  editorService = inject(TemplateEditorService);
  libraryService = inject(TemplateLibraryService);
  undoRedoService = inject(UndoRedoService);
  performanceMonitorService = inject(PerformanceMonitorService);
  keyboardService = inject(KeyboardShortcutsService); // NEW
  galleryService = inject(TemplateGalleryService); // PHASE 9

  // UI State
  showPerformancePanel = false;
  showSidebar = true;
  showBottomPanel = false; // NEW
  showDocsPanel = false; // NEW: collapsible docs
  showSnippetsPanel = false; // NEW: collapsible snippets
  activeEditorTab: 'json' | 'html' | 'css' = 'json';
  activeRightTab: 'preview' | 'data' | 'ports' = 'preview'; // NEW
  activeBottomTab: 'events' | 'performance' | 'validation' = 'events'; // NEW

  // NEW: Test data for data testing panel
  testData: any = {};

  // Panel Sizes (resizable)
  leftPanelWidth = 300;
  editorPanelWidth = 500;  // NEW: resizable editor panel
  rightPanelWidth = 400;
  bottomPanelHeight = 300;
  minPanelWidth = 200;
  maxPanelWidth = 800;  // Increased max for editor
  minEditorWidth = 300;
  maxEditorWidth = 1000;
  minBottomHeight = 150;
  maxBottomHeight = 600;

  // Drag state
  private isDragging = false;
  private dragTarget: 'left' | 'editor' | 'right' | 'bottom' | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartSize = 0;

  // Node Layer Editor
  showNodeLayerEditor = false;
  currentNodePath = '';
  currentNodeHtml = '';
  currentNodeCss = '';
  private monacoEditor: any;

  // Child Node Wizard
  showChildNodeWizard = false;

  // PHASE 9: Template Gallery
  showTemplateGallery = false;
  showTemplatePreview = false;
  currentPreviewTemplate: TemplateMetadata | null = null;
  allTemplatesForPreview: TemplateMetadata[] = [];

  // ViewChild references
  @ViewChild(EventMonitorPanelComponent) eventMonitor?: EventMonitorPanelComponent;
  @ViewChild(PreviewPanelComponent) previewPanel?: PreviewPanelComponent;

  // Service observables
  canUndo$ = this.undoRedoService.canUndo$;
  canRedo$ = this.undoRedoService.canRedo$;
  editorState$ = this.editorService.state$;
  performanceMetrics$ = this.performanceMonitorService.metrics$;

  ngOnInit(): void {
    this.setupKeyboardShortcuts();
    this.setupAutoSaveHistory();
    this.initializeTestData(); // NEW
  }

  /**
   * Setup keyboard shortcuts using KeyboardShortcutsService
   */
  private setupKeyboardShortcuts(): void {
    // File operations
    this.keyboardService.register({
      key: 's',
      ctrl: true,
      description: 'Save template',
      category: 'file',
      handler: () => this.save()
    });

    this.keyboardService.register({
      key: 'e',
      ctrl: true,
      description: 'Export template',
      category: 'file',
      handler: () => this.exportTemplate()
    });

    // Edit operations
    this.keyboardService.register({
      key: 'z',
      ctrl: true,
      description: 'Undo',
      category: 'edit',
      handler: () => this.undo()
    });

    this.keyboardService.register({
      key: 'y',
      ctrl: true,
      description: 'Redo',
      category: 'edit',
      handler: () => this.redo()
    });

    this.keyboardService.register({
      key: 'z',
      ctrl: true,
      shift: true,
      description: 'Redo (alternative)',
      category: 'edit',
      handler: () => this.redo()
    });

    // View operations - Tab switching
    this.keyboardService.register({
      key: '1',
      ctrl: true,
      description: 'Switch to JSON tab',
      category: 'view',
      handler: () => this.activeEditorTab = 'json'
    });

    this.keyboardService.register({
      key: '2',
      ctrl: true,
      description: 'Switch to HTML tab',
      category: 'view',
      handler: () => this.activeEditorTab = 'html'
    });

    this.keyboardService.register({
      key: '3',
      ctrl: true,
      description: 'Switch to CSS tab',
      category: 'view',
      handler: () => this.activeEditorTab = 'css'
    });

    // View operations - Panel toggles
    this.keyboardService.register({
      key: 'b',
      ctrl: true,
      description: 'Toggle left sidebar',
      category: 'view',
      handler: () => this.toggleSidebar()
    });

    this.keyboardService.register({
      key: 'l',
      ctrl: true,
      description: 'Toggle right panel tab',
      category: 'view',
      handler: () => this.cycleRightTab()
    });

    this.keyboardService.register({
      key: 'p',
      ctrl: true,
      shift: true,
      description: 'Toggle bottom panel',
      category: 'view',
      handler: () => this.toggleBottomPanel()
    });

    // Preview operations
    this.keyboardService.register({
      key: '=',
      ctrl: true,
      description: 'Zoom in preview',
      category: 'preview',
      handler: () => this.previewPanel?.zoomIn()
    });

    this.keyboardService.register({
      key: '-',
      ctrl: true,
      description: 'Zoom out preview',
      category: 'preview',
      handler: () => this.previewPanel?.zoomOut()
    });

    this.keyboardService.register({
      key: '0',
      ctrl: true,
      description: 'Reset zoom',
      category: 'preview',
      handler: () => this.previewPanel?.resetZoom()
    });

    console.log('✅ Registered', this.keyboardService.getAllShortcuts().length, 'keyboard shortcuts');
  }

  /**
   * Initialize test data from template
   */
  private initializeTestData(): void {
    this.editorState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const template = this.editorService.parseTemplate();
        if (template?.defaultData && Object.keys(this.testData).length === 0) {
          this.testData = { ...template.defaultData };
        }
      });
  }

  /**
   * Setup auto-save to history
   * Saves state to undo/redo history every time content changes
   */
  private setupAutoSaveHistory(): void {
    this.editorState$
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500), // Wait 500ms after last change
        distinctUntilChanged((prev, curr) =>
          prev.json === curr.json &&
          prev.html === curr.html &&
          prev.css === curr.css
        )
      )
      .subscribe(state => {
        // Push to history (skip if this is from undo/redo)
        if (state.isDirty) {
          this.undoRedoService.pushState(
            state.json,
            state.html,
            state.css,
            'Edit template'
          );
        }
      });
  }

  /**
   * Handle JSON editor content change
   */
  onJsonChange(json: string): void {
    this.editorService.updateJson(json);
  }

  /**
   * Handle HTML editor content change
   */
  onHtmlChange(html: string): void {
    this.editorService.updateHtml(html);
  }

  /**
   * Handle CSS editor content change
   */
  onCssChange(css: string): void {
    this.editorService.updateCss(css);
  }

  /**
   * Handle template selection from library
   */
  onTemplateSelect(templateId: string): void {
    const preset = this.libraryService.getPresetById(templateId);
    if (preset) {
      this.editorService.loadTemplate({
        json: JSON.stringify(preset.template, null, 2),
        html: preset.htmlLayer || '',
        css: preset.cssLayer || ''
      });

      console.log(`✅ Loaded template: ${preset.name}`);
    }
  }

  /**
   * Handle snippet insertion
   */
  onSnippetInsert(event: { code: string; language: 'json' | 'html' | 'css' }): void {
    const state = this.editorService.getState();

    // Insert snippet into the appropriate editor based on language
    switch (event.language) {
      case 'json':
        this.editorService.updateJson(state.json + '\n\n' + event.code);
        this.activeEditorTab = 'json';
        break;
      case 'html':
        this.editorService.updateHtml(state.html + '\n\n' + event.code);
        this.activeEditorTab = 'html';
        break;
      case 'css':
        this.editorService.updateCss(state.css + '\n\n' + event.code);
        this.activeEditorTab = 'css';
        break;
    }

    console.log(`✅ Inserted ${event.language} snippet`);
  }

  /**
   * Undo last change
   */
  undo(): void {
    const entry = this.undoRedoService.undo();
    if (entry) {
      this.editorService.loadTemplate({
        json: entry.snapshot.json,
        html: entry.snapshot.html,
        css: entry.snapshot.css
      });
      console.log(`⬅️ Undo: ${entry.description}`);
    }
  }

  /**
   * Redo last undone change
   */
  redo(): void {
    const entry = this.undoRedoService.redo();
    if (entry) {
      this.editorService.loadTemplate({
        json: entry.snapshot.json,
        html: entry.snapshot.html,
        css: entry.snapshot.css
      });
      console.log(`➡️ Redo: ${entry.description}`);
    }
  }

  /**
   * Save template
   */
  save(): void {
    this.editorService.save();
    console.log('💾 Template saved');
  }

  /**
   * Reset to default template
   */
  reset(): void {
    if (confirm('Reset to default template? All changes will be lost.')) {
      this.editorService.reset();
      this.undoRedoService.clear();
      console.log('🔄 Reset to default template');
    }
  }

  /**
   * Export template as JSON file
   */
  exportTemplate(): void {
    const state = this.editorService.getState();
    const template = this.editorService.parseTemplate();

    if (!template) {
      alert('Cannot export: Invalid JSON');
      return;
    }

    const exportData = {
      template,
      htmlLayer: state.html,
      cssLayer: state.css
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${template.id}.template.json`;
    a.click();
    URL.revokeObjectURL(url);

    console.log('📥 Template exported');
  }

  /**
   * Import template from JSON file
   */
  importTemplate(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = (event: Event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);

          this.editorService.loadTemplate({
            json: JSON.stringify(data.template, null, 2),
            html: data.htmlLayer || '',
            css: data.cssLayer || ''
          });

          console.log('📤 Template imported');
        } catch (error) {
          alert('Failed to import template: Invalid JSON');
          console.error(error);
        }
      };

      reader.readAsText(file);
    };

    input.click();
  }

  /**
   * Toggle performance panel
   */
  togglePerformancePanel(): void {
    this.showPerformancePanel = !this.showPerformancePanel;
  }

  /**
   * Toggle sidebar
   */
  toggleSidebar(): void {
    this.showSidebar = !this.showSidebar;
  }

  /**
   * NEW: Toggle bottom panel
   */
  toggleBottomPanel(): void {
    this.showBottomPanel = !this.showBottomPanel;
  }

  /**
   * NEW: Toggle docs panel
   */
  toggleDocsPanel(): void {
    this.showDocsPanel = !this.showDocsPanel;
    // If opening docs, close snippets to avoid clutter
    if (this.showDocsPanel && this.showSnippetsPanel) {
      this.showSnippetsPanel = false;
    }
  }

  /**
   * NEW: Toggle snippets panel
   */
  toggleSnippetsPanel(): void {
    this.showSnippetsPanel = !this.showSnippetsPanel;
    // If opening snippets, close docs to avoid clutter
    if (this.showSnippetsPanel && this.showDocsPanel) {
      this.showDocsPanel = false;
    }
  }

  /**
   * NEW: Cycle through right panel tabs
   */
  cycleRightTab(): void {
    const tabs: Array<'preview' | 'data' | 'ports'> = ['preview', 'data', 'ports'];
    const currentIndex = tabs.indexOf(this.activeRightTab);
    this.activeRightTab = tabs[(currentIndex + 1) % tabs.length];
  }

  /**
   * NEW: Handle test data change
   */
  onTestDataChange(data: any): void {
    this.testData = data;
    // TODO: Update preview with new data
    console.log('✅ Test data updated:', data);
  }

  /**
   * NEW: Handle ports configuration change
   */
  onPortsConfigChange(portsConfig: PortsConfig): void {
    const currentState = this.editorService.getState();
    try {
      const template = JSON.parse(currentState.json);

      if (!template.structure) {
        template.structure = {};
      }

      template.structure.ports = portsConfig;

      this.editorService.updateJson(JSON.stringify(template, null, 2));

      console.log('✅ Ports configuration updated');
    } catch (error) {
      console.error('❌ Failed to update ports:', error);
    }
  }

  /**
   * Get current template for data testing panel
   */
  getCurrentTemplate() {
    return this.editorService.parseTemplate();
  }

  /**
   * Handle Monaco editor ready event
   */
  onEditorReady(editor: any): void {
    this.monacoEditor = editor;
    console.log('✅ Monaco editor instance captured');
  }

  /**
   * Open node layer editor for current cursor position
   */
  openNodeLayerEditor(): void {
    if (!this.monacoEditor || this.activeEditorTab !== 'json') {
      console.warn('Node layer editor only works in JSON editor mode');
      return;
    }

    try {
      // Get current cursor position
      const position = this.monacoEditor.getPosition();
      const model = this.monacoEditor.getModel();
      const content = model.getValue();

      // Parse JSON and find node at cursor
      const template = JSON.parse(content);
      const { nodePath, node } = this.findNodeAtPosition(template, position, content);

      if (node) {
        this.currentNodePath = nodePath;
        this.currentNodeHtml = node.htmlLayer || '';
        this.currentNodeCss = node.cssLayer || '';
        this.showNodeLayerEditor = true;
        console.log('📝 Opening layer editor for:', nodePath);
      } else {
        alert('Please place your cursor inside a node object to edit its layers.');
      }
    } catch (error) {
      console.error('Failed to open node layer editor:', error);
      alert('Invalid JSON or cursor position. Please ensure valid JSON and cursor is inside a node.');
    }
  }

  /**
   * Find node at cursor position in JSON
   */
  private findNodeAtPosition(template: any, position: any, content: string): { nodePath: string; node: any } {
    const lines = content.split('\n');
    let charCount = 0;
    let targetOffset = 0;

    // Calculate character offset from line/column position
    for (let i = 0; i < position.lineNumber - 1; i++) {
      charCount += lines[i].length + 1; // +1 for newline
    }
    targetOffset = charCount + position.column - 1;

    // Get content up to cursor
    const contentBeforeCursor = content.substring(0, targetOffset);

    // Count brace depth to find which object we're in
    // Strategy: Find the path by counting { and } and tracking property names

    // Check if we're in structure
    if (!contentBeforeCursor.includes('"structure"')) {
      return { nodePath: '', node: null };
    }

    // Check if we're in children array
    const childrenMatch = contentBeforeCursor.lastIndexOf('"children"');
    if (childrenMatch > -1) {
      // Count which child we're in by counting opening braces after "children": [
      const afterChildren = contentBeforeCursor.substring(childrenMatch);
      const arrayStart = afterChildren.indexOf('[');
      if (arrayStart === -1) {
        // Not in the array yet
        return { nodePath: 'structure', node: template.structure };
      }

      const inArray = afterChildren.substring(arrayStart);

      // Count opening braces to determine which child
      let braceDepth = 0;
      let childIndex = -1;

      for (let i = 0; i < inArray.length; i++) {
        const char = inArray[i];
        if (char === '{') {
          if (braceDepth === 0) {
            childIndex++;
          }
          braceDepth++;
        } else if (char === '}') {
          braceDepth--;
        }
      }

      // If we found a child index and it's within bounds
      if (childIndex >= 0 && template.structure?.children && template.structure.children[childIndex]) {
        return {
          nodePath: `structure.children[${childIndex}]`,
          node: template.structure.children[childIndex]
        };
      }
    }

    // Check if we're in repeater.itemTemplate
    const repeaterMatch = contentBeforeCursor.lastIndexOf('"repeater"');
    if (repeaterMatch > -1) {
      const afterRepeater = contentBeforeCursor.substring(repeaterMatch);
      if (afterRepeater.includes('"itemTemplate"') && template.structure?.repeater?.itemTemplate) {
        return {
          nodePath: 'structure.repeater.itemTemplate',
          node: template.structure.repeater.itemTemplate
        };
      }
    }

    // Default to structure itself
    return { nodePath: 'structure', node: template.structure };
  }

  /**
   * Save node layers back to JSON
   */
  onNodeLayersSave(layers: { html: string; css: string }): void {
    try {
      const template = this.editorService.parseTemplate();
      const pathParts = this.currentNodePath.split('.');

      // Navigate to the node
      let node: any = template;
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];

        // Handle array notation like "children[0]"
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          const [, key, index] = arrayMatch;
          node = node[key][parseInt(index, 10)];
        } else {
          node = node[part];
        }
      }

      // Update the node's layers
      if (layers.html) {
        node.htmlLayer = layers.html;
      } else {
        delete node.htmlLayer;
      }

      if (layers.css) {
        node.cssLayer = layers.css;
      } else {
        delete node.cssLayer;
      }

      // Update the editor
      this.editorService.updateJson(JSON.stringify(template, null, 2));

      console.log('✅ Node layers saved successfully');
    } catch (error) {
      console.error('❌ Failed to save node layers:', error);
      alert('Failed to save layers. Please check console for details.');
    }
  }

  /**
   * Open child node wizard
   */
  openChildNodeWizard(): void {
    this.showChildNodeWizard = true;
  }

  /**
   * Generate and insert child node from wizard configuration
   */
  onChildNodeGenerate(config: ChildNodeConfig): void {
    try {
      const template = this.editorService.parseTemplate();

      if (!template) {
        alert('Invalid JSON template');
        return;
      }

      // Ensure structure exists with required type property
      if (!template.structure) {
        template.structure = {
          type: 'container'
        } as any;
      }

      // Ensure layout exists for containers with children
      if (!template.structure.layout) {
        template.structure.layout = {
          direction: 'column',
          wrap: 'nowrap',
          justifyContent: 'start',
          alignItems: 'stretch',
          alignContent: 'start',
          gap: 8,
          padding: { top: 0, right: 0, bottom: 0, left: 0 }
        };
      }

      if (config.type === 'static') {
        // ===== STATIC CHILD NODE =====
        // Add to structure.children array
        const childNode: any = {
          type: config.nodeType,
          size: {
            width: config.width,
            height: config.height
          },
          shape: {
            type: 'rect',
            fill: '#e3f2fd',
            stroke: '#2196f3',
            strokeWidth: 2
          },
          ports: { enabled: false }
        };

        // Add position if specified (absolute positioning)
        if (config.x !== undefined && config.x !== null) {
          childNode.position = { x: config.x, y: config.y || 0 };
        }

        // Initialize children array if needed
        if (!template.structure.children) {
          template.structure.children = [];
        }

        template.structure.children.push(childNode);
        console.log('✅ Static child node added to structure.children:', childNode);

      } else {
        // ===== DYNAMIC CHILD NODES (REPEATER) =====
        // Use structure.repeater for data-driven children
        template.structure.repeater = {
          dataSource: config.dataPath || 'items',
          keyField: 'id', // You could make this configurable
          itemTemplate: {
            type: config.nodeType,
            size: {
              width: config.width,
              height: config.height
            },
            shape: {
              type: 'rect',
              fill: '#e3f2fd',
              stroke: '#2196f3',
              strokeWidth: 2
            },
            html: {
              mode: 'template',
              template: `<div style="padding: 8px; text-align: center;">{{${config.itemVariable || 'item'}}}</div>`
            },
            ports: { enabled: false }
          }
        };

        console.log('✅ Dynamic repeater configured:', template.structure.repeater);
      }

      // Update the editor
      this.editorService.updateJson(JSON.stringify(template, null, 2));

    } catch (error) {
      console.error('❌ Failed to generate child node:', error);
      alert('Failed to add child node. Please check console for details.');
    }
  }

  /**
   * Panel Resize: Start dragging
   */
  startResize(event: MouseEvent, target: 'left' | 'editor' | 'right' | 'bottom'): void {
    event.preventDefault();
    this.isDragging = true;
    this.dragTarget = target;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;

    switch (target) {
      case 'left':
        this.dragStartSize = this.leftPanelWidth;
        break;
      case 'editor':
        this.dragStartSize = this.editorPanelWidth;
        break;
      case 'right':
        this.dragStartSize = this.rightPanelWidth;
        break;
      case 'bottom':
        this.dragStartSize = this.bottomPanelHeight;
        break;
    }

    // Add global listeners
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.onMouseUp);
  }

  /**
   * Panel Resize: Handle mouse move
   */
  private onMouseMove = (event: MouseEvent): void => {
    if (!this.isDragging || !this.dragTarget) return;

    switch (this.dragTarget) {
      case 'left':
        const leftDelta = event.clientX - this.dragStartX;
        this.leftPanelWidth = Math.max(
          this.minPanelWidth,
          Math.min(this.maxPanelWidth, this.dragStartSize + leftDelta)
        );
        break;

      case 'editor':
        const editorDelta = event.clientX - this.dragStartX;
        this.editorPanelWidth = Math.max(
          this.minEditorWidth,
          Math.min(this.maxEditorWidth, this.dragStartSize + editorDelta)
        );
        break;

      case 'right':
        const rightDelta = this.dragStartX - event.clientX;
        this.rightPanelWidth = Math.max(
          this.minPanelWidth,
          Math.min(this.maxPanelWidth, this.dragStartSize + rightDelta)
        );
        break;

      case 'bottom':
        const bottomDelta = this.dragStartY - event.clientY;
        this.bottomPanelHeight = Math.max(
          this.minBottomHeight,
          Math.min(this.maxBottomHeight, this.dragStartSize + bottomDelta)
        );
        break;
    }
  };

  /**
   * Panel Resize: Stop dragging
   */
  private onMouseUp = (): void => {
    this.isDragging = false;
    this.dragTarget = null;
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  };

  /**
   * PHASE 9: Open template gallery
   */
  openTemplateGallery(): void {
    this.showTemplateGallery = true;
    console.log('📚 Template gallery opened');
  }

  /**
   * PHASE 9: Close template gallery
   */
  closeTemplateGallery(): void {
    this.showTemplateGallery = false;
    console.log('📚 Template gallery closed');
  }

  /**
   * PHASE 9: Handle template selection from gallery
   */
  onGalleryTemplateSelect(metadata: TemplateMetadata): void {
    console.log('📄 Template selected from gallery:', metadata.name);

    // Load template from gallery service
    this.galleryService.getTemplate(metadata.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (template) => {
          if (template) {
            this.editorService.loadTemplate({
              json: JSON.stringify(template, null, 2),
              html: metadata.template?.htmlLayer || '',
              css: metadata.template?.cssLayer || ''
            });

            // Increment usage count
            this.galleryService.incrementUsageCount(metadata.id);

            console.log(`✅ Loaded template from gallery: ${metadata.name}`);
          }
        },
        error: (error) => {
          console.error('❌ Failed to load template from gallery:', error);
          alert('Failed to load template. Please try again.');
        }
      });

    this.closeTemplateGallery();
  }

  /**
   * PHASE 9: Handle template actions from gallery
   */
  onGalleryTemplateAction(event: TemplateActionEvent): void {
    console.log('🎯 Template action:', event.type, event.templateId);

    switch (event.type) {
      case 'use':
        if (event.metadata) {
          this.onGalleryTemplateSelect(event.metadata);
        }
        break;

      case 'preview':
        if (event.metadata) {
          this.currentPreviewTemplate = event.metadata;
          this.showTemplatePreview = true;
        }
        break;

      case 'favorite':
        this.galleryService.toggleFavorite(event.templateId).subscribe();
        break;

      case 'duplicate':
        this.galleryService.duplicateTemplate(event.templateId).subscribe({
          next: (newId) => {
            console.log(`✅ Template duplicated: ${newId}`);
            alert('Template duplicated successfully!');
          },
          error: (error) => {
            console.error('❌ Failed to duplicate template:', error);
            alert('Failed to duplicate template.');
          }
        });
        break;

      case 'export':
        this.galleryService.exportTemplate(event.templateId).subscribe({
          next: (blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${event.metadata?.name || 'template'}.template.json`;
            a.click();
            URL.revokeObjectURL(url);
            console.log('📥 Template exported');
          },
          error: (error) => {
            console.error('❌ Failed to export template:', error);
            alert('Failed to export template.');
          }
        });
        break;

      case 'delete':
        if (confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
          this.galleryService.deleteTemplate(event.templateId).subscribe({
            next: () => {
              console.log(`✅ Template deleted: ${event.templateId}`);
            },
            error: (error) => {
              console.error('❌ Failed to delete template:', error);
              alert('Failed to delete template.');
            }
          });
        }
        break;

      case 'rate':
        this.galleryService.setRating(event.templateId, event.data?.rating || 0).subscribe();
        break;

      case 'edit':
        if (event.metadata) {
          this.onGalleryTemplateSelect(event.metadata);
        }
        break;
    }
  }

  /**
   * PHASE 9: Close template preview modal
   */
  closeTemplatePreview(): void {
    this.showTemplatePreview = false;
    this.currentPreviewTemplate = null;
  }

  /**
   * PHASE 9: Navigate preview (next/previous template)
   */
  onPreviewNavigate(direction: 'next' | 'prev'): void {
    if (!this.currentPreviewTemplate || this.allTemplatesForPreview.length === 0) {
      return;
    }

    const currentIndex = this.allTemplatesForPreview.findIndex(
      t => t.id === this.currentPreviewTemplate!.id
    );

    if (direction === 'next' && currentIndex < this.allTemplatesForPreview.length - 1) {
      this.currentPreviewTemplate = this.allTemplatesForPreview[currentIndex + 1];
    } else if (direction === 'prev' && currentIndex > 0) {
      this.currentPreviewTemplate = this.allTemplatesForPreview[currentIndex - 1];
    }
  }

  /**
   * PHASE 9: Save current template to gallery
   */
  saveToGallery(): void {
    const template = this.editorService.parseTemplate();
    const state = this.editorService.getState();

    if (!template) {
      alert('Cannot save to gallery: Invalid JSON');
      return;
    }

    const name = prompt('Enter template name:', template.id);
    if (!name) return;

    const description = prompt('Enter template description (optional):', '');

    this.galleryService.addTemplate(template, {
      name,
      description: description || undefined,
      category: 'custom',
      tags: [],
      author: 'User',
      complexity: 'medium'
    }).subscribe({
      next: (templateId) => {
        console.log(`✅ Template saved to gallery: ${templateId}`);
        alert('Template saved to gallery successfully!');
      },
      error: (error) => {
        console.error('❌ Failed to save template to gallery:', error);
        alert('Failed to save template to gallery.');
      }
    });
  }

  /**
   * Cleanup
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    // Clean up resize listeners if still active
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
  }
}
