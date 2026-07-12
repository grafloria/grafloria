import { Component, OnInit, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SnippetService, Snippet, SnippetCategory } from '../../services/snippet.service';

/**
 * Snippet Panel Component
 *
 * Browseable panel for code snippets with search and filtering.
 * Provides quick access to common template patterns.
 *
 * Features:
 * - Category filtering
 * - Search by name/description
 * - Copy to clipboard
 * - Insert into editor
 * - Collapsible panel
 *
 * ~180 lines
 */
@Component({
    imports: [CommonModule, FormsModule],
    selector: 'app-snippet-panel',
    templateUrl: './snippet-panel.component.html',
    styleUrl: './snippet-panel.component.css'
})
export class SnippetPanelComponent implements OnInit {

  @Output() insertSnippet = new EventEmitter<{ code: string; language: 'json' | 'html' | 'css' }>();

  snippetService = inject(SnippetService);

  isCollapsed = false;
  searchQuery = '';
  selectedCategory: 'all' | 'json' | 'html' | 'css' = 'all';
  displayedSnippets: Snippet[] = [];
  selectedSnippet: Snippet | null = null;

  ngOnInit(): void {
    this.updateDisplayedSnippets();
    this.restoreState();
  }

  /**
   * Toggle collapse state
   */
  toggleCollapse(): void {
    this.isCollapsed = !this.isCollapsed;
    this.saveState();
  }

  /**
   * Select category
   */
  selectCategory(category: 'all' | 'json' | 'html' | 'css'): void {
    this.selectedCategory = category;
    this.updateDisplayedSnippets();
    this.saveState();
  }

  /**
   * Handle search input
   */
  onSearch(): void {
    this.updateDisplayedSnippets();
  }

  /**
   * Select snippet
   */
  selectSnippet(snippet: Snippet): void {
    this.selectedSnippet = snippet;
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedSnippet = null;
  }

  /**
   * Insert snippet into editor
   */
  insertSnippetIntoEditor(): void {
    if (!this.selectedSnippet) return;

    this.insertSnippet.emit({
      code: this.selectedSnippet.code,
      language: this.selectedSnippet.category
    });

    console.log(`✅ Inserted snippet: ${this.selectedSnippet.name}`);
  }

  /**
   * Copy snippet to clipboard
   */
  copySnippet(): void {
    if (!this.selectedSnippet) return;

    navigator.clipboard.writeText(this.selectedSnippet.code).then(
      () => console.log('✅ Snippet copied to clipboard'),
      err => console.error('❌ Failed to copy snippet:', err)
    );
  }

  /**
   * Update displayed snippets based on filters
   */
  private updateDisplayedSnippets(): void {
    let snippets = this.snippetService.getAllSnippets();

    // Filter by category
    if (this.selectedCategory !== 'all') {
      snippets = snippets.filter(s => s.category === this.selectedCategory);
    }

    // Filter by search query
    if (this.searchQuery.trim()) {
      snippets = this.snippetService.searchSnippets(this.searchQuery);
      if (this.selectedCategory !== 'all') {
        snippets = snippets.filter(s => s.category === this.selectedCategory);
      }
    }

    this.displayedSnippets = snippets;
  }

  /**
   * Get subcategory display name
   */
  getSubcategoryName(subcategory: string): string {
    const names: Record<string, string> = {
      'templates': 'Templates',
      'shapes': 'Shapes',
      'ports': 'Ports',
      'html-elements': 'HTML Elements',
      'css-layouts': 'Layouts',
      'css-effects': 'Effects'
    };
    return names[subcategory] || subcategory;
  }

  /**
   * Get category badge color
   */
  getCategoryColor(category: 'json' | 'html' | 'css'): string {
    switch (category) {
      case 'json':
        return '#f59e0b';
      case 'html':
        return '#3b82f6';
      case 'css':
        return '#8b5cf6';
      default:
        return '#6b7280';
    }
  }

  /**
   * Save state to localStorage
   */
  private saveState(): void {
    localStorage.setItem('template-builder-snippets', JSON.stringify({
      isCollapsed: this.isCollapsed,
      selectedCategory: this.selectedCategory
    }));
  }

  /**
   * Restore state from localStorage
   */
  private restoreState(): void {
    const saved = localStorage.getItem('template-builder-snippets');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        this.isCollapsed = state.isCollapsed ?? false;
        this.selectedCategory = state.selectedCategory ?? 'all';
        this.updateDisplayedSnippets();
      } catch (error) {
        console.error('Failed to restore snippet panel state:', error);
      }
    }
  }
}
