import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Keyboard Shortcut Definition
 */
export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  handler: () => void;
  category: 'file' | 'edit' | 'view' | 'preview' | 'search' | 'help';
  enabled?: boolean;
}

/**
 * Keyboard Shortcuts Service
 *
 * Centralized keyboard shortcut management with:
 * - Shortcut registration
 * - Conflict detection
 * - Enable/disable shortcuts
 * - Help dialog data
 *
 * Usage:
 * ```typescript
 * keyboardService.register({
 *   key: 's',
 *   ctrl: true,
 *   description: 'Save template',
 *   handler: () => this.save(),
 *   category: 'file'
 * });
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class KeyboardShortcutsService implements OnDestroy {

  private shortcuts = new Map<string, KeyboardShortcut>();
  private destroy$ = new Subject<void>();
  private keydownHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor() {
    this.initializeGlobalListener();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.removeGlobalListener();
  }

  /**
   * Register a keyboard shortcut
   */
  register(shortcut: KeyboardShortcut): void {
    const key = this.getShortcutKey(
      shortcut.key,
      shortcut.ctrl,
      shortcut.shift,
      shortcut.alt
    );

    if (this.shortcuts.has(key)) {
      console.warn(`Keyboard shortcut already registered: ${key}`);
      return;
    }

    this.shortcuts.set(key, { ...shortcut, enabled: shortcut.enabled !== false });
    console.log(`✅ Registered shortcut: ${this.formatShortcut(shortcut)}`);
  }

  /**
   * Register multiple shortcuts at once
   */
  registerMultiple(shortcuts: KeyboardShortcut[]): void {
    shortcuts.forEach(shortcut => this.register(shortcut));
  }

  /**
   * Unregister a shortcut
   */
  unregister(key: string, ctrl?: boolean, shift?: boolean, alt?: boolean): void {
    const shortcutKey = this.getShortcutKey(key, ctrl, shift, alt);
    this.shortcuts.delete(shortcutKey);
  }

  /**
   * Enable a shortcut
   */
  enable(key: string, ctrl?: boolean, shift?: boolean, alt?: boolean): void {
    const shortcutKey = this.getShortcutKey(key, ctrl, shift, alt);
    const shortcut = this.shortcuts.get(shortcutKey);
    if (shortcut) {
      shortcut.enabled = true;
    }
  }

  /**
   * Disable a shortcut
   */
  disable(key: string, ctrl?: boolean, shift?: boolean, alt?: boolean): void {
    const shortcutKey = this.getShortcutKey(key, ctrl, shift, alt);
    const shortcut = this.shortcuts.get(shortcutKey);
    if (shortcut) {
      shortcut.enabled = false;
    }
  }

  /**
   * Get all registered shortcuts
   */
  getAllShortcuts(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Get shortcuts by category
   */
  getShortcutsByCategory(category: KeyboardShortcut['category']): KeyboardShortcut[] {
    return this.getAllShortcuts().filter(s => s.category === category);
  }

  /**
   * Clear all shortcuts
   */
  clearAll(): void {
    this.shortcuts.clear();
  }

  /**
   * Format shortcut for display
   */
  formatShortcut(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];

    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.shift) parts.push('Shift');
    parts.push(shortcut.key.toUpperCase());

    return parts.join('+');
  }

  /**
   * Initialize global keyboard listener
   */
  private initializeGlobalListener(): void {
    this.keydownHandler = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input/textarea
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Allow Ctrl+S, Ctrl+Z, Ctrl+Y even in inputs
        if (!(event.ctrlKey && ['s', 'z', 'y'].includes(event.key.toLowerCase()))) {
          return;
        }
      }

      const key = this.getShortcutKey(
        event.key.toLowerCase(),
        event.ctrlKey || event.metaKey, // Support Cmd on Mac
        event.shiftKey,
        event.altKey
      );

      const shortcut = this.shortcuts.get(key);

      if (shortcut && shortcut.enabled !== false) {
        event.preventDefault();
        event.stopPropagation();
        shortcut.handler();
      }
    };

    document.addEventListener('keydown', this.keydownHandler);
  }

  /**
   * Remove global keyboard listener
   */
  private removeGlobalListener(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
  }

  /**
   * Generate unique key for shortcut
   */
  private getShortcutKey(
    key: string,
    ctrl?: boolean,
    shift?: boolean,
    alt?: boolean
  ): string {
    const parts: string[] = [];

    if (ctrl) parts.push('ctrl');
    if (alt) parts.push('alt');
    if (shift) parts.push('shift');
    parts.push(key.toLowerCase());

    return parts.join('+');
  }
}

/**
 * Default Template Builder Shortcuts
 */
export const DEFAULT_SHORTCUTS: KeyboardShortcut[] = [
  // File operations
  {
    key: 's',
    ctrl: true,
    description: 'Save template',
    category: 'file',
    handler: () => {} // Will be overridden
  },
  {
    key: 'o',
    ctrl: true,
    description: 'Open template',
    category: 'file',
    handler: () => {}
  },
  {
    key: 'e',
    ctrl: true,
    description: 'Export template',
    category: 'file',
    handler: () => {}
  },

  // Edit operations
  {
    key: 'z',
    ctrl: true,
    description: 'Undo',
    category: 'edit',
    handler: () => {}
  },
  {
    key: 'y',
    ctrl: true,
    description: 'Redo',
    category: 'edit',
    handler: () => {}
  },
  {
    key: 'z',
    ctrl: true,
    shift: true,
    description: 'Redo (alternative)',
    category: 'edit',
    handler: () => {}
  },
  {
    key: 'd',
    ctrl: true,
    description: 'Duplicate selected',
    category: 'edit',
    handler: () => {}
  },

  // View operations
  {
    key: '1',
    ctrl: true,
    description: 'Switch to JSON tab',
    category: 'view',
    handler: () => {}
  },
  {
    key: '2',
    ctrl: true,
    description: 'Switch to HTML tab',
    category: 'view',
    handler: () => {}
  },
  {
    key: '3',
    ctrl: true,
    description: 'Switch to CSS tab',
    category: 'view',
    handler: () => {}
  },
  {
    key: '4',
    ctrl: true,
    description: 'Switch to Visual tab',
    category: 'view',
    handler: () => {}
  },
  {
    key: 'b',
    ctrl: true,
    description: 'Toggle left sidebar',
    category: 'view',
    handler: () => {}
  },
  {
    key: 'l',
    ctrl: true,
    description: 'Toggle right panel',
    category: 'view',
    handler: () => {}
  },
  {
    key: 'p',
    ctrl: true,
    shift: true,
    description: 'Toggle bottom panel',
    category: 'view',
    handler: () => {}
  },

  // Preview operations
  {
    key: '=',
    ctrl: true,
    description: 'Zoom in preview',
    category: 'preview',
    handler: () => {}
  },
  {
    key: '-',
    ctrl: true,
    description: 'Zoom out preview',
    category: 'preview',
    handler: () => {}
  },
  {
    key: '0',
    ctrl: true,
    description: 'Reset zoom',
    category: 'preview',
    handler: () => {}
  },
  {
    key: 'f',
    ctrl: true,
    shift: true,
    description: 'Fit to view',
    category: 'preview',
    handler: () => {}
  },

  // Search
  {
    key: 'f',
    ctrl: true,
    description: 'Search in editor',
    category: 'search',
    handler: () => {}
  },
  {
    key: 'k',
    ctrl: true,
    description: 'Quick open',
    category: 'search',
    handler: () => {}
  },
  {
    key: 'p',
    ctrl: true,
    description: 'Command palette',
    category: 'search',
    handler: () => {}
  },

  // Help
  {
    key: 'F1',
    description: 'Show help',
    category: 'help',
    handler: () => {}
  },
  {
    key: '?',
    shift: true,
    description: 'Show keyboard shortcuts',
    category: 'help',
    handler: () => {}
  }
];
