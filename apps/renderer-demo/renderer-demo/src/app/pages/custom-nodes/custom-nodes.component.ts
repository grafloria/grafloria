import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface TutorialSection {
  title: string;
  description: string;
  steps: string[];
  codeExample?: string;
}

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-custom-nodes',
  templateUrl: './custom-nodes.component.html',
  styleUrl: './custom-nodes.component.css',
})
export class CustomNodesComponent {
  sections: TutorialSection[] = [
    {
      title: 'Part 1: Basic Custom Node (30 min)',
      description: 'Learn the fundamentals of creating custom node components',
      steps: [
        'Set up component structure',
        'Define input/output properties',
        'Apply basic styling',
        'Register node with DiagramEngine'
      ],
      codeExample: `@Component({
  selector: 'app-table-node',
  template: \`
    <div class="custom-node">
      <h3>{{ data.title }}</h3>
      <p>{{ data.description }}</p>
    </div>
  \`
})
export class CustomNodeComponent {
  @Input() data!: any;
}`
    },
    {
      title: 'Part 2: Interactive Nodes (45 min)',
      description: 'Add interactivity and port management',
      steps: [
        'Implement port management',
        'Add click and hover handlers',
        'Create context menus',
        'Handle node selection states'
      ]
    },
    {
      title: 'Part 3: Complex State (60 min)',
      description: 'Manage internal data and property panels',
      steps: [
        'Design internal data models',
        'Build property configuration panels',
        'Implement validation logic',
        'Handle state persistence'
      ]
    },
    {
      title: 'Part 4: Custom Rendering (45 min)',
      description: 'Create advanced visual representations',
      steps: [
        'Use custom SVG elements',
        'Implement canvas rendering',
        'Optimize performance',
        'Add animations and transitions'
      ]
    },
    {
      title: 'Part 5: Real-world Example (90 min)',
      description: 'Build a complete production-ready component',
      steps: [
        'Analyze requirements',
        'Design component architecture',
        'Implement full functionality',
        'Test and debug thoroughly',
        'Write comprehensive documentation'
      ]
    }
  ];
}
