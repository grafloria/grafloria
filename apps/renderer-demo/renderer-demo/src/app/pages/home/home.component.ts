import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface ExampleCard {
  title: string;
  description: string;
  icon: string;
  route: string;
  features: string[];
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  category: 'Core Features' | 'DSL Engine' | 'Advanced Features' | 'Builders';
  tags: string[];
}

type Category = 'All' | 'Core Features' | 'DSL Engine' | 'Advanced Features' | 'Builders';

@Component({
    imports: [CommonModule, RouterModule, FormsModule],
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrl: './home.component.css'
})
export class HomeComponent {
  searchTerm = '';
  selectedCategory: Category = 'All';
  selectedDifficulty: string = 'All';

  categories: Category[] = ['All', 'Core Features', 'DSL Engine', 'Advanced Features', 'Builders'];

  examples: ExampleCard[] = [
    // Core Features
    {
      title: 'Basic Demo',
      description: 'Interactive diagram with nodes, links, and various interaction modes',
      icon: '🎨',
      route: '/basic-demo',
      features: ['Node creation', 'Smart link routing', 'Layout algorithms', 'Theme customization'],
      difficulty: 'Beginner',
      category: 'Core Features',
      tags: ['nodes', 'links', 'layout', 'interactive', 'basics']
    },
    {
      title: 'Animation Demo',
      description: 'Comprehensive showcase of Phase 1 & 1.1 animation features',
      icon: '✨',
      route: '/animation-demo',
      features: ['12 animation types', '50+ presets', 'Performance monitoring', 'Custom registry'],
      difficulty: 'Beginner',
      category: 'Core Features',
      tags: ['animation', 'effects', 'performance']
    },
    {
      title: 'Shape Gallery',
      description: 'Interactive showcase of shape system features (Phases 3.1-3.5)',
      icon: '🎯',
      route: '/shape-gallery',
      features: ['All 5 shape types', 'Port positioning', 'Hit detection', 'HTML templates'],
      difficulty: 'Beginner',
      category: 'Core Features',
      tags: ['shapes', 'rendering', 'templates']
    },
    {
      title: 'Advanced Routing Demo',
      description: 'Interactive demonstration of Phase 2 routing features - JointJS parity achieved',
      icon: '🚀',
      route: '/advanced-routing',
      features: ['Waypoint editing', 'Bezier control', 'Path simplification', 'Performance optimized'],
      difficulty: 'Intermediate',
      category: 'Advanced Features',
      tags: ['routing', 'links', 'performance', 'waypoints']
    },
    {
      title: 'ELK.js Comparison',
      description: 'Side-by-side comparison with React Flow ELK.js implementation',
      icon: '🔗',
      route: '/elk-comparison',
      features: ['Hierarchical layout', 'Orthogonal routing', 'Obstacle avoidance', 'React Flow parity'],
      difficulty: 'Intermediate',
      category: 'Advanced Features',
      tags: ['elk', 'routing', 'comparison', 'orthogonal', 'reactflow']
    },
    {
      title: 'Template Builder',
      description: 'Advanced node template editor with live preview and validation',
      icon: '🛠️',
      route: '/template-builder',
      features: ['JSON editor', 'Live preview', 'Template library', 'Undo/redo'],
      difficulty: 'Advanced',
      category: 'Advanced Features',
      tags: ['templates', 'editor', 'customization']
    },
    {
      title: 'Layout Showcase',
      description: 'Interactive demonstration of layout algorithms with business use cases',
      icon: '📐',
      route: '/layout-showcase',
      features: ['Dagre layouts', 'ELK multi-algorithm', 'Business scenarios', 'Performance metrics'],
      difficulty: 'Intermediate',
      category: 'Advanced Features',
      tags: ['layout', 'algorithms', 'dagre', 'elk']
    },

    // DSL Engine
    {
      title: 'DSL Bidirectional Sync',
      description: 'Real-time text ↔ diagram synchronization with DSL Engine',
      icon: '🔄',
      route: '/dsl-bidirectional-demo',
      features: ['Flowchart, ERD, BPMN, UML', 'Real-time sync', '300ms debounce', 'Format preservation'],
      difficulty: 'Intermediate',
      category: 'DSL Engine',
      tags: ['dsl', 'sync', 'realtime', 'flowchart', 'erd']
    },
    {
      title: 'DSL Extended Types Gallery',
      description: 'Professional ERD, BPMN, and UML diagrams with real-world examples',
      icon: '🗄️',
      route: '/dsl-extended-types-gallery',
      features: ['9 real-world examples', 'ERD tables', 'BPMN pools', 'UML diagrams'],
      difficulty: 'Intermediate',
      category: 'DSL Engine',
      tags: ['dsl', 'erd', 'bpmn', 'uml', 'examples']
    },
    {
      title: 'DSL Styling Studio',
      description: 'Interactive CSS-like style editor with theme presets',
      icon: '🎨',
      route: '/dsl-styling-studio',
      features: ['Visual editor', '5 themes', 'Color pickers', 'Live preview', 'JSON export'],
      difficulty: 'Beginner',
      category: 'DSL Engine',
      tags: ['dsl', 'styling', 'themes', 'css']
    },
    {
      title: 'DSL Template Builder',
      description: 'Create custom HTML templates with data bindings',
      icon: '🛠️',
      route: '/dsl-template-builder',
      features: ['HTML editor', '4 examples', 'Data bindings', 'Validation', 'JSON export'],
      difficulty: 'Advanced',
      category: 'DSL Engine',
      tags: ['dsl', 'templates', 'html', 'bindings']
    },
    {
      title: 'DSL Performance Demo',
      description: 'Web Workers and large diagram performance testing',
      icon: '⚡',
      route: '/dsl-performance-demo',
      features: ['1000+ nodes', 'Web Workers', 'Performance metrics', 'Benchmarks'],
      difficulty: 'Intermediate',
      category: 'DSL Engine',
      tags: ['dsl', 'performance', 'workers', 'testing']
    },

    // Builders
    {
      title: 'ERD Designer',
      description: 'Entity-Relationship Diagram builder for database design',
      icon: '🗄️',
      route: '/erd-designer',
      features: ['Database tables', 'Relationships', 'Primary/Foreign keys', 'SQL export'],
      difficulty: 'Intermediate',
      category: 'Builders',
      tags: ['erd', 'database', 'designer', 'sql']
    },
    {
      title: 'Workflow Builder',
      description: 'Process automation builder with execution tracking',
      icon: '⚙️',
      route: '/workflow-builder',
      features: ['Workflow nodes', 'Execution tracking', 'Debug mode', 'Step-through'],
      difficulty: 'Intermediate',
      category: 'Builders',
      tags: ['workflow', 'automation', 'process', 'execution']
    },
    {
      title: 'Dashboard Builder',
      description: 'Interactive dashboard builder with real-time data binding',
      icon: '📊',
      route: '/dashboard-builder',
      features: ['Drag-drop widgets', 'Data binding', 'Charts', 'Grid layout'],
      difficulty: 'Advanced',
      category: 'Builders',
      tags: ['dashboard', 'widgets', 'charts', 'data']
    },
    {
      title: 'Form Builder',
      description: 'Visual form designer with drag-and-drop controls',
      icon: '📝',
      route: '/form-builder',
      features: ['Drag-drop controls', 'Properties', 'Validation', 'Angular export'],
      difficulty: 'Advanced',
      category: 'Builders',
      tags: ['forms', 'designer', 'validation', 'angular']
    },
    {
      title: 'Custom Node Types',
      description: 'Tutorial for creating custom node types and components',
      icon: '🧩',
      route: '/custom-nodes',
      features: ['Component structure', 'Port management', 'State persistence', 'Tutorial'],
      difficulty: 'Advanced',
      category: 'Advanced Features',
      tags: ['custom', 'components', 'tutorial', 'development']
    }
  ];

  get filteredExamples(): ExampleCard[] {
    return this.examples.filter(example => {
      const matchesSearch = !this.searchTerm ||
        example.title.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        example.description.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        example.tags.some(tag => tag.toLowerCase().includes(this.searchTerm.toLowerCase()));

      const matchesCategory = this.selectedCategory === 'All' ||
        example.category === this.selectedCategory;

      const matchesDifficulty = this.selectedDifficulty === 'All' ||
        example.difficulty === this.selectedDifficulty;

      return matchesSearch && matchesCategory && matchesDifficulty;
    });
  }

  get examplesByCategory(): Record<string, ExampleCard[]> {
    const grouped: Record<string, ExampleCard[]> = {
      'Core Features': [],
      'DSL Engine': [],
      'Advanced Features': [],
      'Builders': []
    };

    this.filteredExamples.forEach(example => {
      grouped[example.category].push(example);
    });

    return grouped;
  }

  getDifficultyClass(difficulty: string): string {
    return `difficulty-${difficulty.toLowerCase()}`;
  }

  getCategoryIcon(category: string): string {
    const icons: Record<string, string> = {
      'Core Features': '⭐',
      'DSL Engine': '📝',
      'Advanced Features': '🚀',
      'Builders': '🏗️'
    };
    return icons[category] || '📦';
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedCategory = 'All';
    this.selectedDifficulty = 'All';
  }
}
