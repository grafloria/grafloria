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
import { NODE_TEMPLATE_SCHEMA } from '../../schemas/node-template.schema';

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

    // Configure JSON language features (schema, validation, autocomplete)
    if (this.language === 'json') {
      this.configureJsonLanguage();
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
      // Suggestion and autocomplete settings
      quickSuggestions: {
        other: true,
        comments: false,
        strings: true
      },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnCommitCharacter: true,
      acceptSuggestionOnEnter: 'on',
      tabCompletion: 'on',
      wordBasedSuggestions: 'off',  // Disable word-based, rely on schema
      snippetSuggestions: 'inline',  // Show snippets inline with other suggestions
      suggest: {
        showProperties: true,
        showMethods: false,
        showFunctions: false,
        showKeywords: false,
        showSnippets: true,
        showWords: false,
        insertMode: 'replace',
        filterGraceful: true,
        snippetsPreventQuickSuggestions: false
      },
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
   * Configure JSON language features
   */
  private configureJsonLanguage(): void {
    if (!monaco || !monaco.languages || !monaco.languages.json) {
      console.error('Monaco JSON language service not available');
      return;
    }

    // Configure JSON language defaults
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: true,
      schemas: [
        {
          uri: 'http://grafloria.internal/schemas/node-template.json',
          fileMatch: ['*'], // Match all JSON documents in this editor
          schema: NODE_TEMPLATE_SCHEMA
        }
      ],
      enableSchemaRequest: false,
      schemaValidation: 'error',
      schemaRequest: 'error'
    });

    // Enable additional JSON features
    monaco.languages.json.jsonDefaults.setModeConfiguration({
      documentFormattingEdits: true,
      documentRangeFormattingEdits: true,
      completionItems: true,
      hovers: true,
      documentSymbols: true,
      tokens: true,
      colors: true,
      foldingRanges: true,
      diagnostics: true,
      selectionRanges: true
    });

    // Register code snippets for common patterns
    this.registerSnippets();

    console.log('✅ JSON schema registered with Monaco + custom snippets');
  }

  /**
   * Register code snippets for common template patterns
   *
   * IMPORTANT: This doesn't replace schema-based completions.
   * Monaco's JSON language service provides schema-based property suggestions automatically.
   * These snippets add additional template-specific shortcuts.
   */
  private registerSnippets(): void {
    monaco.languages.registerCompletionItemProvider('json', {
      triggerCharacters: ['"', ':'],  // Trigger on quote and colon
      provideCompletionItems: (model: any, position: any, context: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn
        };

        // Get the line content to check context
        const lineContent = model.getLineContent(position.lineNumber);
        const beforeCursor = lineContent.substring(0, position.column - 1);

        // Only show snippets when typing a word, not when inside a property key
        // This allows schema-based completions to work for property names
        const isInsidePropertyKey = beforeCursor.trim().endsWith('"') && !beforeCursor.includes(':');

        // If we're inside a property key (e.g., typing "shap|"),
        // return empty to let JSON schema completions handle it
        if (isInsidePropertyKey && context.triggerKind === monaco.languages.CompletionTriggerKind.TriggerCharacter) {
          return { suggestions: [] };
        }

        const snippets = [
          // Child Node Snippet
          {
            label: 'child-node',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Add a child node with basic structure',
            insertText: [
              '{',
              '  "type": "${1:child-type}",',
              '  "size": { "width": ${2:100}, "height": ${3:50} },',
              '  "shape": {',
              '    "type": "rect",',
              '    "fill": "${4:#ffffff}",',
              '    "stroke": "${5:#666}",',
              '    "strokeWidth": 1,',
              '    "cornerRadius": 4',
              '  },',
              '  "text": {',
              '    "content": "${6:Child Node}",',
              '    "fontSize": 12,',
              '    "fontWeight": "normal",',
              '    "fill": "#333"',
              '  }',
              '}$0'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          // Data Template Snippet
          {
            label: 'data-template',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Add data-driven rendering with items and itemTemplate',
            insertText: [
              '"data": ${1:null},',
              '"items": "${2:items}",',
              '"itemTemplate": {',
              '  "type": "${3:item}",',
              '  "size": { "width": ${4:100}, "height": ${5:40} },',
              '  "shape": {',
              '    "type": "rect",',
              '    "fill": "{{item.color || \'#fff\'}}",',
              '    "stroke": "#ccc",',
              '    "strokeWidth": 1,',
              '    "cornerRadius": 4',
              '  },',
              '  "text": {',
              '    "content": "{{item.name}}",',
              '    "fontSize": 12',
              '  }',
              '}$0'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          // Children Array Snippet
          {
            label: 'children-array',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Add children array structure',
            insertText: [
              '"children": [',
              '  {',
              '    "type": "${1:child-type}",',
              '    "size": { "width": ${2:100}, "height": ${3:50} },',
              '    "shape": {',
              '      "type": "rect",',
              '      "fill": "${4:#ffffff}"',
              '    },',
              '    "text": {',
              '      "content": "${5:Child Node}"',
              '    }',
              '  }$0',
              ']'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          // Layout Config Snippet
          {
            label: 'layout-flexbox',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Add flexbox layout configuration',
            insertText: [
              '"layout": {',
              '  "direction": "${1|row,column,row-reverse,column-reverse|}",',
              '  "wrap": "${2|nowrap,wrap,wrap-reverse|}",',
              '  "justifyContent": "${3|start,center,end,space-between,space-around,space-evenly|}",',
              '  "alignItems": "${4|start,center,end,stretch,baseline|}",',
              '  "alignContent": "start",',
              '  "gap": ${5:8},',
              '  "padding": { "top": ${6:0}, "right": ${7:0}, "bottom": ${8:0}, "left": ${9:0} }',
              '}$0'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          },
          // Ports Configuration Snippet
          {
            label: 'ports-config',
            kind: monaco.languages.CompletionItemKind.Snippet,
            documentation: 'Add ports configuration',
            insertText: [
              '"ports": {',
              '  "enabled": ${1|true,false|},',
              '  "defaultVisibility": "${2|always,on-hover,never|}",',
              '  "left": { "enabled": ${3|true,false|}, "type": "${4|input,output,bi|}" },',
              '  "right": { "enabled": ${5|true,false|}, "type": "${6|input,output,bi|}" },',
              '  "top": { "enabled": ${7|false,true|}, "type": "${8|input,output,bi|}" },',
              '  "bottom": { "enabled": ${9|false,true|}, "type": "${10|input,output,bi|}" }',
              '}$0'
            ].join('\n'),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: range
          }
        ];

        return { suggestions: snippets };
      }
    });

    console.log('✅ Code snippets registered');
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
