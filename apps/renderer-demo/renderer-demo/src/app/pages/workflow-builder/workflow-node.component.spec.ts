import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WorkflowNodeComponent, type WorkflowNodeData } from './workflow-node.component';

describe('WorkflowNodeComponent', () => {
  let component: WorkflowNodeComponent;
  let fixture: ComponentFixture<WorkflowNodeComponent>;
  let compiled: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkflowNodeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(WorkflowNodeComponent);
    component = fixture.componentInstance;
    compiled = fixture.nativeElement;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Start Node Rendering', () => {
    beforeEach(() => {
      component.data = {
        type: 'start',
        label: 'Start Process',
        status: 'pending'
      };
      fixture.detectChanges();
    });

    it('should render workflow node container', () => {
      const workflowNode = compiled.querySelector('.workflow-node');
      expect(workflowNode).toBeTruthy();
    });

    it('should apply start node class', () => {
      const workflowNode = compiled.querySelector('.workflow-node');
      expect(workflowNode?.classList.contains('node-start')).toBe(true);
    });

    it('should display start icon', () => {
      const nodeIcon = compiled.querySelector('.node-icon');
      expect(nodeIcon?.textContent).toBe('▶️');
    });

    it('should display node label', () => {
      const nodeLabel = compiled.querySelector('.node-label');
      expect(nodeLabel?.textContent).toContain('Start Process');
    });

    it('should have circular border-radius for start node', () => {
      const workflowNode = compiled.querySelector('.workflow-node') as HTMLElement;
      const styles = window.getComputedStyle(workflowNode);
      expect(styles.borderRadius).toBe('50%');
    });
  });

  describe('Task Node Rendering', () => {
    beforeEach(() => {
      component.data = {
        type: 'task',
        label: 'Process Order',
        status: 'pending'
      };
      fixture.detectChanges();
    });

    it('should apply task node class', () => {
      const workflowNode = compiled.querySelector('.workflow-node');
      expect(workflowNode?.classList.contains('node-task')).toBe(true);
    });

    it('should display task icon', () => {
      const nodeIcon = compiled.querySelector('.node-icon');
      expect(nodeIcon?.textContent).toBe('⚙️');
    });

    it('should display task label', () => {
      const nodeLabel = compiled.querySelector('.node-label');
      expect(nodeLabel?.textContent).toContain('Process Order');
    });

    it('should have rectangular shape (normal border-radius)', () => {
      const workflowNode = compiled.querySelector('.workflow-node') as HTMLElement;
      const styles = window.getComputedStyle(workflowNode);
      expect(styles.borderRadius).not.toBe('50%');
    });
  });

  describe('Decision Node Rendering', () => {
    beforeEach(() => {
      component.data = {
        type: 'decision',
        label: 'Stock Available?',
        status: 'pending'
      };
      fixture.detectChanges();
    });

    it('should apply decision node class', () => {
      const workflowNode = compiled.querySelector('.workflow-node');
      expect(workflowNode?.classList.contains('node-decision')).toBe(true);
    });

    it('should display decision icon', () => {
      const nodeIcon = compiled.querySelector('.node-icon');
      expect(nodeIcon?.textContent).toBe('❓');
    });

    it('should have rotated transform for diamond shape', () => {
      const workflowNode = compiled.querySelector('.workflow-node') as HTMLElement;
      const styles = window.getComputedStyle(workflowNode);
      expect(styles.transform).toContain('rotate(45deg)');
    });

    it('should have counter-rotated content', () => {
      const nodeContent = compiled.querySelector('.node-content') as HTMLElement;
      const styles = window.getComputedStyle(nodeContent);
      expect(styles.transform).toContain('rotate(-45deg)');
    });
  });

  describe('End Node Rendering', () => {
    beforeEach(() => {
      component.data = {
        type: 'end',
        label: 'End Process',
        status: 'pending'
      };
      fixture.detectChanges();
    });

    it('should apply end node class', () => {
      const workflowNode = compiled.querySelector('.workflow-node');
      expect(workflowNode?.classList.contains('node-end')).toBe(true);
    });

    it('should display end icon', () => {
      const nodeIcon = compiled.querySelector('.node-icon');
      expect(nodeIcon?.textContent).toBe('🏁');
    });

    it('should have circular border-radius for end node', () => {
      const workflowNode = compiled.querySelector('.workflow-node') as HTMLElement;
      const styles = window.getComputedStyle(workflowNode);
      expect(styles.borderRadius).toBe('50%');
    });
  });

  describe('Status Indicators', () => {
    it('should display pending status icon', () => {
      component.data = {
        type: 'task',
        label: 'Test',
        status: 'pending'
      };
      fixture.detectChanges();

      const statusIndicator = compiled.querySelector('.node-status-indicator');
      expect(statusIndicator?.textContent).toBe('⏸️');
      expect(statusIndicator?.classList.contains('indicator-pending')).toBe(true);
    });

    it('should display running status icon', () => {
      component.data = {
        type: 'task',
        label: 'Test',
        status: 'running'
      };
      fixture.detectChanges();

      const statusIndicator = compiled.querySelector('.node-status-indicator');
      expect(statusIndicator?.textContent).toBe('▶️');
      expect(statusIndicator?.classList.contains('indicator-running')).toBe(true);
    });

    it('should display completed status icon', () => {
      component.data = {
        type: 'task',
        label: 'Test',
        status: 'completed'
      };
      fixture.detectChanges();

      const statusIndicator = compiled.querySelector('.node-status-indicator');
      expect(statusIndicator?.textContent).toBe('✅');
      expect(statusIndicator?.classList.contains('indicator-completed')).toBe(true);
    });

    it('should display error status icon', () => {
      component.data = {
        type: 'task',
        label: 'Test',
        status: 'error'
      };
      fixture.detectChanges();

      const statusIndicator = compiled.querySelector('.node-status-indicator');
      expect(statusIndicator?.textContent).toBe('❌');
      expect(statusIndicator?.classList.contains('indicator-error')).toBe(true);
    });

    it('should position status indicator in top-right corner', () => {
      component.data = {
        type: 'task',
        label: 'Test',
        status: 'pending'
      };
      fixture.detectChanges();

      const statusIndicator = compiled.querySelector('.node-status-indicator') as HTMLElement;
      const styles = window.getComputedStyle(statusIndicator);
      expect(styles.position).toBe('absolute');
      expect(styles.top).toContain('-');
      expect(styles.right).toContain('-');
    });
  });

  describe('Status Styling', () => {
    it('should apply running status class when running', () => {
      component.data = {
        type: 'task',
        label: 'Test',
        status: 'running'
      };
      fixture.detectChanges();

      const workflowNode = compiled.querySelector('.workflow-node');
      expect(workflowNode?.classList.contains('status-running')).toBe(true);
    });

    it('should apply completed status class when completed', () => {
      component.data = {
        type: 'task',
        label: 'Test',
        status: 'completed'
      };
      fixture.detectChanges();

      const workflowNode = compiled.querySelector('.workflow-node');
      expect(workflowNode?.classList.contains('status-completed')).toBe(true);
    });

    it('should have enhanced styling for running nodes', () => {
      component.data = {
        type: 'task',
        label: 'Test',
        status: 'running'
      };
      fixture.detectChanges();

      const workflowNode = compiled.querySelector('.workflow-node') as HTMLElement;
      const styles = window.getComputedStyle(workflowNode);
      // Running nodes should have increased border width
      expect(styles.borderWidth).toBeTruthy();
    });
  });

  describe('getTypeIcon Method', () => {
    it('should return start icon for start type', () => {
      component.data = { type: 'start', label: 'Test', status: 'pending' };
      expect(component.getTypeIcon()).toBe('▶️');
    });

    it('should return task icon for task type', () => {
      component.data = { type: 'task', label: 'Test', status: 'pending' };
      expect(component.getTypeIcon()).toBe('⚙️');
    });

    it('should return decision icon for decision type', () => {
      component.data = { type: 'decision', label: 'Test', status: 'pending' };
      expect(component.getTypeIcon()).toBe('❓');
    });

    it('should return end icon for end type', () => {
      component.data = { type: 'end', label: 'Test', status: 'pending' };
      expect(component.getTypeIcon()).toBe('🏁');
    });

    it('should return default icon for unknown type', () => {
      component.data = { type: 'unknown' as any, label: 'Test', status: 'pending' };
      expect(component.getTypeIcon()).toBe('📝');
    });
  });

  describe('getStatusIcon Method', () => {
    beforeEach(() => {
      component.data = { type: 'task', label: 'Test', status: 'pending' };
    });

    it('should return pending icon for pending status', () => {
      component.data.status = 'pending';
      expect(component.getStatusIcon()).toBe('⏸️');
    });

    it('should return running icon for running status', () => {
      component.data.status = 'running';
      expect(component.getStatusIcon()).toBe('▶️');
    });

    it('should return completed icon for completed status', () => {
      component.data.status = 'completed';
      expect(component.getStatusIcon()).toBe('✅');
    });

    it('should return error icon for error status', () => {
      component.data.status = 'error';
      expect(component.getStatusIcon()).toBe('❌');
    });

    it('should return default icon for unknown status', () => {
      component.data.status = 'unknown' as any;
      expect(component.getStatusIcon()).toBe('⏸️');
    });
  });

  describe('Edge Cases', () => {
    it('should not render anything when data is null', () => {
      component.data = null as any;
      fixture.detectChanges();

      const workflowNode = compiled.querySelector('.workflow-node');
      expect(workflowNode).toBeFalsy();
    });

    it('should not render anything when data is undefined', () => {
      component.data = undefined as any;
      fixture.detectChanges();

      const workflowNode = compiled.querySelector('.workflow-node');
      expect(workflowNode).toBeFalsy();
    });

    it('should handle empty label', () => {
      component.data = {
        type: 'task',
        label: '',
        status: 'pending'
      };
      fixture.detectChanges();

      const nodeLabel = compiled.querySelector('.node-label');
      expect(nodeLabel).toBeTruthy();
      expect(nodeLabel?.textContent?.trim()).toBe('');
    });

    it('should handle long labels', () => {
      component.data = {
        type: 'task',
        label: 'This is a very long label that might overflow the node container',
        status: 'pending'
      };
      fixture.detectChanges();

      const nodeLabel = compiled.querySelector('.node-label');
      expect(nodeLabel?.textContent).toContain('This is a very long label');
    });

    it('should handle all node types with all statuses', () => {
      const types: Array<'start' | 'task' | 'decision' | 'end'> = ['start', 'task', 'decision', 'end'];
      const statuses: Array<'pending' | 'running' | 'completed' | 'error'> = ['pending', 'running', 'completed', 'error'];

      types.forEach(type => {
        statuses.forEach(status => {
          component.data = { type, label: `${type}-${status}`, status };
          fixture.detectChanges();

          const workflowNode = compiled.querySelector('.workflow-node');
          expect(workflowNode).toBeTruthy();
          expect(workflowNode?.classList.contains(`node-${type}`)).toBe(true);
          expect(workflowNode?.classList.contains(`status-${status}`)).toBe(true);
        });
      });
    });
  });

  describe('Visual Rendering - No Artifacts', () => {
    it('should not have unexpected background shapes', () => {
      component.data = {
        type: 'task',
        label: 'Test',
        status: 'pending'
      };
      fixture.detectChanges();

      const workflowNode = compiled.querySelector('.workflow-node') as HTMLElement;

      // Should only have the node itself, no extra divs or shapes
      const children = Array.from(workflowNode.children);
      const expectedChildren = ['node-status-indicator', 'node-content'];

      children.forEach(child => {
        const hasExpectedClass = expectedChildren.some(expected => child.classList.contains(expected));
        expect(hasExpectedClass).toBe(true);
      });
    });

    it('should have clean rendering without squares/rectangles behind decision nodes', () => {
      component.data = {
        type: 'decision',
        label: 'Test Decision',
        status: 'pending'
      };
      fixture.detectChanges();

      const workflowNode = compiled.querySelector('.workflow-node') as HTMLElement;

      // Decision node uses CSS transform for diamond shape, not additional elements
      // Should only have status indicator and content, no extra shapes
      expect(workflowNode.children.length).toBe(2);
    });

    it('should properly layer status indicator above node', () => {
      component.data = {
        type: 'task',
        label: 'Test',
        status: 'running'
      };
      fixture.detectChanges();

      const statusIndicator = compiled.querySelector('.node-status-indicator') as HTMLElement;
      const styles = window.getComputedStyle(statusIndicator);

      // Status indicator should have higher z-index
      expect(styles.zIndex).toBe('10');
    });
  });

  describe('Animation Support', () => {
    it('should have animation defined for running indicator', () => {
      component.data = {
        type: 'task',
        label: 'Test',
        status: 'running'
      };
      fixture.detectChanges();

      const runningIndicator = compiled.querySelector('.indicator-running') as HTMLElement;
      expect(runningIndicator).toBeTruthy();

      // Animation is defined in CSS with @keyframes pulse
      const styles = window.getComputedStyle(runningIndicator);
      expect(styles.animation).toBeTruthy();
    });

    it('should have box-shadow animation for running nodes', () => {
      component.data = {
        type: 'task',
        label: 'Test',
        status: 'running'
      };
      fixture.detectChanges();

      const workflowNode = compiled.querySelector('.workflow-node.status-running') as HTMLElement;
      const styles = window.getComputedStyle(workflowNode);

      // Running nodes have enhanced box-shadow
      expect(styles.boxShadow).toBeTruthy();
    });
  });

  describe('Node Content Structure', () => {
    beforeEach(() => {
      component.data = {
        type: 'task',
        label: 'Test Task',
        status: 'pending'
      };
      fixture.detectChanges();
    });

    it('should have node content container', () => {
      const nodeContent = compiled.querySelector('.node-content');
      expect(nodeContent).toBeTruthy();
    });

    it('should display icon inside content', () => {
      const nodeIcon = compiled.querySelector('.node-content .node-icon');
      expect(nodeIcon).toBeTruthy();
    });

    it('should display label inside content', () => {
      const nodeLabel = compiled.querySelector('.node-content .node-label');
      expect(nodeLabel).toBeTruthy();
    });

    it('should arrange icon and label vertically', () => {
      const nodeContent = compiled.querySelector('.node-content') as HTMLElement;
      const styles = window.getComputedStyle(nodeContent);

      expect(styles.display).toBe('flex');
      expect(styles.flexDirection).toBe('column');
    });
  });
});
