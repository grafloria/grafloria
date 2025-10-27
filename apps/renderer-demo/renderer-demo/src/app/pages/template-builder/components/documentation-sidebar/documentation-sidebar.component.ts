import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentationService, DocEntry } from '../../services/documentation.service';

/**
 * Documentation Sidebar Component
 *
 * Collapsible sidebar showing documentation for template properties.
 * Provides search, categorized browsing, and context-aware help.
 *
 * Features:
 * - Collapse/expand
 * - Search documentation
 * - Browse by category
 * - Show examples
 * - Persistent state
 *
 * ~200 lines
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-documentation-sidebar',
  templateUrl: './documentation-sidebar.component.html',
  styleUrl: './documentation-sidebar.component.css'
})
export class DocumentationSidebarComponent implements OnInit, OnDestroy {

  isCollapsed = false;
  searchQuery = '';
  selectedCategory: 'all' | 'root' | 'meta' | 'structure' | 'shape' | 'ports' | 'html' | 'behavior' | 'layout' = 'all';
  selectedEntry: DocEntry | null = null;

  categories = [
    { value: 'all', label: 'All Properties' },
    { value: 'root', label: 'Root Level' },
    { value: 'meta', label: 'Metadata' },
    { value: 'structure', label: 'Structure' },
    { value: 'shape', label: 'Shape' },
    { value: 'ports', label: 'Ports' },
    { value: 'html', label: 'HTML' },
    { value: 'behavior', label: 'Behavior' },
    { value: 'layout', label: 'Layout' }
  ];

  displayedEntries: DocEntry[] = [];

  constructor(private docService: DocumentationService) {}

  ngOnInit(): void {
    this.restoreState();
    this.updateDisplayedEntries();
  }

  ngOnDestroy(): void {
    this.saveState();
  }

  /**
   * Toggle collapsed state
   */
  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    this.saveState();
  }

  /**
   * Handle search input
   */
  onSearch(): void {
    this.updateDisplayedEntries();
  }

  /**
   * Handle category change
   */
  onCategoryChange(): void {
    this.updateDisplayedEntries();
  }

  /**
   * Select a documentation entry
   */
  selectEntry(entry: DocEntry): void {
    this.selectedEntry = entry;
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedEntry = null;
  }

  /**
   * Update displayed entries based on search and category
   */
  private updateDisplayedEntries(): void {
    let entries: DocEntry[];

    // Apply search filter
    if (this.searchQuery.trim()) {
      entries = this.docService.search(this.searchQuery);
    } else if (this.selectedCategory !== 'all') {
      // Apply category filter using service method
      entries = this.docService.getEntriesByCategory(this.selectedCategory as any);
    } else {
      entries = this.docService.getAllEntries();
    }

    // Sort by path
    entries.sort((a, b) => a.path.localeCompare(b.path));

    this.displayedEntries = entries;
  }

  /**
   * Save state to localStorage
   */
  private saveState(): void {
    try {
      localStorage.setItem('template-builder-docs-sidebar', JSON.stringify({
        isCollapsed: this.isCollapsed,
        selectedCategory: this.selectedCategory
      }));
    } catch (error) {
      console.error('Failed to save documentation sidebar state:', error);
    }
  }

  /**
   * Restore state from localStorage
   */
  private restoreState(): void {
    try {
      const saved = localStorage.getItem('template-builder-docs-sidebar');
      if (saved) {
        const state = JSON.parse(saved);
        this.isCollapsed = state.isCollapsed || false;
        this.selectedCategory = state.selectedCategory || 'all';
      }
    } catch (error) {
      console.error('Failed to restore documentation sidebar state:', error);
    }
  }

  /**
   * Get badge color for entry type
   */
  getTypeBadgeColor(type: string): string {
    switch (type) {
      case 'string': return '#16a34a';
      case 'number': return '#dc2626';
      case 'boolean': return '#9333ea';
      case 'object': return '#2563eb';
      case 'array': return '#ea580c';
      case 'enum': return '#ca8a04';
      default: return '#6b7280';
    }
  }

  /**
   * Copy example to clipboard
   */
  copyExample(example: string): void {
    navigator.clipboard.writeText(example).then(
      () => console.log('✅ Copied to clipboard'),
      err => console.error('❌ Failed to copy:', err)
    );
  }
}
