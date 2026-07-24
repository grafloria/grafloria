import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DSL, DiagramEngine } from '@grafloria/engine';
import { DiagramCanvasComponent } from '@grafloria/angular';
import { LIGHT_THEME, type Theme, type Rectangle } from '@grafloria/renderer';

interface StylePreset {
  name: string;
  description: string;
  styles: Record<string, StyleProperties>;
}

interface StyleProperties {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  color?: string;
  borderRadius?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  opacity?: number;
  padding?: number;
}

@Component({
    imports: [CommonModule, FormsModule, DiagramCanvasComponent],
    selector: 'app-dsl-styling-studio',
    templateUrl: './dsl-styling-studio.component.html',
    styleUrl: './dsl-styling-studio.component.css'
})
export class DslStylingStudioComponent implements OnInit {
  dsl!: DSL;
  engine!: DiagramEngine;
  viewport: Rectangle = { x: 0, y: 0, width: 1200, height: 800 };
  zoom = 1.0;
  theme: Theme = LIGHT_THEME;

  // Current style being edited
  currentStyleName = 'primary';
  currentStyle: StyleProperties = {
    fill: '#3b82f6',
    stroke: '#1e40af',
    strokeWidth: 2,
    color: '#ffffff',
    borderRadius: 8,
    fontSize: 14,
    fontFamily: 'Arial',
    fontWeight: 'normal',
    opacity: 1,
    padding: 10
  };

  // Diagram with applied styles
  diagramDSL = `flowchart TD
  A[Start]:::primary --> B{Decision}:::primary
  B -->|Yes| C[Success]:::success
  B -->|No| D[Failure]:::error
  C --> E[End]:::primary
  D --> E`;

  generatedDSL = '';
  activeTab: 'editor' | 'presets' | 'preview' = 'editor';

  stylePresets: StylePreset[] = [
    {
      name: 'Corporate Blue',
      description: 'Professional blue theme for business diagrams',
      styles: {
        primary: {
          fill: '#1e3a8a',
          stroke: '#1e40af',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 4,
          fontFamily: 'Arial',
          fontWeight: 'bold'
        },
        secondary: {
          fill: '#0891b2',
          stroke: '#0e7490',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 4
        },
        success: {
          fill: '#059669',
          stroke: '#047857',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 20
        },
        error: {
          fill: '#dc2626',
          stroke: '#b91c1c',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 4
        }
      }
    },
    {
      name: 'Dark Mode',
      description: 'Modern dark theme with purple accents',
      styles: {
        primary: {
          fill: '#1f2937',
          stroke: '#4b5563',
          color: '#f3f4f6',
          strokeWidth: 2,
          borderRadius: 8
        },
        secondary: {
          fill: '#7c3aed',
          stroke: '#6d28d9',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 8
        },
        success: {
          fill: '#10b981',
          stroke: '#059669',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 8
        },
        error: {
          fill: '#ef4444',
          stroke: '#dc2626',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 8
        }
      }
    },
    {
      name: 'Pastel Spring',
      description: 'Soft pastel colors for friendly diagrams',
      styles: {
        primary: {
          fill: '#dbeafe',
          stroke: '#93c5fd',
          color: '#1e3a8a',
          strokeWidth: 2,
          borderRadius: 12
        },
        secondary: {
          fill: '#fce7f3',
          stroke: '#f9a8d4',
          color: '#831843',
          strokeWidth: 2,
          borderRadius: 12
        },
        success: {
          fill: '#d1fae5',
          stroke: '#6ee7b7',
          color: '#065f46',
          strokeWidth: 2,
          borderRadius: 12
        },
        error: {
          fill: '#fee2e2',
          stroke: '#fca5a5',
          color: '#991b1b',
          strokeWidth: 2,
          borderRadius: 12
        }
      }
    },
    {
      name: 'High Contrast',
      description: 'Bold colors with high contrast for accessibility',
      styles: {
        primary: {
          fill: '#000000',
          stroke: '#ffffff',
          color: '#ffffff',
          strokeWidth: 3,
          borderRadius: 0,
          fontWeight: 'bold'
        },
        secondary: {
          fill: '#ffff00',
          stroke: '#000000',
          color: '#000000',
          strokeWidth: 3,
          borderRadius: 0,
          fontWeight: 'bold'
        },
        success: {
          fill: '#00ff00',
          stroke: '#000000',
          color: '#000000',
          strokeWidth: 3,
          borderRadius: 0,
          fontWeight: 'bold'
        },
        error: {
          fill: '#ff0000',
          stroke: '#000000',
          color: '#ffffff',
          strokeWidth: 3,
          borderRadius: 0,
          fontWeight: 'bold'
        }
      }
    },
    {
      name: 'Gradient Modern',
      description: 'Modern gradients with rounded corners',
      styles: {
        primary: {
          fill: '#667eea',
          stroke: '#764ba2',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 16,
          fontSize: 16,
          fontWeight: '600'
        },
        secondary: {
          fill: '#f093fb',
          stroke: '#f5576c',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 16
        },
        success: {
          fill: '#4facfe',
          stroke: '#00f2fe',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 16
        },
        error: {
          fill: '#fa709a',
          stroke: '#fee140',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 16
        }
      }
    }
  ];

  ngOnInit() {
    this.engine = new DiagramEngine();

    this.dsl = new DSL({
      debug: true,
      autoLayout: true
    });

    this.generateStyledDSL();
  }

  generateStyledDSL() {
    // Generate @style blocks from current styles
    const styleBlocks = Object.entries(this.getActiveStyles()).map(([name, props]) => {
      const properties = Object.entries(props)
        .map(([key, value]) => `  ${key}: ${value};`)
        .join('\n');
      return `@style ${name} {\n${properties}\n}`;
    }).join('\n\n');

    this.generatedDSL = `${styleBlocks}\n\n${this.diagramDSL}`;

    // Parse and render the diagram
    try {
      const diagram = this.dsl.parse(this.generatedDSL);
      this.engine.setDiagram(diagram);
    } catch (error) {
      console.error('Failed to parse styled diagram:', error);
    }
  }

  getActiveStyles(): Record<string, StyleProperties> {
    // Return current single style for editor mode
    if (this.activeTab === 'editor') {
      return {
        [this.currentStyleName]: this.currentStyle,
        success: {
          fill: '#10b981',
          stroke: '#059669',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 8
        },
        error: {
          fill: '#ef4444',
          stroke: '#dc2626',
          color: '#ffffff',
          strokeWidth: 2,
          borderRadius: 8
        }
      };
    }

    // Return preset styles
    return this.stylePresets[0].styles;
  }

  applyPreset(preset: StylePreset) {
    // Update diagram with preset styles
    const styleBlocks = Object.entries(preset.styles).map(([name, props]) => {
      const properties = Object.entries(props)
        .map(([key, value]) => `  ${key}: ${value};`)
        .join('\n');
      return `@style ${name} {\n${properties}\n}`;
    }).join('\n\n');

    this.generatedDSL = `${styleBlocks}\n\n${this.diagramDSL}`;

    // Parse and render the diagram
    try {
      const diagram = this.dsl.parse(this.generatedDSL);
      this.engine.setDiagram(diagram);
    } catch (error) {
      console.error('Failed to parse styled diagram:', error);
    }
  }

  onStyleChange() {
    this.generateStyledDSL();
  }

  resetStyle() {
    this.currentStyle = {
      fill: '#3b82f6',
      stroke: '#1e40af',
      strokeWidth: 2,
      color: '#ffffff',
      borderRadius: 8,
      fontSize: 14,
      fontFamily: 'Arial',
      fontWeight: 'normal',
      opacity: 1,
      padding: 10
    };
    this.generateStyledDSL();
  }

  copyToClipboard() {
    navigator.clipboard.writeText(this.generatedDSL);
  }

  exportStyles() {
    const stylesJSON = JSON.stringify(this.getActiveStyles(), null, 2);
    const blob = new Blob([stylesJSON], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dsl-styles.json';
    a.click();
    URL.revokeObjectURL(url);
  }
}
