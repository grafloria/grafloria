import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Button Component
 *
 * Reusable button with multiple variants and sizes.
 * Follows design system tokens for consistent styling.
 *
 * Usage:
 * <app-button variant="primary" size="md" (click)="handleClick()">
 *   Click Me
 * </app-button>
 */
@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type"
      [disabled]="disabled || loading"
      [class]="buttonClasses"
      (click)="handleClick($event)">

      <span *ngIf="loading" class="btn-spinner"></span>
      <span *ngIf="icon && iconPosition === 'left'" class="btn-icon btn-icon-left">
        {{ icon }}
      </span>
      <span class="btn-content">
        <ng-content></ng-content>
      </span>
      <span *ngIf="icon && iconPosition === 'right'" class="btn-icon btn-icon-right">
        {{ icon }}
      </span>
    </button>
  `,
  styles: [`
    :host {
      display: inline-block;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-weight: 500;
      border: none;
      cursor: pointer;
      transition: all 150ms ease;
      position: relative;
      white-space: nowrap;
    }

    button:focus-visible {
      outline: 2px solid #667eea;
      outline-offset: 2px;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    /* Variants */
    .btn-primary {
      background: #667eea;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #5568d3;
      transform: translateY(-1px);
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .btn-primary:active:not(:disabled) {
      transform: translateY(0);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .btn-secondary {
      background: #f3f4f6;
      color: #111827;
      border: 1px solid #e5e7eb;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #e5e7eb;
      border-color: #d1d5db;
    }

    .btn-secondary:active:not(:disabled) {
      background: #d1d5db;
    }

    .btn-ghost {
      background: transparent;
      color: #667eea;
    }

    .btn-ghost:hover:not(:disabled) {
      background: rgba(102, 126, 234, 0.08);
    }

    .btn-ghost:active:not(:disabled) {
      background: rgba(102, 126, 234, 0.16);
    }

    .btn-danger {
      background: #ef4444;
      color: white;
    }

    .btn-danger:hover:not(:disabled) {
      background: #dc2626;
    }

    .btn-danger:active:not(:disabled) {
      background: #b91c1c;
    }

    .btn-success {
      background: #10b981;
      color: white;
    }

    .btn-success:hover:not(:disabled) {
      background: #059669;
    }

    .btn-success:active:not(:disabled) {
      background: #047857;
    }

    /* Sizes */
    .btn-sm {
      padding: 6px 12px;
      font-size: 0.875rem;
      border-radius: 6px;
    }

    .btn-md {
      padding: 8px 16px;
      font-size: 1rem;
      border-radius: 8px;
    }

    .btn-lg {
      padding: 12px 24px;
      font-size: 1.125rem;
      border-radius: 10px;
    }

    /* Icon only */
    .btn-icon-only {
      padding: 8px;
      aspect-ratio: 1;
    }

    .btn-icon-only.btn-sm {
      padding: 6px;
    }

    .btn-icon-only.btn-lg {
      padding: 12px;
    }

    /* Loading state */
    .btn-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .btn-content {
      display: inline-flex;
      align-items: center;
    }

    .btn-icon {
      display: inline-flex;
      align-items: center;
      font-size: 1.2em;
    }

    /* Full width */
    .btn-full-width {
      width: 100%;
    }
  `]
})
export class ButtonComponent {
  @Input() variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' = 'primary';
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() disabled = false;
  @Input() loading = false;
  @Input() icon?: string;
  @Input() iconPosition: 'left' | 'right' = 'left';
  @Input() fullWidth = false;
  @Input() iconOnly = false;

  @Output() clicked = new EventEmitter<MouseEvent>();

  get buttonClasses(): string {
    const classes = [
      `btn-${this.variant}`,
      `btn-${this.size}`
    ];

    if (this.fullWidth) {
      classes.push('btn-full-width');
    }

    if (this.iconOnly) {
      classes.push('btn-icon-only');
    }

    return classes.join(' ');
  }

  handleClick(event: MouseEvent): void {
    if (!this.disabled && !this.loading) {
      this.clicked.emit(event);
    }
  }
}
