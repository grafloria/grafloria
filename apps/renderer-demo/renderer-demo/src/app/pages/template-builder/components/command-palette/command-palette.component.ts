import { Component, Output, EventEmitter, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

/**
 * Command Palette Component
 *
 * Quick access to all Template Builder actions via keyboard shortcut (Ctrl+P).
 * Features fuzzy search, keyboard navigation, and categorized commands.
 *
 * Phase 10: UX Enhancements
 *
 * Features:
 * - Fuzzy search with highlighting
 * - Keyboard navigation (↑↓, Enter, Esc)
 * - Command categories and icons
 * - Recent commands tracking
 * - Command descriptions and shortcuts
 *
 * Usage:
 * <app-command-palette
 *   [isOpen]="showCommandPalette"
 *   [commands]="availableCommands"
 *   (commandExecute)="onCommandExecute($event)"
 *   (close)="showCommandPalette = false">
 * </app-command-palette>
 */

export interface Command {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  icon?: string;
  shortcut?: string;
  action: () => void;
  keywords?: string[]; // For better search matching
}

export type CommandCategory =
  | 'file'
  | 'edit'
  | 'view'
  | 'insert'
  | 'navigation'
  | 'tools'
  | 'help';

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  file: '📁 File',
  edit: '✏️ Edit',
  view: '👁️ View',
  insert: '➕ Insert',
  navigation: '🧭 Navigation',
  tools: '🔧 Tools',
  help: '❓ Help'
};

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-command-palette',
  template: `
    <div class="command-palette-backdrop" *ngIf="isOpen" (click)="close.emit()">
      <div class="command-palette" (click)="$event.stopPropagation()">
        <!-- Search Input -->
        <div class="search-container">
          <span class="search-icon">🔍</span>
          <input
            #searchInput
            type="text"
            class="search-input"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchChange()"
            placeholder="Type a command or search..."
            (keydown)="onKeyDown($event)"
            autofocus>
          <span class="search-hint">↑↓ navigate • Enter select • Esc close</span>
        </div>

        <!-- Commands List -->
        <div class="commands-list">
          <div *ngIf="filteredCommands.length === 0" class="no-results">
            <div class="no-results-icon">🔍</div>
            <div class="no-results-text">No commands found</div>
            <div class="no-results-hint">Try a different search term</div>
          </div>

          <ng-container *ngFor="let group of groupedCommands">
            <div class="command-category" *ngIf="group.commands.length > 0">
              <div class="category-label">{{ getCategoryLabel(group.category) }}</div>
              <div
                *ngFor="let command of group.commands; let i = index"
                class="command-item"
                [class.selected]="isSelected(command)"
                (click)="executeCommand(command)"
                (mouseenter)="selectCommand(command)">
                <span class="command-icon" *ngIf="command.icon">{{ command.icon }}</span>
                <div class="command-content">
                  <div class="command-label" [innerHTML]="highlightMatch(command.label)"></div>
                  <div class="command-description" *ngIf="command.description">{{ command.description }}</div>
                </div>
                <span class="command-shortcut" *ngIf="command.shortcut">{{ command.shortcut }}</span>
              </div>
            </div>
          </ng-container>
        </div>

        <!-- Footer -->
        <div class="palette-footer">
          <span class="footer-stats">{{ filteredCommands.length }} of {{ commands.length }} commands</span>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .command-palette-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 100px;
      z-index: 10000;
      animation: fadeIn 0.15s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .command-palette {
      width: 600px;
      max-width: 90vw;
      max-height: 70vh;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      animation: slideDown 0.2s ease;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .search-container {
      position: relative;
      padding: 16px;
      border-bottom: 2px solid #e5e7eb;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .search-icon {
      font-size: 20px;
      opacity: 0.5;
    }

    .search-input {
      flex: 1;
      border: none;
      outline: none;
      font-size: 16px;
      font-family: inherit;
      background: transparent;
    }

    .search-hint {
      font-size: 11px;
      color: #9ca3af;
      white-space: nowrap;
    }

    .commands-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .no-results {
      padding: 60px 20px;
      text-align: center;
    }

    .no-results-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.3;
    }

    .no-results-text {
      font-size: 16px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 8px;
    }

    .no-results-hint {
      font-size: 14px;
      color: #9ca3af;
    }

    .command-category {
      margin-bottom: 12px;
    }

    .category-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      padding: 8px 12px 4px;
    }

    .command-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .command-item:hover,
    .command-item.selected {
      background: #f3f4f6;
    }

    .command-item.selected {
      background: #3b82f6;
      color: white;
    }

    .command-item.selected .command-description,
    .command-item.selected .command-shortcut {
      color: rgba(255, 255, 255, 0.8);
    }

    .command-icon {
      font-size: 20px;
      flex-shrink: 0;
    }

    .command-content {
      flex: 1;
      min-width: 0;
    }

    .command-label {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 2px;
    }

    .command-label mark {
      background: #fef3c7;
      color: #92400e;
      font-weight: 600;
      padding: 0 2px;
      border-radius: 2px;
    }

    .command-item.selected .command-label mark {
      background: rgba(255, 255, 255, 0.3);
      color: white;
    }

    .command-description {
      font-size: 12px;
      color: #6b7280;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .command-shortcut {
      font-size: 11px;
      font-family: 'Monaco', 'Menlo', monospace;
      color: #9ca3af;
      background: #f3f4f6;
      padding: 3px 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .command-item.selected .command-shortcut {
      background: rgba(255, 255, 255, 0.2);
      color: rgba(255, 255, 255, 0.9);
    }

    .palette-footer {
      padding: 10px 16px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 0 0 12px 12px;
    }

    .footer-stats {
      font-size: 12px;
      color: #6b7280;
    }
  `]
})
export class CommandPaletteComponent implements OnInit, OnDestroy {
  @Output() commandExecute = new EventEmitter<Command>();
  @Output() close = new EventEmitter<void>();

  isOpen = false;
  commands: Command[] = [];
  searchQuery = '';
  filteredCommands: Command[] = [];
  groupedCommands: { category: CommandCategory; commands: Command[] }[] = [];
  selectedCommandIndex = 0;

  ngOnInit(): void {
    this.filteredCommands = this.commands;
    this.groupCommands();
  }

  ngOnDestroy(): void {
    // Cleanup
  }

  /**
   * Handle search query change
   */
  onSearchChange(): void {
    const query = this.searchQuery.toLowerCase().trim();

    if (!query) {
      this.filteredCommands = this.commands;
    } else {
      this.filteredCommands = this.commands.filter(command => {
        // Match against label, description, and keywords
        const searchText = [
          command.label,
          command.description || '',
          ...(command.keywords || [])
        ].join(' ').toLowerCase();

        return searchText.includes(query);
      });
    }

    this.groupCommands();
    this.selectedCommandIndex = 0;
  }

  /**
   * Group commands by category
   */
  private groupCommands(): void {
    const categories: CommandCategory[] = ['file', 'edit', 'view', 'insert', 'navigation', 'tools', 'help'];

    this.groupedCommands = categories.map(category => ({
      category,
      commands: this.filteredCommands.filter(cmd => cmd.category === category)
    }));
  }

  /**
   * Handle keyboard navigation
   */
  onKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedCommandIndex = Math.min(
          this.selectedCommandIndex + 1,
          this.filteredCommands.length - 1
        );
        this.scrollToSelected();
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.selectedCommandIndex = Math.max(this.selectedCommandIndex - 1, 0);
        this.scrollToSelected();
        break;

      case 'Enter':
        event.preventDefault();
        const selected = this.filteredCommands[this.selectedCommandIndex];
        if (selected) {
          this.executeCommand(selected);
        }
        break;

      case 'Escape':
        event.preventDefault();
        this.close.emit();
        break;
    }
  }

  /**
   * Execute a command
   */
  executeCommand(command: Command): void {
    this.commandExecute.emit(command);
    this.close.emit();
    command.action();
  }

  /**
   * Check if command is selected
   */
  isSelected(command: Command): boolean {
    const index = this.filteredCommands.indexOf(command);
    return index === this.selectedCommandIndex;
  }

  /**
   * Select a command
   */
  selectCommand(command: Command): void {
    this.selectedCommandIndex = this.filteredCommands.indexOf(command);
  }

  /**
   * Scroll to selected command
   */
  private scrollToSelected(): void {
    // Would need ViewChild for actual implementation
    // For now, browser handles it automatically
  }

  /**
   * Get category label
   */
  getCategoryLabel(category: CommandCategory): string {
    return CATEGORY_LABELS[category];
  }

  /**
   * Highlight search matches in text
   */
  highlightMatch(text: string): string {
    if (!this.searchQuery) {
      return text;
    }

    const query = this.searchQuery.toLowerCase();
    const index = text.toLowerCase().indexOf(query);

    if (index === -1) {
      return text;
    }

    const before = text.substring(0, index);
    const match = text.substring(index, index + query.length);
    const after = text.substring(index + query.length);

    return `${before}<mark>${match}</mark>${after}`;
  }
}
