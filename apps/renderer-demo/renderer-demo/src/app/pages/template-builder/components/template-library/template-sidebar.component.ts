import { Component, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TemplateLibraryService, type TemplatePreset } from '../../services/template-library.service';

/**
 * Template Sidebar Component
 *
 * Sidebar showing template library with categories and search.
 *
 * Features:
 * - Category filtering
 * - Search templates
 * - Template preview
 * - One-click loading
 *
 * ~150 lines
 */
@Component({
    imports: [CommonModule, FormsModule],
    selector: 'app-template-sidebar',
    templateUrl: './template-sidebar.component.html',
    styleUrl: './template-sidebar.component.css'
})
export class TemplateSidebarComponent implements OnInit {

  @Output() templateSelect = new EventEmitter<string>();

  private libraryService = inject(TemplateLibraryService);

  searchQuery = '';
  selectedCategory = 'all';
  categories: string[] = [];
  filteredPresets: TemplatePreset[] = [];

  ngOnInit(): void {
    this.categories = ['all', ...this.libraryService.getCategories()];
    this.updateFilteredPresets();
  }

  /**
   * Update filtered presets based on search and category
   */
  updateFilteredPresets(): void {
    let presets = this.libraryService.getAllPresets();

    // Filter by category
    if (this.selectedCategory !== 'all') {
      presets = presets.filter(p => p.category === this.selectedCategory);
    }

    // Filter by search query
    if (this.searchQuery.trim()) {
      presets = this.libraryService.searchPresets(this.searchQuery);
    }

    this.filteredPresets = presets;
  }

  /**
   * Handle search input
   */
  onSearchChange(): void {
    this.updateFilteredPresets();
  }

  /**
   * Handle category change
   */
  onCategoryChange(): void {
    this.updateFilteredPresets();
  }

  /**
   * Select a template
   */
  selectTemplate(templateId: string): void {
    this.templateSelect.emit(templateId);
  }

  /**
   * Get category display name
   */
  getCategoryName(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1);
  }

  /**
   * Get category icon
   */
  getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      'all': '📦',
      'basic': '◻️',
      'database': '🗄️',
      'workflow': '🔄',
      'dashboard': '📊',
      'custom': '⚙️'
    };
    return icons[category] || '📄';
  }
}
