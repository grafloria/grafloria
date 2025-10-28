import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of, combineLatest } from 'rxjs';
import { map, debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { NodeTemplate } from '@grafloria/engine';
import {
  TemplateMetadata,
  TemplateCollection,
  TemplateFilters,
  TemplateActionEvent,
  createDefaultTemplateMetadata,
  BUILT_IN_COLLECTIONS
} from '../models/template-metadata.model';
import { getSampleTemplates } from '../data/sample-templates';

/**
 * Template Gallery Service
 *
 * Manages template library with advanced features:
 * - Template CRUD operations
 * - Search and filtering
 * - Collections management
 * - Favorites and ratings
 * - Usage tracking
 * - Thumbnail generation
 *
 * Phase 9: Template Gallery & Management
 */

// Template version for cache invalidation
const TEMPLATE_VERSION = '2.3.0'; // Incremented to force reload with React Flow styled ERD Table template
const TEMPLATE_VERSION_KEY = 'template-gallery-version';

@Injectable({
  providedIn: 'root'
})
export class TemplateGalleryService {

  // ==================== State Management ====================

  private templates$ = new BehaviorSubject<Map<string, TemplateMetadata>>(new Map());
  private collections$ = new BehaviorSubject<Map<string, TemplateCollection>>(new Map());
  private filters$ = new BehaviorSubject<TemplateFilters>({});

  // ==================== Public Observables ====================

  /** All templates */
  public readonly allTemplates$ = this.templates$.asObservable().pipe(
    map(templatesMap => Array.from(templatesMap.values()))
  );

  /** Filtered templates based on current filters */
  public readonly filteredTemplates$ = combineLatest([
    this.allTemplates$,
    this.filters$
  ]).pipe(
    debounceTime(150), // Debounce for search
    map(([templates, filters]) => this.applyFilters(templates, filters))
  );

  /** All collections */
  public readonly allCollections$ = this.collections$.asObservable().pipe(
    map(collectionsMap => Array.from(collectionsMap.values()))
  );

  /** Template count by category */
  public readonly categoryCount$ = this.allTemplates$.pipe(
    map(templates => this.groupByCategory(templates))
  );

  /** Recently used templates (last 10) */
  public readonly recentTemplates$ = this.allTemplates$.pipe(
    map(templates => templates
      .filter(t => t.lastUsed)
      .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
      .slice(0, 10)
    )
  );

  /** Favorite templates */
  public readonly favoriteTemplates$ = this.allTemplates$.pipe(
    map(templates => templates.filter(t => t.isFavorite))
  );

  constructor() {
    this.initialize();
  }

  // ==================== Initialization ====================

  /**
   * Initialize service with built-in collections and load saved data
   */
  private initialize(): void {
    // Initialize built-in collections
    const collectionsMap = new Map<string, TemplateCollection>();
    BUILT_IN_COLLECTIONS.forEach(collection => {
      collectionsMap.set(collection.id, collection);
    });
    this.collections$.next(collectionsMap);

    // Load templates from storage
    this.loadTemplatesFromStorage();

    // Load user collections from storage
    this.loadCollectionsFromStorage();

    // Load sample templates if no templates exist
    this.loadSampleTemplatesIfNeeded();
  }

  /**
   * Load sample templates on first initialization
   */
  private loadSampleTemplatesIfNeeded(): void {
    const currentTemplates = this.templates$.value;

    // Only load samples if no templates exist
    if (currentTemplates.size === 0) {
      console.log('📚 Loading sample templates into gallery...');

      const sampleTemplates = getSampleTemplates();
      const templatesMap = new Map(currentTemplates);

      sampleTemplates.forEach(partial => {
        const metadata = createDefaultTemplateMetadata(partial);
        templatesMap.set(metadata.id, metadata);
      });

      this.templates$.next(templatesMap);
      this.saveTemplatesToStorage();

      console.log(`✅ Loaded ${sampleTemplates.length} sample templates`);
    }
  }

  // ==================== Template Operations ====================

  /**
   * Get all templates
   */
  getAllTemplates(): Observable<TemplateMetadata[]> {
    return this.allTemplates$;
  }

  /**
   * Get template by ID
   */
  getTemplateById(id: string): Observable<TemplateMetadata | undefined> {
    return this.templates$.pipe(
      map(templatesMap => templatesMap.get(id))
    );
  }

  /**
   * Add new template
   */
  addTemplate(template: NodeTemplate, metadata?: Partial<TemplateMetadata>): Observable<string> {
    const fullMetadata = createDefaultTemplateMetadata({
      id: template.id,
      name: template.meta.name,
      description: template.meta.description || '',
      category: (template.meta.category as any) || 'custom',
      tags: template.meta.tags || [],
      author: template.meta.author || 'User',
      template,
      features: this.detectFeatures(template) as any,
      hasChildNodes: this.hasChildNodes(template),
      hasConnections: this.hasConnections(template),
      hasCustomStyling: this.hasCustomStyling(template),
      hasDataBinding: this.hasDataBinding(template),
      ...metadata
    });

    const templatesMap = this.templates$.value;
    templatesMap.set(fullMetadata.id, fullMetadata);
    this.templates$.next(new Map(templatesMap));

    this.saveTemplatesToStorage();

    console.log(`✅ Template added: ${fullMetadata.id} - ${fullMetadata.name}`);

    return of(fullMetadata.id);
  }

  /**
   * Update template metadata
   */
  updateMetadata(id: string, updates: Partial<TemplateMetadata>): Observable<void> {
    const templatesMap = this.templates$.value;
    const existing = templatesMap.get(id);

    if (!existing) {
      console.error(`Template ${id} not found`);
      return of(void 0);
    }

    const updated: TemplateMetadata = {
      ...existing,
      ...updates,
      modifiedAt: Date.now()
    };

    templatesMap.set(id, updated);
    this.templates$.next(new Map(templatesMap));

    this.saveTemplatesToStorage();

    return of(void 0);
  }

  /**
   * Delete template
   */
  deleteTemplate(id: string): Observable<void> {
    const templatesMap = this.templates$.value;

    if (!templatesMap.has(id)) {
      console.error(`Template ${id} not found`);
      return of(void 0);
    }

    templatesMap.delete(id);
    this.templates$.next(new Map(templatesMap));

    // Remove from collections
    this.removeTemplateFromAllCollections(id);

    this.saveTemplatesToStorage();

    console.log(`✅ Template deleted: ${id}`);

    return of(void 0);
  }

  /**
   * Duplicate template
   */
  duplicateTemplate(id: string, newName?: string): Observable<string> {
    const original = this.templates$.value.get(id);

    if (!original || !original.template) {
      console.error(`Template ${id} not found or has no template data`);
      return of('');
    }

    const newId = `${id}-copy-${Date.now()}`;
    const duplicated: NodeTemplate = {
      ...original.template,
      id: newId,
      meta: {
        ...original.template.meta,
        name: newName || `${original.name} (Copy)`
      }
    };

    return this.addTemplate(duplicated, {
      name: duplicated.meta.name,
      description: original.description,
      category: original.category,
      tags: [...original.tags],
      complexity: original.complexity
    });
  }

  /**
   * Export template as JSON
   */
  exportTemplate(id: string): Observable<Blob> {
    const metadata = this.templates$.value.get(id);

    if (!metadata || !metadata.template) {
      console.error(`Template ${id} not found or has no template data`);
      return of(new Blob());
    }

    const exportData = {
      metadata: {
        name: metadata.name,
        description: metadata.description,
        category: metadata.category,
        tags: metadata.tags,
        author: metadata.author,
        version: metadata.version,
        complexity: metadata.complexity,
        features: metadata.features
      },
      template: metadata.template
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });

    console.log(`✅ Template exported: ${id}`);

    return of(blob);
  }

  /**
   * Import template from JSON
   */
  importTemplate(json: string): Observable<string> {
    try {
      const data = JSON.parse(json);

      if (!data.template) {
        throw new Error('Invalid template format: missing template data');
      }

      const template: NodeTemplate = data.template;
      const metadata = data.metadata || {};

      return this.addTemplate(template, metadata);
    } catch (error) {
      console.error('Failed to import template:', error);
      return of('');
    }
  }

  // ==================== Usage Tracking ====================

  /**
   * Increment usage count
   */
  incrementUsageCount(id: string): void {
    const template = this.templates$.value.get(id);

    if (template) {
      this.updateMetadata(id, {
        usageCount: (template.usageCount || 0) + 1,
        lastUsed: Date.now()
      }).subscribe();
    }
  }

  /**
   * Increment view count
   */
  incrementViewCount(id: string): void {
    const template = this.templates$.value.get(id);

    if (template) {
      this.updateMetadata(id, {
        viewCount: (template.viewCount || 0) + 1
      }).subscribe();
    }
  }

  // ==================== Favorites & Rating ====================

  /**
   * Toggle favorite status
   */
  toggleFavorite(id: string): Observable<boolean> {
    const template = this.templates$.value.get(id);

    if (!template) {
      return of(false);
    }

    const newFavoriteStatus = !template.isFavorite;

    this.updateMetadata(id, {
      isFavorite: newFavoriteStatus
    }).subscribe();

    return of(newFavoriteStatus);
  }

  /**
   * Set user rating
   */
  setRating(id: string, rating: number): Observable<void> {
    const clampedRating = Math.max(1, Math.min(5, rating));

    return this.updateMetadata(id, {
      userRating: clampedRating
    });
  }

  // ==================== Collections Management ====================

  /**
   * Get all collections
   */
  getAllCollections(): Observable<TemplateCollection[]> {
    return this.allCollections$;
  }

  /**
   * Create new collection
   */
  createCollection(collection: Omit<TemplateCollection, 'id' | 'createdAt' | 'modifiedAt' | 'isBuiltIn'>): Observable<string> {
    const id = `collection-${Date.now()}`;
    const now = Date.now();

    const newCollection: TemplateCollection = {
      ...collection,
      id,
      createdAt: now,
      modifiedAt: now,
      isBuiltIn: false
    };

    const collectionsMap = this.collections$.value;
    collectionsMap.set(id, newCollection);
    this.collections$.next(new Map(collectionsMap));

    this.saveCollectionsToStorage();

    console.log(`✅ Collection created: ${id} - ${newCollection.name}`);

    return of(id);
  }

  /**
   * Delete collection
   */
  deleteCollection(id: string): Observable<void> {
    const collection = this.collections$.value.get(id);

    if (!collection) {
      return of(void 0);
    }

    if (collection.isBuiltIn) {
      console.error('Cannot delete built-in collection');
      return of(void 0);
    }

    const collectionsMap = this.collections$.value;
    collectionsMap.delete(id);
    this.collections$.next(new Map(collectionsMap));

    // Remove collection from all templates
    const templatesMap = this.templates$.value;
    templatesMap.forEach(template => {
      if (template.collections.includes(id)) {
        const updated: TemplateMetadata = {
          ...template,
          collections: template.collections.filter(cId => cId !== id)
        };
        templatesMap.set(template.id, updated);
      }
    });
    this.templates$.next(new Map(templatesMap));

    this.saveCollectionsToStorage();
    this.saveTemplatesToStorage();

    console.log(`✅ Collection deleted: ${id}`);

    return of(void 0);
  }

  /**
   * Add template to collection
   */
  addToCollection(templateId: string, collectionId: string): Observable<void> {
    const template = this.templates$.value.get(templateId);

    if (!template) {
      console.error(`Template ${templateId} not found`);
      return of(void 0);
    }

    if (template.collections.includes(collectionId)) {
      return of(void 0);
    }

    return this.updateMetadata(templateId, {
      collections: [...template.collections, collectionId]
    });
  }

  /**
   * Remove template from collection
   */
  removeFromCollection(templateId: string, collectionId: string): Observable<void> {
    const template = this.templates$.value.get(templateId);

    if (!template) {
      return of(void 0);
    }

    return this.updateMetadata(templateId, {
      collections: template.collections.filter(id => id !== collectionId)
    });
  }

  /**
   * Remove template from all collections
   */
  private removeTemplateFromAllCollections(templateId: string): void {
    const collectionsMap = this.collections$.value;

    collectionsMap.forEach(collection => {
      if (collection.templateIds.includes(templateId)) {
        const updated: TemplateCollection = {
          ...collection,
          templateIds: collection.templateIds.filter(id => id !== templateId),
          modifiedAt: Date.now()
        };
        collectionsMap.set(collection.id, updated);
      }
    });

    this.collections$.next(new Map(collectionsMap));
    this.saveCollectionsToStorage();
  }

  // ==================== Filtering & Search ====================

  /**
   * Set filters
   */
  setFilters(filters: TemplateFilters): void {
    this.filters$.next(filters);
  }

  /**
   * Clear filters
   */
  clearFilters(): void {
    this.filters$.next({});
  }

  /**
   * Apply filters to template list
   */
  private applyFilters(templates: TemplateMetadata[], filters: TemplateFilters): TemplateMetadata[] {
    let filtered = [...templates];

    // Search query
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.tags.some(tag => tag.toLowerCase().includes(query)) ||
        t.userTags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Categories
    if (filters.categories && filters.categories.length > 0) {
      filtered = filtered.filter(t => filters.categories!.includes(t.category));
    }

    // Tags
    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(t =>
        filters.tags!.some(tag => t.tags.includes(tag) || t.userTags.includes(tag))
      );
    }

    // Features (AND logic - template must have all selected features)
    if (filters.features && filters.features.length > 0) {
      filtered = filtered.filter(t =>
        filters.features!.every(feature => t.features.includes(feature))
      );
    }

    // Complexity
    if (filters.complexity && filters.complexity.length > 0) {
      filtered = filtered.filter(t => filters.complexity!.includes(t.complexity));
    }

    // Collections
    if (filters.collections && filters.collections.length > 0) {
      filtered = filtered.filter(t =>
        filters.collections!.some(collId => t.collections.includes(collId))
      );
    }

    // Favorites only
    if (filters.favoritesOnly) {
      filtered = filtered.filter(t => t.isFavorite);
    }

    // Minimum rating
    if (filters.minRating !== undefined) {
      filtered = filtered.filter(t => (t.userRating || 0) >= filters.minRating!);
    }

    // Maximum node count
    if (filters.maxNodeCount !== undefined) {
      filtered = filtered.filter(t => (t.nodeCount || 0) <= filters.maxNodeCount!);
    }

    // Sorting
    if (filters.sortBy) {
      filtered = this.sortTemplates(filtered, filters.sortBy, filters.sortOrder || 'asc');
    }

    return filtered;
  }

  /**
   * Sort templates
   */
  private sortTemplates(
    templates: TemplateMetadata[],
    sortBy: string,
    order: 'asc' | 'desc'
  ): TemplateMetadata[] {
    const sorted = [...templates];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'recent':
          comparison = (b.lastUsed || 0) - (a.lastUsed || 0);
          break;
        case 'popular':
          comparison = b.usageCount - a.usageCount;
          break;
        case 'rating':
          comparison = (b.userRating || 0) - (a.userRating || 0);
          break;
        case 'created':
          comparison = b.createdAt - a.createdAt;
          break;
        case 'modified':
          comparison = b.modifiedAt - a.modifiedAt;
          break;
      }

      return order === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }

  // ==================== Helper Methods ====================

  /**
   * Group templates by category
   */
  private groupByCategory(templates: TemplateMetadata[]): Record<string, number> {
    const grouped: Record<string, number> = {};

    templates.forEach(template => {
      const category = template.category;
      grouped[category] = (grouped[category] || 0) + 1;
    });

    return grouped;
  }

  /**
   * Detect features from template
   */
  private detectFeatures(template: NodeTemplate): string[] {
    const features: string[] = [];

    if (template.structure.ports?.enabled) {
      features.push('ports');
    }

    if (template.structure.html) {
      features.push('html');
    }

    if (template.structure.html?.template?.includes('<style>')) {
      features.push('css');
    }

    if (template.structure.layout) {
      features.push('layout');
    }

    if (template.structure.children && template.structure.children.length > 0) {
      features.push('children');
    }

    if (template.structure.repeater) {
      features.push('repeater');
    }

    if (template.structure.behavior) {
      features.push('behavior');
    }

    return features;
  }

  /**
   * Check if template has child nodes
   */
  private hasChildNodes(template: NodeTemplate): boolean {
    return !!(template.structure.children && template.structure.children.length > 0);
  }

  /**
   * Check if template has connections
   */
  private hasConnections(template: NodeTemplate): boolean {
    return !!(template.structure.ports?.enabled);
  }

  /**
   * Check if template has custom styling
   */
  private hasCustomStyling(template: NodeTemplate): boolean {
    return !!(template.structure.html || template.styles);
  }

  /**
   * Check if template has data binding
   */
  private hasDataBinding(template: NodeTemplate): boolean {
    return !!(template.structure.repeater);
  }

  // ==================== Storage ====================

  /**
   * Load templates from localStorage
   */
  private loadTemplatesFromStorage(): void {
    try {
      // Check version first - clear cache if version mismatch
      const storedVersion = localStorage.getItem(TEMPLATE_VERSION_KEY);
      if (storedVersion !== TEMPLATE_VERSION) {
        console.log(`🔄 Template version mismatch (${storedVersion || 'none'} → ${TEMPLATE_VERSION}). Clearing cache...`);
        localStorage.removeItem('template-gallery-templates');
        localStorage.setItem(TEMPLATE_VERSION_KEY, TEMPLATE_VERSION);
        // Return early - loadSampleTemplatesIfNeeded() will handle loading new templates
        return;
      }

      const stored = localStorage.getItem('template-gallery-templates');
      if (stored) {
        const data = JSON.parse(stored);
        const templatesMap = new Map<string, TemplateMetadata>();

        Object.entries(data).forEach(([id, metadata]) => {
          templatesMap.set(id, metadata as TemplateMetadata);
        });

        this.templates$.next(templatesMap);
        console.log(`✅ Loaded ${templatesMap.size} templates from storage (version ${TEMPLATE_VERSION})`);
      }
    } catch (error) {
      console.error('Failed to load templates from storage:', error);
    }
  }

  /**
   * Save templates to localStorage
   */
  private saveTemplatesToStorage(): void {
    try {
      const templatesMap = this.templates$.value;
      const data: Record<string, TemplateMetadata> = {};

      templatesMap.forEach((metadata, id) => {
        data[id] = metadata;
      });

      localStorage.setItem('template-gallery-templates', JSON.stringify(data));
      localStorage.setItem(TEMPLATE_VERSION_KEY, TEMPLATE_VERSION);
    } catch (error) {
      console.error('Failed to save templates to storage:', error);
    }
  }

  /**
   * Load collections from localStorage
   */
  private loadCollectionsFromStorage(): void {
    try {
      const stored = localStorage.getItem('template-gallery-collections');
      if (stored) {
        const data = JSON.parse(stored);
        const collectionsMap = this.collections$.value;

        Object.entries(data).forEach(([id, collection]) => {
          if (!collectionsMap.has(id)) {
            collectionsMap.set(id, collection as TemplateCollection);
          }
        });

        this.collections$.next(new Map(collectionsMap));
        console.log(`✅ Loaded collections from storage`);
      }
    } catch (error) {
      console.error('Failed to load collections from storage:', error);
    }
  }

  /**
   * Save collections to localStorage
   */
  private saveCollectionsToStorage(): void {
    try {
      const collectionsMap = this.collections$.value;
      const data: Record<string, TemplateCollection> = {};

      collectionsMap.forEach((collection, id) => {
        if (!collection.isBuiltIn) {
          data[id] = collection;
        }
      });

      localStorage.setItem('template-gallery-collections', JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save collections to storage:', error);
    }
  }
}
