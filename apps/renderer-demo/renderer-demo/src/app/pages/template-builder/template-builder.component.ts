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
import { KeyboardShortcutsService } from './services/keyboard-shortcuts.service';
import type { PortsConfig } from './components/port-config-panel/port-config-panel.component';

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
    PortConfigPanelComponent
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

  // UI State
  showPerformancePanel = false;
  showSidebar = true;
  showBottomPanel = false; // NEW
  activeEditorTab: 'json' | 'html' | 'css' = 'json';
  activeRightTab: 'preview' | 'data' | 'ports' = 'preview'; // NEW
  activeBottomTab: 'events' | 'performance' | 'validation' = 'events'; // NEW

  // NEW: Test data for data testing panel
  testData: any = {};

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

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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
}
