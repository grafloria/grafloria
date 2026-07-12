import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { TemplateGalleryService } from '../../services/template-gallery.service';
import { TemplateCardComponent } from '../template-card/template-card.component';
import {
  TemplateMetadata,
  TemplateCollection,
  TemplateFilters,
  TemplateViewMode,
  TemplateActionEvent,
  TemplateCategory,
  TemplateComplexity,
  CATEGORY_DISPLAY_NAMES,
  CATEGORY_COLORS
} from '../../models/template-metadata.model';

/**
 * Template Gallery Component
 *
 * Main gallery view with:
 * - Grid/list view toggle
 * - Search bar
 * - Category filters
 * - Sort options
 * - Template cards
 * - Collections sidebar
 * - Empty states
 *
 * Phase 9: Template Gallery & Management
 */
@Component({
    imports: [CommonModule, FormsModule, TemplateCardComponent],
    selector: 'app-template-gallery',
    templateUrl: './template-gallery.component.html',
    styleUrl: './template-gallery.component.css'
})
export class TemplateGalleryComponent implements OnInit, OnDestroy {

  @Output() templateSelected = new EventEmitter<TemplateMetadata>();
  @Output() templateAction = new EventEmitter<TemplateActionEvent>();

  // ==================== View State ====================

  viewMode: TemplateViewMode = 'grid';
  searchQuery = '';
  selectedCategories: TemplateCategory[] = [];
  selectedComplexity: TemplateComplexity[] = [];
  showFavoritesOnly = false;
  sortBy: 'name' | 'recent' | 'popular' | 'rating' = 'name';
  sortOrder: 'asc' | 'desc' = 'asc';

  // ==================== Data ====================

  templates: TemplateMetadata[] = [];
  filteredTemplates: TemplateMetadata[] = [];
  collections: TemplateCollection[] = [];
  collectionNames = new Map<string, string>();
  categoryCount: Record<string, number> = {};

  // ==================== UI State ====================

  showFilters = false;
  isLoading = false;

  // ==================== Constants ====================

  categories: TemplateCategory[] = [
    'basic',
    'database',
    'workflow',
    'dashboard',
    'diagram',
    'ui-component',
    'data-visualization',
    'custom'
  ];

  complexityLevels: TemplateComplexity[] = ['simple', 'medium', 'complex'];

  sortOptions = [
    { value: 'name', label: 'Name' },
    { value: 'recent', label: 'Recently Used' },
    { value: 'popular', label: 'Most Popular' },
    { value: 'rating', label: 'Highest Rated' }
  ];

  private destroy$ = new Subject<void>();

  constructor(private galleryService: TemplateGalleryService) {}

  ngOnInit(): void {
    this.loadData();
    this.subscribeToData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ==================== Data Loading ====================

  /**
   * Load initial data
   */
  private loadData(): void {
    this.isLoading = true;

    // Load templates
    this.galleryService.getAllTemplates()
      .pipe(takeUntil(this.destroy$))
      .subscribe(templates => {
        this.templates = templates;
        this.applyFilters();
        this.isLoading = false;
      });

    // Load collections
    this.galleryService.getAllCollections()
      .pipe(takeUntil(this.destroy$))
      .subscribe(collections => {
        this.collections = collections;
        this.updateCollectionNames();
      });

    // Load category counts
    this.galleryService.categoryCount$
      .pipe(takeUntil(this.destroy$))
      .subscribe(counts => {
        this.categoryCount = counts;
      });
  }

  /**
   * Subscribe to data changes
   */
  private subscribeToData(): void {
    // Subscribe to filtered templates from service
    this.galleryService.filteredTemplates$
      .pipe(takeUntil(this.destroy$))
      .subscribe(templates => {
        this.filteredTemplates = templates;
      });
  }

  /**
   * Update collection names map
   */
  private updateCollectionNames(): void {
    this.collectionNames.clear();
    this.collections.forEach(collection => {
      this.collectionNames.set(collection.id, collection.name);
    });
  }

  // ==================== Filtering ====================

  /**
   * Apply current filters
   */
  applyFilters(): void {
    const filters: TemplateFilters = {
      searchQuery: this.searchQuery.trim() || undefined,
      categories: this.selectedCategories.length > 0 ? this.selectedCategories : undefined,
      complexity: this.selectedComplexity.length > 0 ? this.selectedComplexity : undefined,
      favoritesOnly: this.showFavoritesOnly || undefined,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder
    };

    this.galleryService.setFilters(filters);
  }

  /**
   * Handle search input
   */
  onSearchChange(): void {
    this.applyFilters();
  }

  /**
   * Toggle category filter
   */
  toggleCategory(category: TemplateCategory): void {
    const index = this.selectedCategories.indexOf(category);
    if (index > -1) {
      this.selectedCategories.splice(index, 1);
    } else {
      this.selectedCategories.push(category);
    }
    this.applyFilters();
  }

  /**
   * Toggle complexity filter
   */
  toggleComplexity(complexity: TemplateComplexity): void {
    const index = this.selectedComplexity.indexOf(complexity);
    if (index > -1) {
      this.selectedComplexity.splice(index, 1);
    } else {
      this.selectedComplexity.push(complexity);
    }
    this.applyFilters();
  }

  /**
   * Toggle favorites filter
   */
  toggleFavorites(): void {
    this.showFavoritesOnly = !this.showFavoritesOnly;
    this.applyFilters();
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.searchQuery = '';
    this.selectedCategories = [];
    this.selectedComplexity = [];
    this.showFavoritesOnly = false;
    this.applyFilters();
  }

  /**
   * Check if any filters are active
   */
  get hasActiveFilters(): boolean {
    return this.searchQuery.length > 0 ||
           this.selectedCategories.length > 0 ||
           this.selectedComplexity.length > 0 ||
           this.showFavoritesOnly;
  }

  // ==================== Sorting ====================

  /**
   * Change sort option
   */
  changeSortBy(sortBy: 'name' | 'recent' | 'popular' | 'rating'): void {
    if (this.sortBy === sortBy) {
      // Toggle order if same field
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = sortBy;
      this.sortOrder = 'asc';
    }
    this.applyFilters();
  }

  // ==================== View Mode ====================

  /**
   * Toggle view mode
   */
  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'grid' ? 'list' : 'grid';
  }

  /**
   * Set view mode
   */
  setViewMode(mode: TemplateViewMode): void {
    this.viewMode = mode;
  }

  // ==================== Template Actions ====================

  /**
   * Handle template card action
   */
  onTemplateAction(event: TemplateActionEvent): void {
    console.log('Template action:', event.type, event.templateId);

    switch (event.type) {
      case 'use':
        this.onUseTemplate(event.metadata!);
        break;
      case 'preview':
        this.onPreviewTemplate(event.metadata!);
        break;
      case 'favorite':
        this.onToggleFavorite(event.templateId);
        break;
      case 'duplicate':
        this.onDuplicateTemplate(event.templateId);
        break;
      case 'export':
        this.onExportTemplate(event.templateId);
        break;
      case 'delete':
        this.onDeleteTemplate(event.templateId);
        break;
      case 'rate':
        this.onRateTemplate(event.templateId, event.data?.rating);
        break;
      case 'add-to-collection':
        this.onAddToCollection(event.templateId);
        break;
    }

    // Emit action event
    this.templateAction.emit(event);
  }

  /**
   * Use template
   */
  onUseTemplate(metadata: TemplateMetadata): void {
    this.galleryService.incrementUsageCount(metadata.id);
    this.templateSelected.emit(metadata);
  }

  /**
   * Preview template
   */
  onPreviewTemplate(metadata: TemplateMetadata): void {
    this.galleryService.incrementViewCount(metadata.id);
    // Preview modal will be handled by parent component
  }

  /**
   * Toggle favorite
   */
  private onToggleFavorite(templateId: string): void {
    this.galleryService.toggleFavorite(templateId).subscribe();
  }

  /**
   * Duplicate template
   */
  private onDuplicateTemplate(templateId: string): void {
    const template = this.templates.find(t => t.id === templateId);
    if (template) {
      const newName = prompt('Enter name for duplicated template:', `${template.name} (Copy)`);
      if (newName) {
        this.galleryService.duplicateTemplate(templateId, newName).subscribe();
      }
    }
  }

  /**
   * Export template
   */
  private onExportTemplate(templateId: string): void {
    this.galleryService.exportTemplate(templateId).subscribe(blob => {
      const template = this.templates.find(t => t.id === templateId);
      if (template) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${template.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  }

  /**
   * Delete template
   */
  private onDeleteTemplate(templateId: string): void {
    const template = this.templates.find(t => t.id === templateId);
    if (template) {
      const confirmed = confirm(`Are you sure you want to delete "${template.name}"?`);
      if (confirmed) {
        this.galleryService.deleteTemplate(templateId).subscribe();
      }
    }
  }

  /**
   * Rate template
   */
  private onRateTemplate(templateId: string, rating: number): void {
    this.galleryService.setRating(templateId, rating).subscribe();
  }

  /**
   * Add to collection
   */
  private onAddToCollection(templateId: string): void {
    // Collection selector modal will be handled by parent component
    console.log('Add to collection:', templateId);
  }

  // ==================== Helper Methods ====================

  /**
   * Get category display name
   */
  getCategoryName(category: TemplateCategory): string {
    return CATEGORY_DISPLAY_NAMES[category];
  }

  /**
   * Get category color
   */
  getCategoryColor(category: TemplateCategory): string {
    return CATEGORY_COLORS[category];
  }

  /**
   * Check if category is selected
   */
  isCategorySelected(category: TemplateCategory): boolean {
    return this.selectedCategories.includes(category);
  }

  /**
   * Check if complexity is selected
   */
  isComplexitySelected(complexity: TemplateComplexity): boolean {
    return this.selectedComplexity.includes(complexity);
  }

  /**
   * Get template count text
   */
  get templateCountText(): string {
    const count = this.filteredTemplates.length;
    return `${count} template${count !== 1 ? 's' : ''}`;
  }

  /**
   * Track by function for ngFor
   */
  trackByTemplateId(index: number, template: TemplateMetadata): string {
    return template.id;
  }

  /**
   * Track by function for collections
   */
  trackByCollectionId(index: number, collection: TemplateCollection): string {
    return collection.id;
  }
}
