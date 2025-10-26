import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * JSON Editor Component
 *
 * Simple textarea-based JSON editor.
 * Future enhancement: Integrate Monaco Editor for advanced features.
 *
 * Features:
 * - Syntax highlighting (via CSS)
 * - Auto-indentation
 * - Format button
 *
 * ~120 lines
 */
@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-json-editor',
  templateUrl: './json-editor.component.html',
  styleUrl: './json-editor.component.css'
})
export class JsonEditorComponent implements OnInit, OnDestroy {

  @Input() content = '';
  @Output() contentChange = new EventEmitter<string>();

  editorContent = '';

  constructor(private elementRef: ElementRef) {}

  ngOnInit(): void {
    this.editorContent = this.content;
  }

  ngOnDestroy(): void {
    // Cleanup if needed
  }

  /**
   * Handle content change
   */
  onContentChange(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.editorContent = textarea.value;
    this.contentChange.emit(this.editorContent);
  }

  /**
   * Format JSON
   */
  formatJson(): void {
    try {
      const parsed = JSON.parse(this.editorContent);
      this.editorContent = JSON.stringify(parsed, null, 2);
      this.contentChange.emit(this.editorContent);
    } catch (error) {
      console.error('Cannot format: Invalid JSON', error);
    }
  }

  /**
   * Handle tab key for indentation
   */
  onKeyDown(event: KeyboardEvent): void {
    const textarea = event.target as HTMLTextAreaElement;

    // Tab key - insert 2 spaces
    if (event.key === 'Tab') {
      event.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;

      textarea.value = value.substring(0, start) + '  ' + value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;

      this.editorContent = textarea.value;
      this.contentChange.emit(this.editorContent);
    }
  }
}
