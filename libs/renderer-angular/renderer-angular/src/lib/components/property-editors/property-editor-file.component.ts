import { Component, Input, OnInit, OnChanges, SimpleChanges, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PropertyDefinition, ValidationError } from '@grafloria/renderer';
import { PropertyEditorComponent } from './property-editor.interface';

/**
 * File editor component for file upload.
 *
 * Features:
 * - File input with drag-drop
 * - File type validation (accept attribute)
 * - File size validation
 * - Preview for images
 * - Multiple files support (optional)
 * - Read-only mode
 *
 * @example
 * ```html
 * <property-editor-file
 *   [value]="fileData"
 *   [property]="propertyDef"
 *   [readonly]="false"
 *   (valueChange)="onValueChange($event)">
 * </property-editor-file>
 * ```
 */
@Component({
    selector: 'property-editor-file',
    imports: [CommonModule],
    template: `
    <div class="property-editor property-editor-file">
      <div
        class="file-drop-zone"
        [class.drag-over]="isDragging"
        [class.has-file]="hasFile()"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
        (click)="fileInput.click()"
      >
        <input
          #fileInput
          type="file"
          [id]="property.key"
          (change)="onFileSelected($event)"
          [accept]="getAcceptTypes()"
          [multiple]="isMultiple()"
          [disabled]="readonly"
          class="file-input"
        />

        <div class="drop-zone-content" *ngIf="!hasFile()">
          <svg
            class="upload-icon"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <p class="drop-zone-text">
            Click to upload or drag and drop
          </p>
          <p class="drop-zone-hint" *ngIf="getAcceptTypes()">
            {{ getAcceptTypes() }}
          </p>
        </div>

        <div class="file-preview" *ngIf="hasFile()">
          <img
            *ngIf="isImagePreview()"
            [src]="currentValue.preview"
            [alt]="currentValue.name"
            class="image-preview"
          />
          <div class="file-info">
            <span class="file-name">{{ currentValue.name }}</span>
            <span class="file-size">{{ formatFileSize(currentValue.size) }}</span>
          </div>
          <button
            type="button"
            class="btn-remove-file"
            (click)="removeFile($event)"
            [disabled]="readonly"
            aria-label="Remove file"
          >
            ×
          </button>
        </div>
      </div>

      <div class="file-error" *ngIf="errorMessage">
        {{ errorMessage }}
      </div>
    </div>
  `,
    styles: [
        `
      .property-editor-file {
        width: 100%;
      }

      .file-input {
        display: none;
      }

      .file-drop-zone {
        border: 2px dashed var(--input-border, #ccc);
        border-radius: 8px;
        padding: 24px;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
        background: var(--drop-zone-bg, #fafafa);
      }

      .file-drop-zone:hover:not(.has-file) {
        border-color: var(--primary-color, #007bff);
        background: var(--drop-zone-hover-bg, #f0f8ff);
      }

      .file-drop-zone.drag-over {
        border-color: var(--primary-color, #007bff);
        background: var(--drop-zone-hover-bg, #f0f8ff);
      }

      .file-drop-zone.has-file {
        cursor: default;
      }

      .drop-zone-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }

      .upload-icon {
        color: var(--text-secondary, #666);
      }

      .drop-zone-text {
        margin: 0;
        color: var(--text-primary, #333);
        font-size: 14px;
      }

      .drop-zone-hint {
        margin: 0;
        color: var(--text-secondary, #666);
        font-size: 12px;
      }

      .file-preview {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .image-preview {
        width: 80px;
        height: 80px;
        object-fit: cover;
        border-radius: 4px;
      }

      .file-info {
        flex: 1;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .file-name {
        font-size: 14px;
        color: var(--text-primary, #333);
        font-weight: 500;
      }

      .file-size {
        font-size: 12px;
        color: var(--text-secondary, #666);
      }

      .btn-remove-file {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: none;
        background: var(--error-color, #dc3545);
        color: white;
        font-size: 24px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }

      .btn-remove-file:hover:not(:disabled) {
        background: var(--error-color-dark, #c82333);
      }

      .btn-remove-file:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .file-error {
        margin-top: 8px;
        padding: 8px 12px;
        background: var(--error-bg, #f8d7da);
        color: var(--error-text, #721c24);
        border-radius: 4px;
        font-size: 13px;
      }
    `,
    ]
})
export class PropertyEditorFileComponent
  implements PropertyEditorComponent, OnInit, OnChanges
{
  @Input() value: any;
  @Input() property!: PropertyDefinition;
  @Input() readonly = false;

  readonly valueChange = output<any>();
  readonly validationError = output<ValidationError | null>();

  currentValue: any = null;
  isDragging = false;
  errorMessage = '';

  ngOnInit(): void {
    this.currentValue = this.value;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.currentValue = this.value;
    }
  }

  getAcceptTypes(): string {
    return this.property.validation?.accept || '';
  }

  isMultiple(): boolean {
    return this.property.validation?.multiple === true;
  }

  hasFile(): boolean {
    return this.currentValue !== null && this.currentValue !== undefined;
  }

  isImagePreview(): boolean {
    return this.currentValue?.type?.startsWith('image/') &&
           this.currentValue?.preview;
  }

  onDragOver(event: DragEvent): void {
    if (this.readonly) return;
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = true;
  }

  onDragLeave(event: DragEvent): void {
    if (this.readonly) return;
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;
  }

  onDrop(event: DragEvent): void {
    if (this.readonly) return;
    event.preventDefault();
    event.stopPropagation();
    this.isDragging = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelected(event: Event): void {
    if (this.readonly) return;
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private handleFile(file: File): void {
    this.errorMessage = '';

    // Validate file size
    const maxSize = this.property.validation?.maxSize;
    if (maxSize && file.size > maxSize) {
      this.errorMessage = `File size exceeds maximum of ${this.formatFileSize(maxSize)}`;
      this.validationError.emit({ message: this.errorMessage });
      return;
    }

    // Validate file type
    const acceptTypes = this.getAcceptTypes();
    if (acceptTypes) {
      const types = acceptTypes.split(',').map((t) => t.trim());
      const fileType = file.type;
      const fileExt = '.' + file.name.split('.').pop();

      const isValid = types.some((type) => {
        if (type.startsWith('.')) {
          return fileExt === type;
        }
        if (type.endsWith('/*')) {
          return fileType.startsWith(type.replace('/*', ''));
        }
        return fileType === type;
      });

      if (!isValid) {
        this.errorMessage = `File type not accepted. Accepted types: ${acceptTypes}`;
        this.validationError.emit({ message: this.errorMessage });
        return;
      }
    }

    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.currentValue = {
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          preview: e.target?.result,
        };
        this.valueChange.emit(this.currentValue);
      };
      reader.readAsDataURL(file);
    } else {
      this.currentValue = {
        file,
        name: file.name,
        size: file.size,
        type: file.type,
      };
      this.valueChange.emit(this.currentValue);
    }

    this.validationError.emit(null);
  }

  removeFile(event: Event): void {
    if (this.readonly) return;
    event.stopPropagation();
    this.currentValue = null;
    this.errorMessage = '';
    this.valueChange.emit(null);
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}
