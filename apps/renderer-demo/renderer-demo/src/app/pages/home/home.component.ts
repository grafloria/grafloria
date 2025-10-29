import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface ExampleCard {
  title: string;
  description: string;
  icon: string;
  route: string;
  features: string[];
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
}

@Component({
  standalone: true,
  imports: [CommonModule, RouterModule],
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  examples: ExampleCard[] = [
    {
      title: 'Basic Demo',
      description: 'Interactive diagram with nodes, links, and various interaction modes',
      icon: '🎨',
      route: '/basic-demo',
      features: [
        'Node creation and manipulation',
        'Smart link routing',
        'Layout algorithms',
        'Theme customization',
        'Command console'
      ],
      difficulty: 'Beginner'
    },
    {
      title: 'Animation Demo',
      description: 'Comprehensive showcase of Phase 1 & 1.1 animation features',
      icon: '✨',
      route: '/animation-demo',
      features: [
        '12 core animation types',
        '50+ animation presets',
        'Performance monitoring dashboard',
        'Custom animation registry',
        'Animation sequencing & lifecycle'
      ],
      difficulty: 'Beginner'
    },
    {
      title: 'ERD Designer',
      description: 'Entity-Relationship Diagram builder for database design',
      icon: '🗄️',
      route: '/erd-designer',
      features: [
        'Database table components',
        'Relationship connectors',
        'Primary/Foreign keys',
        'SQL export',
        'Auto-layout tables'
      ],
      difficulty: 'Intermediate'
    },
    {
      title: 'Workflow Builder',
      description: 'Process automation builder with execution tracking',
      icon: '⚙️',
      route: '/workflow-builder',
      features: [
        'Pre-built workflow nodes',
        'Visual execution tracking',
        'Debug mode with breakpoints',
        'Step-through simulation',
        'Real-time status updates'
      ],
      difficulty: 'Intermediate'
    },
    {
      title: 'Dashboard Builder',
      description: 'Interactive dashboard builder with real-time data binding',
      icon: '📊',
      route: '/dashboard-builder',
      features: [
        'Drag-and-drop widgets',
        'Real-time data binding',
        'Chart components',
        'Responsive grid layout',
        'JSON export/import'
      ],
      difficulty: 'Advanced'
    },
    {
      title: 'Form Builder',
      description: 'Visual form designer with drag-and-drop controls',
      icon: '📝',
      route: '/form-builder',
      features: [
        'Drag-and-drop controls',
        'Property configuration',
        'Validation rules',
        'Form preview mode',
        'Angular template export'
      ],
      difficulty: 'Advanced'
    },
    {
      title: 'Custom Node Types',
      description: 'Tutorial for creating custom node types and components',
      icon: '🧩',
      route: '/custom-nodes',
      features: [
        'Component structure',
        'Port management',
        'State persistence',
        'Custom rendering',
        'Step-by-step tutorial'
      ],
      difficulty: 'Advanced'
    },
    {
      title: 'Shape Gallery',
      description: 'Interactive showcase of shape system features (Phases 3.1-3.5)',
      icon: '🎯',
      route: '/shape-gallery',
      features: [
        'All 5 shape types',
        'Shape-aware port positioning',
        'Accurate hit detection',
        'HTML templates with events',
        'Hybrid rendering demo'
      ],
      difficulty: 'Beginner'
    },
    {
      title: 'Advanced Routing Demo',
      description: 'Interactive demonstration of Phase 2 routing features - JointJS parity achieved',
      icon: '🚀',
      route: '/advanced-routing',
      features: [
        'Waypoint editing with drag & drop',
        'Bezier control point manipulation',
        'Douglas-Peucker path simplification',
        'Performance optimized (99% fewer allocations)',
        'Full feature comparison showcase'
      ],
      difficulty: 'Intermediate'
    },
    {
      title: 'Template Builder',
      description: 'Advanced node template editor with live preview and validation',
      icon: '🛠️',
      route: '/template-builder',
      features: [
        'JSON template editor',
        'Live preview with zoom/pan',
        'Template library with presets',
        'Performance monitoring',
        'Undo/redo support'
      ],
      difficulty: 'Advanced'
    },
    {
      title: 'Layout Showcase',
      description: 'Interactive demonstration of layout algorithms with business use cases',
      icon: '📐',
      route: '/layout-showcase',
      features: [
        'Dagre hierarchical layouts',
        'ELK multi-algorithm layouts',
        'Real business scenarios',
        'Interactive controls',
        'Performance metrics'
      ],
      difficulty: 'Intermediate'
    },
    {
      title: 'DSL Bidirectional Sync',
      description: 'Real-time text ↔ diagram synchronization with DSL Engine',
      icon: '🔄',
      route: '/dsl-bidirectional-demo',
      features: [
        'Flowchart, ERD, BPMN, UML support',
        'Real-time bidirectional sync',
        '300ms debounced updates',
        'CSS-like styling system',
        'Custom HTML templates',
        'Format preservation',
        'Web Worker performance'
      ],
      difficulty: 'Intermediate'
    },
    {
      title: 'DSL Extended Types Gallery',
      description: 'Professional ERD, BPMN, and UML diagrams with real-world examples',
      icon: '🗄️',
      route: '/dsl-extended-types-gallery',
      features: [
        '9 real-world examples',
        'ERD with table-like rendering',
        'BPMN with pools & lanes',
        'UML class diagrams',
        'Parse metrics & stats',
        'Layout suggestions',
        'Professional use cases'
      ],
      difficulty: 'Intermediate'
    },
    {
      title: 'DSL Styling Studio',
      description: 'Interactive CSS-like style editor with theme presets',
      icon: '🎨',
      route: '/dsl-styling-studio',
      features: [
        'Visual style editor',
        '5 professional themes',
        'Color pickers & sliders',
        'Typography controls',
        'Live preview',
        'JSON export',
        'Style cascading demo'
      ],
      difficulty: 'Beginner'
    },
    {
      title: 'DSL Template Builder',
      description: 'Create custom HTML templates with data bindings',
      icon: '🛠️',
      route: '/dsl-template-builder',
      features: [
        'HTML template editor',
        '4 template examples',
        '{{data.field}} bindings',
        'Real-time validation',
        'Security checks',
        'Sample data editor',
        'JSON export'
      ],
      difficulty: 'Advanced'
    },
    {
      title: 'DSL Performance Demo',
      description: 'Web Workers and large diagram performance testing',
      icon: '⚡',
      route: '/dsl-performance-demo',
      features: [
        'Large diagram testing (1000+ nodes)',
        'Web Worker comparison',
        'Performance metrics',
        'Memory tracking',
        'Format preservation',
        'Progress reporting',
        'Benchmark suite'
      ],
      difficulty: 'Intermediate'
    }
  ];

  getDifficultyClass(difficulty: string): string {
    return `difficulty-${difficulty.toLowerCase()}`;
  }
}
