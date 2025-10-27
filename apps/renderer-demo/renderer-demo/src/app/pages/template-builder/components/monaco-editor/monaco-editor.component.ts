import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ElementRef,
  ViewChild,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';

// Monaco types (will be loaded dynamically)
declare const monaco: any;

/**
 * Monaco Editor Component
 *
 * Angular wrapper for Monaco Editor with dynamic loading.
 * Supports JSON, HTML, CSS, and other languages.
 *
 * Features:
 * - Dynamic Monaco loading
 * - Language-specific configuration
 * - Line numbers, code folding, minimap
 * - Syntax highlighting
 * - Auto-completion (when schema provided)
 * - Theme support (light/dark)
 *
 * ~200 lines
 */
@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-monaco-editor',
  template: `
    <div class="monaco-editor-container" #editorContainer></div>
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .monaco-editor-container {
      width: 100%;
      height: 100%;
    }
  `]
})
export class MonacoEditorComponent implements OnInit, AfterViewInit, OnDestroy, OnChanges {

  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef;

  @Input() content = '';
  @Input() language: 'json' | 'html' | 'css' | 'typescript' | 'javascript' = 'json';
  @Input() theme: 'vs' | 'vs-dark' | 'hc-black' = 'vs';
  @Input() readOnly = false;
  @Input() minimap = true;
  @Input() lineNumbers: 'on' | 'off' | 'relative' = 'on';

  @Output() contentChange = new EventEmitter<string>();
  @Output() editorReady = new EventEmitter<any>();

  private editor: any;
  private monacoLoaded = false;

  ngOnInit(): void {
    this.loadMonaco();
  }

  ngAfterViewInit(): void {
    // Editor will be initialized after Monaco loads
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Update content if it changed externally
    if (changes['content'] && !changes['content'].firstChange && this.editor) {
      const currentValue = this.editor.getValue();
      if (changes['content'].currentValue !== currentValue) {
        this.editor.setValue(changes['content'].currentValue);
      }
    }

    // Update theme if it changed
    if (changes['theme'] && !changes['theme'].firstChange && this.monacoLoaded) {
      monaco.editor.setTheme(changes['theme'].currentValue);
    }

    // Update language if it changed
    if (changes['language'] && !changes['language'].firstChange && this.editor) {
      const model = this.editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, changes['language'].currentValue);
      }
    }
  }

  ngOnDestroy(): void {
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }

  /**
   * Load Monaco Editor dynamically
   */
  private loadMonaco(): void {
    if (typeof monaco !== 'undefined') {
      this.monacoLoaded = true;
      this.initMonaco();
      return;
    }

    // Load Monaco from assets
    const script = document.createElement('script');
    script.src = 'assets/monaco-editor/min/vs/loader.js';
    script.onload = () => {
      (window as any).require.config({
        paths: { vs: 'assets/monaco-editor/min/vs' }
      });

      (window as any).require(['vs/editor/editor.main'], () => {
        this.monacoLoaded = true;
        this.initMonaco();
      });
    };
    script.onerror = () => {
      console.error('Failed to load Monaco Editor');
    };
    document.body.appendChild(script);
  }

  /**
   * Initialize Monaco Editor
   */
  private initMonaco(): void {
    if (!this.editorContainer || !this.monacoLoaded) {
      return;
    }

    // Create editor instance
    this.editor = monaco.editor.create(this.editorContainer.nativeElement, {
      value: this.content,
      language: this.language,
      theme: this.theme,
      readOnly: this.readOnly,
      automaticLayout: true, // Auto-resize with container
      minimap: {
        enabled: this.minimap
      },
      lineNumbers: this.lineNumbers,
      fontSize: 13,
      tabSize: 2,
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      folding: true,
      foldingStrategy: 'indentation',
      formatOnPaste: true,
      formatOnType: true,
      autoClosingBrackets: 'always',
      autoClosingQuotes: 'always',
      bracketPairColorization: {
        enabled: true
      },
      renderWhitespace: 'selection',
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      mouseWheelZoom: true,
      contextmenu: true,
      quickSuggestions: true,
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnCommitCharacter: true,
      acceptSuggestionOnEnter: 'on',
      snippetSuggestions: 'top',
      // Performance optimizations
      glyphMargin: false,
      fixedOverflowWidgets: true
    });

    // Listen for content changes
    this.editor.onDidChangeModelContent(() => {
      const value = this.editor.getValue();
      this.contentChange.emit(value);
    });

    // Emit editor ready event
    this.editorReady.emit(this.editor);

    console.log(`✅ Monaco editor initialized (${this.language})`);
  }

  /**
   * Get the Monaco editor instance
   */
  public getEditor(): any {
    return this.editor;
  }

  /**
   * Set editor content programmatically
   */
  public setValue(value: string): void {
    if (this.editor) {
      this.editor.setValue(value);
    }
  }

  /**
   * Get current editor content
   */
  public getValue(): string {
    return this.editor ? this.editor.getValue() : '';
  }

  /**
   * Format document
   */
  public formatDocument(): void {
    if (this.editor) {
      this.editor.getAction('editor.action.formatDocument').run();
    }
  }

  /**
   * Focus the editor
   */
  public focus(): void {
    if (this.editor) {
      this.editor.focus();
    }
  }
}
