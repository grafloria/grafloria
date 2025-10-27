import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { TemplateMetadata, TemplateActionEvent } from '../../models/template-metadata.model';
import { TemplateGalleryService } from '../../services/template-gallery.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/**
 * Template Preview Modal Component
 *
 * Full-screen modal for previewing templates with live rendering
 *
 * Features:
 * - Live canvas preview of template
 * - Template metadata display
 * - Quick actions (use, favorite, duplicate, export)
 * - Keyboard navigation (ESC to close, arrow keys for next/prev)
 * - Smooth animations
 *
 * Phase 9: Template Gallery & Management
 */
@Component({
  selector: 'app-template-preview-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './template-preview-modal.component.html',
  styleUrls: ['./template-preview-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('modalAnimation', [
      state('void', style({
        opacity: 0,
        transform: 'scale(0.95)'
      })),
      state('*', style({
        opacity: 1,
        transform: 'scale(1)'
      })),
      transition('void => *', animate('200ms cubic-bezier(0.4, 0, 0.2, 1)')),
      transition('* => void', animate('150ms cubic-bezier(0.4, 0, 1, 1)'))
    ]),
    trigger('backdropAnimation', [
      state('void', style({ opacity: 0 })),
      state('*', style({ opacity: 1 })),
      transition('void => *', animate('200ms')),
      transition('* => void', animate('150ms'))
    ])
  ]
})
export class TemplatePreviewModalComponent implements OnInit, OnDestroy, AfterViewInit {
  // ==================== Inputs & Outputs ====================

  /** Template metadata to preview */
  @Input() metadata: TemplateMetadata | null = null;

  /** All available templates (for navigation) */
  @Input() allTemplates: TemplateMetadata[] = [];

  /** Whether modal is visible */
  @Input() isOpen = false;

  /** Modal closed event */
  @Output() close = new EventEmitter<void>();

  /** Template action event */
  @Output() action = new EventEmitter<TemplateActionEvent>();

  /** Navigate to next/previous template */
  @Output() navigate = new EventEmitter<'next' | 'prev'>();

  // ==================== View References ====================

  @ViewChild('previewCanvas', { static: false }) previewCanvas?: ElementRef<HTMLCanvasElement>;

  // ==================== Component State ====================

  /** Loading state */
  isLoading = false;

  /** Error state */
  errorMessage: string | null = null;

  /** Current template index in filtered list */
  currentIndex = -1;

  /** Whether there's a next template */
  hasNext = false;

  /** Whether there's a previous template */
  hasPrev = false;

  /** Component destruction subject */
  private destroy$ = new Subject<void>();

  // ==================== Constructor ====================

  constructor(
    private galleryService: TemplateGalleryService,
    private cdr: ChangeDetectorRef
  ) {}

  // ==================== Lifecycle Hooks ====================

  ngOnInit(): void {
    // Listen for keyboard events
    document.addEventListener('keydown', this.handleKeyDown);

    // Update navigation state
    this.updateNavigationState();
  }

  ngAfterViewInit(): void {
    // Render template when view is ready
    if (this.metadata && this.previewCanvas) {
      this.renderPreview();
    }
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==================== Keyboard Navigation ====================

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isOpen) return;

    switch (event.key) {
      case 'Escape':
        this.onClose();
        break;
      case 'ArrowLeft':
        if (this.hasPrev) {
          this.onNavigate('prev');
        }
        break;
      case 'ArrowRight':
        if (this.hasNext) {
          this.onNavigate('next');
        }
        break;
    }
  };

  // ==================== Preview Rendering ====================

  private renderPreview(): void {
    if (!this.metadata || !this.previewCanvas) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.markForCheck();

    // Render template to canvas
    this.renderTemplateToCanvas();

    // Increment view count
    this.galleryService.incrementViewCount(this.metadata.id);
  }

  private renderTemplateToCanvas(): void {
    if (!this.metadata?.template || !this.previewCanvas) {
      return;
    }

    try {
      const canvas = this.previewCanvas.nativeElement;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Set canvas size
      const containerWidth = canvas.parentElement?.clientWidth || 800;
      const containerHeight = canvas.parentElement?.clientHeight || 600;
      canvas.width = containerWidth;
      canvas.height = containerHeight;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // TODO: Implement canvas rendering when CanvasRendererService is available
      // For now, show placeholder text
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#666';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Template Preview', canvas.width / 2, canvas.height / 2 - 20);
      ctx.fillText('(Visual rendering coming soon)', canvas.width / 2, canvas.height / 2 + 20);

      this.isLoading = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Failed to render template preview:', error);
      this.errorMessage = 'Failed to render preview';
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  // ==================== Navigation ====================

  private updateNavigationState(): void {
    if (!this.metadata || this.allTemplates.length === 0) {
      this.currentIndex = -1;
      this.hasNext = false;
      this.hasPrev = false;
      return;
    }

    this.currentIndex = this.allTemplates.findIndex(t => t.id === this.metadata!.id);
    this.hasNext = this.currentIndex < this.allTemplates.length - 1;
    this.hasPrev = this.currentIndex > 0;
  }

  onNavigate(direction: 'next' | 'prev'): void {
    this.navigate.emit(direction);
    this.updateNavigationState();

    // Re-render preview for new template
    if (this.previewCanvas) {
      this.renderPreview();
    }
  }

  // ==================== Actions ====================

  onClose(): void {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    // Only close if clicking the backdrop itself, not the modal content
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  onUseTemplate(): void {
    if (!this.metadata) return;

    this.action.emit({
      type: 'use',
      templateId: this.metadata.id,
      metadata: this.metadata
    });

    this.onClose();
  }

  onToggleFavorite(): void {
    if (!this.metadata) return;

    this.action.emit({
      type: 'favorite',
      templateId: this.metadata.id,
      metadata: this.metadata
    });

    // Update local state
    this.metadata.isFavorite = !this.metadata.isFavorite;
    this.cdr.markForCheck();
  }

  onDuplicate(): void {
    if (!this.metadata) return;

    this.action.emit({
      type: 'duplicate',
      templateId: this.metadata.id,
      metadata: this.metadata
    });
  }

  onExport(): void {
    if (!this.metadata) return;

    this.action.emit({
      type: 'export',
      templateId: this.metadata.id,
      metadata: this.metadata
    });
  }

  onEdit(): void {
    if (!this.metadata) return;

    this.action.emit({
      type: 'edit',
      templateId: this.metadata.id,
      metadata: this.metadata
    });

    this.onClose();
  }

  onRate(rating: number): void {
    if (!this.metadata) return;

    this.action.emit({
      type: 'rate',
      templateId: this.metadata.id,
      metadata: this.metadata,
      data: { rating }
    });

    // Update local state
    this.metadata.userRating = rating;
    this.cdr.markForCheck();
  }

  // ==================== Helper Methods ====================

  get categoryName(): string {
    if (!this.metadata) return '';
    return this.metadata.category.split('-').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  get complexityColor(): string {
    if (!this.metadata) return '#95a5a6';

    const colors: Record<string, string> = {
      simple: '#27ae60',
      medium: '#f39c12',
      complex: '#e74c3c'
    };

    return colors[this.metadata.complexity] || '#95a5a6';
  }

  get ratingStars(): boolean[] {
    const rating = this.metadata?.userRating || 0;
    return Array.from({ length: 5 }, (_, i) => i < rating);
  }

  get createdDate(): string {
    if (!this.metadata) return '';
    return new Date(this.metadata.createdAt).toLocaleDateString();
  }

  get lastUsedDate(): string {
    if (!this.metadata?.lastUsed) return 'Never';
    return this.formatTimeAgo(this.metadata.lastUsed);
  }

  private formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;

    return new Date(timestamp).toLocaleDateString();
  }

  trackByFeature(index: number, feature: string): string {
    return feature;
  }
}
