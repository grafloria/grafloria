import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, debounceTime, distinctUntilChanged, map } from 'rxjs';
import type { NodeTemplate } from '@grafloria/engine';

/**
 * Template Editor State
 * Represents the complete state of the template being edited
 */
export interface TemplateEditorState {
  json: string;
  html: string;
  css: string;
  isValid: boolean;
  isDirty: boolean;
  lastSaved: number | null;
}

/**
 * Template Editor Service
 *
 * Central state management for the template builder.
 * Provides a single source of truth for template editing state
 * and coordinates updates across all editor components.
 *
 * Responsibilities:
 * - Maintain current editing state
 * - Emit state changes to subscribers
 * - Handle auto-save
 * - Track dirty state
 *
 * ~200 lines
 */
@Injectable({
  providedIn: 'root'
})
export class TemplateEditorService {

  // Private state
  private stateSubject = new BehaviorSubject<TemplateEditorState>({
    json: this.getDefaultTemplate(),
    html: '',
    css: '',
    isValid: true,
    isDirty: false,
    lastSaved: null
  });

  // Public observables
  public state$: Observable<TemplateEditorState> = this.stateSubject.asObservable();
  public json$: Observable<string> = this.stateSubject.pipe(
    debounceTime(100),
    distinctUntilChanged((prev, curr) => prev.json === curr.json),
    map(state => state.json)
  );

  constructor() {
    // Try to restore from auto-save
    this.restoreFromAutoSave();

    // Setup auto-save every 30 seconds
    this.state$.pipe(
      debounceTime(30000)
    ).subscribe(state => {
      if (state.isDirty) {
        this.autoSave();
      }
    });
  }

  /**
   * Get current state snapshot
   */
  getState(): TemplateEditorState {
    return this.stateSubject.getValue();
  }

  /**
   * Update JSON content
   */
  updateJson(json: string): void {
    const currentState = this.getState();
    this.stateSubject.next({
      ...currentState,
      json,
      isDirty: true
    });
  }

  /**
   * Update HTML content
   */
  updateHtml(html: string): void {
    const currentState = this.getState();
    this.stateSubject.next({
      ...currentState,
      html,
      isDirty: true
    });
  }

  /**
   * Update CSS content
   */
  updateCss(css: string): void {
    const currentState = this.getState();
    this.stateSubject.next({
      ...currentState,
      css,
      isDirty: true
    });
  }

  /**
   * Set validation status
   */
  setValidationStatus(isValid: boolean): void {
    const currentState = this.getState();
    this.stateSubject.next({
      ...currentState,
      isValid
    });
  }

  /**
   * Load a template (from library or file)
   */
  loadTemplate(template: Partial<TemplateEditorState>): void {
    const currentState = this.getState();
    this.stateSubject.next({
      ...currentState,
      json: template.json || currentState.json,
      html: template.html || '',
      css: template.css || '',
      isDirty: false,
      lastSaved: Date.now()
    });
  }

  /**
   * Reset to default template
   */
  reset(): void {
    this.stateSubject.next({
      json: this.getDefaultTemplate(),
      html: '',
      css: '',
      isValid: true,
      isDirty: false,
      lastSaved: null
    });
  }

  /**
   * Save template
   */
  save(): void {
    const currentState = this.getState();
    // In a real app, this would save to a backend
    // For now, just update the state
    this.stateSubject.next({
      ...currentState,
      isDirty: false,
      lastSaved: Date.now()
    });

    // Also save to localStorage
    this.autoSave();
  }

  /**
   * Parse current JSON to NodeTemplate
   */
  parseTemplate(): NodeTemplate | null {
    try {
      const currentState = this.getState();
      const parsed = JSON.parse(currentState.json);
      return parsed as NodeTemplate;
    } catch (error) {
      console.error('Failed to parse template JSON:', error);
      return null;
    }
  }

  /**
   * Auto-save to localStorage
   */
  private autoSave(): void {
    try {
      const state = this.getState();
      localStorage.setItem('template-builder-autosave', JSON.stringify({
        json: state.json,
        html: state.html,
        css: state.css,
        timestamp: Date.now()
      }));
      console.log('✅ Auto-saved template');
    } catch (error) {
      console.error('❌ Auto-save failed:', error);
    }
  }

  /**
   * Restore from auto-save
   */
  private restoreFromAutoSave(): void {
    try {
      const saved = localStorage.getItem('template-builder-autosave');
      if (saved) {
        const data = JSON.parse(saved);
        const age = Date.now() - data.timestamp;

        // Only restore if less than 24 hours old
        if (age < 24 * 60 * 60 * 1000) {
          this.loadTemplate({
            json: data.json,
            html: data.html,
            css: data.css
          });
          console.log('✅ Restored from auto-save');
        }
      }
    } catch (error) {
      console.error('❌ Failed to restore from auto-save:', error);
    }
  }

  /**
   * Get default template
   */
  private getDefaultTemplate(): string {
    const defaultTemplate: Partial<NodeTemplate> = {
      id: 'new-template',
      version: '1.0.0',
      meta: {
        name: 'New Template',
        category: 'custom',
        description: 'A new custom node template',
        tags: []
      },
      structure: {
        type: 'custom',
        size: {
          width: 200,
          height: 100
        },
        shape: {
          type: 'rect',
          cornerRadius: 8
        },
        behavior: {
          draggable: true,
          selectable: true
        }
      },
      dataSchema: {
        type: 'object',
        properties: {
          label: { type: 'string' }
        }
      },
      defaultData: {
        label: 'New Node'
      }
    };

    return JSON.stringify(defaultTemplate, null, 2);
  }
}
