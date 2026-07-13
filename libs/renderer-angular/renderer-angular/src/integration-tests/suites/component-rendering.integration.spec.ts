import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VNodeRendererService } from '../../lib/services/vnode-renderer.service';
import { ComponentRendererService } from '../../lib/services/component-renderer.service';
import type { VNode } from '@grafloria/renderer';

/**
 * Component Rendering Integration Tests
 *
 * The VNode → DOM half of the pipeline, end to end in a real Angular fixture:
 * `VNodeRendererService` reconciling a VNode tree into a live container, next to
 * `ComponentRendererService`, which mounts Angular components into the
 * `<foreignObject>` containers that tree produces.
 *
 * This suite previously drove a `MockRenderer` through a `render(vnode, container,
 * renderer)` overload that the service never had — it had not compiled (TS2554)
 * and contributed zero tests. It has been retargeted at the real API, and at the
 * behaviour that actually matters here: re-rendering must REUSE the DOM, because
 * anything mounted inside a foreignObject dies with the element that held it.
 */

@Component({
  selector: 'test-diagram-host',
  standalone: false,
  template: `<div #container class="diagram-container"></div>`,
  styles: ['.diagram-container { width: 800px; height: 600px; }'],
})
class TestHostComponent {
  @ViewChild('container', { static: true }) containerRef!: ElementRef<HTMLElement>;

  get container(): HTMLElement {
    return this.containerRef.nativeElement;
  }
}

@Component({
  selector: 'test-embedded',
  standalone: false,
  template: `<span class="embedded">embedded</span>`,
})
class EmbeddedComponent {}

describe('Component Rendering Integration Tests', () => {
  let hostComponent: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;
  let vnodeService: VNodeRendererService;
  let componentService: ComponentRendererService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TestHostComponent, EmbeddedComponent],
      imports: [CommonModule],
      providers: [VNodeRendererService, ComponentRendererService],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    hostComponent = fixture.componentInstance;
    vnodeService = TestBed.inject(VNodeRendererService);
    componentService = TestBed.inject(ComponentRendererService);

    fixture.detectChanges();
  });

  afterEach(() => {
    vnodeService.unmount(hostComponent.container);
  });

  /** A diagram-shaped tree: root svg → nodes layer → keyed node groups. */
  const diagramTree = (nodes: Array<{ id: string; x: number }>): VNode => ({
    type: 'svg',
    key: 'diagram-root',
    props: { className: 'grafloria-diagram' },
    children: [
      {
        type: 'g',
        key: 'nodes-layer',
        props: { className: 'nodes-layer' },
        children: nodes.map(({ id, x }) => ({
          type: 'g',
          key: `node-${id}`,
          props: { transform: `translate(${x}, 0)` },
          children: [{ type: 'rect', props: { width: 100, height: 50 } }],
        })),
      },
    ],
  });

  describe('Scenario 1: VNode rendering into a live container', () => {
    it('should render a VNode tree to real DOM', () => {
      vnodeService.render(diagramTree([{ id: 'a', x: 0 }]), hostComponent.container);

      const svg = hostComponent.container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg!.getAttribute('class')).toBe('grafloria-diagram');
      expect(hostComponent.container.querySelectorAll('rect').length).toBe(1);
    });

    it('should keep exactly one root across repeated renders', () => {
      vnodeService.render(diagramTree([{ id: 'a', x: 0 }]), hostComponent.container);
      vnodeService.render(diagramTree([{ id: 'a', x: 10 }]), hostComponent.container);
      vnodeService.render(diagramTree([{ id: 'a', x: 20 }]), hostComponent.container);

      expect(hostComponent.container.children.length).toBe(1);
    });
  });

  describe('Scenario 2: re-render reuses DOM instead of rebuilding it', () => {
    it('should keep the same element objects and just patch them', () => {
      vnodeService.render(diagramTree([{ id: 'a', x: 0 }]), hostComponent.container);
      const nodeGroup = hostComponent.container.querySelector('[data-vnode-key="node-a"]')!;

      vnodeService.render(diagramTree([{ id: 'a', x: 250 }]), hostComponent.container);

      const after = hostComponent.container.querySelector('[data-vnode-key="node-a"]')!;
      expect(after).toBe(nodeGroup); // same object — not torn down and rebuilt
      expect(after.getAttribute('transform')).toBe('translate(250, 0)');
      expect(vnodeService.getLastPatchStats().created).toBe(0);
    });

    it('should add and remove nodes without disturbing the survivors', () => {
      vnodeService.render(
        diagramTree([{ id: 'a', x: 0 }, { id: 'b', x: 100 }]),
        hostComponent.container
      );
      const a = hostComponent.container.querySelector('[data-vnode-key="node-a"]')!;

      vnodeService.render(
        diagramTree([{ id: 'a', x: 0 }, { id: 'c', x: 200 }]),
        hostComponent.container
      );

      expect(hostComponent.container.querySelector('[data-vnode-key="node-a"]')).toBe(a);
      expect(hostComponent.container.querySelector('[data-vnode-key="node-b"]')).toBeNull();
      expect(hostComponent.container.querySelector('[data-vnode-key="node-c"]')).toBeTruthy();
    });

    it('should preserve DOM state a full rebuild would destroy (focus)', () => {
      // A rebuilt element cannot hold focus, selection or a running animation.
      const tree = (x: number): VNode => ({
        type: 'svg',
        key: 'diagram-root',
        props: {},
        children: [
          {
            type: 'foreignObject',
            key: 'fo-node-a',
            props: { x, y: 0, width: 200, height: 100 },
            children: [{ type: 'div', props: { id: 'live-container' } }],
          },
        ],
      });

      vnodeService.render(tree(0), hostComponent.container);
      const mount = hostComponent.container.querySelector('#live-container')!;

      const input = document.createElement('input');
      mount.appendChild(input);
      input.focus();
      input.value = 'half-typed';

      vnodeService.render(tree(40), hostComponent.container);

      const stillThere = hostComponent.container.querySelector('#live-container')!
        .firstElementChild as HTMLInputElement;
      expect(stillThere).toBe(input);
      expect(stillThere.value).toBe('half-typed');
      expect(document.activeElement).toBe(input);
      // The foreignObject's own geometry still updated.
      expect(
        hostComponent.container.querySelector('foreignObject')!.getAttribute('x')
      ).toBe('40');
    });
  });

  describe('Scenario 3: components mounted in foreignObject containers', () => {
    it('should mount an Angular component into the foreignObject container and survive re-renders', () => {
      componentService.registerComponent('custom-node', EmbeddedComponent);
      expect(componentService.hasComponent('custom-node')).toBe(true);

      const node = { id: 'node-a', type: 'custom-node' } as any;
      const foVNode = componentService.createForeignObjectVNode(node, {
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      });
      const containerId = componentService.getContainerId('node-a')!;
      expect(containerId).toBeTruthy();

      const tree = (x: number): VNode => ({
        type: 'svg',
        key: 'diagram-root',
        props: {},
        children: [{ ...foVNode, key: 'fo-node-a', props: { ...foVNode.props, x } }],
      });

      vnodeService.render(tree(0), hostComponent.container);

      // The component's mount point exists in the real DOM...
      const mountPoint = hostComponent.container.querySelector(`#${containerId}`);
      expect(mountPoint).toBeTruthy();

      // ...simulate the component's view landing inside it.
      const view = document.createElement('test-embedded');
      mountPoint!.appendChild(view);

      vnodeService.render(tree(30), hostComponent.container);

      // Still the same mount point holding the same view: the foreignObject
      // subtree is opaque to the reconciler.
      expect(hostComponent.container.querySelector(`#${containerId}`)).toBe(mountPoint);
      expect(mountPoint!.firstElementChild).toBe(view);
    });

    it('should give each node its own stable container id', () => {
      const a = componentService.createForeignObjectVNode({ id: 'n1', type: 't' } as any, {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
      const b = componentService.createForeignObjectVNode({ id: 'n2', type: 't' } as any, {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });

      expect(a.props.containerId).not.toBe(b.props.containerId);
      // Stable across calls for the same node.
      const aAgain = componentService.createForeignObjectVNode({ id: 'n1', type: 't' } as any, {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
      expect(aAgain.props.containerId).toBe(a.props.containerId);
    });
  });

  describe('Scenario 4: larger trees', () => {
    it('should render many nodes and then re-render them without rebuilding', () => {
      const many = Array.from({ length: 100 }, (_, i) => ({ id: `n${i}`, x: i * 10 }));

      vnodeService.render(diagramTree(many), hostComponent.container);
      expect(hostComponent.container.querySelectorAll('[data-vnode-key^="node-"]').length).toBe(100);

      const first = hostComponent.container.querySelector('[data-vnode-key="node-n0"]')!;

      vnodeService.render(
        diagramTree(many.map((n) => ({ ...n, x: n.x + 5 }))),
        hostComponent.container
      );

      expect(hostComponent.container.querySelector('[data-vnode-key="node-n0"]')).toBe(first);
      expect(vnodeService.getLastPatchStats().created).toBe(0);
    });

    it('should reorder keyed nodes by moving them, not recreating them', () => {
      const nodes = [
        { id: 'a', x: 0 },
        { id: 'b', x: 100 },
        { id: 'c', x: 200 },
      ];
      vnodeService.render(diagramTree(nodes), hostComponent.container);
      const layer = hostComponent.container.querySelector('[data-vnode-key="nodes-layer"]')!;
      const [a, b, c] = Array.from(layer.children);

      // Selection reorders links/nodes so the selected one paints on top.
      vnodeService.render(
        diagramTree([nodes[2], nodes[0], nodes[1]]),
        hostComponent.container
      );

      expect(Array.from(layer.children)).toEqual([c, a, b]);
      expect(vnodeService.getLastPatchStats().created).toBe(0);
    });
  });
});
