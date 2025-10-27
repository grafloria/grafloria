import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, state, style, transition, animate } from '@angular/animations';
import {
  TemplateMetadata,
  TemplateActionEvent,
  FEATURE_ICONS,
  FEATURE_DISPLAY_NAMES,
  COMPLEXITY_COLORS,
  CATEGORY_COLORS
} from '../../models/template-metadata.model';

/**
 * Template Card Component
 *
 * Visual card displaying template with:
 * - Preview thumbnail
 * - Metadata (name, category, rating, complexity)
 * - Feature badges
 * - Quick actions menu
 * - Collection badges
 * - Hover effects
 *
 * Phase 9: Template Gallery & Management
 */
@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-template-card',
  templateUrl: './template-card.component.html',
  styleUrl: './template-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('slideDown', [
      state('void', style({ height: '0', opacity: '0' })),
      state('*', style({ height: '*', opacity: '1' })),
      transition('void <=> *', animate('200ms ease-in-out'))
    ]),
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'scale(0.95)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'scale(1)' }))
      ])
    ])
  ]
})
export class TemplateCardComponent {

  @Input() metadata!: TemplateMetadata;
  @Input() collectionNames: Map<string, string> = new Map();

  @Output() action = new EventEmitter<TemplateActionEvent>();

  showMenu = false;

  /**
   * Get thumbnail URL or placeholder
   */
  get thumbnailUrl(): string {
    return this.metadata.thumbnail || 'assets/template-placeholder.svg';
  }

  /**
   * Get category color
   */
  get categoryColor(): string {
    return CATEGORY_COLORS[this.metadata.category] || '#95a5a6';
  }

  /**
   * Get complexity color
   */
  get complexityColor(): string {
    return COMPLEXITY_COLORS[this.metadata.complexity];
  }

  /**
   * Get feature icons
   */
  getFeatureIcon(feature: string): string {
    return FEATURE_ICONS[feature as keyof typeof FEATURE_ICONS] || '•';
  }

  /**
   * Get feature display name
   */
  getFeatureName(feature: string): string {
    return FEATURE_DISPLAY_NAMES[feature as keyof typeof FEATURE_DISPLAY_NAMES] || feature;
  }

  /**
   * Get collection color
   */
  getCollectionColor(collectionId: string): string {
    // Return color based on collection ID or default
    const colors = ['#3498db', '#e74c3c', '#27ae60', '#f39c12', '#9b59b6', '#1abc9c'];
    const hash = collectionId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  /**
   * Get collection name
   */
  getCollectionName(collectionId: string): string {
    return this.collectionNames.get(collectionId) || collectionId;
  }

  /**
   * Format last used time
   */
  get lastUsedFormatted(): string {
    if (!this.metadata.lastUsed) {
      return 'Never used';
    }

    const now = Date.now();
    const diff = now - this.metadata.lastUsed;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ago`;
    } else if (hours > 0) {
      return `${hours}h ago`;
    } else if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return 'Just now';
    }
  }

  /**
   * Get rating stars array
   */
  get ratingStars(): boolean[] {
    const rating = this.metadata.userRating || 0;
    return Array.from({ length: 5 }, (_, i) => i < Math.floor(rating));
  }

  // ==================== Event Handlers ====================

  /**
   * Handle preview click
   */
  onPreview(): void {
    this.action.emit({
      type: 'preview',
      templateId: this.metadata.id,
      metadata: this.metadata
    });
  }

  /**
   * Handle use template click
   */
  onUse(): void {
    this.action.emit({
      type: 'use',
      templateId: this.metadata.id,
      metadata: this.metadata
    });
  }

  /**
   * Toggle quick actions menu
   */
  toggleMenu(): void {
    this.showMenu = !this.showMenu;
  }

  /**
   * Handle toggle favorite
   */
  onToggleFavorite(event: Event): void {
    event.stopPropagation();
    this.showMenu = false;

    this.action.emit({
      type: 'favorite',
      templateId: this.metadata.id,
      metadata: this.metadata
    });
  }

  /**
   * Handle duplicate
   */
  onDuplicate(event: Event): void {
    event.stopPropagation();
    this.showMenu = false;

    this.action.emit({
      type: 'duplicate',
      templateId: this.metadata.id,
      metadata: this.metadata
    });
  }

  /**
   * Handle export
   */
  onExport(event: Event): void {
    event.stopPropagation();
    this.showMenu = false;

    this.action.emit({
      type: 'export',
      templateId: this.metadata.id,
      metadata: this.metadata
    });
  }

  /**
   * Handle add to collection
   */
  onAddToCollection(event: Event): void {
    event.stopPropagation();
    this.showMenu = false;

    this.action.emit({
      type: 'add-to-collection',
      templateId: this.metadata.id,
      metadata: this.metadata
    });
  }

  /**
   * Handle delete
   */
  onDelete(event: Event): void {
    event.stopPropagation();
    this.showMenu = false;

    this.action.emit({
      type: 'delete',
      templateId: this.metadata.id,
      metadata: this.metadata
    });
  }

  /**
   * Handle rating click
   */
  onRate(rating: number, event: Event): void {
    event.stopPropagation();

    this.action.emit({
      type: 'rate',
      templateId: this.metadata.id,
      metadata: this.metadata,
      data: { rating }
    });
  }

  /**
   * Close menu when clicking outside
   */
  onCardClick(event: Event): void {
    if (this.showMenu) {
      this.showMenu = false;
    }
  }
}
