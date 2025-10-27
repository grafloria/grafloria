import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DocumentationService, DocEntry } from '../../services/documentation.service';

export interface PatternExample {
  title: string;
  description: string;
  icon: string;
  code: string;
  category: 'static' | 'dynamic' | 'layout';
}

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
  showPatterns = false;
  copiedPattern: string | null = null;

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

  commonPatterns: PatternExample[] = [
    {
      title: 'Static Child Node',
      description: 'A single, fixed child node that\'s always visible. Perfect for labels, icons, or decorative elements.',
      icon: '📄',
      category: 'static',
      code: `{
  "type": "label",
  "size": { "width": 100, "height": 30 },
  "position": { "x": 10, "y": 10 },
  "shape": {
    "type": "rect",
    "fill": "#e3f2fd",
    "stroke": "#2196f3",
    "strokeWidth": 2
  },
  "htmlLayer": "<div style='padding: 4px 8px;'>Label</div>"
}`
    },
    {
      title: 'Dynamic Children (Data-Driven)',
      description: 'Multiple child nodes generated from data. Each item in your data array creates a new child.',
      icon: '🔄',
      category: 'dynamic',
      code: `{
  "type": "task-item",
  "dataTemplate": {
    "dataPath": "tasks",
    "itemVariable": "task"
  },
  "size": { "width": 120, "height": 40 },
  "shape": {
    "type": "rect",
    "fill": "#e3f2fd",
    "stroke": "#2196f3"
  },
  "htmlLayer": "<div style='padding: 8px;'>{{task.title}}</div>",
  "layout": {
    "direction": "column",
    "gap": 8
  }
}`
    },
    {
      title: 'Flexbox Layout (Horizontal)',
      description: 'Arrange children horizontally with flexbox spacing.',
      icon: '↔️',
      category: 'layout',
      code: `"layout": {
  "direction": "row",
  "wrap": "nowrap",
  "justifyContent": "space-between",
  "alignItems": "center",
  "gap": 12
}`
    }
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

  /**
   * Toggle patterns section
   */
  togglePatterns(): void {
    this.showPatterns = !this.showPatterns;
  }

  /**
   * Copy pattern to clipboard with visual feedback
   */
  copyPattern(pattern: PatternExample): void {
    navigator.clipboard.writeText(pattern.code).then(
      () => {
        this.copiedPattern = pattern.title;
        console.log(`✅ Copied pattern: ${pattern.title}`);

        // Clear feedback after 2 seconds
        setTimeout(() => {
          this.copiedPattern = null;
        }, 2000);
      },
      err => console.error('❌ Failed to copy:', err)
    );
  }

  /**
   * Check if pattern was just copied
   */
  wasRecentlyCopied(pattern: PatternExample): boolean {
    return this.copiedPattern === pattern.title;
  }

  /**
   * Get filtered patterns (if search is active)
   */
  getFilteredPatterns(): PatternExample[] {
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      return this.commonPatterns.filter(p =>
        p.title.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query)
      );
    }
    return this.commonPatterns;
  }
}
